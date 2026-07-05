/**
 * lattice — a jittered grid of nodes joined by bonds, reading as a crystal or
 * molecular structure. Field or focal.
 */

import type { MotifDef, MotifGen, Prim, Anchor } from "../types"

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const g = Math.round((params.grid as number) ?? 5)
  const jitter = ((params.jitter as number) ?? 0.35) * (box.w / g) * 0.5
  const short = Math.min(box.w, box.h)
  const pt = (i: number, j: number): [number, number] => [
    box.x + ((i + 0.5) / g) * box.w + (rng() - 0.5) * jitter,
    box.y + ((j + 0.5) / g) * box.h + (rng() - 0.5) * jitter,
  ]
  const grid: [number, number][][] = []
  for (let i = 0; i < g; i++) {
    grid[i] = []
    for (let j = 0; j < g; j++) grid[i][j] = pt(i, j)
  }
  // Bonds: right + down neighbours (skip a few for irregularity).
  for (let i = 0; i < g; i++) {
    for (let j = 0; j < g; j++) {
      if (i + 1 < g && rng() > 0.12) prims.push({ t: "line", x1: grid[i][j][0], y1: grid[i][j][1], x2: grid[i + 1][j][0], y2: grid[i + 1][j][1], pen: ctx.penRole, w: 0.7, alpha: 0.6 })
      if (j + 1 < g && rng() > 0.12) prims.push({ t: "line", x1: grid[i][j][0], y1: grid[i][j][1], x2: grid[i][j + 1][0], y2: grid[i][j + 1][1], pen: ctx.penRole, w: 0.7, alpha: 0.6 })
    }
  }
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) prims.push({ t: "circle", cx: grid[i][j][0], cy: grid[i][j][1], r: short * 0.012, pen: "highlight", fill: true, alpha: 0.85 })

  const anchors: Anchor[] = [
    { id: "mount", x: box.x + box.w / 2, y: box.y + box.h / 2, kind: "mount" },
    { id: "p-0", x: grid[0][0][0], y: grid[0][0][1], kind: "port" },
    { id: "p-1", x: grid[g - 1][g - 1][0], y: grid[g - 1][g - 1][1], kind: "port" },
  ]
  return { primitives: prims, anchors }
}

export const lattice: MotifDef = {
  key: "lattice",
  name: "Lattice",
  classes: ["field", "focal"],
  params: [
    { key: "grid", label: "grid", min: 3, max: 8, step: 1, default: 5 },
    { key: "jitter", label: "jitter", min: 0, max: 1, step: 0.05, default: 0.35 },
  ],
  gen,
}
