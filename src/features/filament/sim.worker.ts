/**
 * FILAMENT simulation worker — the loop, the instruments, the luminous events,
 * and the raster.
 *
 * Two machines run here, and they share nothing below the message contract:
 *
 *   • Cosmos (`cosmos.ts`) — a periodic expanding box, evolved by FastPM and
 *     drawn by folding its dark-matter sheet into pixels (`sheet.ts`).
 *     Physics runs on its own schedule (steps equal in ln D) and the display
 *     interpolates between steps, so playback speed and accuracy are
 *     independent. The box is periodic, and so is the picture: pan forever.
 *
 *   • Isolated worlds (`universe.ts`) — discs, mergers, streams, collapses on
 *     the FMM, drawn with adaptive kernels sized to the local particle density.
 *
 * The measurements live in `analysis.ts`, the colours in `palettes.ts`; this
 * file owns what only a worker can: the frame loop, the pixel buffers, and the
 * message contract in `protocol.ts`.
 */

import { Universe } from "./universe"
import { Cosmos } from "./cosmos"
import { A_REC, cmbGlow, COSMOLOGIES, PATCH_MPC, type Afterglow } from "./cosmology"
import { wrapPeriodic } from "./particle-mesh"
import { depositCic, resampleConservative, timedDecay } from "./density-raster"
import { SheetRaster } from "./sheet"
import {
  MeshAnalysis,
  densityPdf,
  isolatedDiagnostics,
  type WebCensus,
  type WebClass,
} from "./analysis"
import { K_BINS, kBinCentre } from "./spectrum"
import {
  HUE_BINS,
  HUE_SCALE,
  buildDensityPalette,
  buildLensPalette,
  buildLogTone,
  LOG_TONE,
  lensHasHue,
  signedHue,
  streamHue,
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
/** Tone-map index the isolated auto-exposure aims the mean occupied pixel at. */
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
/** Seconds from recombination to today at ▶. */
const RUN_SECONDS = 70
/** Wall-clock budget for physics catch-up per frame. */
const STEP_BUDGET_MS = 22
/** Share of the playback clock spent per e-fold of expansion vs of growth. */
const CLOCK_EXPANSION_SHARE = 0.22
/** The camera never pulls back further than this in Cosmos (tiles explode). */
const COSMOS_MIN_ZOOM = 0.4
/** Neighbours inside an isolated-world kernel; sets the adaptive radius. */
const KERNEL_NEIGHBOURS = 7
const KERNEL_MAX_PX = 5
/** Coarse cell, in pixels, for the isolated-world local density estimate. */
const COARSE_PX = 8

const ctx = globalThis as unknown as {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void
  addEventListener(type: "message", cb: (e: MessageEvent<ToWorker>) => void): void
}

let params: SimParams | null = null
let view: ViewParams = { zoom: 1, panX: 0, panY: 0, autoFit: true }
let cosmos: Cosmos | null = null
let uni: Universe | null = null

let frameCx = 0, frameCy = 0, frameHalf = 1
let rng = 1

let accum = new Float32Array(0)
/** Doppler numerator: Σ weight·hue, so hue = hueAccum / accum survives trails. */
let hueAccum = new Float32Array(0)
let coarse = new Float32Array(0)
let coarseW = 0
let coarseH = 0
const sheet = new SheetRaster()
const palette = new Uint32Array(256)
const lensLut = new Uint32Array(HUE_BINS * 256)
const logTone = buildLogTone()
let accent: Rgb = [0.71, 0.26, 0.3]
let glowKey = -1
let lutKey = ""
/** Metered exposure for isolated worlds; 0 means "not yet measured". */
let autoGain = 0
let rw = 0, rh = 0
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

// --- cosmos playback --------------------------------------------------------
/** Playback position, 0 at recombination and 1 today. */
let playhead = 0
/** Scale factor on screen; lies within the cosmos's current step. */
let aShow = A_REC
/** Interpolated (display) vertex positions. */
let dispX = new Float32Array(0)
let dispY = new Float32Array(0)

// --- analysis state ---------------------------------------------------------
let analysis: MeshAnalysis | null = null
/** Force-mesh mass binned down to the analysis mesh. */
let analysisMass = new Float32Array(0)
/** Lens hue on the analysis mesh, 0–1. */
let hueMesh = new Float32Array(0)
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
  particles: 0, peakCellMass: 0, occupiedCells: 0,
}

/** xorshift32 — the worker's own stream, for presentation only. */
function rand(): number {
  rng ^= rng << 13
  rng ^= rng >>> 17
  rng ^= rng << 5
  return (rng >>> 0) / 4294967296
}

/** The lens actually in force: each world offers only the lenses it can read. */
function activeLens(): LensName {
  const lens = params?.lens ?? "density"
  if (lens === "density") return lens
  if (cosmos) return lens === "doppler" ? "density" : lens
  return lens === "doppler" ? lens : "density"
}

// ---------------------------------------------------------------------------
// Cosmos playback clock
// ---------------------------------------------------------------------------

/**
 * Playback position of scale factor a: a blend of e-folds of expansion and
 * e-folds of growth. Pure ln a would spend most of the run in the dark ages,
 * where nothing moves; pure ln D would flash through them in a frame. The
 * blend gives the afterglow a few seconds and the web the rest.
 */
function playheadOf(c: Cosmos, a: number): number {
  const lnRec = Math.log(A_REC)
  const dRec = Math.log(c.history.growth(A_REC))
  const e = (Math.log(a) - lnRec) / -lnRec
  const g = (Math.log(c.history.growth(a)) - dRec) / -dRec
  return CLOCK_EXPANSION_SHARE * e + (1 - CLOCK_EXPANSION_SHARE) * g
}

function scaleFactorAtPlayhead(c: Cosmos, s: number): number {
  if (s <= 0) return A_REC
  if (s >= 1) return 1
  let lo = Math.log(A_REC)
  let hi = 0
  for (let i = 0; i < 36; i++) {
    const mid = 0.5 * (lo + hi)
    if (playheadOf(c, Math.exp(mid)) < s) lo = mid
    else hi = mid
  }
  return Math.exp(0.5 * (lo + hi))
}

/** Advance the playhead and run physics until it covers the epoch shown. */
function advanceCosmos(c: Cosmos, dtSec: number, rate: number): void {
  playhead = Math.min(1, playhead + (dtSec * rate) / RUN_SECONDS)
  const want = scaleFactorAtPlayhead(c, playhead)
  const t0 = performance.now()
  while (!c.done && c.a < want && performance.now() - t0 < STEP_BUDGET_MS) c.step()
  if (c.a < want) {
    // Physics is behind: show what exists rather than run ahead of it.
    aShow = c.a
    playhead = playheadOf(c, aShow)
  } else {
    aShow = Math.max(c.aPrev, want)
  }
}

// ---------------------------------------------------------------------------
// Luminous events
// ---------------------------------------------------------------------------

/**
 * Quasars and starbursts are not dynamics — they carry no mass and exert no
 * force. They are a *reading* of the dynamics: both are triggered by the mass
 * and compactness of the halo they sit in, which either force solver has
 * already measured on its cells.
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

function forEachDensityCell(cb: (mass: number, x: number, y: number, size: number) => void): void {
  if (cosmos) cosmos.forEachDensityCell(cb)
  else uni?.forEachDensityCell(cb)
}

/**
 * Scan the force cells for halos and decide what lights up.
 *
 * Quasars need a deep potential well and a supply of gas, so they track the
 * most massive compact halos — and their space density peaks sharply at
 * z ≈ 2, "cosmic noon", then falls away as the fuel runs out. In the isolated
 * scenarios compactness alone decides, which is why the merger lights one at
 * coalescence, as galaxy mergers are thought to do.
 *
 * Starbursts fire at a rate proportional to local surface density — roughly
 * the Kennicutt-Schmidt law, and roughly where supernovae actually go off.
 */
function scanEvents(dtSec: number): void {
  const p = params!
  if (!p.events || activeLens() !== "density") {
    quasars.length = 0
    bursts.length = 0
    return
  }
  const cosmological = !!cosmos
  const boxHalf = cosmos ? cosmos.half : uni!.boxHalf

  let peak = 0
  forEachDensityCell((mass) => {
    if (mass > peak) peak = mass
  })
  if (peak <= 0) return

  const z = 1 / aShow - 1
  // Cosmic noon: a log-normal in (1+z) peaking at z ≈ 2.
  const noon = cosmological ? Math.exp(-Math.pow(Math.log((1 + z) / 3) / 0.62, 2)) : 1
  const quasarThreshold = peak * 0.45
  const burstThreshold = peak * (cosmological ? 0.12 : 0.05)
  const burstRate = 8 * dtSec * (cosmological ? 0.3 + noon : 1)

  forEachDensityCell((m, cellX, cellY, h) => {
    if (m < burstThreshold) return

    if (rand() < burstRate * m) {
      bursts.push({ x: cellX + (rand() - 0.5) * h, y: cellY + (rand() - 0.5) * h, born: clock })
      burstTotal++
    }

    if (m < quasarThreshold) return
    const near = Math.max(h * 2.5, boxHalf * 0.05)
    let occupied = false
    for (const q of quasars) {
      const dx = cosmological ? wrapPeriodic(cellX - q.x, boxHalf) : cellX - q.x
      const dy = cosmological ? wrapPeriodic(cellY - q.y, boxHalf) : cellY - q.y
      if (Math.abs(dx) < near && Math.abs(dy) < near) {
        q.x += dx * 0.25
        q.y += dy * 0.25
        if (cosmological) {
          q.x = wrapPeriodic(q.x, boxHalf)
          q.y = wrapPeriodic(q.y, boxHalf)
        }
        occupied = true
        break
      }
    }
    if (occupied || quasars.length >= (cosmological ? 5 : 2)) return
    if (rand() < (cosmological ? 0.04 * noon : 0.012)) {
      quasars.push({
        x: cellX,
        y: cellY,
        mass: m / peak,
        born: clock,
        life: 3 + rand() * 7,
        phase: rand() * Math.PI * 2,
      })
    }
  })

  quasars = quasars.filter((q) => clock - q.born < q.life)
  bursts = bursts.filter((b) => clock - b.born < BURST_LIFE)
  if (bursts.length > 300) bursts.splice(0, bursts.length - 300)
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

/** Rebuild the density palette only when the afterglow has visibly moved. */
function syncGlow(): void {
  const lit = !!cosmos && params?.events && activeLens() === "density"
  const glow: Afterglow = lit ? cmbGlow(aShow) : { strength: 0, r: 0, g: 0, b: 0 }
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

/** Sum a fine periodic mesh down to the analysis mesh, block by block. */
function binDown(src: Float32Array, n: number, dst: Float32Array, m: number): void {
  if (n === m) {
    dst.set(src)
    return
  }
  dst.fill(0)
  const f = n / m
  for (let y = 0; y < n; y++) {
    const row = ((y / f) | 0) * m
    for (let x = 0; x < n; x++) dst[row + ((x / f) | 0)] += src[y * n + x]
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
  const t0 = performance.now()
  const lens = activeLens()

  if (cosmos && analysis) {
    const c = cosmos
    const an = analysis
    binDown(c.pm.cellMass, c.pm.size, analysisMass, an.n)
    an.load(analysisMass)
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
      an.flow([{ c: c.cloud, n: c.n }], 1 / (c.a * c.a * c.hubbleRate))
      flowValid = true
    }
    refreshHueMesh()

    // Growth of the largest modes, recorded whether or not anyone is looking,
    // so opening the instruments mid-run shows the whole history.
    let meas = 0
    let lin = 0
    for (let b = 0; b < K_BINS; b++) {
      if (kBinCentre(b) > GROWTH_K_MAX || c.linearToday[b] <= 0 || spectrum[b] <= 0) continue
      meas += spectrum[b]
      lin += c.linearToday[b]
    }
    if (lin > 0 && (advancing || growthHistory.lnA.length === 0)) {
      const lnA = Math.log(c.a)
      const last = growthHistory.lnA[growthHistory.lnA.length - 1]
      if (last === undefined || lnA > last) pushHistory(growthHistory, { lnA, measured: Math.sqrt(meas / lin) })
    }

    if (p.instruments) postCosmic(c)
  } else if (uni) {
    const u = uni
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

function postCosmic(c: Cosmos): void {
  const D = c.growthFactor
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
    const lin = c.linearToday[b] * D * D
    k.push(kc)
    measured.push(spectrum[b])
    linear.push(lin)
    shot.push((2 * Math.PI * kc * kc) / c.n)
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

  const theoryLnA: number[] = []
  const theoryD: number[] = []
  const lo = Math.log(A_REC)
  for (let i = 0; i <= 64; i++) {
    const s = lo * (1 - i / 64)
    theoryLnA.push(s)
    theoryD.push(c.history.growth(Math.exp(s)))
  }

  ctx.postMessage({
    t: "instruments",
    data: {
      kind: "cosmic",
      a: c.a,
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
  const scale = stats.scale
  let x = (px - rw * 0.5) / scale + frameCx + view.panX
  let y = (rh * 0.5 - py) / scale + frameCy + view.panY
  if (cosmos) {
    x = wrapPeriodic(x, cosmos.half)
    y = wrapPeriodic(y, cosmos.half)
  }
  return { x, y }
}

function postProbe(): void {
  if (!probeAt || rw === 0 || (!cosmos && !uni)) return
  const { x, y } = rasterToWorld(probeAt.x, probeAt.y)
  const reading: ProbeReading = { x, y, cosmological: !!cosmos }
  if (cosmos && analysis) {
    const n = analysis.n
    const half = cosmos.half
    const ix = Math.min(n - 1, Math.max(0, Math.floor(((x + half) / (2 * half)) * n)))
    const iy = Math.min(n - 1, Math.max(0, Math.floor(((y + half) / (2 * half)) * n)))
    const i = iy * n + ix
    reading.delta = analysis.delta[i]
    if (webValid) reading.web = analysis.web[i] as WebClass
    if (phiValid) reading.phi = analysis.phi[i]
    if (flowValid && activeLens() === "flow") reading.theta = analysis.theta[i]
  }
  ctx.postMessage({ t: "probe", reading })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function reset(): void {
  const p = params!
  cosmos = null
  uni = null
  if (p.preset === "cosmos") {
    const c = new Cosmos({
      seed: p.seed,
      grid: p.grid,
      meshSize: p.meshSize,
      ic: {
        cosmology: COSMOLOGIES[p.cosmology] ?? COSMOLOGIES.planck,
        darkMatter: p.darkMatter,
        amplitude: p.amplitude,
      },
    })
    cosmos = c
    frameHalf = 1
    playhead = 0
    aShow = c.a
    if (dispX.length !== c.n) {
      dispX = new Float32Array(c.n)
      dispY = new Float32Array(c.n)
    }
    const an = Math.min(256, c.pm.size, Math.max(64, c.grid))
    if (!analysis || analysis.n !== an) analysis = new MeshAnalysis(an, c.half)
    if (hueMesh.length !== an * an) {
      hueMesh = new Float32Array(an * an)
      analysisMass = new Float32Array(an * an)
    }
    hueMesh.fill(0.5)
  } else {
    uni = new Universe({
      preset: p.preset,
      seed: p.seed,
      nMass: p.nMass,
      nTracer: p.nTracer,
      order: p.order,
      softening: p.softening,
    })
    frameHalf = uni.extent
    analysis = null
  }
  frameCx = 0
  frameCy = 0
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
 * Adaptive-kernel splat for the isolated worlds.
 *
 * A fixed bilinear kernel shows a galaxy's outskirts as scattered grains and
 * its core as a saturated blob. Here each particle's kernel is sized so that
 * about {@link KERNEL_NEIGHBOURS} others fall inside it — the SPH convention —
 * from a coarse count of particles per screen cell. Sparse regions become
 * smooth fields; dense ones keep their full, pixel-sharp resolution.
 */
function splatParticles(u: Universe, scale: number, ox: number, oy: number, doppler: boolean): void {
  const cw = Math.ceil(rw / COARSE_PX)
  const ch = Math.ceil(rh / COARSE_PX)
  if (cw !== coarseW || ch !== coarseH) {
    coarseW = cw
    coarseH = ch
    coarse = new Float32Array(cw * ch)
  }
  coarse.fill(0)
  const clouds = [
    { c: u.tracers, n: u.nTracer, weight: 1 },
    { c: u.masses, n: u.nMass, weight: MASS_WEIGHT },
  ]
  const invC = 1 / COARSE_PX
  for (const { c, n } of clouds) {
    for (let i = 0; i < n; i++) {
      const sx = c.x[i] * scale + ox
      const sy = oy - c.y[i] * scale
      if (sx < 0 || sx >= rw || sy < 0 || sy >= rh) continue
      coarse[((sy * invC) | 0) * cw + ((sx * invC) | 0)]++
    }
  }
  const perPx = 1 / (COARSE_PX * COARSE_PX)
  const h2Scale = KERNEL_NEIGHBOURS / Math.PI
  for (const { c, n, weight } of clouds) {
    const { x: cx, y: cy, vy } = c
    for (let i = 0; i < n; i++) {
      const sx = cx[i] * scale + ox
      const sy = oy - cy[i] * scale
      if (sx < -KERNEL_MAX_PX || sx >= rw + KERNEL_MAX_PX || sy < -KERNEL_MAX_PX || sy >= rh + KERNEL_MAX_PX) continue
      const gx = Math.min(cw - 1, Math.max(0, (sx * invC) | 0))
      const gy = Math.min(ch - 1, Math.max(0, (sy * invC) | 0))
      const density = Math.max(1, coarse[gy * cw + gx]) * perPx
      const h = Math.min(KERNEL_MAX_PX, Math.sqrt(h2Scale / density))
      const hue = doppler ? signedHue(vy[i], HUE_SCALE.doppler) : 0
      if (h < 1.25) {
        depositCic(accum, rw, rh, sx, sy, weight)
        if (doppler) depositCic(hueAccum, rw, rh, sx, sy, weight * hue)
        continue
      }
      // (1 − r²/h²)², which integrates to πh²/3 over the disc.
      const norm = (3 * weight) / (Math.PI * h * h)
      const invH2 = 1 / (h * h)
      const y0 = Math.max(0, Math.ceil(sy - h))
      const y1 = Math.min(rh - 1, Math.floor(sy + h))
      const x0 = Math.max(0, Math.ceil(sx - h))
      const x1 = Math.min(rw - 1, Math.floor(sx + h))
      for (let y = y0; y <= y1; y++) {
        const dy = y - sy
        const row = y * rw
        for (let x = x0; x <= x1; x++) {
          const dx = x - sx
          const q = 1 - (dx * dx + dy * dy) * invH2
          if (q <= 0) continue
          const wgt = norm * q * q
          accum[row + x] += wgt
          if (doppler) hueAccum[row + x] += wgt * hue
        }
      }
    }
  }
}

/** Per-pixel mesh-lens hue, sampled bilinearly from the periodic analysis mesh. */
function sampleHue(px: number, py: number, scale: number, cx: number, cy: number): number {
  const n = analysis!.n
  const g = n / 2 // cells per world unit (box side 2)
  const wx = (px + 0.5 - rw * 0.5) / scale + cx + 1
  const wy = (rh * 0.5 - py - 0.5) / scale + cy + 1
  const gx = wx * g - 0.5
  const gy = wy * g - 0.5
  const fx = Math.floor(gx)
  const fy = Math.floor(gy)
  const tx = gx - fx
  const ty = gy - fy
  const x0 = ((fx % n) + n) % n
  const y0 = ((fy % n) + n) % n
  const x1 = x0 + 1 === n ? 0 : x0 + 1
  const y1 = y0 + 1 === n ? 0 : y0 + 1
  const a = hueMesh[y0 * n + x0] * (1 - tx) + hueMesh[y0 * n + x1] * tx
  const b = hueMesh[y1 * n + x0] * (1 - tx) + hueMesh[y1 * n + x1] * tx
  return a * (1 - ty) + b * ty
}

function renderCosmos(c: Cosmos, out: Uint32Array): void {
  const p = params!
  const lens = activeLens()
  const zoom = Math.max(COSMOS_MIN_ZOOM, view.zoom)
  const scale = (Math.min(rw, rh) * 0.5 * zoom) / frameHalf
  stats.scale = scale
  const camX = wrapPeriodic(view.panX, c.half)
  const camY = wrapPeriodic(view.panY, c.half)

  // Display vertices: within a FastPM step every particle moves on a straight
  // line linear in D, so this interpolation *is* the drift.
  const w = c.displayWeight(aShow)
  const { x, y, prevX, prevY, vy } = c
  const n = c.n
  if (lens === "redshift") {
    // Distance read from redshift: s = y + v_y/H, comoving — u/(a²H).
    const shift = 1 / (aShow * aShow * c.history.hubble(aShow))
    for (let i = 0; i < n; i++) {
      dispX[i] = prevX[i] + (x[i] - prevX[i]) * w
      dispY[i] = prevY[i] + (y[i] - prevY[i]) * w + vy[i] * shift
    }
  } else {
    for (let i = 0; i < n; i++) {
      dispX[i] = prevX[i] + (x[i] - prevX[i]) * w
      dispY[i] = prevY[i] + (y[i] - prevY[i]) * w
    }
  }
  sheet.resize(rw, rh)
  sheet.draw(dispX, dispY, c.grid, 2 * c.half, { cx: camX, cy: camY, scale })
  syncLensLut()

  const density = sheet.density
  const bits = new Int32Array(density.buffer)
  const streams = sheet.streams
  const { lut, keyLo } = logTone
  const top = lut.length - 1
  const offset = Math.round(Math.log2(Math.max(1e-3, p.exposure)) * LOG_TONE.perOctave) - keyLo
  const meshHue = (lens === "web" && webValid) || (lens === "flow" && flowValid) || (lens === "potential" && phiValid)
  const hueTop = HUE_BINS - 1e-3
  const px = rw * rh
  if (lens === "streams") {
    for (let i = 0; i < px; i++) {
      const k = density[i] > 0 ? bits[i] >> 16 : -1e9
      const q = k + offset
      const idx = q <= 0 ? 0 : q >= top ? lut[top] : lut[q]
      out[i] = lensLut[(((streamHue(streams[i]) * hueTop) | 0) << 8) | idx]
    }
  } else if (meshHue) {
    for (let py = 0; py < rh; py++) {
      const row = py * rw
      for (let pxx = 0; pxx < rw; pxx++) {
        const i = row + pxx
        const k = density[i] > 0 ? bits[i] >> 16 : -1e9
        const q = k + offset
        const idx = q <= 0 ? 0 : q >= top ? lut[top] : lut[q]
        const h = sampleHue(pxx, py, scale, camX, camY)
        out[i] = lensLut[(((h * hueTop) | 0) << 8) | idx]
      }
    }
  } else {
    for (let i = 0; i < px; i++) {
      const k = density[i] > 0 ? bits[i] >> 16 : -1e9
      const q = k + offset
      out[i] = palette[q <= 0 ? 0 : q >= top ? lut[top] : lut[q]]
    }
  }

  if (!p.events || lens !== "density") return
  const toScreen = (wx: number, wy: number): [number, number] => [
    wrapPeriodic(wx - camX, c.half) * scale + rw * 0.5,
    rh * 0.5 - wrapPeriodic(wy - camY, c.half) * scale,
  ]
  drawEvents(out, toScreen, 0.6)
}

/** Starbursts and quasars, in screen space; `size` scales the sprites. */
function drawEvents(out: Uint32Array, toScreen: (x: number, y: number) => [number, number], size: number): void {
  for (const b of bursts) {
    const age = (clock - b.born) / BURST_LIFE
    const f = (1 - age) * (1 - age)
    const [sx, sy] = toScreen(b.x, b.y)
    if (sx < -8 || sy < -8 || sx > rw + 8 || sy > rh + 8) continue
    sprite(out, sx, sy, (2 + 5 * (1 - f)) * size, 255 * f, 240 * f, 200 * f)
  }
  for (const q of quasars) {
    const age = (clock - q.born) / q.life
    const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, age)))
    const variability = 0.97 + 0.03 * Math.sin(clock * 1.4 + q.phase)
    const f = envelope * variability * (0.55 + q.mass)
    if (f <= 0.02) continue
    const [sx, sy] = toScreen(q.x, q.y)
    if (sx < -40 || sy < -40 || sx > rw + 40 || sy > rh + 40) continue
    spikes(out, sx, sy, (9 + 26 * f) * size, 150 * f, 190 * f, 255 * f)
    sprite(out, sx, sy, (2.5 + 4 * f) * size, 255 * f, 250 * f, 255 * f)
  }
}

function renderIsolated(u: Universe, out: Uint32Array, elapsedSeconds: number, advancing: boolean): void {
  const p = params!
  const lens = activeLens()
  if (view.autoFit) {
    const k = 0.05
    frameCx += (u.boxCx - frameCx) * k
    frameCy += (u.boxCy - frameCy) * k
    frameHalf += (u.boxHalf * 1.08 - frameHalf) * k
  }
  const scale = (Math.min(rw, rh) * 0.5 * view.zoom) / Math.max(1e-6, frameHalf)
  const ox = rw * 0.5 - (frameCx + view.panX) * scale
  const oy = rh * 0.5 + (frameCy + view.panY) * scale
  stats.scale = scale

  const doppler = lens === "doppler"
  splatParticles(u, scale, ox, oy, doppler)
  syncLensLut()

  // Paused redraws are fresh static reconstructions. They must not brighten
  // merely because a view or palette message requested the same state again.
  const decay = advancing ? timedDecay(p.trails, elapsedSeconds) : 0
  const empty = palette[0]
  const px = rw * rh

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

  // Tone map and decay in one pass; the same pass meters the frame.
  let sum = 0
  let occupied = 0
  for (let i = 0; i < px; i++) {
    const v = accum[i]
    if (v > 1e-4) {
      const k = v * gain
      const idx = k >= 255 ? 255 : k | 0
      if (doppler) {
        const h = Math.max(0, Math.min(1, hueAccum[i] / v))
        out[i] = lensLut[(((h * hueTop) | 0) << 8) | idx]
        hueAccum[i] *= decay
      } else {
        out[i] = palette[idx]
      }
      accum[i] = v * decay
      sum += v
      occupied++
    } else {
      out[i] = empty
      accum[i] = 0
      hueAccum[i] = 0
    }
  }

  // Auto-exposure, metered off the frame just drawn. Slow enough not to pump
  // on a passing supernova.
  if (occupied > 0) {
    const want = (TARGET_LEVEL * occupied) / sum
    const ease = autoGain > 0 ? 1 - Math.exp(-Math.max(1 / 240, elapsedSeconds) / 0.75) : 1
    autoGain += (want - autoGain) * ease
  }

  if (!p.events || lens !== "density") return
  drawEvents(out, (x, y) => [x * scale + ox, oy - y * scale], 1)
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

function finished(): boolean {
  return !!cosmos && cosmos.done && playhead >= 1
}

function runTick(): void {
  scheduled = false
  if (!running || !params || (!cosmos && !uni) || pool.length === 0) return

  const now = performance.now()
  const advancing = params.substeps > 0 && !finished()
  const dtSec = advancing ? (lastTick ? Math.min(0.25, (now - lastTick) / 1000) : 1 / 60) : 0
  lastTick = advancing ? now : 0
  if (advancing) clock += dtSec
  renderRequested = false

  const t0 = performance.now()
  if (advancing) {
    if (cosmos) advanceCosmos(cosmos, dtSec, params.substeps)
    else for (let s = 0; s < params.substeps; s++) uni!.step()
  }
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
  const out = new Uint32Array(buf)
  const t2 = performance.now()
  if (cosmos) renderCosmos(cosmos, out)
  else renderIsolated(uni!, out, dtSec, advancing)
  const t3 = performance.now()

  if (advancing || stats.stepMs === 0) stats.stepMs = t1 - t0
  stats.drawMs = t3 - t2
  stats.quasars = quasars.length
  stats.bursts = burstTotal
  if (cosmos) {
    const c = cosmos
    const pm = c.pm.stats
    stats.cosmological = true
    stats.solver = "pm"
    stats.cells = pm.cells
    stats.depth = Math.log2(c.pm.size)
    stats.nearPairs = 0
    stats.translations = pm.fftOps
    stats.speedup = (c.n * (c.n - 1)) / Math.max(1, c.n * 10 + pm.fftOps)
    stats.particles = c.n
    stats.peakCellMass = pm.peakCellMass
    stats.occupiedCells = pm.occupied
    stats.a = aShow
    stats.z = 1 / aShow - 1
    stats.time = c.history.ageAt(aShow)
    stats.growth = c.history.growth(aShow)
    stats.done = finished()
    stats.epoch = stats.done ? "today" : c.epochAt(aShow)
  } else {
    const u = uni!
    stats.cosmological = false
    stats.solver = "fmm"
    stats.cells = u.stats.cells
    stats.depth = u.stats.depth
    stats.nearPairs = u.stats.nearPairs
    stats.translations = u.stats.translations
    stats.speedup = u.stats.speedup
    stats.particles = u.nMass + u.nTracer
    stats.peakCellMass = u.stats.peakCellMass
    stats.occupiedCells = u.stats.occupiedCells
    stats.a = 1
    stats.z = 0
    stats.time = u.time
    stats.growth = 1
    stats.done = false
    stats.epoch = ""
  }

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
    (finished() && !renderRequested)
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
        if (!params || (!cosmos && !uni)) return
        const prev = params
        params = { ...params, ...msg.params }
        const cosmic = params.preset === "cosmos"
        const structural =
          msg.reseed ||
          params.preset !== prev.preset ||
          params.seed !== prev.seed ||
          (cosmic
            ? params.grid !== prev.grid ||
              params.meshSize !== prev.meshSize ||
              params.cosmology !== prev.cosmology ||
              params.darkMatter !== prev.darkMatter ||
              params.amplitude !== prev.amplitude
            : params.nMass !== prev.nMass || params.nTracer !== prev.nTracer)
        if (structural) {
          faulted = false
          reset()
        } else {
          if (uni && params.order !== prev.order) uni.setOrder(params.order)
          if (uni && params.softening !== prev.softening) uni.setSoftening(params.softening)
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
        } else if (!wasProbing && cosmos && (!webValid || !phiValid)) {
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
