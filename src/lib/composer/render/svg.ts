/**
 * IR → SVG. Vector, pen-coloured, self-contained. This is the clean output the
 * store/plotter path uses directly; the optional era pass (raster + dither)
 * rasterizes *this* SVG (M2). Coordinates are plate-space 0..1 mapped into a
 * viewBox whose long edge is 1000 units — x by width, y by height, scalar radii
 * and text sizes by the short edge, so shapes stay proportional across ratios.
 */

import type { Palette, Plate, Prim } from "../types"
import { penColor, groundColor } from "../pens"
import { realizePlate } from "../realize"

const LONG_EDGE = 1000
const BASE_STROKE = 1.4

// Escapes both text and attribute contexts (quotes included) — the seed can
// become free-text via permalink codes (M5), so no interpolation is trusted.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

interface Mapper {
  X: (v: number) => number
  Y: (v: number) => number
  S: (v: number) => number
  sw: (w: number | undefined) => number
  /** Deterministic hand-drawn wobble applied to stroke vertices (plate-space). */
  jp: (x: number, y: number) => [number, number]
}

// Coordinate-hashed offset in -0.5..0.5 — stable per point, so jitter never shimmers.
function jhash(a: number, b: number): number {
  let h = 2166136261
  h ^= Math.round(a * 4096)
  h = Math.imul(h, 16777619)
  h ^= Math.round(b * 4096)
  h = Math.imul(h, 16777619)
  h ^= h >>> 13
  return ((h >>> 0) % 2000) / 2000 - 0.5
}

function primToSvg(p: Prim, palette: Palette, m: Mapper, lineWeight: number, plotter = false): string {
  const color = penColor(palette, p.pen)
  const alpha = plotter ? 1 : p.alpha ?? 1
  const common = alpha < 1 ? ` opacity="${round(alpha)}"` : ""
  const dash = p.dash ? ` stroke-dasharray="${p.dash.map((d) => round(m.S(d))).join(",")}"` : ""
  const w = round(m.sw(p.w) * lineWeight)
  const doFill = plotter ? false : undefined // plotter forces stroke-only
  const P = (x: number, y: number): string => {
    const [jx, jy] = m.jp(x, y)
    return `${round(m.X(jx))},${round(m.Y(jy))}`
  }

  switch (p.t) {
    case "line": {
      const [a, b] = [m.jp(p.x1, p.y1), m.jp(p.x2, p.y2)]
      return `<line x1="${round(m.X(a[0]))}" y1="${round(m.Y(a[1]))}" x2="${round(m.X(b[0]))}" y2="${round(m.Y(b[1]))}" stroke="${color}" stroke-width="${w}"${dash}${common}/>`
    }
    case "polyline": {
      const pts = p.pts.map(([x, y]) => P(x, y)).join(" ")
      const tag = p.closed ? "polygon" : "polyline"
      return `<${tag} points="${pts}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${dash}${common}/>`
    }
    case "polygon": {
      const pts = p.pts.map(([x, y]) => P(x, y)).join(" ")
      const filled = doFill === false ? false : p.fill
      const fill = filled ? color : "none"
      return `<polygon points="${pts}" fill="${fill}" stroke="${filled ? "none" : color}" stroke-width="${w}" stroke-linejoin="round"${common}/>`
    }
    case "circle": {
      const filled = doFill === false ? false : p.fill
      const fill = filled ? color : "none"
      const stroke = filled ? "none" : color
      if (p.ry !== undefined) {
        return `<ellipse cx="${round(m.X(p.cx))}" cy="${round(m.Y(p.cy))}" rx="${round(m.S(p.r))}" ry="${round(m.S(p.ry))}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"${common}/>`
      }
      return `<circle cx="${round(m.X(p.cx))}" cy="${round(m.Y(p.cy))}" r="${round(m.S(p.r))}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"${common}/>`
    }
    case "text": {
      const anchor = p.align ?? "start"
      // Hershey (single-stroke, plotter-correct) arrives in M5; until then all
      // label text renders in the mono face — legible on screen and in raster.
      const family = "'IBM Plex Mono', monospace"
      const px = round(m.X(p.x))
      const py = round(m.Y(p.y))
      const tracking = p.letterSpacing ? ` letter-spacing="${round(m.S(p.letterSpacing))}"` : ""
      const transform = p.rot ? ` transform="rotate(${round((p.rot * 180) / Math.PI)} ${px} ${py})"` : ""
      return `<text x="${px}" y="${py}" font-size="${round(m.S(p.size))}" text-anchor="${anchor}" font-family="${family}" fill="${color}"${tracking}${transform}${common}>${esc(p.s)}</text>`
    }
  }
}

export interface SvgOptions {
  /** Emit an xmlns so the string is a valid standalone .svg file (for export). */
  standalone?: boolean
  /**
   * Plotter mode (AxiDraw / pen): drop the paper ground, render every primitive
   * as a single stroke (no fills), and group by pen role so a physical plotter
   * can pen-order the job. The IR is already single-stroke-friendly.
   */
  plotter?: boolean
}

export function renderSVG(plate: Plate, opts: SvgOptions = {}): string {
  const [rw, rh] = plate.ratio
  const scale = LONG_EDGE / Math.max(rw, rh)
  const W = rw * scale
  const H = rh * scale
  const S = Math.min(W, H)
  const amp = Math.max(0, plate.post.handJitter) * 0.005
  const m: Mapper = {
    X: (v) => v * W,
    Y: (v) => v * H,
    S: (v) => v * S,
    sw: (weight) => (weight ?? 1) * BASE_STROKE,
    jp: amp > 0 ? (x, y) => [x + jhash(x, y) * amp, y + jhash(y, x) * amp] : (x, y) => [x, y],
  }

  const items = realizePlate(plate)
  let body: string
  if (opts.plotter) {
    // Group every stroke by pen role so a plotter can pen-order the job.
    const byPen = new Map<string, string[]>()
    for (const item of items) {
      for (const p of item.prims) {
        const svg = primToSvg(p, plate.palette, m, plate.post.lineWeight, true)
        const arr = byPen.get(p.pen) ?? []
        arr.push(svg)
        byPen.set(p.pen, arr)
      }
    }
    body = [...byPen.entries()].map(([pen, prims]) => `<g data-pen="${pen}">${prims.join("")}</g>`).join("")
  } else {
    body = items
      .map((item) => `<g data-src="${item.source.kind}:${esc(item.source.id)}">${item.prims.map((p) => primToSvg(p, plate.palette, m, plate.post.lineWeight)).join("")}</g>`)
      .join("")
  }

  // Standalone output carries xmlns + intrinsic width/height so it is a valid
  // .svg file and rasterizes predictably through `new Image()` (the era pass).
  const head = opts.standalone || opts.plotter
    ? ` xmlns="http://www.w3.org/2000/svg" width="${round(W)}" height="${round(H)}"`
    : ""
  const ground = opts.plotter ? "" : `<rect x="0" y="0" width="${round(W)}" height="${round(H)}" fill="${groundColor(plate.palette)}"/>`
  return (
    `<svg${head} viewBox="0 0 ${round(W)} ${round(H)}" preserveAspectRatio="xMidYMid meet" data-plate="${esc(plate.seed)}" data-salt="${plate.salt}">` +
    ground +
    body +
    `</svg>`
  )
}
