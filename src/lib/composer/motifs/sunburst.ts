/**
 * sunburst — a radiant: a central disc ringed by rays of alternating length,
 * with an outer circle. Reads as a sun, a monstrance, or an emitter. Satellite
 * or focal.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"

const TAU = Math.PI * 2

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const pen = ctx.penRole
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const r = Math.min(box.w, box.h) * 0.46
  const rays = Math.round((params.rays as number) ?? 16)
  const inner = r * 0.28

  prims.push({ t: "circle", cx, cy, r, pen, w: 0.5, alpha: 0.5 })
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU + rng() * 0.02
    const len = i % 2 === 0 ? r : r * (0.6 + rng() * 0.2)
    prims.push({ t: "line", x1: cx + Math.cos(a) * inner, y1: cy + Math.sin(a) * inner, x2: cx + Math.cos(a) * len, y2: cy + Math.sin(a) * len, pen, w: i % 2 === 0 ? 0.9 : 0.5, alpha: 0.8 })
  }
  prims.push({ t: "circle", cx, cy, r: inner, pen: "highlight", w: 0.9, alpha: 0.9 })
  prims.push({ t: "circle", cx, cy, r: inner * 0.4, pen: "highlight", fill: true, alpha: 0.85 })

  const anchors: Anchor[] = [
    { id: "mount", x: cx, y: cy, kind: "mount" },
    { id: "p-top", x: cx, y: cy - r, kind: "port", dir: -Math.PI / 2 },
    { id: "p-bot", x: cx, y: cy + r, kind: "port", dir: Math.PI / 2 },
  ]
  return { primitives: prims, anchors }
}

export const sunburst: MotifDef = {
  key: "sunburst",
  name: "Sunburst",
  classes: ["satellite", "focal"],
  params: [{ key: "rays", label: "rays", min: 8, max: 32, step: 1, default: 16 }],
  gen,
}
