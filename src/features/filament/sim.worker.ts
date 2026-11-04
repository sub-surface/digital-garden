/**
 * FILAMENT simulation worker — the loop, the instruments, the luminous events,
 * and the raster.
 *
 * The physics lives in `universe.ts` and the measurements in `analysis.ts`
 * (both headlessly testable); this file owns what only a worker can: the frame
 * loop, the pixel buffers, and the message contract in `protocol.ts`.
 *
 * Per frame:
 *   1. advance the {@link Universe} by `substeps`
 *   2. every ~0.2 s, run the analysis pass: spectra, web, flow, profiles
 *   3. scan solver-independent density cells; light quasars, fire starbursts
 *   4. splat density (and the lens quantity) into the raster, tone-map it
 */

import { Universe } from "./universe"
import { cmbGlow, COSMOLOGIES, PATCH_MPC, type Afterglow } from "./cosmology"
import { wrapPeriodic } from "./particle-mesh"
import { depositCic, resampleConservative, timedDecay } from "./density-raster"
import {
  MeshAnalysis,
  densityPdf,
  depositPeriodic,
  isolatedDiagnostics,
  type WebCensus,
  type WebClass,
} from "./analysis"
import { K_BINS, kBinCentre } from "./spectrum"
import { sampleGrowth } from "./cosmology"
import {
  HUE_BINS,
  HUE_SCALE,
  buildDensityPalette,
  buildLensPalette,
  lensHasHue,
  signedHue,
  type Rgb,
} from "./palettes"
import type {
  FromWorker,
  LensName,
  ProbeReading,
  SimParams,
  SimStats,
  ToWorker,
  ViewParams,
} from "./protocol"

/** Brightness of a massive particle relative to a tracer. */
const MASS_WEIGHT = 2.6
/** Tone-map index the auto-exposure aims the mean occupied pixel at. */
const TARGET_LEVEL = 7.5
/** Wall-clock seconds between analysis passes while running. */
const ANALYSIS_PERIOD = 0.2
/** T-web smoothing (3 comoving Mpc) and eigenvalue threshold. */
const WEB_SMOOTHING = 3 / PATCH_MPC
const WEB_THRESHOLD = 0.3
/** Wavenumbers treated as "the largest modes" for the growth instrument. */
const GROWTH_K_MAX = 4.5
/** History arrays are halved, keeping every other sample, past this length. */
const HISTORY_CAP = 360

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
/** Doppler numerator: Σ weight·hue, so hue = hueAccum / accum survives trails. */
let hueAccum = new Float32Array(0)
/** Per-pixel lens hue for mesh lenses; −1 outside the periodic patch. */
let hueFrame = new Float32Array(0)
const palette = new Uint32Array(256)
const lensLut = new Uint32Array(HUE_BINS * 256)
let accent: Rgb = [0.71, 0.26, 0.3]
let glowKey = -1
let lutKey = ""
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

// --- analysis state ---------------------------------------------------------
let analysis: MeshAnalysis | null = null
/** Lens hue on the force mesh, 0–1. */
let hueMesh = new Float32Array(0)
/** Redshift-space density on the force mesh. */
let rsdMesh = new Float32Array(0)
let lastAnalysis = -Infinity
let analysisDirty = true
let webValid = false
let phiValid = false
let flowValid = false
let lastCensus: WebCensus | null = null
const spectrum = new Float64Array(K_BINS)
let growthHistory = { lnA: [] as number[], measured: [] as number[] }
let isoHistory = { t: [] as number[], virial: [] as number[], r10: [] as number[], r50: [] as number[], r90: [] as number[] }
let angularZero: number | null = null
let probeAt: { x: number; y: number } | null = null

const stats: SimStats = {
  stepMs: 0, drawMs: 0, analysisMs: 0, cells: 0, depth: 0, nearPairs: 0, translations: 0,
  speedup: 1, scale: 1, cosmological: false, a: 1, z: 0, time: 0, growth: 1,
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

/** The lens actually in force: a cosmological lens falls back in isolated worlds. */
function activeLens(): LensName {
  const lens = params?.lens ?? "density"
  const cosmo = !!uni?.cosmological
  if (lens === "doppler") return cosmo ? "density" : lens
  if (lens === "density") return lens
  return cosmo ? lens : "density"
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
  if (!p.events || activeLens() !== "density") {
    quasars.length = 0
    bursts.length = 0
    return
  }

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
  const burstRate = 8 * dtSec * (u.cosmological ? 0.3 + noon : 1)

  u.forEachDensityCell((m, cellX, cellY, h) => {
    if (m < burstThreshold) return

    if (rand() < burstRate * m) {
      bursts.push({ x: cellX + (rand() - 0.5) * h, y: cellY + (rand() - 0.5) * h, born: clock })
      burstTotal++
    }

    if (m < quasarThreshold) return
    // One quasar per halo, judged at a fraction of the *system* rather than of
    // a cell, so a wandering nucleus does not re-ignite as the tree deepens.
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
// Palettes
// ---------------------------------------------------------------------------

/** Rebuild the density palette only when the afterglow has visibly moved. */
function syncGlow(): void {
  const lit = uni?.cosmological && params?.events && activeLens() === "density"
  const glow: Afterglow = lit ? cmbGlow(uni!.a) : { strength: 0, r: 0, g: 0, b: 0 }
  const key = Math.round(glow.strength * 96) * 128 + Math.round(glow.g * 64)
  if (key === glowKey) return
  glowKey = key
  buildDensityPalette(palette, accent, glow)
}

function syncLensLut(): void {
  const lens = activeLens()
  if (!lensHasHue(lens)) return
  const key = `${lens}:${accent.join(",")}`
  if (key === lutKey) return
  lutKey = key
  buildLensPalette(lensLut, lens, accent)
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function pushHistory<T extends Record<string, number[]>>(h: T, values: { [K in keyof T]: number }): void {
  const keys = Object.keys(h) as (keyof T)[]
  for (const k of keys) h[k].push(values[k])
  if (h[keys[0]].length > HISTORY_CAP) {
    for (const k of keys) h[k] = h[k].filter((_, i) => i % 2 === 0) as T[keyof T]
  }
}

/** Transcribe the active lens quantity onto the mesh hue field. */
function refreshHueMesh(): void {
  const an = analysis
  if (!an) return
  const lens = activeLens()
  const cells = hueMesh.length
  if (lens === "web" && webValid) {
    for (let i = 0; i < cells; i++) hueMesh[i] = an.web[i] * 0.5
  } else if (lens === "flow" && flowValid) {
    for (let i = 0; i < cells; i++) hueMesh[i] = signedHue(an.theta[i], HUE_SCALE.flow)
  } else if (lens === "potential" && phiValid) {
    for (let i = 0; i < cells; i++) hueMesh[i] = signedHue(an.phi[i], HUE_SCALE.potential)
  }
}

function analyse(advancing: boolean): void {
  const p = params!
  const u = uni!
  const t0 = performance.now()
  const lens = activeLens()

  if (u.pm && analysis) {
    const an = analysis
    an.load(u.pm.cellMass)
    an.powerSpectrum(spectrum)
    if (lens === "web" || p.instruments || probeAt) {
      lastCensus = an.tidalWeb(WEB_SMOOTHING, WEB_THRESHOLD)
      webValid = true
    }
    if (lens === "potential" || probeAt) {
      an.potential()
      phiValid = true
    }
    if (lens === "flow") {
      an.flow(
        [
          { c: u.masses, n: u.nMass },
          { c: u.tracers, n: u.nTracer },
        ],
        1 / (u.a * u.a * u.hubbleRate),
      )
      flowValid = true
    }
    refreshHueMesh()

    // Growth of the largest modes, recorded whether or not anyone is looking,
    // so opening the instruments mid-run shows the whole history.
    const D = u.growthFactor
    let meas = 0
    let lin = 0
    for (let b = 0; b < K_BINS; b++) {
      if (kBinCentre(b) > GROWTH_K_MAX || u.linearToday[b] <= 0 || spectrum[b] <= 0) continue
      meas += spectrum[b]
      lin += u.linearToday[b]
    }
    if (lin > 0 && (advancing || growthHistory.lnA.length === 0)) {
      const lnA = Math.log(u.a)
      const last = growthHistory.lnA[growthHistory.lnA.length - 1]
      if (last === undefined || lnA > last) pushHistory(growthHistory, { lnA, measured: Math.sqrt(meas / lin) })
    }

    if (p.instruments) postCosmic(D)
  } else if (!u.cosmological) {
    const diag = isolatedDiagnostics(u.masses, u.nMass)
    if (angularZero === null) angularZero = diag.angularMomentum
    const last = isoHistory.t[isoHistory.t.length - 1]
    if (last === undefined || u.time > last) {
      pushHistory(isoHistory, {
        t: u.time,
        virial: diag.virial,
        r10: diag.lagrangian[0],
        r50: diag.lagrangian[1],
        r90: diag.lagrangian[2],
      })
    }
    if (p.instruments) {
      ctx.postMessage({
        t: "instruments",
        data: {
          kind: "isolated",
          ...isoHistory,
          rotation: diag.rotation,
          angularDrift: Math.abs(diag.angularMomentum - angularZero) / Math.max(1e-12, diag.angularScale),
          momentumDrift: diag.momentumDrift,
        },
      })
    }
  }

  if (probeAt) postProbe()
  stats.analysisMs = performance.now() - t0
}

function postCosmic(D: number): void {
  const u = uni!
  const total = u.nMass + u.nTracer
  const k: number[] = []
  const measured: number[] = []
  const linear: number[] = []
  const shot: number[] = []
  let kNL: number | null = null
  let prevK = 0
  let prevLin = 0
  for (let b = 0; b < K_BINS; b++) {
    if (spectrum[b] <= 0) continue
    const kc = kBinCentre(b)
    const lin = u.linearToday[b] * D * D
    k.push(kc)
    measured.push(spectrum[b])
    linear.push(lin)
    shot.push((2 * Math.PI * kc * kc) / total)
    // Largest scale at which linear theory has reached Δ² = 1: where the box
    // stops being describable as small ripples.
    if (kNL === null && lin >= 1) {
      kNL = prevLin > 0 && prevLin < 1
        ? Math.exp(Math.log(prevK) + (Math.log(kc) - Math.log(prevK)) * (-Math.log(prevLin) / (Math.log(lin) - Math.log(prevLin))))
        : kc
    }
    if (lin > 0) {
      prevK = kc
      prevLin = lin
    }
  }

  // The theory curve is fixed per universe; 64 samples across the run.
  const theoryLnA: number[] = []
  const theoryD: number[] = []
  const lo = Math.log(1 / 1101)
  for (let i = 0; i <= 64; i++) {
    const s = lo + (0 - lo) * (i / 64)
    theoryLnA.push(s)
    theoryD.push(sampleGrowth(u.growth, Math.exp(s)).D)
  }

  ctx.postMessage({
    t: "instruments",
    data: {
      kind: "cosmic",
      a: u.a,
      k,
      measured,
      linear,
      shot,
      kNL,
      growth: { lnA: [...growthHistory.lnA], measured: [...growthHistory.measured] },
      growthTheory: { lnA: theoryLnA, D: theoryD },
      pdf: densityPdf(analysis!.delta),
      web: lastCensus,
    },
  })
}

/** Screen raster pixel → world coordinates under the current camera. */
function rasterToWorld(px: number, py: number): { x: number; y: number } {
  const u = uni!
  const scale = stats.scale
  let x = (px - rw * 0.5) / scale + frameCx + view.panX
  let y = (rh * 0.5 - py) / scale + frameCy + view.panY
  if (u.cosmological) {
    x = wrapPeriodic(x, u.boxHalf)
    y = wrapPeriodic(y, u.boxHalf)
  }
  return { x, y }
}

function postProbe(): void {
  const u = uni
  if (!u || !probeAt || rw === 0) return
  const { x, y } = rasterToWorld(probeAt.x, probeAt.y)
  const reading: ProbeReading = { x, y, cosmological: u.cosmological }
  if (u.pm && analysis) {
    const n = analysis.n
    const half = u.pm.half
    if (Math.abs((probeAt.x - rw * 0.5) / stats.scale) < half && Math.abs((rh * 0.5 - probeAt.y) / stats.scale) < half) {
      const ix = Math.min(n - 1, Math.max(0, Math.floor(((x + half) / (2 * half)) * n)))
      const iy = Math.min(n - 1, Math.max(0, Math.floor(((y + half) / (2 * half)) * n)))
      const i = iy * n + ix
      reading.delta = analysis.delta[i]
      if (webValid) reading.web = analysis.web[i] as WebClass
      if (phiValid) reading.phi = analysis.phi[i]
      if (flowValid && activeLens() === "flow") reading.theta = analysis.theta[i]
    }
  }
  ctx.postMessage({ t: "probe", reading })
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
    ic: {
      cosmology: COSMOLOGIES[p.cosmology] ?? COSMOLOGIES.planck,
      darkMatter: p.darkMatter,
      amplitude: p.amplitude,
    },
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
  hueAccum.fill(0)
  rng = (p.seed | 1) >>> 0

  if (uni.pm) {
    const n = uni.pm.size
    if (!analysis || analysis.n !== n) analysis = new MeshAnalysis(n, uni.pm.half)
    if (hueMesh.length !== n * n) {
      hueMesh = new Float32Array(n * n)
      rsdMesh = new Float32Array(n * n)
    }
    hueMesh.fill(0.5)
  } else {
    analysis = null
  }
  webValid = phiValid = flowValid = false
  lastCensus = null
  growthHistory = { lnA: [], measured: [] }
  isoHistory = { t: [], virial: [], r10: [], r50: [], r90: [] }
  angularZero = null
  lastAnalysis = -Infinity
  analysisDirty = true
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

/**
 * Continuous CIC particle raster for isolated FMM scenarios. With `doppler`
 * set, each deposit also carries its line-of-sight speed as hue.
 */
function splatParticles(u: Universe, scale: number, ox: number, oy: number, doppler: boolean): void {
  const splat = (c: { x: Float32Array; y: Float32Array; vy: Float32Array }, n: number, weight: number) => {
    const { x: cx, y: cy, vy } = c
    for (let i = 0; i < n; i++) {
      const sx = cx[i] * scale + ox
      const sy = oy - cy[i] * scale
      if (sx < -1 || sx >= rw || sy < -1 || sy >= rh) continue
      depositCic(accum, rw, rh, sx, sy, weight)
      if (doppler) depositCic(hueAccum, rw, rh, sx, sy, weight * signedHue(vy[i], HUE_SCALE.doppler))
    }
  }
  splat(u.tracers, u.nTracer, 1)
  splat(u.masses, u.nMass, MASS_WEIGHT)
}

/**
 * Reconstruct a periodic mesh field directly into the raster.
 *
 * The mesh is the simulation's actual resolved mass field. Showing individual
 * nearest-pixel particles below that scale adds sampling noise, not physical
 * detail. Bilinear reconstruction gives continuous motion, costs no particle
 * splat pass, and makes visual and force resolution agree. A lens hue field on
 * the same mesh is sampled with the same weights in the same pass.
 */
function splatPeriodicMesh(u: Universe, scale: number, rho: Float32Array, hue: Float32Array | null): void {
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

  const patchPixels = Math.max(1, Math.pow(2 * half * scale, 2))
  const densityScale = ((u.nMass + u.nTracer) * n * n) / patchPixels
  if (hue) hueFrame.fill(-1)
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
      const wx0 = 1 - tx
      const a = rho[y0 + x0] * wx0 + rho[y0 + x1] * tx
      const b = rho[y1 + x0] * wx0 + rho[y1 + x1] * tx
      accum[row + x] += (a * wy0 + b * ty) * densityScale
      if (hue) {
        const ha = hue[y0 + x0] * wx0 + hue[y0 + x1] * tx
        const hb = hue[y1 + x0] * wx0 + hue[y1 + x1] * tx
        hueFrame[row + x] = ha * wy0 + hb * ty
      }
    }
  }
}

/** Redshift-space density: positions displaced by v_los / (aH) along y. */
function depositRedshiftSpace(u: Universe): Float32Array {
  const pm = u.pm!
  rsdMesh.fill(0)
  const total = u.nMass + u.nTracer
  // u = a²ẋ, so the peculiar velocity over the Hubble rate, in comoving
  // length, is u / (a²H): exactly the drift factor's own combination.
  const shift = 1 / (u.a * u.a * u.hubbleRate)
  depositPeriodic(rsdMesh, pm.size, pm.half, u.masses, u.nMass, 1 / total, shift)
  depositPeriodic(rsdMesh, pm.size, pm.half, u.tracers, u.nTracer, 1 / total, shift)
  return rsdMesh
}

function render(buf: ArrayBuffer, elapsedSeconds: number, advancing: boolean): void {
  const p = params!
  const u = uni!
  const out = new Uint32Array(buf)
  const px = rw * rh
  const lens = activeLens()

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

  let hueMode: "none" | "mesh" | "particle" = "none"
  if (u.pm) {
    const rho = lens === "redshift" ? depositRedshiftSpace(u) : u.pm.cellMass
    const meshHue = lensHasHue(lens) && (webValid || phiValid || flowValid)
    splatPeriodicMesh(u, scale, rho, meshHue ? hueMesh : null)
    if (meshHue) hueMode = "mesh"
  } else {
    const doppler = lens === "doppler"
    splatParticles(u, scale, ox, oy, doppler)
    if (doppler) hueMode = "particle"
  }
  syncLensLut()

  // Paused redraws are fresh static reconstructions. They must not brighten
  // merely because a view or palette message requested the same state again.
  const decay = advancing ? timedDecay(p.trails, elapsedSeconds) : 0
  const empty = palette[0]
  // Flow and potential paint empty space too: voids are where they speak.
  const fillEmpty = lens === "flow" || lens === "potential"

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
  const hueTop = HUE_BINS - 1e-3

  // Tone map and decay in one pass. `decay === 0` clears the buffer, so trails
  // off costs exactly the same as trails on. The same pass meters the frame.
  let sum = 0
  let occupied = 0
  for (let i = 0; i < px; i++) {
    const v = accum[i]
    if (v > 0) {
      const k = v * gain
      const idx = k >= 255 ? 255 : k | 0
      if (hueMode === "mesh") {
        const h = hueFrame[i]
        out[i] = h < 0 ? palette[idx] : lensLut[(((h * hueTop) | 0) << 8) | idx]
      } else if (hueMode === "particle") {
        const h = hueAccum[i] / v
        out[i] = lensLut[(((h * hueTop) | 0) << 8) | idx]
        hueAccum[i] *= decay
      } else {
        out[i] = palette[idx]
      }
      accum[i] = v * decay
      sum += v
      occupied++
    } else if (fillEmpty && hueMode === "mesh" && hueFrame[i] >= 0) {
      out[i] = lensLut[((hueFrame[i] * hueTop) | 0) << 8]
    } else {
      out[i] = empty
      if (hueMode === "particle") hueAccum[i] = 0
    }
  }

  // Auto-exposure, metered off the frame just drawn: a fixed gain cannot serve
  // both a thin cosmological field and a merger remnant packed into a few
  // dozen pixels. Slow enough not to pump on a passing supernova.
  if (occupied > 0) {
    const want = (TARGET_LEVEL * occupied) / sum
    const ease = autoGain > 0
      ? 1 - Math.exp(-Math.max(1 / 240, elapsedSeconds) / 0.75)
      : 1
    autoGain += (want - autoGain) * ease
  }

  if (!p.events || lens !== "density") return

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
  // across the halo's active lifetime, with slow, subtle variability.
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
  const advancing = params.substeps > 0 && !(uni.cosmological && uni.done)
  const dtSec = advancing ? (lastTick ? Math.min(0.25, (now - lastTick) / 1000) : 1 / 60) : 0
  lastTick = advancing ? now : 0
  if (advancing) clock += dtSec
  renderRequested = false

  const t0 = performance.now()
  for (let s = 0; s < params.substeps; s++) uni.step()
  const t1 = performance.now()

  syncGlow()
  if (analysisDirty || (advancing && clock - lastAnalysis >= ANALYSIS_PERIOD)) {
    analysisDirty = false
    lastAnalysis = clock
    analyse(advancing)
  }
  if (advancing && clock - lastEventScan >= 0.1) {
    scanEvents(clock - lastEventScan)
    lastEventScan = clock
  }

  const buf = pool.pop()!
  const t2 = performance.now()
  render(buf, dtSec, advancing)
  const t3 = performance.now()

  stats.stepMs = t1 - t0
  stats.drawMs = t3 - t2
  stats.cells = uni.stats.cells
  stats.depth = uni.stats.depth
  stats.nearPairs = uni.stats.nearPairs
  stats.translations = uni.stats.translations
  stats.speedup = uni.stats.speedup
  stats.cosmological = uni.cosmological
  stats.a = uni.a
  stats.z = uni.z
  stats.time = uni.time
  stats.growth = uni.cosmological ? uni.growthFactor : 1
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
    (params?.substeps === 0 && !renderRequested) ||
    (uni?.cosmological && uni.done && !renderRequested)
  ) return
  scheduled = true
  setTimeout(tick, 0)
}

function resize(w: number, h: number): void {
  const nextAccum = resampleConservative(accum, rw, rh, w, h)
  const nextHue = resampleConservative(hueAccum, rw, rh, w, h)
  rw = w
  rh = h
  accum = nextAccum
  hueAccum = nextHue
  hueFrame = new Float32Array(w * h)
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
          params.meshSize !== prev.meshSize ||
          params.cosmology !== prev.cosmology ||
          params.darkMatter !== prev.darkMatter ||
          params.amplitude !== prev.amplitude
        if (structural) {
          faulted = false
          reset()
        } else {
          if (params.order !== prev.order) uni.setOrder(params.order)
          if (params.softening !== prev.softening) uni.setSoftening(params.softening)
          if (params.events !== prev.events || params.lens !== prev.lens) {
            glowKey = -1
            syncGlow()
          }
          if (params.lens !== prev.lens) {
            // Trails belong to one reading of the field; carrying them into
            // another would ghost the old colouring over the new.
            accum.fill(0)
            hueAccum.fill(0)
            analysisDirty = true
          }
          if (params.instruments && !prev.instruments) analysisDirty = true
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
        hueAccum.fill(0)
        kick(true)
        break

      case "accent":
        accent = msg.accent
        glowKey = -1
        lutKey = ""
        syncGlow()
        kick(true)
        break

      case "probe": {
        const wasProbing = probeAt !== null
        probeAt = msg.at
        if (!probeAt) {
          ctx.postMessage({ t: "probe", reading: null })
        } else if (!wasProbing && uni?.cosmological && (!webValid || !phiValid)) {
          // The first probe needs fields the current lens may not compute.
          analysisDirty = true
          kick(true)
        } else {
          postProbe()
        }
        break
      }

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
