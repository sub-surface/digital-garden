/**
 * Deterministic PRNG for the composer core. Same lineage as `src/lib/sigil.ts`
 * (mulberry32 + FNV-1a hash), re-declared here so the composer core stays
 * self-contained and dependency-free — it is imported by both the React shell
 * and the headless test script, and must not pull in DOM or sibling modules.
 *
 * One rng instance is threaded through grammar → layout → motifs → connectors →
 * apparatus in a fixed order, so a given `(seed, salt)` fully reproduces a plate.
 */

import type { Rng } from "./types"

export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seed a plate rng from a human seed + regenerate salt. */
export function makeRng(seed: string, salt: number): Rng {
  return mulberry32(hashStr(seed) ^ hashStr(`salt:${salt}`))
}

/** Real number in `[min, max)`. */
export function rr(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Integer in `[min, max]` (inclusive). */
export function ri(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/** Pick one element (uniform). Returns the first element for an empty-guard callsite mistake. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Weighted pick — `weightOf` returns a non-negative weight per item. */
export function pickWeighted<T>(rng: Rng, arr: readonly T[], weightOf: (t: T) => number): T {
  const total = arr.reduce((s, t) => s + Math.max(0, weightOf(t)), 0)
  if (total <= 0) return pick(rng, arr)
  let r = rng() * total
  for (const t of arr) {
    r -= Math.max(0, weightOf(t))
    if (r <= 0) return t
  }
  return arr[arr.length - 1]
}

/** True with probability `p`. */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p
}
