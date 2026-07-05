/**
 * hero-annotated — a single large motif off-centre, with a margin column of
 * flowing annotation script and a few arced leaders to satellites. Wears a
 * frame, caption, seal and colophon.
 */

import type { Armature } from "../types"

export const heroAnnotated: Armature = {
  id: "hero-annotated",
  name: "Hero annotated",
  weight: 1,
  tags: ["mystical", "technical", "astronomical"],
  layout: "hero",
  ratioAffinity: [[4, 5], [2, 3], [1, 1]],
  slots: [
    {
      id: "hero",
      role: "focal",
      region: { x: 0.2, y: 0.2, w: 0.5, h: 0.6 },
      count: [1, 1],
      motifKeys: ["orrery-rings", "chamber", "voxel-mass", "geometer", "lattice"],
      penRole: "structure",
      scale: [0.42, 0.52],
    },
    {
      id: "satellites",
      role: "satellite",
      region: { x: 0.05, y: 0.1, w: 0.9, h: 0.8 },
      count: [2, 4],
      motifKeys: ["instrument", "glyph-seal", "specimen-panel"],
      penRole: "highlight",
      scale: [0.09, 0.13],
    },
    {
      id: "notes",
      role: "margin",
      region: { x: 0.05, y: 0.2, w: 0.16, h: 0.62 },
      count: [1, 1],
      motifKeys: ["asemic-script"],
      penRole: "annotation",
      scale: [0.16, 0.16],
    },
  ],
  connectorIntents: [{ from: "hero", to: "satellites", route: "arc", density: 0.8 }],
  apparatusIntents: [{ kind: "frame" }, { kind: "caption" }, { kind: "seal" }, { kind: "colophon" }],
}
