/**
 * geometer — a stylized robed figure (the astronomer / surveyor / scribe), drawn
 * as a single-stroke line figure: hooded head, robe, one arm holding a staff or
 * instrument. Focal or satellite.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const pen = ctx.penRole
  const cx = box.x + box.w / 2
  const w = box.w
  const h = box.h
  const shoulderY = box.y + h * 0.32
  const bottomY = box.y + h * 0.94
  const halfTop = w * 0.13
  const halfBot = w * 0.27

  // Robe.
  prims.push({
    t: "polygon",
    pts: [
      [cx - halfTop, shoulderY],
      [cx + halfTop, shoulderY],
      [cx + halfBot, bottomY],
      [cx - halfBot, bottomY],
    ],
    pen,
    w: 0.9,
    alpha: 0.9,
  })
  // Hem fold lines.
  for (let i = 1; i <= 2; i++) {
    const t = i / 3
    prims.push({ t: "line", x1: cx - halfTop * (1 - t) - halfBot * t + w * 0.02, y1: shoulderY + (bottomY - shoulderY) * t, x2: cx, y2: bottomY - h * 0.02, pen, w: 0.4, alpha: 0.4 })
  }
  // Head + hood.
  const headR = w * 0.09
  const headY = shoulderY - headR * 1.1
  prims.push({ t: "circle", cx, cy: headY, r: headR, pen, w: 0.8, alpha: 0.9 })
  prims.push({
    t: "polyline",
    pts: [
      [cx - halfTop, shoulderY],
      [cx - headR * 0.6, headY - headR * 0.4],
      [cx, headY - headR * 1.3],
      [cx + headR * 0.6, headY - headR * 0.4],
      [cx + halfTop, shoulderY],
    ],
    pen,
    w: 0.7,
    alpha: 0.8,
  })
  // Staff on one side.
  const side = rng() < 0.5 ? -1 : 1
  const sx = cx + side * halfBot * 1.05
  prims.push({ t: "line", x1: sx, y1: box.y + h * 0.08, x2: sx, y2: bottomY, pen: "highlight", w: 0.9, alpha: 0.9 })
  prims.push({ t: "circle", cx: sx, cy: box.y + h * 0.08, r: w * 0.03, pen: "highlight", w: 0.8, alpha: 0.9 })
  // Arm to the staff.
  prims.push({ t: "line", x1: cx + side * halfTop * 0.6, y1: shoulderY + h * 0.06, x2: sx, y2: box.y + h * 0.34, pen, w: 0.7, alpha: 0.8 })

  const anchors: Anchor[] = [
    { id: "mount", x: cx, y: box.y + h * 0.5, kind: "mount" },
    { id: "head", x: cx, y: headY, kind: "port", dir: -Math.PI / 2 },
    { id: "staff", x: sx, y: box.y + h * 0.08, kind: "port" },
  ]
  return { primitives: prims, anchors }
}

export const geometer: MotifDef = {
  key: "geometer",
  name: "Geometer",
  classes: ["focal", "satellite"],
  params: [],
  gen,
}
