// Types for BgCanvas.tsx's ambient backgrounds (ROADMAP §28.12).
//
// Two families live here:
//  - BgState: the single mutable per-mode scratch object threaded through
//    every drawX(ctx, state, config) call (see BgCanvas.tsx stateRef).
//  - BackgroundsConfig + friends: the shape of config.backgrounds (site-defaults.ts),
//    keyed so that every user-selectable BgMode is statically required to have
//    a config block — see the comment on BackgroundsConfig below.

import type { BgMode } from "@/store"

// ── Scratch-state element types ──
// Each interface below is derived from what its owning drawX function actually
// assigns/reads, not from a separate spec — see BgCanvas.tsx for the draw fn.

export interface ColorCache {
  secondary: string
  palette: string[]
}

// Declared in stateRef but never populated/read anywhere in BgCanvas.tsx —
// kept typed (not removed) since this is a typing-only pass.
export interface Ripple {
  x: number
  y: number
  t: number
}

// Same as Ripple: declared, never used.
export interface Drop {
  x: number
  y: number
  text: string
  speed: number
  opacity: number
  color: string
}

// drawTerminalPops
export interface Pop {
  x: number
  y: number
  anim: { frames: string[] }
  frame: number
  life: number
  opacity: number
  color: string
}

// drawMurmuration
export interface Boid {
  x: number
  y: number
  vx: number
  vy: number
}

// drawChamber
export interface Emitter {
  x: number
  y: number
}

// spawnTrack / drawChamber
export interface Track {
  pts: { x: number; y: number }[]
  life: number
  ci: number
  glyph: string | null
  gx: number
  gy: number
}

// drawSchematic
export interface Anchor {
  i: number
  phase: number
  glyphs: string
}

// drawIsometric
export interface Cube {
  x: number
  y: number
  s: number
  depth: number
  spin: number
  phase: number
  glyph: string | null
}

// Raw /graph.json payload — mirrors scripts/prebuild.ts's emitGraph() and
// ConstellationPage.tsx's RawNode/RawLink.
export interface GraphJsonNode {
  id: string
  title: string
  tags?: string[]
}

export interface GraphJsonLink {
  source: string
  target: string
}

export interface GraphJsonData {
  nodes: GraphJsonNode[]
  links: GraphJsonLink[]
}

// GraphJsonNode plus the drift-simulation fields BgCanvas adds on fetch.
export interface GraphNode extends GraphJsonNode {
  x: number
  y: number
  vx: number
  vy: number
}

export type GraphLink = GraphJsonLink

export interface BgState {
  mx: number
  my: number
  readerAlpha: number
  readerTarget: number
  colorCache: ColorCache
  colorValid: boolean
  nodes: GraphNode[]
  links: GraphLink[]
  nodeMap: Map<string, GraphNode>
  ripples: Ripple[]
  drops: Drop[]
  pops: Pop[]
  boids: Boid[]
  boidGrid: number[][]
  emitters: Emitter[]
  tracks: Track[]
  anchors: Anchor[]    // schematic
  cubes: Cube[]         // isometric
  plate: HTMLCanvasElement | null  // plate-scan offscreen still
  plateKey: string
  lastFrame: number
  w: number
  h: number
}

// ── config.backgrounds.<mode> shapes ──
// Each interface's fields are exactly what site-defaults.ts defines for that
// mode today; optional fields are only added where a draw fn genuinely reads
// them via `||`/`??` fallback across modes that don't define them (see
// FieldConfig below).

export interface VectorsConfig {
  step: number
  rx: number
  ry: number
  scale: number
  range: number
  speed: number
  vortex: number
  radius: number
}

export interface GraphConfig {
  drift: number
  linkWidth: number
  linkOpacity: number
  nodeSize: number
  nodeHoverSize: number
  nodeOpacity: number
  nodeHoverOpacity: number
}

export interface DotsConfig {
  step: number
  minSize: number
  maxSize: number
  opacity: number
  speed: number
  scale: number
}

export interface TerminalConfig {
  step: number
  opacity: number
  speed: number
  scale: number
}

export interface ChamberConfig {
  emitters: number
  spawnRate: number
  maxTracks: number
  steps: number
  stepLen: number
  fieldScale: number
  drift: number
  curl: number
  fade: number
  dot: number
  gap: number
  opacity: number
  spot: number
  glyphChance: number
  reticle: boolean
}

export interface MurmurationConfig {
  count: number
  maxSpeed: number
  cohere: number
  wind: number
  opacity: number
}

export interface SchematicConfig {
  anchors: number
  driftSpeed: number
  opacity: number
}

export interface IsometricConfig {
  count: number
  spin: number
  parallax: number
  opacity: number
}

export interface OrreryConfig {
  rings: number
  spin: number
  opacity: number
}

export interface PlateScanConfig {
  panSpeed: number
  scanSpeed: number
  cell: number
  opacity: number
}

// drawField reads one shared shape across vectors/dots/terminal — mode-specific
// fields it touches (range/radius/vortex/rx/ry/minSize/maxSize/opacity) are only
// defined by some of those three configs; the others fall back via `||` at each
// read site. Optional here mirrors that real absence, not a typing shortcut.
export interface FieldConfig {
  step: number
  speed: number
  scale: number
  opacity?: number
  range?: number
  radius?: number
  vortex?: number
  rx?: number
  ry?: number
  minSize?: number
  maxSize?: number
}

// Every user-selectable mode (BgMode minus the page-scoped chess/hexo boards,
// which have no config block — see drawChess/drawHexo, which take no config
// param) must have a shape here. Adding a mode to BgMode without adding its
// shape below is a compile error at the BackgroundsConfig definition —
// this is what makes the CLAUDE.md "adding a mode" checklist type-enforced
// (ROADMAP §28.12).
type ConfigurableBgMode = Exclude<BgMode, "chess" | "hexo">

interface BgModeConfigShapes {
  murmuration: MurmurationConfig
  graph: GraphConfig
  vectors: VectorsConfig
  dots: DotsConfig
  terminal: TerminalConfig
  chamber: ChamberConfig
  schematic: SchematicConfig
  isometric: IsometricConfig
  orrery: OrreryConfig
  "plate-scan": PlateScanConfig
}

export type BackgroundsConfig = { [K in ConfigurableBgMode]: BgModeConfigShapes[K] }
