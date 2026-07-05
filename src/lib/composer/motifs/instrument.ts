/**
 * instrument — one drawing from a small parts kit: dividers, coil, sextant, or
 * retort. Picks a kind per seed. Satellite scale.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"

const TAU = Math.PI * 2

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const pen = ctx.penRole
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const s = Math.min(box.w, box.h) * 0.42
  const kind = Math.floor(rng() * 4)

  if (kind === 0) {
    // Dividers — pivot at top, two legs, an arc between the tips.
    const top: [number, number] = [cx, cy - s]
    const spread = s * 0.5
    const lt: [number, number] = [cx - spread, cy + s]
    const rt: [number, number] = [cx + spread, cy + s]
    prims.push({ t: "line", x1: top[0], y1: top[1], x2: lt[0], y2: lt[1], pen, w: 1, alpha: 0.9 })
    prims.push({ t: "line", x1: top[0], y1: top[1], x2: rt[0], y2: rt[1], pen, w: 1, alpha: 0.9 })
    prims.push({ t: "circle", cx: top[0], cy: top[1], r: s * 0.09, pen: "highlight", fill: true, alpha: 0.9 })
    const arc: [number, number][] = []
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      arc.push([lt[0] + (rt[0] - lt[0]) * t, cy + s + Math.sin(t * Math.PI) * s * 0.14])
    }
    prims.push({ t: "polyline", pts: arc, pen, w: 0.6, alpha: 0.6 })
  } else if (kind === 1) {
    // Coil — a logarithmic spiral.
    const pts: [number, number][] = []
    const turns = 3.5
    for (let i = 0; i <= 60; i++) {
      const t = i / 60
      const a = t * turns * TAU
      const r = s * t
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
    prims.push({ t: "polyline", pts, pen, w: 0.8, alpha: 0.85 })
    prims.push({ t: "circle", cx, cy, r: s * 0.05, pen: "highlight", fill: true, alpha: 0.9 })
  } else if (kind === 2) {
    // Sextant — an arc frame with two radii and an index arm.
    const arc: [number, number][] = []
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI * 0.75 + (i / 16) * Math.PI * 0.5
      arc.push([cx + Math.cos(a) * s, cy + Math.sin(a) * s])
    }
    prims.push({ t: "polyline", pts: arc, pen, w: 0.9, alpha: 0.9 })
    prims.push({ t: "line", x1: cx, y1: cy, x2: arc[0][0], y2: arc[0][1], pen, w: 0.7, alpha: 0.8 })
    prims.push({ t: "line", x1: cx, y1: cy, x2: arc[arc.length - 1][0], y2: arc[arc.length - 1][1], pen, w: 0.7, alpha: 0.8 })
    const ia = -Math.PI * 0.55
    prims.push({ t: "line", x1: cx, y1: cy, x2: cx + Math.cos(ia) * s, y2: cy + Math.sin(ia) * s, pen: "highlight", w: 0.9, alpha: 0.9 })
  } else {
    // Retort — a bulb with a curved neck.
    const br = s * 0.55
    const by = cy + s * 0.3
    prims.push({ t: "circle", cx, cy: by, r: br, pen, w: 0.9, alpha: 0.9 })
    const neck: [number, number][] = []
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      neck.push([cx + t * s * 0.7, by - br - t * s * 0.5 + Math.sin(t * Math.PI) * s * 0.1])
    }
    prims.push({ t: "polyline", pts: neck, pen, w: 0.8, alpha: 0.85 })
    prims.push({ t: "line", x1: cx - br * 0.4, y1: by + br * 0.5, x2: cx + br * 0.4, y2: by + br * 0.5, pen: "highlight", w: 0.6, alpha: 0.7 })
  }

  const anchors: Anchor[] = [
    { id: "mount", x: cx, y: cy, kind: "mount" },
    { id: "p-top", x: cx, y: box.y, kind: "port", dir: -Math.PI / 2 },
  ]
  return { primitives: prims, anchors }
}

export const instrument: MotifDef = {
  key: "instrument",
  name: "Instrument",
  classes: ["satellite"],
  params: [],
  gen,
}
