/**
 * chamber — particle tracks curving through a flow field, stippled, with bright
 * origin vertices. Lifts BgCanvas' bubble-chamber logic (field-steered walks +
 * charge curl) into a still: a fixed set of tracks, mostly structure pen with a
 * few accent "signal" tracks.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"
import { fbm } from "../noise"

const TAU = Math.PI * 2

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const short = Math.min(box.w, box.h)
  const tracks = Math.round((params.tracks as number) ?? 18)
  const steps = 22
  const stepLen = short * 0.02

  for (let t = 0; t < tracks; t++) {
    let x = cx + (rng() - 0.5) * short * 0.35
    let y = cy + (rng() - 0.5) * short * 0.35
    const charge = rng() < 0.5 ? 1 : -1
    let ang = rng() * TAU
    const pts: [number, number][] = [[x, y]]
    for (let s = 0; s < steps; s++) {
      const fieldA = fbm(x * 3.2, y * 3.2, 3) * TAU
      ang += Math.sin(fieldA - ang) * 0.35 + charge * 0.06
      x += Math.cos(ang) * stepLen
      y += Math.sin(ang) * stepLen
      pts.push([x, y])
    }
    const accent = rng() < 0.16
    prims.push({ t: "polyline", pts, pen: accent ? "highlight" : ctx.penRole, w: 0.6, alpha: 0.55, dash: [short * 0.006, short * 0.011] })
    prims.push({ t: "circle", cx: pts[0][0], cy: pts[0][1], r: short * 0.007, pen: ctx.penRole, fill: true, alpha: 0.85 })
  }

  const anchors: Anchor[] = [
    { id: "mount", x: cx, y: cy, kind: "mount" },
    { id: "p-l", x: box.x, y: cy, kind: "port", dir: Math.PI },
    { id: "p-r", x: box.x + box.w, y: cy, kind: "port", dir: 0 },
  ]
  return { primitives: prims, anchors }
}

export const chamber: MotifDef = {
  key: "chamber",
  name: "Chamber",
  classes: ["focal"],
  params: [{ key: "tracks", label: "tracks", min: 6, max: 40, step: 1, default: 18 }],
  gen,
}
