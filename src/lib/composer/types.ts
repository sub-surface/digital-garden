/**
 * Apparatus — intermediate representation (IR) + registry interfaces.
 *
 * The IR is the spine: plain, serialisable data that the grammar writes, the
 * layout solver resolves, the renderer reads, and the editor mutates. Nothing
 * downstream bakes a decision that belongs upstream. Everything is plate-space
 * `0..1` so ratio changes and hi-res export are trivial.
 *
 * (Product name: "Apparatus". The internal module stays `composer` to avoid a
 * collision with the IR's `Apparatus` chrome type and the `"apparatus"` pen
 * role, both defined here.)
 */

// ─── Pens & palettes ─────────────────────────────────────────────────────────

/** Colour is assigned by *role*, never by literal hex at motif level. */
export type PenRole = "structure" | "annotation" | "highlight" | "shadow" | "apparatus"

export const PEN_ROLES: PenRole[] = ["structure", "annotation", "highlight", "shadow", "apparatus"]

export interface Pen {
  role: PenRole
  color: string // vector hex — what SVG export uses (era pass may remap it later)
  name: string
}

export interface Palette {
  id: string
  name: string
  pens: Pen[]
  source: "named" | "accent"
}

// ─── Geometry ────────────────────────────────────────────────────────────────

/** Axis-aligned box in plate-space `0..1`. */
export type Box = { x: number; y: number; w: number; h: number }

export interface Anchor {
  id: string
  x: number
  y: number // plate-space 0..1
  kind: "port" | "label" | "mount"
  dir?: number // outward normal (radians) — routing hint
}

// ─── Vector primitive vocabulary ─────────────────────────────────────────────
// Motifs emit primitives + anchors only; they never pick colour or dither. The
// renderer resolves `pen (role) → palette colour → era colour`. All coordinates
// are plate-space 0..1; scalar radii/sizes are fractions of the plate's short
// edge so shapes stay proportional across ratios.

interface PrimBase {
  pen: PenRole
  w?: number // stroke weight multiplier (1 = base)
  alpha?: number // 0..1
  dash?: number[] // stroke dash pattern (plate-space units)
}

export type Prim =
  | (PrimBase & { t: "line"; x1: number; y1: number; x2: number; y2: number })
  | (PrimBase & { t: "polyline"; pts: [number, number][]; closed?: boolean })
  | (PrimBase & { t: "polygon"; pts: [number, number][]; fill?: boolean })
  | (PrimBase & { t: "circle"; cx: number; cy: number; r: number; ry?: number; fill?: boolean })
  | (PrimBase & {
      t: "text"
      x: number
      y: number
      s: string
      size: number // fraction of short edge
      align?: "start" | "middle" | "end"
      font?: "mono" | "hershey"
      rot?: number // radians — glyph rotation (text-path connectors)
      letterSpacing?: number // tracking, fraction of short edge
    })

// ─── Motif registry ──────────────────────────────────────────────────────────

export type MotifParams = Record<string, number | string | boolean>

export interface MotifCtx {
  penRole: PenRole // the node's register — the motif's primary pen
  plateSeed: string // the plate seed — lets a motif derive plate-consistent detail (asemic alphabet)
}

export type Rng = () => number

export type MotifGen = (
  rng: Rng,
  box: Box,
  params: MotifParams,
  ctx: MotifCtx,
) => { primitives: Prim[]; anchors: Anchor[] }

/** One editable parameter, surfaced in the inspector (same idea as BG_CONTROLS). */
export interface ParamSpec {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
}

export interface MotifDef {
  key: string
  name: string
  /** Which motif classes this belongs to — focal / satellite / field / margin / caption. */
  classes: string[]
  params: ParamSpec[]
  gen: MotifGen
}

// ─── Armatures (archetypes) ──────────────────────────────────────────────────

export type LayoutStrategy = "radial" | "grid" | "axis" | "free" | "hero"

export interface Slot {
  id: string
  role: "focal" | "satellite" | "field" | "margin" | "caption"
  region: Box // rough area — the solver jitters within it
  count: [number, number] // min..max instances to place here
  motifKeys: string[] // allowed motif registry keys for this slot
  penRole?: PenRole
  scale: [number, number] // size range (fraction of short edge)
}

export interface ConnectorIntent {
  from: string
  to: string // slot ids (resolved to anchors at layout)
  route: Connector["route"] | "auto"
  density: number // 0..1
}

export interface ApparatusIntent {
  kind: Apparatus["kind"]
}

export interface Armature {
  id: string
  name: string
  weight: number // selection probability
  tags: string[] // "mystical" | "cartographic" | "schematic" | …
  slots: Slot[]
  connectorIntents: ConnectorIntent[]
  apparatusIntents: ApparatusIntent[]
  layout: LayoutStrategy
  ratioAffinity?: [number, number][]
}

// ─── IR: the Plate ───────────────────────────────────────────────────────────

export interface Node {
  id: string
  motif: string // registry key, e.g. "voxel-mass"
  box: Box // resolved by the layout solver
  rotation?: number
  params: MotifParams
  penRole: PenRole
  anchors: Anchor[] // resolved at realize time
  locked: boolean
  z: number // painter order
  /** Motif sub-seed — makes re-realization and "re-roll this node" deterministic. */
  seed: number
}

export interface Connector {
  id: string
  from: string // anchor id
  to: string // anchor id
  route: "leader" | "manhattan" | "arc" | "dotted" | "stream" | "text-path"
  penRole: PenRole
  label?: string
  params?: Record<string, number>
  locked: boolean
}

export interface Apparatus {
  id: string
  kind:
    | "frame"
    | "corner-reg"
    | "ruler"
    | "legend"
    | "seal"
    | "caption"
    | "scale-bar"
    | "compass"
    | "colophon"
  box?: Box
  penRole: PenRole
  data?: Record<string, unknown>
  locked: boolean
}

export interface PostParams {
  inkBias: number // -0.35..0.35, darken/lighten before threshold
  contrast: number // 0.5..2.5
  handJitter: number // 0..1, hand-drawn wobble amount
  lineWeight: number // global stroke scaling
}

export interface Plate {
  version: 1
  seed: string // human seed ("plate-8842" or a word)
  salt: number // regenerate counter within a seed
  archetype: string // armature id
  ratio: [number, number] // [1,1] album default
  palette: Palette
  era: string // render/era preset id
  nodes: Node[]
  connectors: Connector[]
  apparatus: Apparatus[]
  post: PostParams
  meta: { title?: string; createdWith: string }
}
