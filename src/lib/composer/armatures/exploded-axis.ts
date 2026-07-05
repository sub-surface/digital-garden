/**
 * exploded-axis — (technical / schematic) one mechanism blown apart along a
 * diagonal axis, dotted numbered leaders keying the parts to a legend. Wears a
 * frame, scale-bar, legend and corner registration.
 */

import type { Armature } from "../types"

export const explodedAxis: Armature = {
  id: "exploded-axis",
  name: "Exploded axis",
  weight: 1,
  tags: ["schematic", "technical"],
  layout: "axis",
  ratioAffinity: [[1, 1], [16, 9]],
  slots: [
    {
      id: "core",
      role: "focal",
      region: { x: 0.32, y: 0.32, w: 0.36, h: 0.36 },
      count: [1, 1],
      motifKeys: ["voxel-mass", "lattice", "chamber", "polyhedron"],
      penRole: "structure",
      scale: [0.26, 0.34],
    },
    {
      id: "parts",
      role: "satellite",
      region: { x: 0.08, y: 0.08, w: 0.84, h: 0.84 },
      count: [4, 7],
      motifKeys: ["voxel-mass", "instrument", "glyph-seal", "polyhedron", "sunburst"],
      penRole: "structure",
      scale: [0.09, 0.14],
    },
  ],
  connectorIntents: [{ from: "core", to: "parts", route: "dotted", density: 0.9 }],
  apparatusIntents: [{ kind: "frame" }, { kind: "scale-bar" }, { kind: "legend" }, { kind: "corner-reg" }],
}
