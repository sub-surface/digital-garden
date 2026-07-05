/**
 * Realize — turn IR nodes/apparatus into concrete primitives by invoking the
 * registered generators. Deterministic: each node carries a `seed`, so the same
 * IR always realizes to the same primitives (and byte-identical SVG).
 *
 * Failure is visible (design law): a node whose motif key isn't registered draws
 * a legible cross + label in the shadow pen rather than a silent blank.
 */

import type { Anchor, Apparatus, Node, Plate, Prim } from "./types"
import { mulberry32 } from "./rng"
import { getMotif } from "./motifs"
import { realizeApparatus } from "./apparatus"
import { realizeConnector } from "./connectors"

export interface DrawItem {
  z: number
  prims: Prim[]
  source: { kind: "node" | "apparatus" | "connector"; id: string }
}

function failMark(box: Node["box"], label: string): Prim[] {
  return [
    { t: "line", x1: box.x, y1: box.y, x2: box.x + box.w, y2: box.y + box.h, pen: "shadow", w: 1 },
    { t: "line", x1: box.x + box.w, y1: box.y, x2: box.x, y2: box.y + box.h, pen: "shadow", w: 1 },
    { t: "text", x: box.x + box.w / 2, y: box.y + box.h / 2, s: label, size: 0.02, pen: "shadow", align: "middle" },
  ]
}

export function realizeNode(node: Node, plateSeed = ""): { primitives: Prim[]; anchors: Anchor[] } {
  const def = getMotif(node.motif)
  if (!def) return { primitives: failMark(node.box, `?${node.motif}`), anchors: [] }
  const rng = mulberry32(node.seed >>> 0)
  return def.gen(rng, node.box, node.params, { penRole: node.penRole, plateSeed })
}

/** Every draw item for a plate, in painter order (low z first). */
export function realizePlate(plate: Plate): DrawItem[] {
  const items: DrawItem[] = []
  for (const a of plate.apparatus as Apparatus[]) {
    items.push({ z: -100, prims: realizeApparatus(a, plate), source: { kind: "apparatus", id: a.id } })
  }
  // Connectors sit above the frame but below the motifs, so nodes read on top.
  for (const c of plate.connectors) {
    items.push({ z: -50, prims: realizeConnector(plate, c), source: { kind: "connector", id: c.id } })
  }
  for (const node of plate.nodes) {
    items.push({ z: node.z, prims: realizeNode(node, plate.seed).primitives, source: { kind: "node", id: node.id } })
  }
  return items.sort((a, b) => a.z - b.z)
}
