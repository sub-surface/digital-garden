/**
 * The FILAMENT page/worker contract.
 *
 * Everything expensive — integration, tree build, halo finding, splatting —
 * happens in the worker. The main thread only ever hands over parameters and
 * blits a finished pixel buffer, so a 40 ms simulation step never touches the
 * site's frame budget, its scroll, or its other canvases.
 *
 * Pixel buffers are *transferred*, not copied, and handed straight back after
 * being drawn. Two of them circulate, which is enough for the worker to be
 * computing frame n+1 while the page paints frame n, and few enough that the
 * pool doubles as backpressure: if the page stalls, the worker runs out of
 * buffers and stops rendering instead of queueing frames nobody will see.
 */

import type { PresetName } from "./presets"

export interface SimParams {
  preset: PresetName
  seed: number
  nMass: number
  nTracer: number
  /** Expansion order p — the accuracy dial. Higher is slower and truer. */
  order: number
  /** Physics substeps per rendered frame; 0 pauses. */
  substeps: number
  /** Multiplier on the preset's softening length. */
  softening: number
  /** Brightness multiplier for the density tone map. */
  exposure: number
  /** Per-frame decay of the accumulation buffer; 0 clears (no trails). */
  trails: number
  /** Draw quasars, starbursts and the recombination afterglow. */
  events: boolean
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
  | { t: "replay" }
  | { t: "stop" }

export interface SimStats {
  /** Wall-clock milliseconds for the last physics step. */
  stepMs: number
  /** Wall-clock milliseconds for the last splat + tone map. */
  drawMs: number
  /** Leaf cells in the current tree. */
  cells: number
  depth: number
  /** Direct pair interactions summed in the near field. */
  nearPairs: number
  /** Cell-to-cell M2L translations performed. */
  translations: number
  /**
   * How many times more pairwise work the naive O(N²) sum would have been,
   * counting an M2L translation as its p² complex multiply-adds.
   */
  speedup: number
  /** World units per pixel⁻¹ — lets the page turn drag pixels into world pan. */
  scale: number

  /** True while the cosmological integrator is in charge. */
  cosmological: boolean
  /** Scale factor, redshift, and cosmic time (in units of 1/H₀). */
  a: number
  z: number
  time: number
  /** Named epoch, for the readout. */
  epoch: string
  /** Set once the run reaches the present day. */
  done: boolean
  /** Currently active quasars. */
  quasars: number
  /** Starbursts / supernovae fired since the run began. */
  bursts: number
}

export type FromWorker =
  | { t: "frame"; buf: ArrayBuffer; w: number; h: number; stats: SimStats }
  | { t: "ready" }
