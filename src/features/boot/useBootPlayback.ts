/**
 * Pause-aware playback state machine for declarative boot events.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import { BootGenerator } from "./bootGenerators"
import type {
  BootEvent,
  BootEventKind,
  BootRenderedLine,
  BootTone,
  BootViewport,
} from "./bootTypes"

export interface UseBootPlaybackOptions {
  seed: number | null
  runId?: number
  initialEpoch?: number
  viewport?: BootViewport
  reducedMotion?: boolean
  speed?: number
  maxLines?: number
  onTone?: (tone: BootTone) => void
}

export interface UseBootPlaybackResult {
  lines: readonly BootRenderedLine[]
  activeText: string
  activeTone: BootTone
  activeKind: BootEventKind
  activeAriaLabel?: string
  phaseLabel: string
  isPaused: boolean
  isRunning: boolean
  setPaused: (paused: boolean) => void
  togglePaused: () => void
  epoch: number
  emittedCount: number
  error: string | null
  injectLine: (text: string, tone?: BootTone, kind?: BootEventKind) => void
  replaceLastLines: (count: number, newLines: string[], tone?: BootTone, kind?: BootEventKind) => void
  clearLines: () => void
}

interface ActiveLine {
  text: string
  tone: BootTone
  kind: BootEventKind
  ariaLabel?: string
}

const EMPTY_ACTIVE: ActiveLine = {
  text: "",
  tone: "normal",
  kind: "line",
}

const DEFAULT_MAX_LINES = 180
const MIN_SPEED = 0.25
const MAX_SPEED = 8
const CLOCK_SLICE_MS = 64

class PlaybackAbortedError extends Error {
  constructor() {
    super("Boot playback aborted")
    this.name = "PlaybackAbortedError"
  }
}

function sanitizeSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed))
}

function sanitizeMaxLines(maxLines: number): number {
  if (!Number.isFinite(maxLines)) return DEFAULT_MAX_LINES
  return Math.max(20, Math.floor(maxLines))
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new PlaybackAbortedError())

  return new Promise((resolve, reject) => {
    const timeout: ReturnType<typeof setTimeout> = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort)
      resolve()
    }, Math.max(0, milliseconds))

    function handleAbort(): void {
      clearTimeout(timeout)
      signal.removeEventListener("abort", handleAbort)
      reject(new PlaybackAbortedError())
    }

    signal.addEventListener("abort", handleAbort, { once: true })
  })
}

function documentIsHidden(): boolean {
  return typeof document !== "undefined" && document.hidden
}

async function waitForActiveTime(
  durationMs: number,
  signal: AbortSignal,
  pausedRef: MutableRefObject<boolean>,
  speedRef: MutableRefObject<number>,
): Promise<void> {
  let remaining = Math.max(0, durationMs)
  let previous = now()

  while (remaining > 0) {
    if (signal.aborted) throw new PlaybackAbortedError()

    const inactiveBeforeWait = pausedRef.current || documentIsHidden()
    const speed = speedRef.current
    const realTimeNeeded = inactiveBeforeWait
      ? CLOCK_SLICE_MS
      : Math.min(CLOCK_SLICE_MS, remaining / speed)

    await abortableDelay(Math.max(8, realTimeNeeded), signal)

    const current = now()
    const elapsed = Math.max(0, current - previous)
    previous = current

    if (!pausedRef.current && !documentIsHidden()) {
      remaining -= elapsed * speedRef.current
    }
  }
}

interface SegmenterLike {
  segment(value: string): Iterable<{ segment: string }>
}

interface SegmenterConstructorLike {
  new (
    locales?: string | string[],
    options?: { granularity: "grapheme" },
  ): SegmenterLike
}

function segmentGraphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructorLike })
    .Segmenter

  if (Segmenter) {
    const segmenter = new Segmenter(undefined, { granularity: "grapheme" })
    return Array.from(segmenter.segment(text), (entry) => entry.segment)
  }

  return Array.from(text)
}

function asRenderedLine(event: BootEvent): BootRenderedLine {
  return {
    id: event.id,
    text: event.text,
    tone: event.tone,
    kind: event.kind,
    ariaLabel: event.ariaLabel,
  }
}

export function useBootPlayback({
  seed,
  runId = 0,
  initialEpoch = 0,
  viewport = "wide",
  reducedMotion = false,
  speed = 1,
  maxLines = DEFAULT_MAX_LINES,
  onTone,
}: UseBootPlaybackOptions): UseBootPlaybackResult {
  const [lines, setLines] = useState<readonly BootRenderedLine[]>([])
  const [active, setActive] = useState<ActiveLine>(EMPTY_ACTIVE)
  const [phaseLabel, setPhaseLabel] = useState("awaiting seed")
  const [isPaused, setPausedState] = useState(false)
  const [isRunning, setRunning] = useState(false)
  const [epoch, setEpoch] = useState(initialEpoch)
  const [emittedCount, setEmittedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const pausedRef = useRef(false)
  const speedRef = useRef(sanitizeSpeed(speed))
  const viewportRef = useRef<BootViewport>(viewport)
  const reducedMotionRef = useRef(reducedMotion)
  const maxLinesRef = useRef(sanitizeMaxLines(maxLines))

  useEffect(() => {
    speedRef.current = sanitizeSpeed(speed)
  }, [speed])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => {
    reducedMotionRef.current = reducedMotion
  }, [reducedMotion])

  useEffect(() => {
    maxLinesRef.current = sanitizeMaxLines(maxLines)
  }, [maxLines])

  const setPaused = useCallback((paused: boolean) => {
    pausedRef.current = paused
    setPausedState(paused)
  }, [])

  const togglePaused = useCallback(() => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPausedState(next)
  }, [])

  const injectLine = useCallback((text: string, tone: BootTone = "normal", kind: BootEventKind = "line") => {
    const rendered: BootRenderedLine = {
      id: `injected-${Date.now()}-${Math.random()}`,
      text,
      tone,
      kind
    }
    setLines((previous) => {
      const next = [...previous, rendered]
      const limit = maxLinesRef.current
      return next.length > limit ? next.slice(-limit) : next
    })
    setEmittedCount((count) => count + 1)
  }, [])

  const clearLines = useCallback(() => {
    setLines([])
  }, [])

  const replaceLastLines = useCallback((count: number, newLines: string[], tone: BootTone = "normal", kind: BootEventKind = "frame") => {
    setLines((previous) => {
      const next = previous.slice(0, Math.max(0, previous.length - count))
      const rendered = newLines.map((text, i) => ({
        id: `replaced-${Date.now()}-${Math.random()}-${i}`,
        text,
        tone,
        kind
      }))
      return [...next, ...rendered]
    })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    let effectIsCurrent = true

    pausedRef.current = false
    setPausedState(false)
    setLines([])
    setActive(EMPTY_ACTIVE)
    setPhaseLabel(seed === null ? "awaiting seed" : "firmware")
    setEpoch(initialEpoch)
    setEmittedCount(0)
    setError(null)
    setRunning(seed !== null)

    if (seed === null) {
      return () => {
        effectIsCurrent = false
        controller.abort()
      }
    }

    const generator = new BootGenerator(seed)

    const commit = (event: BootEvent): void => {
      if (!effectIsCurrent || signal.aborted || event.ephemeral) return

      const rendered = asRenderedLine(event)
      setLines((previous) => {
        const next = [...previous, rendered]
        const limit = maxLinesRef.current
        return next.length > limit ? next.slice(-limit) : next
      })
      setEmittedCount((count) => count + 1)
      setActive(EMPTY_ACTIVE)
      
      if (!event.ephemeral && (event.tone === "tender" || event.tone === "warning")) {
        onTone?.(event.tone)
      }
    }

    const showActive = (event: BootEvent, text: string): void => {
      if (!effectIsCurrent || signal.aborted) return
      setActive({
        text,
        tone: event.tone,
        kind: event.kind,
        ariaLabel: event.ariaLabel,
      })
    }

    const playEvent = async (event: BootEvent): Promise<void> => {
      if (event.kind === "phase") {
        setPhaseLabel(event.text.replace(/^phase\s*::\s*/i, ""))
      }

      if (reducedMotionRef.current) {
        if (!event.ephemeral) commit(event)
        await waitForActiveTime(
          Math.max(80, Math.min(event.holdAfterMs, 260)),
          signal,
          pausedRef,
          speedRef,
        )
        return
      }

      if (event.reveal === "instant") {
        commit(event)
      } else if (event.reveal === "overwrite") {
        showActive(event, event.text)
        if (!event.ephemeral) commit(event)
      } else {
        const graphemes = segmentGraphemes(event.text)
        const chunkSize = event.reveal === "burst"
          ? Math.max(2, Math.min(8, Math.ceil(graphemes.length / 8)))
          : 1

        for (let end = chunkSize; end <= graphemes.length + chunkSize - 1; end += chunkSize) {
          const clampedEnd = Math.min(end, graphemes.length)
          showActive(event, graphemes.slice(0, clampedEnd).join(""))

          if (clampedEnd < graphemes.length) {
            let charDelay = event.charDelayMs
            if (event.tone === "accent" || event.kind === "heading") { charDelay *= 1.5 + Math.random() * 0.5 }
            else if (event.tone === "muted" || event.kind === "frame") { charDelay *= 0.6 }
            
            await waitForActiveTime(charDelay, signal, pausedRef, speedRef)
          }
        }

        commit(event)
      }

      let holdMs = event.holdAfterMs
      if (event.tone === "accent" || event.kind === "heading" || event.tone === "warning") { holdMs *= 1.5 + Math.random() }
      else if (event.tone === "muted" || event.kind === "frame") { holdMs *= 0.6 }

      await waitForActiveTime(holdMs, signal, pausedRef, speedRef)
    }

    const run = async (): Promise<void> => {
      let currentEpoch = initialEpoch

      while (!signal.aborted) {
        if (effectIsCurrent) setEpoch(currentEpoch)

        const events = generator.generateEpoch(
          currentEpoch,
          viewportRef.current,
        )

        for (const event of events) {
          await playEvent(event)
        }

        currentEpoch += 1
      }
    }

    void run()
      .catch((reason: unknown) => {
        if (reason instanceof PlaybackAbortedError || signal.aborted) return
        const message = reason instanceof Error
          ? reason.message
          : "Unknown playback error"
        if (effectIsCurrent) {
          setError(message)
          setPhaseLabel("playback fault")
        }
      })
      .finally(() => {
        if (effectIsCurrent && !signal.aborted) setRunning(false)
      })

    return () => {
      effectIsCurrent = false
      controller.abort()
    }
  }, [initialEpoch, runId, seed])

  return {
    lines,
    activeText: active.text,
    activeTone: active.tone,
    activeKind: active.kind,
    activeAriaLabel: active.ariaLabel,
    phaseLabel,
    isPaused,
    isRunning,
    setPaused,
    togglePaused,
    epoch,
    emittedCount,
    error,
    injectLine,
    replaceLastLines,
    clearLines,
  }
}
