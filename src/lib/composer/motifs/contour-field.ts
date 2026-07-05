/**
 * contour-field — topographic strata: noise-displaced lines reading as survey
 * contours, with a scatter of survey marks. Fills its region (a field motif).
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"
import { fbm } from "../noise"

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const lines = Math.round((params.lines as number) ?? 16)
  const amp = ((params.relief as number) ?? 1) * box.h * 0.05
  const cols = 44

  for (let i = 0; i < lines; i++) {
    const baseY = box.y + ((i + 0.5) / lines) * box.h
    const pts: [number, number][] = []
    for (let c = 0; c <= cols; c++) {
      const x = box.x + (c / cols) * box.w
      const disp = (fbm(x * 4, baseY * 4 + i * 0.35, 3) - 0.5) * amp
      pts.push([x, baseY + disp])
    }
    prims.push({ t: "polyline", pts, pen: ctx.penRole, w: 0.6, alpha: 0.55 })
  }

  // Survey marks — small crosses at a few sampled points.
  const marks = 5
  for (let m = 0; m < marks; m++) {
    const mx = box.x + (0.1 + 0.8 * rng()) * box.w
    const my = box.y + (0.1 + 0.8 * rng()) * box.h
    const r = Math.min(box.w, box.h) * 0.01
    prims.push({ t: "line", x1: mx - r, y1: my, x2: mx + r, y2: my, pen: "highlight", w: 0.7, alpha: 0.8 })
    prims.push({ t: "line", x1: mx, y1: my - r, x2: mx, y2: my + r, pen: "highlight", w: 0.7, alpha: 0.8 })
  }

  const anchors: Anchor[] = [
    { id: "mount", x: box.x + box.w / 2, y: box.y + box.h / 2, kind: "mount" },
    { id: "p-tl", x: box.x, y: box.y, kind: "port" },
    { id: "p-br", x: box.x + box.w, y: box.y + box.h, kind: "port" },
  ]
  return { primitives: prims, anchors }
}

export const contourField: MotifDef = {
  key: "contour-field",
  name: "Contour field",
  classes: ["field"],
  params: [
    { key: "lines", label: "lines", min: 6, max: 30, step: 1, default: 16 },
    { key: "relief", label: "relief", min: 0.3, max: 2.5, step: 0.1, default: 1 },
  ],
  gen,
}
