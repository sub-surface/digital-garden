/**
 * polyhedron — a wireframe icosahedron (12 golden-ratio vertices, 30 edges),
 * orthographically projected at a fixed attitude. The "sacred geometry" cousin
 * of voxel-mass. Focal or satellite.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"

const PHI = (1 + Math.sqrt(5)) / 2

// 12 icosahedron vertices.
const VERTS: [number, number, number][] = [
  [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
  [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1],
]

// Edges: vertex pairs at the icosahedron edge length (²  = 4).
const EDGES: [number, number][] = (() => {
  const out: [number, number][] = []
  for (let i = 0; i < VERTS.length; i++) {
    for (let j = i + 1; j < VERTS.length; j++) {
      const dx = VERTS[i][0] - VERTS[j][0]
      const dy = VERTS[i][1] - VERTS[j][1]
      const dz = VERTS[i][2] - VERTS[j][2]
      if (Math.abs(dx * dx + dy * dy + dz * dz - 4) < 1e-6) out.push([i, j])
    }
  }
  return out
})()

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const r = Math.min(box.w, box.h) * 0.42
  const ax = (params.tiltX as number) ?? 0.5 + rng() * 0.3
  const ay = (params.tiltY as number) ?? 0.9 + rng() * 0.4
  const cax = Math.cos(ax)
  const sax = Math.sin(ax)
  const cay = Math.cos(ay)
  const say = Math.sin(ay)
  const norm = PHI // vertices span ~±φ

  const proj = VERTS.map(([x, y, z]) => {
    // rotate about Y then X, orthographic.
    const x1 = x * cay - z * say
    const z1 = x * say + z * cay
    const y1 = y * cax - z1 * sax
    return [cx + (x1 / norm) * r, cy + (y1 / norm) * r] as [number, number]
  })

  for (const [i, j] of EDGES) {
    prims.push({ t: "line", x1: proj[i][0], y1: proj[i][1], x2: proj[j][0], y2: proj[j][1], pen: ctx.penRole, w: 0.8, alpha: 0.8 })
  }
  // Vertex nodes.
  for (const p of proj) prims.push({ t: "circle", cx: p[0], cy: p[1], r: r * 0.03, pen: "highlight", fill: true, alpha: 0.8 })

  const anchors: Anchor[] = [
    { id: "mount", x: cx, y: cy, kind: "mount" },
    { id: "p-top", x: cx, y: cy - r, kind: "port", dir: -Math.PI / 2 },
    { id: "p-r", x: cx + r, y: cy, kind: "port", dir: 0 },
  ]
  return { primitives: prims, anchors }
}

export const polyhedron: MotifDef = {
  key: "polyhedron",
  name: "Polyhedron",
  classes: ["focal", "satellite"],
  params: [
    { key: "tiltX", label: "tilt x", min: 0, max: 3.14, step: 0.02, default: 0.6 },
    { key: "tiltY", label: "tilt y", min: 0, max: 6.28, step: 0.02, default: 1 },
  ],
  gen,
}
