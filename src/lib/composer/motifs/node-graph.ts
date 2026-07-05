/**
 * node-graph — scattered nodes joined to their nearest neighbours by thin links,
 * with small node discs. Lifts BgCanvas' graph mode into a still.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const anchors: Anchor[] = []
  const short = Math.min(box.w, box.h)
  const n = Math.round((params.nodes as number) ?? 12)
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    pts.push([box.x + (0.08 + 0.84 * rng()) * box.w, box.y + (0.08 + 0.84 * rng()) * box.h])
  }

  // Link each node to its 1–2 nearest neighbours.
  for (let i = 0; i < n; i++) {
    const dists = pts
      .map((p, j) => ({ j, d: (p[0] - pts[i][0]) ** 2 + (p[1] - pts[i][1]) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
    const links = 1 + (rng() < 0.4 ? 1 : 0)
    for (let k = 0; k < links && k < dists.length; k++) {
      const j = dists[k].j
      if (j > i) prims.push({ t: "line", x1: pts[i][0], y1: pts[i][1], x2: pts[j][0], y2: pts[j][1], pen: ctx.penRole, w: 0.6, alpha: 0.55 })
    }
  }
  for (const p of pts) prims.push({ t: "circle", cx: p[0], cy: p[1], r: short * 0.014, pen: "highlight", fill: true, alpha: 0.85 })

  // Expose a few nodes as ports for connectors.
  anchors.push({ id: "mount", x: box.x + box.w / 2, y: box.y + box.h / 2, kind: "mount" })
  for (let i = 0; i < Math.min(3, n); i++) anchors.push({ id: `p-${i}`, x: pts[i][0], y: pts[i][1], kind: "port" })
  return { primitives: prims, anchors }
}

export const nodeGraph: MotifDef = {
  key: "node-graph",
  name: "Node graph",
  classes: ["field", "focal"],
  params: [{ key: "nodes", label: "nodes", min: 5, max: 28, step: 1, default: 12 }],
  gen,
}
