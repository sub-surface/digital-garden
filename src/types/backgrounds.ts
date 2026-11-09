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
  /** --color-text, for the monochrome and typographic modes. */
  text: string
}

// drawField dots constellation
export interface DotNode {
  x: number
  y: number
  r: number
  ci: number
  alpha: number
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

// Raw /graph.json payload — mirrors scripts/prebuild.ts's emitGraph() and
// ConstellationPage.tsx's RawNode/RawLink.
export interface GraphJsonNode {
  id: string
  title: string
  tags?: string[]
  x?: number
  y?: number
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
  dotNodes: DotNode[]
  pops: Pop[]
  boids: Boid[]
  boidGrid: number[][]
  emitters: Emitter[]
  tracks: Track[]
  lastFrame: number
  /**
   * The drawing surface in CSS px. On phones this is a virtual viewport
   * larger than the screen (see `scale`), so every mode draws at desktop
   * proportions and the canvas shrinks the result.
   */
  w: number
  h: number
  /** Screen px per drawing px: 1 on desktop, < 1 on phones. */
  scale: number
  /** Bumped whenever the surface is resized: modules that keep their own scratch state reseed on change. */
  epoch: number
  /** The note being read (the typographic modes draw from it). */
  slug: string
}

// Newer modes keep their own scratch state in a module-level WeakMap keyed on
// BgState (reseeding when `epoch` changes) rather than adding fields here.

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

export interface IsometricConfig {
  count: number
  spin: number
  parallax: number
  opacity: number
}

export interface OrreryConfig {
  /** Days of planetary motion per second; 0 is real time (today's sky). */
  timelapse: number
  /** 1 shows planet names, 0 just the marks. */
  labels: number
  opacity: number
}

export interface LightningConfig {
  /** Strikes per minute. */
  frequency: number
  branching: number
  /** Width of the soft halo around each channel. */
  glow: number
  opacity: number
}

export interface AttractorConfig {
  speed: number
  rotSpeed: number
  trail: number
  /** Seconds before the ribbon becomes the next attractor. */
  morph: number
  opacity: number
}

export interface CartographyConfig {
  lines: number
  speed: number
  relief: number
  elevation: number
  opacity: number
}

export interface ProseConfig {
  size: number
  /** Seconds a passage holds before it scatters. */
  hold: number
  drift: number
  opacity: number
}

export interface SedimentConfig {
  /** Words per second. */
  rate: number
  size: number
  opacity: number
}

export interface PalimpsestConfig {
  layers: number
  speed: number
  size: number
  opacity: number
}

export interface RiversConfig {
  /** Column width in px: narrower justified columns open more rivers. */
  measure: number
  size: number
  flow: number
  opacity: number
}

export interface CutupConfig {
  lines: number
  /** Seconds between cuts. */
  interval: number
  size: number
  opacity: number
}

export interface ConcordanceConfig {
  stars: number
  twinkle: number
  opacity: number
}

export interface TeletypeConfig {
  /** Characters per second. */
  speed: number
  size: number
  opacity: number
}

// drawField reads one shared shape across vectors/dots/terminal
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

type ConfigurableBgMode = Exclude<BgMode, "chess" | "hexo">

interface BgModeConfigShapes {
  murmuration: MurmurationConfig
  graph: GraphConfig
  vectors: VectorsConfig
  dots: DotsConfig
  terminal: TerminalConfig
  chamber: ChamberConfig
  isometric: IsometricConfig
  orrery: OrreryConfig
  lightning: LightningConfig
  attractor: AttractorConfig
  cartography: CartographyConfig
  prose: ProseConfig
  sediment: SedimentConfig
  palimpsest: PalimpsestConfig
  rivers: RiversConfig
  cutup: CutupConfig
  concordance: ConcordanceConfig
  teletype: TeletypeConfig
}

export type BackgroundsConfig = { [K in ConfigurableBgMode]: BgModeConfigShapes[K] }
