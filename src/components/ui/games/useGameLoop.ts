import { useEffect, useRef } from "react"

/**
 * Shared requestAnimationFrame scaffolding for the arcade games and toys.
 *
 * Every canvas game used to hand-roll the same `raf = requestAnimationFrame(loop)`
 * / `last` / `dt` / `cancelAnimationFrame` dance (and a per-frame
 * `getComputedStyle` for the accent colour). Centralising it also gives every
 * loop one behaviour on tab return: a backgrounded tab pauses rAF, so the first
 * frame back would otherwise hand the game a multi-second `dt` (HexLife's
 * `while (acc >= stepMs)` could then run thousands of generations in one frame).
 */

/** Longest frame delta (ms) a loop ever sees. */
export const MAX_FRAME_DT = 250

/**
 * Start a rAF loop. `cb` receives the clamped delta since the previous frame
 * (0 on the first frame) and the raw rAF timestamp. Returns a stop function —
 * for loops that live inside a larger setup effect:
 *
 *   const stop = startFrameLoop((dt) => { ... })
 *   return () => { stop(); ...other cleanup }
 */
export function startFrameLoop(cb: (dt: number, now: number) => void): () => void {
  let raf = 0
  let last = 0
  const frame = (t: number) => {
    raf = requestAnimationFrame(frame)
    const dt = last ? Math.min(t - last, MAX_FRAME_DT) : 0
    last = t
    cb(dt, t)
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}

/**
 * Hook form: runs `cb` every frame while `active`. The callback is read through
 * a ref, so it may close over fresh props/state each render without tearing the
 * loop down — only `active` flips start/stop.
 */
export function useGameLoop(cb: (dt: number, now: number) => void, active = true) {
  const cbRef = useRef(cb)
  useEffect(() => { cbRef.current = cb })
  useEffect(() => {
    if (!active) return
    return startFrameLoop((dt, now) => cbRef.current(dt, now))
  }, [active])
}

/**
 * Cached reader for a CSS custom property on :root. Games redraw every frame
 * but the theme changes rarely, so re-reading the computed style that often is
 * waste; a short TTL still tracks a live ThemePanel edit within a few frames.
 */
export function cssVarReader(name: string, fallback: string, ttlMs = 300): () => string {
  let value = fallback
  let stamp = -Infinity
  return () => {
    const now = performance.now()
    if (now - stamp > ttlMs) {
      stamp = now
      value = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
    }
    return value
  }
}
