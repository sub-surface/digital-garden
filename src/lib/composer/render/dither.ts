/**
 * Dither kernels — pure, DOM-free (headlessly testable). Quantizes an RGBA pixel
 * buffer to a device palette with a chosen method. The Atkinson path is the same
 * error-diffusion BgCanvas' `buildPlate` uses, generalised from 1-bit to an
 * arbitrary N-colour palette (palette length encodes the bit-depth). Ordered
 * (Bayer) and Floyd–Steinberg are the other workhorses; blue-noise approximates
 * with a hashed threshold field.
 */

export type RGB = [number, number, number]
export type DitherMethod =
  | "none"
  | "bayer2"
  | "bayer4"
  | "bayer8"
  | "atkinson"
  | "floyd"
  | "bluenoise"

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "")
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}

// Normalised Bayer matrices (values in 0..1).
function bayer(n: 2 | 4 | 8): number[][] {
  const base2 = [
    [0, 2],
    [3, 1],
  ]
  let m = base2
  while (m.length < n) {
    const s = m.length
    const next: number[][] = Array.from({ length: s * 2 }, () => new Array(s * 2).fill(0))
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = m[y][x] * 4
        next[y][x] = v
        next[y][x + s] = v + 2
        next[y + s][x] = v + 3
        next[y + s][x + s] = v + 1
      }
    }
    m = next
  }
  const denom = n * n
  return m.map((row) => row.map((v) => (v + 0.5) / denom))
}

const BAYER = { bayer2: bayer(2), bayer4: bayer(4), bayer8: bayer(8) }

function nearest(r: number, g: number, b: number, pal: RGB[]): RGB {
  let best = pal[0]
  let bestD = Infinity
  for (const c of pal) {
    const dr = r - c[0]
    const dg = g - c[1]
    const db = b - c[2]
    const d = dr * dr + dg * dg + db * db
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

// FNV-ish hash → 0..1, for a stable blue-noise-ish threshold field.
function hash01(x: number, y: number): number {
  let h = 2166136261
  h ^= x
  h = Math.imul(h, 16777619)
  h ^= y
  h = Math.imul(h, 16777619)
  h ^= h >>> 13
  return ((h >>> 0) % 4096) / 4096
}

/**
 * Quantize `data` (RGBA, row-major, w×h) to `pal` in place. Alpha is preserved;
 * fully-transparent pixels are left untouched so a substrate can show through.
 */
export function ditherToPalette(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  pal: RGB[],
  method: DitherMethod,
): void {
  if (pal.length === 0) return

  // Ordered / threshold-field methods operate per-pixel.
  if (method === "none" || method === "bayer2" || method === "bayer4" || method === "bayer8" || method === "bluenoise") {
    const mat = method === "bayer2" || method === "bayer4" || method === "bayer8" ? BAYER[method] : null
    const spread = pal.length <= 2 ? 96 : pal.length <= 4 ? 64 : 40
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (data[i + 3] === 0) continue
        let bias = 0
        if (mat) {
          const t = mat[y % mat.length][x % mat.length]
          bias = (t - 0.5) * spread
        } else if (method === "bluenoise") {
          bias = (hash01(x, y) - 0.5) * spread
        }
        const c = nearest(data[i] + bias, data[i + 1] + bias, data[i + 2] + bias, pal)
        data[i] = c[0]
        data[i + 1] = c[1]
        data[i + 2] = c[2]
      }
    }
    return
  }

  // Error diffusion (Atkinson / Floyd–Steinberg) — work in float per channel.
  const buf = new Float32Array(w * h * 3)
  for (let p = 0; p < w * h; p++) {
    buf[p * 3] = data[p * 4]
    buf[p * 3 + 1] = data[p * 4 + 1]
    buf[p * 3 + 2] = data[p * 4 + 2]
  }
  // kernel: [dx, dy, weight]; Atkinson diffuses 1/8 to six neighbours (the rest
  // is intentionally lost, giving its characteristic contrast).
  const kernel: [number, number, number][] =
    method === "atkinson"
      ? [
          [1, 0, 1 / 8],
          [2, 0, 1 / 8],
          [-1, 1, 1 / 8],
          [0, 1, 1 / 8],
          [1, 1, 1 / 8],
          [0, 2, 1 / 8],
        ]
      : [
          [1, 0, 7 / 16],
          [-1, 1, 3 / 16],
          [0, 1, 5 / 16],
          [1, 1, 1 / 16],
        ]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] === 0) continue
      const p = (y * w + x) * 3
      const or = buf[p]
      const og = buf[p + 1]
      const ob = buf[p + 2]
      const c = nearest(or, og, ob, pal)
      const er = or - c[0]
      const eg = og - c[1]
      const eb = ob - c[2]
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      for (const [dx, dy, wt] of kernel) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= w || ny >= h) continue
        const q = (ny * w + nx) * 3
        buf[q] += er * wt
        buf[q + 1] += eg * wt
        buf[q + 2] += eb * wt
      }
    }
  }
}
