/**
 * waveform — a plotted signal trace over a faint measured grid, like an
 * oscilloscope readout or a seismograph strip. Field or satellite.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"
import { fbm } from "../noise"

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const pen = ctx.penRole
  const cy = box.y + box.h / 2
  const amp = box.h * 0.32
  const harmonics = 1 + Math.floor(rng() * 3)
  const phase = rng() * Math.PI * 2
  const freq = (2 + rng() * 4) * ((params.freq as number) ?? 1)

  // Faint grid.
  for (let i = 0; i <= 4; i++) {
    const y = box.y + (i / 4) * box.h
    prims.push({ t: "line", x1: box.x, y1: y, x2: box.x + box.w, y2: y, pen: "shadow", w: 0.4, alpha: 0.35 })
  }
  const vlines = 8
  for (let i = 0; i <= vlines; i++) {
    const x = box.x + (i / vlines) * box.w
    prims.push({ t: "line", x1: x, y1: box.y, x2: x, y2: box.y + box.h, pen: "shadow", w: 0.4, alpha: 0.25 })
  }

  // The trace.
  const pts: [number, number][] = []
  const steps = 80
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    let v = 0
    for (let h = 1; h <= harmonics; h++) v += Math.sin(t * freq * Math.PI * 2 * h + phase) / h
    v = v / harmonics + (fbm(t * 6, phase, 2) - 0.5) * 0.4
    pts.push([box.x + t * box.w, cy - v * amp])
  }
  prims.push({ t: "polyline", pts, pen: "highlight", w: 0.9, alpha: 0.9 })

  const anchors: Anchor[] = [
    { id: "mount", x: box.x + box.w / 2, y: cy, kind: "mount" },
    { id: "p-l", x: box.x, y: cy, kind: "port", dir: Math.PI },
    { id: "p-r", x: box.x + box.w, y: cy, kind: "port", dir: 0 },
  ]
  return { primitives: prims, anchors }
}

export const waveform: MotifDef = {
  key: "waveform",
  name: "Waveform",
  classes: ["field", "satellite"],
  params: [{ key: "freq", label: "freq", min: 0.3, max: 2.5, step: 0.1, default: 1 }],
  gen,
}
