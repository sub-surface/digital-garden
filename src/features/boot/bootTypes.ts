/**
 * Core type definitions for the boot sequence system.
 */

export type BootTone =
  | "normal"
  | "muted"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "tender"

export type RevealMode =
  | "type"       // character reveal, used sparingly
  | "burst"      // reveal in deterministic chunks
  | "instant"    // print complete line
  | "overwrite"  // temporary frame replaces the prior active frame

export type BootEventKind =
  | "line"
  | "blank"
  | "rule"
  | "heading"
  | "frame"
  | "phase"

export interface BootEvent {
  id: string
  epoch: number
  kind: BootEventKind
  text: string
  tone: BootTone
  reveal: RevealMode
  charDelayMs: number
  holdAfterMs: number
  ariaLabel?: string
  ephemeral?: boolean
}

export interface BootRenderedLine {
  id: string
  text: string
  tone: BootTone
  kind: BootEventKind
}

export interface SnippetContext {
  rootSeed: number
  epoch: number
  phase: string
  rng: any // Will be SeededRNG, but avoid circular import here
  sequence: EventIdFactory
  viewport: "narrow" | "wide"
}

export type SnippetFactory = (
  context: SnippetContext,
) => Iterable<BootEvent>

export interface EventIdFactory {
  (kind: BootEventKind): string
}

export interface BootPlaybackState {
  lines: readonly BootRenderedLine[]
  activeText: string
  activeTone: BootTone
  phaseLabel: string
  epoch: number
  emittedCount: number
  isRunning: boolean
}

export interface ResolvedSeed {
  source: string
  value: number
  display: string
}
