/**
 * specimen-grid — (cartographic / catalogue) a lattice of small labelled
 * specimens, each self-captioned with a catalog code. Wears a ruler frame,
 * legend, corner registration and colophon.
 */

import type { Armature } from "../types"

export const specimenGrid: Armature = {
  id: "specimen-grid",
  name: "Specimen grid",
  weight: 1,
  tags: ["cartographic", "schematic"],
  layout: "grid",
  ratioAffinity: [[1, 1], [4, 5]],
  slots: [
    {
      id: "specimens",
      role: "satellite",
      region: { x: 0.08, y: 0.1, w: 0.84, h: 0.78 },
      count: [6, 12],
      motifKeys: ["specimen-panel", "instrument", "glyph-seal", "sunburst", "polyhedron"],
      penRole: "structure",
      scale: [0.11, 0.15],
    },
    {
      id: "header",
      role: "caption",
      region: { x: 0.1, y: 0.05, w: 0.5, h: 0.05 },
      count: [0, 1],
      motifKeys: ["asemic-script"],
      penRole: "annotation",
      scale: [0.05, 0.05],
    },
  ],
  connectorIntents: [],
  apparatusIntents: [{ kind: "frame" }, { kind: "ruler" }, { kind: "legend" }, { kind: "corner-reg" }, { kind: "colophon" }],
}
