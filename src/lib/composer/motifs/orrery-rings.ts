/**
 * orrery-rings — nested astrolabe rings with tick radials and orbiting bodies.
 * Lifts the ring/tick/precession geometry from BgCanvas' `drawOrrery`, frozen
 * to a still: each ring gets a deterministic squash and phase, one body node,
 * and a short trailing arc (sampled to a polyline so the renderer needs no arc
 * primitive).
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"

const TAU = Math.PI * 2

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const anchors: Anchor[] = []
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const short = Math.min(box.w, box.h)
  const maxR = short * 0.46
  const rings = Math.round((params.rings as number) ?? 5)
  const structure = ctx.penRole
  const accent = "highlight"

  for (let i = 0; i < rings; i++) {
    const r = maxR * ((i + 1) / rings)
    const squash = 1 - 0.08 * (rng() - 0.5)
    const ry = r * squash
    const rot = rng() * TAU

    // Ring ellipse.
    prims.push({ t: "circle", cx, cy, r, ry, pen: structure, w: 0.8, alpha: 0.7 })

    // Tick radials.
    const ticks = 12 + i * 6
    for (let t = 0; t < ticks; t++) {
      const a = (t / ticks) * TAU + rot * 0.4
      const inner = t % 3 === 0 ? 0.955 : 0.98
      prims.push({
        t: "line",
        x1: cx + Math.cos(a) * r,
        y1: cy + Math.sin(a) * ry,
        x2: cx + Math.cos(a) * r * inner,
        y2: cy + Math.sin(a) * ry * inner,
        pen: structure,
        w: 0.6,
        alpha: 0.6,
      })
    }

    // Orbiting body + short trailing arc (sampled polyline).
    const ba = rot
    prims.push({
      t: "circle",
      cx: cx + Math.cos(ba) * r,
      cy: cy + Math.sin(ba) * ry,
      r: short * 0.012,
      pen: accent,
      fill: true,
      alpha: 0.9,
    })
    const trail: [number, number][] = []
    for (let s = 0; s <= 8; s++) {
      const a = ba - 0.6 + (0.6 * s) / 8
      trail.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry])
    }
    prims.push({ t: "polyline", pts: trail, pen: accent, w: 0.8, alpha: 0.35 })
  }

  // Centre node.
  prims.push({ t: "circle", cx, cy, r: short * 0.016, pen: accent, fill: true, alpha: 0.85 })

  // Anchors: centre mount + four cardinal ports on the outer ring.
  anchors.push({ id: "mount", x: cx, y: cy, kind: "mount" })
  for (let q = 0; q < 4; q++) {
    const a = (q / 4) * TAU
    anchors.push({
      id: `p-${q}`,
      x: cx + Math.cos(a) * maxR,
      y: cy + Math.sin(a) * maxR,
      kind: "port",
      dir: a,
    })
  }

  return { primitives: prims, anchors }
}

export const orreryRings: MotifDef = {
  key: "orrery-rings",
  name: "Orrery rings",
  classes: ["focal"],
  params: [{ key: "rings", label: "rings", min: 2, max: 9, step: 1, default: 5 }],
  gen,
}
