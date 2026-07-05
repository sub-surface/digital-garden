/**
 * glyph-seal — a radial sigil: concentric rings, hashed radial spokes, an inner
 * star polygon and a ring of ticks. Kin to SIGIL's seal, richer. Satellite or
 * decorative apparatus.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"

const TAU = Math.PI * 2

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const pen = ctx.penRole
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const r = Math.min(box.w, box.h) * 0.44
  const points = Math.round((params.points as number) ?? 7)

  prims.push({ t: "circle", cx, cy, r, pen, w: 0.9, alpha: 0.9 })
  prims.push({ t: "circle", cx, cy, r: r * 0.72, pen, w: 0.5, alpha: 0.6 })

  // Radial spokes from a hashed bit pattern.
  const bits = (rng() * 4096) | 0
  const spokes = 12
  for (let i = 0; i < spokes; i++) {
    if ((bits >> i) & 1) {
      const a = (i / spokes) * TAU
      prims.push({ t: "line", x1: cx, y1: cy, x2: cx + Math.cos(a) * r, y2: cy + Math.sin(a) * r, pen, w: 0.5, alpha: 0.7 })
    }
  }

  // Inner star polygon (skip vertices for a {n/k} star).
  const k = points >= 5 ? 2 : 1
  const inner = r * 0.72
  const star: [number, number][] = []
  for (let i = 0; i <= points; i++) {
    const a = ((i * k) % points) / points * TAU - Math.PI / 2
    star.push([cx + Math.cos(a) * inner, cy + Math.sin(a) * inner])
  }
  prims.push({ t: "polyline", pts: star, pen: "highlight", w: 0.8, alpha: 0.85 })

  // Outer ticks.
  const ticks = 36
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * TAU
    const inR = i % 3 === 0 ? 0.9 : 0.95
    prims.push({ t: "line", x1: cx + Math.cos(a) * r, y1: cy + Math.sin(a) * r, x2: cx + Math.cos(a) * r * inR, y2: cy + Math.sin(a) * r * inR, pen, w: 0.4, alpha: 0.5 })
  }
  prims.push({ t: "circle", cx, cy, r: r * 0.06, pen: "highlight", fill: true, alpha: 0.9 })

  const anchors: Anchor[] = [
    { id: "mount", x: cx, y: cy, kind: "mount" },
    { id: "p-top", x: cx, y: cy - r, kind: "port", dir: -Math.PI / 2 },
  ]
  return { primitives: prims, anchors }
}

export const glyphSeal: MotifDef = {
  key: "glyph-seal",
  name: "Glyph seal",
  classes: ["satellite", "apparatus"],
  params: [{ key: "points", label: "points", min: 5, max: 12, step: 1, default: 7 }],
  gen,
}
