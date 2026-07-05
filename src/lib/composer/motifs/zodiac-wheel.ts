/**
 * zodiac-wheel — a divided wheel: outer + inner rings, twelve house spokes with
 * tick graduations and a small mark per house. The astrological / horary focal.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"

const TAU = Math.PI * 2

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const pen = ctx.penRole
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const r = Math.min(box.w, box.h) * 0.46
  const houses = Math.round((params.houses as number) ?? 12)
  const rot = rng() * TAU

  prims.push({ t: "circle", cx, cy, r, pen, w: 0.8, alpha: 0.85 })
  prims.push({ t: "circle", cx, cy, r: r * 0.82, pen, w: 0.5, alpha: 0.55 })
  prims.push({ t: "circle", cx, cy, r: r * 0.34, pen, w: 0.5, alpha: 0.55 })

  for (let i = 0; i < houses; i++) {
    const a = (i / houses) * TAU + rot
    // house spoke between the two inner rings
    prims.push({ t: "line", x1: cx + Math.cos(a) * r * 0.34, y1: cy + Math.sin(a) * r * 0.34, x2: cx + Math.cos(a) * r * 0.82, y2: cy + Math.sin(a) * r * 0.82, pen, w: 0.6, alpha: 0.7 })
    // a small house mark in the band
    const ma = a + TAU / houses / 2
    const mr = r * 0.58
    prims.push({ t: "circle", cx: cx + Math.cos(ma) * mr, cy: cy + Math.sin(ma) * mr, r: r * 0.03, pen: "highlight", fill: rng() < 0.5, alpha: 0.85 })
  }
  // fine graduation ticks on the outer ring
  const ticks = houses * 5
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * TAU + rot
    const inR = i % 5 === 0 ? 0.9 : 0.95
    prims.push({ t: "line", x1: cx + Math.cos(a) * r, y1: cy + Math.sin(a) * r, x2: cx + Math.cos(a) * r * inR, y2: cy + Math.sin(a) * r * inR, pen, w: 0.4, alpha: 0.5 })
  }
  prims.push({ t: "circle", cx, cy, r: r * 0.05, pen: "highlight", fill: true, alpha: 0.9 })

  const anchors: Anchor[] = [
    { id: "mount", x: cx, y: cy, kind: "mount" },
    ...[0, 1, 2, 3].map((q) => ({ id: `p-${q}`, x: cx + Math.cos((q / 4) * TAU) * r, y: cy + Math.sin((q / 4) * TAU) * r, kind: "port" as const, dir: (q / 4) * TAU })),
  ]
  return { primitives: prims, anchors }
}

export const zodiacWheel: MotifDef = {
  key: "zodiac-wheel",
  name: "Zodiac wheel",
  classes: ["focal"],
  params: [{ key: "houses", label: "houses", min: 8, max: 16, step: 1, default: 12 }],
  gen,
}
