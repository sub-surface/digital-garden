/**
 * voxel-mass — a cluster of isometric wireframe cubes stacked into a "mass".
 * Lifts the orthographic cube projection from BgCanvas' `drawIsometric`, but
 * emits vector primitives + anchors instead of painting to a canvas, and holds
 * a fixed rotation (the composer renders a still, not an animation).
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const cx0 = box.x + box.w / 2
  const cy0 = box.y + box.h / 2
  const short = Math.min(box.w, box.h)
  const count = Math.round((params.count as number) ?? 5)
  const sizeK = (params.size as number) ?? 1
  const ang = (params.angle as number) ?? 0.62 // fixed iso-ish spin
  const cos = Math.cos(ang)
  const sin = Math.sin(ang)
  const tilt = 0.5
  const pen = ctx.penRole

  // Stack cubes up an iso column with jittered lateral offsets — reads as a mass.
  for (let k = 0; k < count; k++) {
    const s = short * (0.09 + 0.055 * sizeK) * (0.7 + rng() * 0.6)
    const ox = (rng() - 0.5) * short * 0.5
    const oy = (rng() - 0.5) * short * 0.35 - k * s * 0.35
    const cx = cx0 + ox
    const cy = cy0 + oy
    const v: [number, number][] = []
    for (let i = 0; i < 8; i++) {
      const X = i & 1 ? 1 : -1
      const Y = i & 2 ? 1 : -1
      const Z = i & 4 ? 1 : -1
      const rx = X * cos - Z * sin
      const rz = X * sin + Z * cos
      v.push([cx + rx * s, cy + Y * s * 0.8 + rz * s * tilt])
    }
    // 12 edges: vertex pairs differing in exactly one bit.
    for (let i = 0; i < 8; i++) {
      for (const b of [1, 2, 4]) {
        const j = i | b
        if (j > i) {
          prims.push({
            t: "line",
            x1: v[i][0],
            y1: v[i][1],
            x2: v[j][0],
            y2: v[j][1],
            pen,
            w: k === 0 ? 1.2 : 0.9,
            alpha: 0.55 + 0.4 * (1 - k / Math.max(1, count)),
          })
        }
      }
    }
    // A shaded top face on the crown cube grounds the stack.
    if (k === count - 1) {
      prims.push({
        t: "polygon",
        pts: [v[2], v[3], v[7], v[6]],
        pen: "shadow",
        fill: true,
        alpha: 0.14,
      })
    }
  }

  // Anchors: a central mount + three edge ports for future connectors.
  const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const anchors: Anchor[] = [
    { id: "mount", x: cx0, y: cy0, kind: "mount" },
    { id: "p-top", x: cx0, y: clamp(box.y, box.y + short * 0.08, box.y + box.h), kind: "port", dir: -Math.PI / 2 },
    { id: "p-left", x: box.x, y: cy0, kind: "port", dir: Math.PI },
    { id: "p-right", x: box.x + box.w, y: cy0, kind: "port", dir: 0 },
  ]

  return { primitives: prims, anchors }
}

export const voxelMass: MotifDef = {
  key: "voxel-mass",
  name: "Voxel mass",
  classes: ["focal", "satellite"],
  params: [
    { key: "count", label: "cubes", min: 1, max: 12, step: 1, default: 5 },
    { key: "size", label: "size", min: 0.4, max: 2, step: 0.05, default: 1 },
    { key: "angle", label: "spin", min: 0, max: 6.28, step: 0.01, default: 0.62 },
  ],
  gen,
}
