/**
 * The FILAMENT page/worker contract.
 *
 * Everything expensive — integration, force solve, halo finding, analysis,
 * splatting — happens in the worker. The main thread only ever hands over
 * parameters and blits a finished pixel buffer, so a 40 ms simulation step
 * never touches the site's frame budget, its scroll, or its other canvases.
 *
 * Pixel buffers are *transferred*, not copied, and handed straight back after
 * being drawn. Two of them circulate, which is enough for the worker to be
 * computing frame n+1 while the page paints frame n, and few enough that the
 * pool doubles as backpressure: if the page stalls, the worker runs out of
 * buffers and stops rendering instead of queueing frames nobody will see.
 *
 * Instruments (spectra, censuses, profiles) travel separately, a few times a
 * second, as plain arrays: they change at the analysis cadence, not per frame.
 */

import type { CosmologyName } from "./cosmology"
import type { DarkMatter, PresetName } from "./presets"
import type { DensityPdf, WebCensus, WebClass } from "./analysis"

/**
 * How the field is coloured. Brightness is always surface density; a lens adds
 * a second quantity as hue, so structure stays legible under every reading.
 */
export type LensName = "density" | "web" | "flow" | "potential" | "redshift" | "doppler"

export interface SimParams {
  preset: PresetName
  seed: number
  nMass: number
  nTracer: number
  /** Width of the periodic force mesh used by cosmological worlds. */
  meshSize: number
  /** Expansion order p — the accuracy dial. Higher is slower and truer. */
  order: number
  /** Physics substeps per rendered frame; 0 pauses. */
  substeps: number
  /** Multiplier on the preset's softening length. */
  softening: number
  /** Brightness multiplier for the density tone map. */
  exposure: number
  /** Trail persistence authored at 60 Hz; the worker converts it to wall time. */
  trails: number
  /** Draw quasars, starbursts and the recombination afterglow. */
  events: boolean
  /** Colouring of the field. */
  lens: LensName
  /** Background universe for Cosmos. */
  cosmology: CosmologyName
  /** Free-streaming species for Cosmos. */
  darkMatter: DarkMatter
  /** Linear rms density contrast Cosmos would reach today. */
  amplitude: number
  /** Measure and post instrument readings. */
  instruments: boolean
}

export interface ViewParams {
  /** Zoom multiplier over the framed extent. */
  zoom: number
  /** Pan offset in world units. */
  panX: number
  panY: number
  /** Follow the particle distribution automatically. */
  autoFit: boolean
}

export type ToWorker =
  | { t: "start"; params: SimParams; view: ViewParams; accent: [number, number, number] }
  | { t: "params"; params: Partial<SimParams>; reseed?: boolean }
  | { t: "view"; view: ViewParams }
  | { t: "accent"; accent: [number, number, number] }
  | { t: "resize"; w: number; h: number }
  | { t: "recycle"; buf: ArrayBuffer }
  /** Read the field under a raster pixel; null stops probing. */
  | { t: "probe"; at: { x: number; y: number } | null }
  | { t: "replay" }
  | { t: "stop" }

export interface SimStats {
  /** Wall-clock milliseconds for the last physics step. */
  stepMs: number
  /** Wall-clock milliseconds for the last splat + tone map. */
  drawMs: number
  /** Wall-clock milliseconds for the last analysis pass. */
  analysisMs: number
  /** Force cells in the active tree or periodic mesh. */
  cells: number
  depth: number
  /** Direct pairs summed by FMM; zero for the particle mesh. */
  nearPairs: number
  /** FMM translations or the particle mesh's estimated FFT butterflies. */
  translations: number
  /**
   * How many times more pairwise work the naive O(N²) sum would have been,
   * counting an M2L translation as its p² complex multiply-adds.
   */
  speedup: number
  solver: "fmm" | "pm"
  /** Total integrated particle count. */
  particles: number
  /** Fraction of total mass in the densest force cell. */
  peakCellMass: number
  occupiedCells: number
  health: "stable" | "resolution-limit"
  /** Raster pixels per world unit — lets the page turn drag pixels into world pan. */
  scale: number

  /** True while the cosmological integrator is in charge. */
  cosmological: boolean
  /** Scale factor, redshift, and cosmic time (in units of 1/H₀). */
  a: number
  z: number
  time: number
  /** Linear growth factor D(a), D(today) = 1. */
  growth: number
  /** Named epoch, for the readout. */
  epoch: string
  /** Set once the run reaches the present day. */
  done: boolean
  /** Currently active quasars. */
  quasars: number
  /** Starbursts / supernovae fired since the run began. */
  bursts: number
}

/** Measurements of the periodic box, posted a few times a second. */
export interface CosmicInstruments {
  kind: "cosmic"
  a: number
  /** Integer wavenumber of each populated spectrum bin. */
  k: number[]
  /** Measured Δ²(k), CIC-deconvolved. */
  measured: number[]
  /** Linear-theory Δ²(k) for this realisation, D(a)² · Δ²_lin,today. 0 where none. */
  linear: number[]
  /** Poisson shot-noise floor 2πk²/N. */
  shot: number[]
  /** Wavenumber at which linear Δ² crosses 1, or null if nowhere in range. */
  kNL: number | null
  /** Measured growth of the largest modes, against the D(a) curve. */
  growth: { lnA: number[]; measured: number[] }
  growthTheory: { lnA: number[]; D: number[] }
  pdf: DensityPdf
  web: WebCensus | null
}

/** Measurements of an isolated system, posted a few times a second. */
export interface IsolatedInstruments {
  kind: "isolated"
  /** Code time of each history sample. */
  t: number[]
  virial: number[]
  r10: number[]
  r50: number[]
  r90: number[]
  rotation: { r: number[]; vPhi: number[]; vCirc: number[] }
  /** |L − L₀| / Σm|r||v| since the start of the run. */
  angularDrift: number
  /** |Σmv| / Σm|v|. */
  momentumDrift: number
}

export type Instruments = CosmicInstruments | IsolatedInstruments

/** What lies under the pointer. */
export interface ProbeReading {
  /** World coordinates (code units). */
  x: number
  y: number
  cosmological: boolean
  /** Density contrast δ on the force mesh. */
  delta?: number
  /** T-web class, if the web has been measured. */
  web?: WebClass
  /** Peculiar potential in σ, if measured. */
  phi?: number
  /** ∇·v / H, if the flow lens is active. */
  theta?: number
}

export type FromWorker =
  | { t: "frame"; buf: ArrayBuffer; w: number; h: number; stats: SimStats }
  | { t: "instruments"; data: Instruments }
  | { t: "probe"; reading: ProbeReading | null }
  | { t: "ready" }
  | { t: "fault"; message: string }
