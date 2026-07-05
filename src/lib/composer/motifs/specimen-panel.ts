/**
 * specimen-panel — a small framed specimen with a catalog label: a double-ruled
 * box, a little object inside, and a lexicon code beneath. The workhorse of the
 * cartographic/catalogue armatures.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"
import { mulberry32 } from "../rng"
import { catalogCode } from "../lexicon"

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const pen = ctx.penRole
  const rect = (x: number, y: number, w: number, h: number, sw: number, alpha: number): Prim => ({
    t: "polygon",
    pts: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    pen,
    w: sw,
    alpha,
  })
  const panelH = box.h * 0.78
  prims.push(rect(box.x, box.y, box.w, panelH, 0.8, 0.85))
  prims.push(rect(box.x + box.w * 0.04, box.y + box.h * 0.04, box.w * 0.92, panelH - box.h * 0.08, 0.5, 0.6))

  // A little specimen inside — a small cluster of strokes / a ring.
  const cx = box.x + box.w / 2
  const cy = box.y + panelH * 0.5
  const r = Math.min(box.w, panelH) * 0.24
  prims.push({ t: "circle", cx, cy, r, pen: "highlight", w: 0.7, alpha: 0.8 })
  const spokes = 3 + Math.floor(rng() * 4)
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rng() * 0.4
    prims.push({ t: "line", x1: cx, y1: cy, x2: cx + Math.cos(a) * r, y2: cy + Math.sin(a) * r, pen, w: 0.5, alpha: 0.7 })
  }

  // Catalog label beneath the panel (deterministic per node via its own rng).
  const label = catalogCode(mulberry32((rng() * 2 ** 31) | 0))
  prims.push({ t: "text", x: cx, y: box.y + box.h * 0.94, s: label, size: Math.min(box.w, box.h) * 0.09, pen, align: "middle", alpha: 0.9 })

  const anchors: Anchor[] = [
    { id: "mount", x: cx, y: cy, kind: "mount" },
    { id: "label", x: cx, y: box.y + box.h * 0.9, kind: "label" },
    { id: "p-top", x: cx, y: box.y, kind: "port", dir: -Math.PI / 2 },
  ]
  return { primitives: prims, anchors }
}

export const specimenPanel: MotifDef = {
  key: "specimen-panel",
  name: "Specimen panel",
  classes: ["satellite"],
  params: [],
  gen,
}
