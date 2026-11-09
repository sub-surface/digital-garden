import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { simplex } from "./simplex"
import { perState, FONT } from "./scratch"

// ── Cartography background ──
// A survey map: contour lines around drifting hills, the way a real
// topographic sheet draws them. Closed rings round each summit, crowding
// where the ground is steep, every fifth line an index contour (bolder, with
// its height on it), spot heights on the tops, and the cursor as the
// surveyor's station with a live reading.
//
// Elevation is fractal noise sampled on a grid; contours are traced with
// marching squares (each cell's four corners say which edges an isoline
// crosses; interpolating along those edges puts it exactly where the
// height passes the level). The terrain drifts slowly, as if the sheet
// were being redrawn under you.

const CELL = 13
const INDEX_EVERY = 5
const MAX_M = 3000

interface Scene {
  seed: number
  cols: number
  rows: number
  h: Float32Array
}

const scene = perState<Scene>((state) => {
  const cols = Math.ceil(state.w / CELL) + 2
  const rows = Math.ceil(state.h / CELL) + 2
  return { seed: Math.random() * 1000, cols, rows, h: new Float32Array(cols * rows) }
})

// Marching-squares edge pairs per case (edges: 0 top, 1 right, 2 bottom, 3 left).
// Saddles (5, 10) are split one way; at this scale the choice is invisible.
const CASES: number[][] = [
  [], [3, 2], [2, 1], [3, 1], [1, 0], [3, 0, 1, 2], [2, 0], [3, 0],
  [0, 3], [0, 2], [0, 1, 2, 3], [0, 1], [1, 3], [1, 2], [2, 3], [],
]

export function drawCartography(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.cartography
  if (!p) return
  const s = scene(state)
  const { cols, rows, h } = s
  const levels = Math.max(4, Math.round(p.lines ?? 16))
  const freq = p.elevation ?? 0.0022
  const relief = p.relief ?? 1.6
  const t = (performance.now() / 1000) * (p.speed ?? 0.6) * 0.02
  const op = (p.opacity ?? 0.3) * state.readerAlpha
  const ink = state.colorCache.secondary

  // Elevation field, 0..1. Relief sharpens the summits (a power curve), so
  // high ground stands out of gentler lowland.
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i * CELL) * freq + s.seed, y = (j * CELL) * freq
      let v = simplex(x + t, y - t * 0.6) * 0.62
        + simplex(x * 2.1 - t * 1.3, y * 2.1 + 40) * 0.26
        + simplex(x * 4.7 + 90, y * 4.7 + t * 2) * 0.12
      v = v * 0.5 + 0.5
      h[j * cols + i] = Math.pow(Math.min(1, Math.max(0, v)), 0.6 + relief * 0.35)
    }
  }

  const minor = new Path2D()
  const index = new Path2D()
  const labels: { x: number; y: number; a: number; m: number }[] = []
  const lastLabel = new Map<number, { x: number; y: number }[]>()

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = h[j * cols + i], b = h[j * cols + i + 1]
      const c = h[(j + 1) * cols + i + 1], d = h[(j + 1) * cols + i]
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d)
      // Only the levels that actually cross this cell
      const l0 = Math.ceil(lo * (levels + 1)), l1 = Math.floor(hi * (levels + 1))
      for (let l = Math.max(1, l0); l <= Math.min(levels, l1); l++) {
        const iso = l / (levels + 1)
        const k = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0)
        const edges = CASES[k]
        if (!edges.length) continue
        const x0 = (i - 1) * CELL, y0 = (j - 1) * CELL
        const pt = (e: number): [number, number] => {
          if (e === 0) return [x0 + ((iso - a) / (b - a)) * CELL, y0]
          if (e === 1) return [x0 + CELL, y0 + ((iso - b) / (c - b)) * CELL]
          if (e === 2) return [x0 + ((iso - d) / (c - d)) * CELL, y0 + CELL]
          return [x0, y0 + ((iso - a) / (d - a)) * CELL]
        }
        const isIndex = l % INDEX_EVERY === 0
        const path = isIndex ? index : minor
        for (let e = 0; e < edges.length; e += 2) {
          const [ax, ay] = pt(edges[e]), [bx, by] = pt(edges[e + 1])
          path.moveTo(ax, ay)
          path.lineTo(bx, by)
          // A height on index contours, where the line runs fairly level,
          // spaced well apart along the same contour
          if (isIndex && Math.abs(by - ay) < Math.abs(bx - ax) * 0.5 && ax > 40 && ax < state.w - 60 && ay > 30 && ay < state.h - 30) {
            const near = lastLabel.get(l) ?? []
            if (near.every((q) => Math.hypot(q.x - ax, q.y - ay) > 260) && labels.length < 14) {
              near.push({ x: ax, y: ay })
              lastLabel.set(l, near)
              labels.push({ x: (ax + bx) / 2, y: (ay + by) / 2, a: Math.atan2(by - ay, bx - ax), m: Math.round(iso * MAX_M) })
            }
          }
        }
      }
    }
  }

  ctx.strokeStyle = ink
  ctx.lineCap = "round"
  ctx.lineWidth = 0.8
  ctx.globalAlpha = op * 0.55
  ctx.stroke(minor)
  ctx.lineWidth = 1.5
  ctx.globalAlpha = op * 0.95
  ctx.stroke(index)

  // Heights along index contours, set along the line
  ctx.font = `8px ${FONT.mono}`
  ctx.fillStyle = ink
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.globalAlpha = op * 0.9
  for (const lb of labels) {
    let a = lb.a
    if (a > Math.PI / 2) a -= Math.PI
    if (a < -Math.PI / 2) a += Math.PI
    ctx.save()
    ctx.translate(lb.x, lb.y - 5)
    ctx.rotate(a)
    ctx.fillText(String(lb.m), 0, 0)
    ctx.restore()
  }

  // Spot heights: summits (higher than everything within three cells)
  ctx.textAlign = "left"
  for (let j = 3; j < rows - 3; j += 3) {
    for (let i = 3; i < cols - 3; i += 3) {
      const v = h[j * cols + i]
      if (v < 0.55) continue
      let top = true
      for (let dj = -3; dj <= 3 && top; dj++) for (let di = -3; di <= 3; di++) {
        if ((di || dj) && h[(j + dj) * cols + i + di] >= v) { top = false; break }
      }
      if (!top) continue
      const x = (i - 1) * CELL, y = (j - 1) * CELL
      ctx.globalAlpha = op
      ctx.beginPath()
      ctx.moveTo(x, y - 3); ctx.lineTo(x + 3, y + 2); ctx.lineTo(x - 3, y + 2); ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = op * 0.8
      ctx.fillText(String(Math.round(v * MAX_M)), x + 6, y)
    }
  }

  // The surveyor's station: the height under the cursor
  if (state.mx > -9000) {
    const gi = Math.min(cols - 2, Math.max(0, state.mx / CELL + 1)), gj = Math.min(rows - 2, Math.max(0, state.my / CELL + 1))
    const i = Math.floor(gi), j = Math.floor(gj), fx = gi - i, fy = gj - j
    const v = (h[j * cols + i] * (1 - fx) + h[j * cols + i + 1] * fx) * (1 - fy)
      + (h[(j + 1) * cols + i] * (1 - fx) + h[(j + 1) * cols + i + 1] * fx) * fy
    const mx = state.mx, my = state.my
    ctx.lineWidth = 1
    ctx.globalAlpha = op * 1.4
    ctx.beginPath()
    ctx.moveTo(mx - 10, my); ctx.lineTo(mx - 3, my)
    ctx.moveTo(mx + 3, my); ctx.lineTo(mx + 10, my)
    ctx.moveTo(mx, my - 10); ctx.lineTo(mx, my - 3)
    ctx.moveTo(mx, my + 3); ctx.lineTo(mx, my + 10)
    ctx.stroke()
    ctx.fillText(`△ ${Math.round(v * MAX_M)} m`, mx + 13, my - 8)
  }
  ctx.textBaseline = "alphabetic"
  ctx.globalAlpha = 1
}
