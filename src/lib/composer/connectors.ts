/**
 * Connectors — routed as a post-layout pass. Given from/to anchors and a route
 * style, emit primitives. Routing avoids node interiors where it can; when it
 * can't it falls back to a straight leader and marks it (failure visible, not
 * hidden). Anchor references are global: `"nodeId#anchorId"`.
 */

import type { Connector, Plate, Prim } from "./types"
import { hashStr } from "./rng"

interface Pt {
  x: number
  y: number
  dir?: number
}

export function resolveAnchor(plate: Plate, ref: string): Pt | null {
  const hash = ref.indexOf("#")
  if (hash < 0) return null
  const nodeId = ref.slice(0, hash)
  const anchorId = ref.slice(hash + 1)
  const node = plate.nodes.find((n) => n.id === nodeId)
  const a = node?.anchors.find((an) => an.id === anchorId)
  return a ? { x: a.x, y: a.y, dir: a.dir } : null
}

function insideBox(b: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h
}

function labelPrim(c: Connector, x: number, y: number, rightward: boolean): Prim | null {
  if (!c.label) return null
  const off = rightward ? 0.009 : -0.009
  return { t: "text", x: x + off, y: y + 0.004, s: c.label, size: 0.013, pen: c.penRole, align: rightward ? "start" : "end", alpha: 0.85 }
}

function leader(from: Pt, to: Pt, c: Connector): Prim[] {
  const elbow = 0.028
  const pts: [number, number][] = [[from.x, from.y]]
  if (from.dir !== undefined) pts.push([from.x + Math.cos(from.dir) * elbow, from.y + Math.sin(from.dir) * elbow])
  pts.push([to.x, to.y])
  const prims: Prim[] = [
    { t: "polyline", pts, pen: c.penRole, w: 0.8, alpha: 0.75, dash: c.route === "dotted" ? [0.002, 0.006] : undefined },
    { t: "circle", cx: to.x, cy: to.y, r: 0.004, pen: c.penRole, fill: true, alpha: 0.8 },
  ]
  const lbl = labelPrim(c, to.x, to.y, to.x >= from.x)
  if (lbl) prims.push(lbl)
  return prims
}

function bezier(from: Pt, to: Pt, bow: number): { pts: [number, number][]; ctrl: [number, number] } {
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1e-6
  const ctrl: [number, number] = [mx + (-dy / len) * bow * len, my + (dx / len) * bow * len]
  const pts: [number, number][] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const u = 1 - t
    pts.push([u * u * from.x + 2 * u * t * ctrl[0] + t * t * to.x, u * u * from.y + 2 * u * t * ctrl[1] + t * t * to.y])
  }
  return { pts, ctrl }
}

function arc(from: Pt, to: Pt, c: Connector, dotted: boolean): Prim[] {
  const bow = c.params?.bow ?? 0.18
  const { pts } = bezier(from, to, bow)
  const prims: Prim[] = [{ t: "polyline", pts, pen: c.penRole, w: 0.8, alpha: 0.75, dash: dotted ? [0.002, 0.006] : undefined }]
  const lbl = labelPrim(c, to.x, to.y, to.x >= from.x)
  if (lbl) prims.push(lbl)
  return prims
}

function manhattan(from: Pt, to: Pt, c: Connector, plate: Plate): Prim[] {
  const c1: [number, number] = [to.x, from.y] // horizontal then vertical
  const c2: [number, number] = [from.x, to.y] // vertical then horizontal
  const blocked = (p: [number, number]) => plate.nodes.some((n) => insideBox(n.box, p[0], p[1]))
  let corner = c1
  let clean = true
  if (blocked(c1)) {
    if (!blocked(c2)) corner = c2
    else clean = false // neither elbow is clear — draw it, but mark it
  }
  return [
    {
      t: "polyline",
      pts: [[from.x, from.y], corner, [to.x, to.y]],
      pen: c.penRole,
      w: 0.8,
      alpha: 0.75,
      dash: clean ? undefined : [0.004, 0.004], // marked route (failure visible)
    },
  ]
}

function stream(from: Pt, to: Pt, c: Connector): Prim[] {
  const { pts } = bezier(from, to, c.params?.bow ?? 0.08)
  const prims: Prim[] = []
  const seed = hashStr(c.id)
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1)
    const density = 1 - t * 0.7 // denser near source
    const h = ((seed ^ (i * 2654435761)) >>> 0) / 4294967296
    if (h > density) continue
    const [x, y] = pts[i]
    prims.push({ t: "circle", cx: x, cy: y, r: 0.0022 * (1 - t * 0.5), pen: c.penRole, fill: true, alpha: 0.6 * density })
  }
  return prims
}

function textPath(from: Pt, to: Pt, c: Connector): Prim[] {
  const label = c.label
  if (!label) return leader(from, to, c)
  const bow = c.params?.bow ?? 0.16
  const { ctrl } = bezier(from, to, bow)
  const prims: Prim[] = []
  const n = label.length
  const size = 0.016
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n
    const u = 1 - t
    const x = u * u * from.x + 2 * u * t * ctrl[0] + t * t * to.x
    const y = u * u * from.y + 2 * u * t * ctrl[1] + t * t * to.y
    // tangent = derivative of the quadratic
    const dx = 2 * u * (ctrl[0] - from.x) + 2 * t * (to.x - ctrl[0])
    const dy = 2 * u * (ctrl[1] - from.y) + 2 * t * (to.y - ctrl[1])
    prims.push({ t: "text", x, y, s: label[k], size, pen: c.penRole, align: "middle", rot: Math.atan2(dy, dx), alpha: 0.9 })
  }
  return prims
}

export function realizeConnector(plate: Plate, c: Connector): Prim[] {
  const from = resolveAnchor(plate, c.from)
  const to = resolveAnchor(plate, c.to)
  if (!from || !to) return [] // defensive: anchors are resolved at generate time
  switch (c.route) {
    case "arc":
      return arc(from, to, c, false)
    case "dotted":
      return arc(from, to, c, true)
    case "manhattan":
      return manhattan(from, to, c, plate)
    case "stream":
      return stream(from, to, c)
    case "text-path":
      return textPath(from, to, c)
    case "leader":
    default:
      return leader(from, to, c)
  }
}
