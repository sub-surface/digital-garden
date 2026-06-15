/**
 * Core, serialisable types for the procedural boot sequence.
 *
 * Content generation is intentionally timing-free: generators describe what
 * should happen, while useBootPlayback owns clocks, pausing and rendering.
 */

import type { SeededRNG } from "./bootRng"

export type BootTone =
  | "normal"
  | "muted"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "tender"

export type RevealMode =
  | "type"
  | "burst"
  | "instant"
  | "overwrite"

export type BootEventKind =
  | "line"
  | "blank"
  | "rule"
  | "heading"
  | "frame"
  | "phase"

export type BootViewport = "narrow" | "wide"

export interface BootEvent {
  id: string
  epoch: number
  kind: BootEventKind
  text: string
  tone: BootTone
  reveal: RevealMode
  /** Per-grapheme delay at 1× playback speed. */
  charDelayMs: number
  /** Delay after the event completes at 1× playback speed. */
  holdAfterMs: number
  /** Plain-language replacement for symbolic or ASCII-only content. */
  ariaLabel?: string
  /** Ephemeral events replace the active frame and are not added to history. */
  ephemeral?: boolean
}

export interface BootRenderedLine {
  id: string
  text: string
  tone: BootTone
  kind: BootEventKind
  ariaLabel?: string
}

export interface EventIdFactory {
  (kind: BootEventKind): string
}

export interface SnippetContext {
  rootSeed: number
  epoch: number
  phase: string
  rng: SeededRNG
  sequence: EventIdFactory
  viewport: BootViewport
}

export type SnippetFactory = (
  context: SnippetContext,
) => Iterable<BootEvent>

export interface BootPlaybackState {
  lines: readonly BootRenderedLine[]
  activeText: string
  activeTone: BootTone
  activeKind: BootEventKind
  activeAriaLabel?: string
  phaseLabel: string
  epoch: number
  emittedCount: number
  isRunning: boolean
  isPaused: boolean
}

export type ResolvedSeedSource =
  | "url"
  | "stored"
  | "generated"
  | "fallback"

export interface ResolvedSeed {
  source: ResolvedSeedSource
  value: number
  display: string
}
