import type { BgState } from "@/types/backgrounds"

/**
 * Per-mode scratch state, owned by the mode's own module instead of BgState.
 * `init` runs on first use and again whenever the surface is resized (BgCanvas
 * bumps `state.epoch`), so a mode reseeds to the new viewport by itself.
 *
 *   const scene = perState((s) => ({ bolts: [] as Bolt[] }))
 *   const { bolts } = scene(state)
 */
export function perState<T>(init: (state: BgState) => T): (state: BgState) => T {
  const slots = new WeakMap<BgState, { epoch: number; value: T }>()
  return (state) => {
    let slot = slots.get(state)
    if (!slot || slot.epoch !== state.epoch) {
      slot = { epoch: state.epoch, value: init(state) }
      slots.set(state, slot)
    }
    return slot.value
  }
}

/** Fonts the canvas modes set type in (the site's own, self-hosted). */
export const FONT = {
  serif: "'Playfair Display', serif",
  sans: "'IBM Plex Sans', sans-serif",
  mono: "'IBM Plex Mono', monospace",
} as const

/** A small deterministic PRNG (mulberry32), for layouts that must not flicker. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
