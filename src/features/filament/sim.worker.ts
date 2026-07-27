/**
 * FILAMENT simulation worker — the loop, the luminous events, and the raster.
 *
 * The physics lives in `universe.ts` (headlessly testable); this file owns what
 * only a worker can: the frame loop, the pixel buffers, and the message
 * contract in `protocol.ts`.
 *
 * Per frame:
 *   1. advance the {@link Universe} by `substeps`
 *   2. scan solver-independent density cells; light quasars, fire starbursts
 *   3. splat both species into a density buffer, tone-map it, draw the events
 */

import { Universe } from "./universe"
import { cmbGlow, type Afterglow } from "./cosmology"
import { wrapPeriodic } from "./particle-mesh"
import { depositCic, resampleConservative, timedDecay } from "./density-raster"
import type { FromWorker, SimParams, SimStats, ToWorker, ViewParams } from "./protocol"

/** Brightness of a massive particle relative to a tracer. */
const MASS_WEIGHT = 2.6
/** Tone-map index the auto-exposure aims the mean occupied pixel at. */
const TARGET_LEVEL = 7.5

const ctx = globalThis as unknown as {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void
  addEventListener(type: "message", cb: (e: MessageEvent<ToWorker>) => void): void
}

let params: SimParams | null = null
let view: ViewParams = { zoom: 1, panX: 0, panY: 0, autoFit: true }
let uni: Universe | null = null

let frameCx = 0, frameCy = 0, frameHalf = 1
let rng = 1

let accum = new Float32Array(0)
const palette = new Uint32Array(256)
let accent: [number, number, number] = [0.71, 0.26, 0.3]
let glowKey = -1
/** Metered exposure; 0 means "not yet measured", so the first frame snaps. */
let autoGain = 0
let rw = 0, rh = 0
let sampleX0 = new Int32Array(0)
let sampleX1 = new Int32Array(0)
let sampleXF = new Float32Array(0)
let sampleXInside = new Uint8Array(0)
let sampleY0 = new Int32Array(0)
let sampleY1 = new Int32Array(0)
let sampleYF = new Float32Array(0)
let sampleYInside = new Uint8Array(0)
const pool: ArrayBuffer[] = []
let scheduled = false
let running = false
let faulted = false
/** A paused simulation renders only when a parameter, view, or size changes. */
let renderRequested = false
/** Monotonic wall clock in seconds, so event fades are framerate-independent. */
let clock = 0
let lastTick = 0
let lastEventScan = 0

const stats: SimStats = {
  stepMs: 0, drawMs: 0, cells: 0, depth: 0, nearPairs: 0, translations: 0,
  speedup: 1, scale: 1, cosmological: false, a: 1, z: 0, time: 0,
  epoch: "", done: false, quasars: 0, bursts: 0, solver: "fmm",
  particles: 0, peakCellMass: 0, occupiedCells: 0, health: "stable",
}

/** xorshift32 — the worker's own stream, for presentation only. */
function rand(): number {
  rng ^= rng << 13
  rng ^= rng >>> 17
  rng ^= rng << 5
  return (rng >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------
// Luminous events
// ---------------------------------------------------------------------------

/**
 * Quasars and starbursts are not dynamics — they carry no mass and exert no
 * force. They are a *reading* of the dynamics: both are triggered by the mass
 * and compactness of the halo they sit in, which either force solver has already
 * measured on its cells. Halo finding therefore costs one read-only pass over
 * density and no extra physics at all.
 */
interface Quasar {
  x: number
  y: number
  /** Halo mass relative to the largest, at ignition. */
  mass: number
  born: number
  life: number
  phase: number
}
interface Burst {
  x: number
  y: number
  born: number
}

const BURST_LIFE = 1.1
let quasars: Quasar[] = []
let bursts: Burst[] = []
let burstTotal = 0

/**
 * Scan the leaf level for halos and decide what lights up.
 *
 * Quasars need a deep potential well and a supply of gas, so they track the
 * most massive compact halos — and in the real universe their space density
 * peaks sharply at z ≈ 2, "cosmic noon", then falls away as the fuel runs out
 * and the black holes starve. That window is applied here. In the isolated
 * scenarios there is no cosmic clock to hang it on, so compactness alone
 * decides — which is why the `Encounter` merger lights one at coalescence,
 * exactly as galaxy mergers are thought to do.
 *
 * Starbursts stand in for supernovae. At this mass resolution a single particle
 * is something like 10⁹ M☉, so one supernova is far below anything that could
 * honestly be resolved; what is drawn is the flash of a whole star-forming
 * region, fired at a rate proportional to local surface density — roughly the
 * Kennicutt-Schmidt law, and roughly where supernovae actually go off.
 */
function scanEvents(dtSec: number): void {
  const p = params!
  const u = uni!
  if (!p.events) {
    quasars.length = 0
    bursts.length = 0
    return
  }

  // One pass for the scale of the biggest halo, so every threshold below is
  // relative and works at any particle count and any epoch.
  let peak = 0
  u.forEachDensityCell((mass) => {
    if (mass > peak) peak = mass
  })
  if (peak <= 0) return

  const z = u.z
  // Cosmic noon: a log-normal in (1+z) peaking at z ≈ 2.
  const noon = u.cosmological ? Math.exp(-Math.pow(Math.log((1 + z) / 3) / 0.62, 2)) : 1
  const quasarThreshold = peak * 0.45
  const burstThreshold = peak * 0.05
  // Global expected flashes per second, distributed by physical cell mass.
  // Normalising by total mass rather than by the peak keeps a 256² mesh from
  // producing 16× more events than a 64² mesh merely because it has more cells.
  const burstRate = 8 * dtSec * (u.cosmological ? 0.3 + noon : 1)

  u.forEachDensityCell((m, cellX, cellY, h) => {
    if (m < burstThreshold) return

    if (rand() < burstRate * m) {
      bursts.push({ x: cellX + (rand() - 0.5) * h, y: cellY + (rand() - 0.5) * h, born: clock })
      burstTotal++
    }

    if (m < quasarThreshold) return
    // One quasar per halo: if there is already one nearby, let it drift with
    // its halo rather than igniting a second. The "nearby" radius is a fraction
    // of the *system*, not of a cell — cells shrink as the tree deepens, and
    // keying off them lets a single wandering nucleus re-ignite every time the
    // depth feedback subdivides underneath it.
    const near = Math.max(h * 2.5, u.boxHalf * 0.05)
    let occupied = false
    for (const q of quasars) {
      const dx = u.cosmological ? wrapPeriodic(cellX - q.x, u.boxHalf) : cellX - q.x
      const dy = u.cosmological ? wrapPeriodic(cellY - q.y, u.boxHalf) : cellY - q.y
      if (Math.abs(dx) < near && Math.abs(dy) < near) {
        q.x += dx * 0.25
        q.y += dy * 0.25
        if (u.cosmological) {
          q.x = wrapPeriodic(q.x, u.boxHalf)
          q.y = wrapPeriodic(q.y, u.boxHalf)
        }
        occupied = true
        break
      }
    }
    // A whole cosmological patch can host a dozen at cosmic noon; a single
    // galaxy or a merging pair hosts one, occasionally two.
    if (occupied || quasars.length >= (u.cosmological ? 12 : 2)) return
    if (rand() < (u.cosmological ? 0.05 * noon : 0.012)) {
      quasars.push({
        x: cellX,
        y: cellY,
        mass: m / peak,
        born: clock,
        // Quasar lifetimes are ~10⁷–10⁸ yr, a blink of cosmic time; on screen
        // that is a handful of seconds.
        life: 3 + rand() * 7,
        phase: rand() * Math.PI * 2,
      })
    }
  })

  quasars = quasars.filter((q) => clock - q.born < q.life)
  bursts = bursts.filter((b) => clock - b.born < BURST_LIFE)
  if (bursts.length > 400) bursts.splice(0, bursts.length - 400)
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/**
 * Build the density → colour table.
 *
 * The asinh stretch is baked into the *table*, not applied per pixel: entry i
 * stands for a linear density of i/gain, but is coloured as though that density
 * had been passed through asinh. So the tone map costs one multiply, one
 * truncation and one array read per pixel, and still gets the enormous dynamic
 * range astronomy needs — the same stretch SDSS uses to show a galaxy's core
 * and its outer arms in a single image.
 *
 * The recombination afterglow rides in the same table, added as a uniform floor
 * rather than composited per pixel: it is the same colour everywhere on screen,
 * so there is no reason to pay for it more than 256 times.
 */
function buildPalette(glow: Afterglow): void {
  const [ar, ag, ab] = accent
  const K = 14
  const norm = Math.asinh(K)
  // Placed so the site's accent lands on the *filaments* — the mid-densities
  // that make up most of the visible field — rather than on a thin shell
  // between "empty" and "clipped to white", which is where an evenly spaced
  // ramp puts it once the asinh stretch has done its work.
  const stops: [number, number, number, number][] = [
    [0.0, 0.01, 0.01, 0.035],
    [0.1, 0.05, 0.045, 0.2],
    [0.26, ar * 0.8, ag * 0.8, ab * 0.9],
    [0.55, Math.min(1, ar * 0.6 + 0.45), Math.min(1, ag * 0.55 + 0.36), Math.min(1, ab * 0.45 + 0.26)],
    [1.0, 1.0, 0.97, 0.9],
  ]

  // The afterglow tints the whole ramp rather than washing over it, and adds
  // only a dim uniform floor. That way the early sky is not a flat orange
  // rectangle: it is the density field itself rendered hot, which is what a CMB
  // map actually is — the same primordial potential, seen in temperature.
  const s = glow.strength
  const tint = s * 0.62
  const floor = s * 0.05

  for (let i = 0; i < 256; i++) {
    const t = Math.asinh((i / 255) * K) / norm
    let k = 0
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++
    const [t0, r0, g0, b0] = stops[k]
    const [t1, r1, g1, b1] = stops[k + 1]
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0
    let r = r0 + (r1 - r0) * f
    let g = g0 + (g1 - g0) * f
    let b = b0 + (b1 - b0) * f
    if (s > 0) {
      // Warm the ramp, weighted toward the low end so bright knots keep their
      // structure instead of clipping to a single orange.
      const w = tint * (1 - 0.45 * t)
      r = Math.min(1, r * (1 - w) + glow.r * w + floor)
      g = Math.min(1, g * (1 - w) + glow.g * w + floor * 0.45)
      b = Math.min(1, b * (1 - w) + glow.b * w + floor * 0.2)
    }
    // Fade in over the first few levels so empty space stays transparent and
    // the page's own background shows through — except while the sky itself is
    // still glowing, when even empty space carries the afterglow.
    const alpha = Math.max(s * 0.34, Math.min(1, t * 4)) * 255
    // Little-endian byte order (0xAABBGGRR) — every platform a browser ships on.
    palette[i] = ((alpha & 255) << 24) | ((b * 255) << 16) | ((g * 255) << 8) | (r * 255)
  }
  if (s <= 0) palette[0] = 0
}

/** Rebuild the palette only when the afterglow has visibly moved. */
function syncGlow(): void {
  const lit = uni?.cosmological && params?.events
  const glow: Afterglow = lit ? cmbGlow(uni!.a) : { strength: 0, r: 0, g: 0, b: 0 }
  // Quantised so the palette is rebuilt only when the afterglow visibly moves.
  const key = Math.round(glow.strength * 96) * 128 + Math.round(glow.g * 64)
  if (key === glowKey) return
  glowKey = key
  buildPalette(glow)
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function reset(): void {
  const p = params!
  uni = new Universe({
    preset: p.preset,
    seed: p.seed,
    nMass: p.nMass,
    nTracer: p.nTracer,
    order: p.order,
    meshSize: p.meshSize,
    softening: p.softening,
  })
  frameCx = 0
  frameCy = 0
  frameHalf = uni.extent
  quasars = []
  bursts = []
  burstTotal = 0
  clock = 0
  lastTick = 0
  lastEventScan = 0
  glowKey = -1
  autoGain = 0
  accum.fill(0)
  rng = (p.seed | 1) >>> 0
  syncGlow()
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Additive sprite with a soft radial falloff, saturating per channel. */
function sprite(out: Uint32Array, cx: number, cy: number, r: number, cr: number, cg: number, cb: number): void {
  const x0 = Math.max(0, Math.ceil(cx - r))
  const x1 = Math.min(rw - 1, Math.floor(cx + r))
  const y0 = Math.max(0, Math.ceil(cy - r))
  const y1 = Math.min(rh - 1, Math.floor(cy + r))
  const r2 = r * r
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const f = 1 - Math.sqrt(d2) / r
      const w = f * f
      const i = y * rw + x
      const px = out[i]
      out[i] =
        (Math.min(255, ((px >>> 24) & 255) + 255 * w) << 24) |
        (Math.min(255, ((px >> 16) & 255) + cb * w) << 16) |
        (Math.min(255, ((px >> 8) & 255) + cg * w) << 8) |
        Math.min(255, (px & 255) + cr * w)
    }
  }
}

/** The four-point diffraction spikes that say "this is a point source". */
function spikes(out: Uint32Array, cx: number, cy: number, len: number, cr: number, cg: number, cb: number): void {
  for (let s = -len; s <= len; s++) {
    const f = 1 - Math.abs(s) / len
    const w = f * f * f
    for (const [dx, dy] of [[s, 0], [0, s]] as const) {
      const x = (cx + dx) | 0
      const y = (cy + dy) | 0
      if (x < 0 || x >= rw || y < 0 || y >= rh) continue
      const i = y * rw + x
      const px = out[i]
      out[i] =
        (Math.min(255, ((px >>> 24) & 255) + 255 * w) << 24) |
        (Math.min(255, ((px >> 16) & 255) + cb * w) << 16) |
        (Math.min(255, ((px >> 8) & 255) + cg * w) << 8) |
        Math.min(255, (px & 255) + cr * w)
    }
  }
}

/** Continuous CIC particle raster for isolated FMM scenarios. */
function splatParticles(u: Universe, scale: number, ox: number, oy: number): void {
  const splat = (cx: Float32Array, cy: Float32Array, n: number, weight: number) => {
    for (let i = 0; i < n; i++) {
      const sx = cx[i] * scale + ox
      const sy = oy - cy[i] * scale
      if (sx < -1 || sx >= rw || sy < -1 || sy >= rh) continue
      depositCic(accum, rw, rh, sx, sy, weight)
    }
  }
  splat(u.tracers.x, u.tracers.y, u.nTracer, 1)
  splat(u.masses.x, u.masses.y, u.nMass, MASS_WEIGHT)
}

/**
 * Reconstruct the cosmological density directly from the force mesh.
 *
 * The mesh is the simulation's actual resolved mass field. Showing individual
 * nearest-pixel particles below that scale adds sampling noise, not physical
 * detail. Bilinear reconstruction gives continuous motion, costs no particle
 * splat pass, and makes visual and force resolution agree.
 */
function splatPeriodicDensity(u: Universe, scale: number): void {
  const pm = u.pm!
  const n = pm.size
  const half = pm.half
  const invCell = 1 / pm.cellSize
  const cameraX = frameCx + view.panX
  const cameraY = frameCy + view.panY

  for (let x = 0; x < rw; x++) {
    const local = (x + 0.5 - rw * 0.5) / scale
    if (Math.abs(local) >= half) {
      sampleXInside[x] = 0
      continue
    }
    sampleXInside[x] = 1
    const world = wrapPeriodic(local + cameraX, half)
    const gx = (world + half) * invCell - 0.5
    const base = Math.floor(gx)
    const x0 = base < 0 ? n - 1 : base
    sampleX0[x] = x0
    sampleX1[x] = x0 + 1 === n ? 0 : x0 + 1
    sampleXF[x] = gx - base
  }

  for (let y = 0; y < rh; y++) {
    const local = (rh * 0.5 - y - 0.5) / scale
    if (Math.abs(local) >= half) {
      sampleYInside[y] = 0
      continue
    }
    sampleYInside[y] = 1
    const world = wrapPeriodic(local + cameraY, half)
    const gy = (world + half) * invCell - 0.5
    const base = Math.floor(gy)
    const y0 = base < 0 ? n - 1 : base
    sampleY0[y] = y0
    sampleY1[y] = y0 + 1 === n ? 0 : y0 + 1
    sampleYF[y] = gy - base
  }

  const rho = pm.cellMass
  const patchPixels = Math.max(1, Math.pow(2 * half * scale, 2))
  const densityScale = ((u.nMass + u.nTracer) * n * n) / patchPixels
  for (let y = 0; y < rh; y++) {
    if (!sampleYInside[y]) continue
    const y0 = sampleY0[y] * n
    const y1 = sampleY1[y] * n
    const ty = sampleYF[y]
    const wy0 = 1 - ty
    const row = y * rw
    for (let x = 0; x < rw; x++) {
      if (!sampleXInside[x]) continue
      const x0 = sampleX0[x]
      const x1 = sampleX1[x]
      const tx = sampleXF[x]
      const a = rho[y0 + x0] * (1 - tx) + rho[y0 + x1] * tx
      const b = rho[y1 + x0] * (1 - tx) + rho[y1 + x1] * tx
      accum[row + x] += (a * wy0 + b * ty) * densityScale
    }
  }
}

function render(buf: ArrayBuffer, elapsedSeconds: number, advancing: boolean): void {
  const p = params!
  const u = uni!
  const out = new Uint32Array(buf)
  const px = rw * rh

  // Camera. In comoving coordinates the patch is a fixed size by construction,
  // so the cosmological run wants a fixed frame; the isolated scenarios expand
  // and contract, and want to be followed.
  if (view.autoFit && !u.cosmological) {
    const k = 0.05
    frameCx += (u.boxCx - frameCx) * k
    frameCy += (u.boxCy - frameCy) * k
    frameHalf += (u.boxHalf * 1.08 - frameHalf) * k
  }
  const scale = (Math.min(rw, rh) * 0.5 * view.zoom) / Math.max(1e-6, frameHalf)
  const ox = rw * 0.5 - (frameCx + view.panX) * scale
  const oy = rh * 0.5 + (frameCy + view.panY) * scale
  stats.scale = scale

  if (u.pm) splatPeriodicDensity(u, scale)
  else splatParticles(u, scale, ox, oy)

  // Paused redraws are fresh static reconstructions. They must not brighten
  // merely because a view or palette message requested the same state again.
  const decay = advancing ? timedDecay(p.trails, elapsedSeconds) : 0
  const empty = palette[0]

  // Meter once before the first tone map so a reset does not emit a blank
  // calibration frame. Subsequent frames meter inside the normal decay pass.
  if (autoGain === 0) {
    let initialSum = 0
    let initialOccupied = 0
    for (let i = 0; i < px; i++) {
      if (accum[i] <= 0) continue
      initialSum += accum[i]
      initialOccupied++
    }
    if (initialOccupied > 0) autoGain = (TARGET_LEVEL * initialOccupied) / initialSum
  }
  const gain = autoGain * p.exposure

  // Tone map and decay in one pass. `decay === 0` clears the buffer, so trails
  // off costs exactly the same as trails on. The same pass measures the frame
  // for the auto-exposure below, for two adds per occupied pixel.
  let sum = 0
  let occupied = 0
  for (let i = 0; i < px; i++) {
    const v = accum[i]
    if (v > 0) {
      const k = v * gain
      out[i] = palette[k >= 255 ? 255 : k | 0]
      accum[i] = v * decay
      sum += v
      occupied++
    } else {
      out[i] = empty
    }
  }

  // Auto-exposure, metered off the frame just drawn.
  //
  // A fixed gain cannot serve both a cosmological patch — matter spread thinly
  // over the whole field — and a merger remnant, where most of the mass ends up
  // inside a few dozen pixels. Anything static is either a grey cosmos or a
  // blown-out galaxy. Metering the mean occupied density and easing the gain
  // toward whatever puts it at a fixed point on the tone curve fixes both, and
  // it also absorbs the 1/(1-decay) brightening that switching trails on would
  // otherwise cause. Slow enough not to pump on a passing supernova.
  if (occupied > 0) {
    const want = (TARGET_LEVEL * occupied) / sum
    const ease = autoGain > 0
      ? 1 - Math.exp(-Math.max(1 / 240, elapsedSeconds) / 0.75)
      : 1
    autoGain += (want - autoGain) * ease
  }

  if (!p.events) return

  // Starbursts: a fast blue-white flash expanding and decaying over ~1 s.
  for (const b of bursts) {
    const age = (clock - b.born) / BURST_LIFE
    const f = (1 - age) * (1 - age)
    const sx = u.cosmological
      ? wrapPeriodic(b.x - frameCx - view.panX, u.boxHalf) * scale + rw * 0.5
      : b.x * scale + ox
    const sy = u.cosmological
      ? rh * 0.5 - wrapPeriodic(b.y - frameCy - view.panY, u.boxHalf) * scale
      : oy - b.y * scale
    if (sx < -8 || sy < -8 || sx > rw + 8 || sy > rh + 8) continue
    sprite(out, sx, sy, 2 + 5 * (1 - f), 255 * f, 240 * f, 200 * f)
  }

  // Quasars: a hard blue-white core with diffraction spikes, fading in and out
  // across the halo's active lifetime. Their intrinsic variability is kept
  // deliberately slow and subtle; a fast 22% pulse looked exactly like a
  // dropped-frame or adaptive-resolution fault.
  for (const q of quasars) {
    const age = (clock - q.born) / q.life
    const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, age)))
    const variability = 0.97 + 0.03 * Math.sin(clock * 1.4 + q.phase)
    const f = envelope * variability * (0.55 + q.mass)
    if (f <= 0.02) continue
    const sx = u.cosmological
      ? wrapPeriodic(q.x - frameCx - view.panX, u.boxHalf) * scale + rw * 0.5
      : q.x * scale + ox
    const sy = u.cosmological
      ? rh * 0.5 - wrapPeriodic(q.y - frameCy - view.panY, u.boxHalf) * scale
      : oy - q.y * scale
    if (sx < -40 || sy < -40 || sx > rw + 40 || sy > rh + 40) continue
    spikes(out, sx, sy, 9 + 26 * f, 150 * f, 190 * f, 255 * f)
    sprite(out, sx, sy, 2.5 + 4 * f, 255 * f, 250 * f, 255 * f)
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function reportFault(error: unknown): void {
  faulted = true
  scheduled = false
  const message = error instanceof Error ? error.message : String(error)
  ctx.postMessage({ t: "fault", message: `Simulation paused: ${message}` })
}

function tick(): void {
  try {
    runTick()
  } catch (error) {
    reportFault(error)
  }
}

function runTick(): void {
  scheduled = false
  if (!running || !params || !uni || pool.length === 0) return

  const now = performance.now()
  const advancing = params.substeps > 0
  const dtSec = advancing ? (lastTick ? Math.min(0.25, (now - lastTick) / 1000) : 1 / 60) : 0
  lastTick = advancing ? now : 0
  if (advancing) clock += dtSec
  renderRequested = false

  const t0 = performance.now()
  for (let s = 0; s < params.substeps; s++) uni.step()
  const t1 = performance.now()

  syncGlow()
  if (advancing && clock - lastEventScan >= 0.1) {
    scanEvents(clock - lastEventScan)
    lastEventScan = clock
  }

  const buf = pool.pop()!
  render(buf, dtSec, advancing)
  const t2 = performance.now()

  stats.stepMs = t1 - t0
  stats.drawMs = t2 - t1
  stats.cells = uni.stats.cells
  stats.depth = uni.stats.depth
  stats.nearPairs = uni.stats.nearPairs
  stats.translations = uni.stats.translations
  stats.speedup = uni.stats.speedup
  stats.cosmological = uni.cosmological
  stats.a = uni.a
  stats.z = uni.z
  stats.time = uni.time
  stats.epoch = uni.epoch()
  stats.done = uni.done
  stats.quasars = quasars.length
  stats.bursts = burstTotal
  stats.solver = uni.stats.solver
  stats.particles = uni.nMass + uni.nTracer
  stats.peakCellMass = uni.stats.peakCellMass
  stats.occupiedCells = uni.stats.occupiedCells
  stats.health =
    uni.cosmological && uni.a > 0.15 && uni.stats.peakCellMass > 0.04
      ? "resolution-limit"
      : "stable"

  ctx.postMessage({ t: "frame", buf, w: rw, h: rh, stats: { ...stats } }, [buf])
  kick()
}

function kick(force = false): void {
  if (force) renderRequested = true
  if (
    scheduled ||
    !running ||
    faulted ||
    pool.length === 0 ||
    rw === 0 ||
    (params?.substeps === 0 && !renderRequested)
  ) return
  scheduled = true
  setTimeout(tick, 0)
}

function resize(w: number, h: number): void {
  const nextAccum = resampleConservative(accum, rw, rh, w, h)
  rw = w
  rh = h
  accum = nextAccum
  sampleX0 = new Int32Array(w)
  sampleX1 = new Int32Array(w)
  sampleXF = new Float32Array(w)
  sampleXInside = new Uint8Array(w)
  sampleY0 = new Int32Array(h)
  sampleY1 = new Int32Array(h)
  sampleYF = new Float32Array(h)
  sampleYInside = new Uint8Array(h)
  pool.length = 0
  pool.push(new ArrayBuffer(w * h * 4), new ArrayBuffer(w * h * 4))
  kick(true)
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

ctx.addEventListener("message", (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  try {
    switch (msg.t) {
      case "start":
        params = { ...msg.params }
        view = { ...msg.view }
        accent = msg.accent
        faulted = false
        reset()
        running = true
        ctx.postMessage({ t: "ready" })
        kick(true)
        break

      case "params": {
        if (!params || !uni) return
        const prev = params
        params = { ...params, ...msg.params }
        const structural =
          msg.reseed ||
          params.preset !== prev.preset ||
          params.seed !== prev.seed ||
          params.nMass !== prev.nMass ||
          params.nTracer !== prev.nTracer ||
          params.meshSize !== prev.meshSize
        if (structural) {
          faulted = false
          reset()
        } else {
          if (params.order !== prev.order) uni.setOrder(params.order)
          if (params.softening !== prev.softening) uni.setSoftening(params.softening)
          if (params.events !== prev.events) {
            glowKey = -1
            syncGlow()
          }
        }
        kick(true)
        break
      }

      case "replay":
        if (params) {
          faulted = false
          reset()
        }
        kick(true)
        break

      case "view":
        view = { ...msg.view }
        // Trails live in screen space; retaining them through a camera
        // transform would ghost the old coordinate system over the new one.
        accum.fill(0)
        kick(true)
        break

      case "accent":
        accent = msg.accent
        glowKey = -1
        syncGlow()
        kick(true)
        break

      case "resize":
        if (msg.w > 0 && msg.h > 0 && (msg.w !== rw || msg.h !== rh)) resize(msg.w, msg.h)
        break

      case "recycle":
        // Only keep buffers that still match the current geometry; a resize
        // orphans the old pair mid-flight.
        if (msg.buf.byteLength === rw * rh * 4) pool.push(msg.buf)
        kick()
        break

      case "stop":
        running = false
        break
    }
  } catch (error) {
    reportFault(error)
  }
})
