/**
 * Deterministic value noise for field-like motifs (chamber flow, contour strata,
 * terrain). Pure and dependency-free — hash-lattice value noise with smoothstep
 * interpolation and a small fBm helper. Not true simplex, but coherent and cheap,
 * and it never shimmers because it's a pure function of position.
 */

function h2(x: number, y: number): number {
  let h = 2166136261
  h ^= x
  h = Math.imul(h, 16777619)
  h ^= y
  h = Math.imul(h, 16777619)
  h ^= h >>> 13
  return ((h >>> 0) % 100000) / 100000
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Value noise in ~0..1. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const tl = h2(xi, yi)
  const tr = h2(xi + 1, yi)
  const bl = h2(xi, yi + 1)
  const br = h2(xi + 1, yi + 1)
  const u = smooth(xf)
  const v = smooth(yf)
  return (tl * (1 - u) + tr * u) * (1 - v) + (bl * (1 - u) + br * u) * v
}

/** Fractal Brownian motion — layered noise in ~0..1. */
export function fbm(x: number, y: number, octaves = 3): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * freq, y * freq)
    norm += amp
    freq *= 2
    amp *= 0.5
  }
  return sum / norm
}
