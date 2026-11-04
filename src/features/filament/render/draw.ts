/**
 * Small additive drawing primitives on a packed RGBA raster (R in the low
 * byte, as ImageData lays it out in little-endian memory). Every layer draws
 * its marks with these, so a ring or a star looks the same at every scale.
 */

export interface Raster {
  out: Uint32Array
  w: number
  h: number
}

/** Add (cr, cg, cb) × k to pixel i, saturating per channel; alpha goes opaque. */
function add(out: Uint32Array, i: number, k: number, cr: number, cg: number, cb: number): void {
  const v = out[i]
  out[i] =
    (0xff000000 |
      (Math.min(255, ((v >> 16) & 255) + cb * k) << 16) |
      (Math.min(255, ((v >> 8) & 255) + cg * k) << 8) |
      Math.min(255, (v & 255) + cr * k)) >>>
    0
}

/** One pixel, nearest. */
export function plot(r: Raster, x: number, y: number, k: number, cr: number, cg: number, cb: number): void {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= r.w || yi >= r.h || k <= 0) return
  add(r.out, yi * r.w + xi, k, cr, cg, cb)
}

/** One point spread bilinearly over four pixels, so slow motion stays smooth. */
export function dot(r: Raster, x: number, y: number, k: number, cr: number, cg: number, cb: number): void {
  const px = x - 0.5
  const py = y - 0.5
  const x0 = Math.floor(px)
  const y0 = Math.floor(py)
  const fx = px - x0
  const fy = py - y0
  for (let q = 0; q < 4; q++) {
    const xx = x0 + (q & 1)
    const yy = y0 + (q >> 1)
    if (xx < 0 || yy < 0 || xx >= r.w || yy >= r.h) continue
    const wgt = k * ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy)
    add(r.out, yy * r.w + xx, wgt, cr, cg, cb)
  }
}

/** An antialiased circle; `dash` > 0 leaves gaps every `dash` pixels of arc. */
export function ring(
  r: Raster, cx: number, cy: number, radius: number, k: number,
  cr: number, cg: number, cb: number, dash = 0,
): void {
  if (radius <= 0 || cx + radius < -2 || cy + radius < -2 || cx - radius > r.w + 2 || cy - radius > r.h + 2) return
  const steps = Math.min(20000, Math.max(24, Math.ceil(2 * Math.PI * radius * 1.4)))
  for (let s = 0; s < steps; s++) {
    if (dash > 0 && Math.floor((s / 1.4) / dash) % 2 === 1) continue
    const t = (s / steps) * Math.PI * 2
    const x = cx + Math.cos(t) * radius
    const y = cy + Math.sin(t) * radius
    if (x < -1 || y < -1 || x > r.w + 1 || y > r.h + 1) continue
    dot(r, x, y, k / 1.4, cr, cg, cb)
  }
}

/** A soft radial glow of radius `radius` pixels. */
export function sprite(r: Raster, cx: number, cy: number, radius: number, cr: number, cg: number, cb: number): void {
  const x0 = Math.max(0, Math.ceil(cx - radius))
  const x1 = Math.min(r.w - 1, Math.floor(cx + radius))
  const y0 = Math.max(0, Math.ceil(cy - radius))
  const y1 = Math.min(r.h - 1, Math.floor(cy + radius))
  const r2 = radius * radius
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const f = 1 - Math.sqrt(d2) / radius
      add(r.out, y * r.w + x, f * f, cr, cg, cb)
    }
  }
}

/** The four-point diffraction spikes that say "this is a point source". */
export function spikes(r: Raster, cx: number, cy: number, len: number, cr: number, cg: number, cb: number): void {
  for (let s = -len; s <= len; s++) {
    const f = 1 - Math.abs(s) / len
    const w = f * f * f
    plot(r, cx + s, cy, w, cr, cg, cb)
    if (s !== 0) plot(r, cx, cy + s, w, cr, cg, cb)
  }
}

/**
 * Crossfade `src` in over `dst` by k. A plain lerp dims the frame midway,
 * where both worlds are half-lit; here the incoming one rises faster than the
 * outgoing one falls (weights 1 − k and min(1, 1.6k)), so the light carries
 * through the change of scale.
 */
export function blend(dst: Uint32Array, src: Uint32Array, k: number): void {
  if (k <= 0) return
  if (k >= 1) {
    dst.set(src)
    return
  }
  const a = Math.round(Math.min(1, 1.6 * k) * 256)
  const b = Math.round((1 - k) * 256)
  for (let i = 0; i < dst.length; i++) {
    const d = dst[i]
    const s = src[i]
    const r = ((d & 255) * b + (s & 255) * a) >> 8
    const g = (((d >> 8) & 255) * b + ((s >> 8) & 255) * a) >> 8
    const bl = (((d >> 16) & 255) * b + ((s >> 16) & 255) * a) >> 8
    dst[i] = (0xff000000 | ((bl > 255 ? 255 : bl) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0
  }
}
