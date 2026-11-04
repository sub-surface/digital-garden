/**
 * The FILAMENT page/worker contract.
 *
 * Everything expensive (integration, force solve, halo finding, analysis,
 * rasterising) happens in the worker, and so does the camera: the page sends
 * gestures — pan by these pixels, zoom by this factor about that point — and
 * the worker moves one camera through the nested layers (`layers/layer.ts`).
 * The main thread only blits finished pixel buffers.
 *
 * Pixel buffers are *transferred*, not copied, and handed straight back after
 * being drawn. Two circulate: enough for the worker to compute frame n+1 while
 * the page paints frame n, few enough that the pool doubles as backpressure.
 *
 * Instruments (spectra, censuses, profiles) travel separately, a few times a
 * second, as plain arrays.
 */

import type { CosmologyName } from "./engine/cosmology"
import type { DarkMatter } from "./engine/ics"
import type { DensityPdf, WebCensus, WebClass } from "./engine/analysis"
import type { NucleusReadout } from "./layers/nucleus"

/**
 * How the field is coloured. Brightness is always the light (or mass); a lens
 * adds a second quantity as hue, so structure stays legible under every one.
 */
export type LensName =
  | "density" | "streams" | "web" | "flow" | "potential" | "redshift"
  | "doppler" | "origin"
  | "orbits"

/** The three nested scales: the cosmic web, one halo's galaxy, its black hole. */
export type LevelName = "web" | "galaxy" | "nucleus"

/** What one code unit of a layer is, physically. */
export interface WorldUnits {
  /** kpc per code length (comoving in the web, physical below it). */
  kpc: number
  /** km/s per code velocity. */
  kms: number
  /** Myr per code time. */
  myr: number
}

/** A halo as the page shows it: hover card, breadcrumb, URL. */
export interface HaloCard {
  /** Smallest lattice index among members; stable, and deep-linkable. */
  id: number
  members: number
  massSun: number
  radiusKpc: number
  sigmaKms: number
  /** Rotational support, 0 (hot) to 1 (cold disc). */
  spin: number
  /** Redshift at which the halo was found. */
  z: number
}

export interface SimParams {
  seed: number
  /** Massive particles a galaxy may spend (dark matter + stars). */
  nMass: number
  /** The web's Lagrangian lattice width (particles = grid²) and force mesh. */
  grid: number
  meshSize: number
  /** FMM expansion order for galaxies. */
  order: number
  /** Playback rate; 0 pauses. */
  substeps: number
  /** Brightness multiplier. */
  exposure: number
  /** Trail persistence authored at 60 Hz; the worker converts it to wall time. */
  trails: number
  /** Draw quasars, starbursts, the recombination afterglow and halo rings. */
  events: boolean
  lens: LensName
  cosmology: CosmologyName
  darkMatter: DarkMatter
  /** σ₈: rms linear contrast today in 8 Mpc top-hats. */
  amplitude: number
  /** Measure and post instrument readings. */
  instruments: boolean
}

/** Where to go once the world exists: a deep link. */
export interface Destination {
  /** Redshift to run the web to. */
  z: number
  /** Lattice index of a member of the halo to descend into; −1 for the heaviest. */
  halo: number
  /** Carry on down to its black hole. */
  nucleus: boolean
}

type Px = { x: number; y: number }

export type ToWorker =
  | { t: "start"; params: SimParams; accent: [number, number, number]; destination?: Destination; lone?: boolean }
  | { t: "params"; params: Partial<SimParams>; reseed?: boolean }
  | { t: "accent"; accent: [number, number, number] }
  | { t: "resize"; w: number; h: number }
  | { t: "recycle"; buf: ArrayBuffer }
  /** Pan the camera by a drag of (dx, dy) raster pixels. */
  | { t: "pan"; dx: number; dy: number }
  /** Zoom by `factor` about raster pixel `at`. */
  | { t: "zoom"; at: Px; factor: number }
  /** Frame the current layer whole. */
  | { t: "home" }
  /** Read the field under a raster pixel; null stops probing. */
  | { t: "probe"; at: Px | null }
  /** A click: dive into the halo or the galaxy's heart under it, or place an orbit. */
  | { t: "click"; at: Px }
  /** In the nucleus: a press at `from` released at `to`, raster pixels — a throw. */
  | { t: "launch"; from: Px; to: Px }
  /** Climb to the layer above (`to` names one further up). */
  | { t: "ascend"; to?: LevelName }
  /** Scrub the web's history to scale factor a. */
  | { t: "seek"; a: number }
  | { t: "goto"; destination: Destination }
  | { t: "replay" }
  | { t: "stop" }

export interface SimStats {
  stepMs: number
  drawMs: number
  analysisMs: number
  /** Force cells, tree depth, near pairs, translations of the layer in view. */
  cells: number
  depth: number
  nearPairs: number
  translations: number
  speedup: number
  solver: "fmm" | "pm" | "geodesic"
  particles: number
  peakCellMass: number

  /** The web's epoch: scale factor, redshift, age (1/H₀), growth, named epoch. */
  cosmological: boolean
  a: number
  z: number
  time: number
  growth: number
  epoch: string
  done: boolean
  quasars: number
  bursts: number

  /** The layer the camera is in, and the layers that exist beneath the web. */
  level: LevelName
  stack: LevelName[]
  /** Whose clock is running: the deepest layer on screen. */
  running: LevelName
  /** The halo whose galaxy is built, if any. */
  focus: HaloCard | null
  /** The black hole's mass, if one is built. */
  holeMass: number | null
  /** Clocks of the deeper layers: galaxy time (code units) and hole time (M). */
  galaxyTime: number
  galaxyMyr: number
  holeTime: number
  holeSeconds: number
  /** kpc per raster pixel, at the camera's layer; and whether that is comoving. */
  kpcPerPx: number
  comoving: boolean
  /** True while the camera is flying itself, or the web is being run on. */
  moving: boolean
  /** A black hole with no universe above it (the arcade's GEODESIC). */
  lone: boolean
  /** Zoom is at its limit here, and why ("" if not). */
  limit: string
}

/** Measurements of the periodic box. */
export interface CosmicInstruments {
  kind: "cosmic"
  a: number
  k: number[]
  measured: number[]
  linear: number[]
  shot: number[]
  kNL: number | null
  growth: { lnA: number[]; measured: number[] }
  growthTheory: { lnA: number[]; D: number[] }
  pdf: DensityPdf
  web: WebCensus | null
}

/** Measurements of a galaxy. */
export interface GalaxyInstruments {
  kind: "galaxy"
  t: number[]
  virial: number[]
  r10: number[]
  r50: number[]
  r90: number[]
  rotation: { r: number[]; vPhi: number[]; vCirc: number[] }
  angularDrift: number
  momentumDrift: number
  units: WorldUnits
}

/** The black hole: the selected orbit's well, and the infall clocks. */
export interface NucleusInstruments extends NucleusReadout {
  kind: "nucleus"
  massSun: number
  units: WorldUnits
  /** Coordinate time elapsed, M. */
  time: number
}

export type Instruments = CosmicInstruments | GalaxyInstruments | NucleusInstruments

/** What lies under the pointer. */
export interface ProbeReading {
  x: number
  y: number
  cosmological: boolean
  delta?: number
  web?: WebClass
  phi?: number
  theta?: number
  /** A halo under the pointer, which a click would dive into. */
  halo?: HaloCard
  units: WorldUnits
}

export type FromWorker =
  | { t: "frame"; buf: ArrayBuffer; w: number; h: number; stats: SimStats }
  | { t: "instruments"; data: Instruments }
  | { t: "probe"; reading: ProbeReading | null }
  | { t: "ready" }
  | { t: "fault"; message: string }
