/**
 * constellation-web — (mystical / technical hybrid) a node-graph of instruments
 * and glyphs joined by thin labelled lines, over a faint star-field. Wears a
 * frame, legend and colophon.
 */

import type { Armature } from "../types"

export const constellationWeb: Armature = {
  id: "constellation-web",
  name: "Constellation web",
  weight: 1,
  tags: ["mystical", "astronomical", "technical"],
  layout: "free",
  ratioAffinity: [[1, 1], [16, 9]],
  slots: [
    {
      id: "field",
      role: "field",
      region: { x: 0.06, y: 0.06, w: 0.88, h: 0.86 },
      count: [1, 1],
      motifKeys: ["node-graph"],
      penRole: "shadow",
      scale: [0.88, 0.88],
    },
    {
      id: "stars",
      role: "satellite",
      region: { x: 0.12, y: 0.12, w: 0.76, h: 0.76 },
      count: [3, 6],
      motifKeys: ["glyph-seal", "instrument", "orrery-rings", "sunburst", "polyhedron"],
      penRole: "highlight",
      scale: [0.09, 0.14],
    },
  ],
  connectorIntents: [{ from: "stars", to: "stars", route: "leader", density: 0.5 }],
  apparatusIntents: [{ kind: "frame" }, { kind: "legend" }, { kind: "colophon" }],
}
