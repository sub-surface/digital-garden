/**
 * cascade-stream — (beyond) a diagonal current of nodes joined by particle-stream
 * connectors, reading like signal flow or alchemy stages. Wears a minimal frame
 * and corner registration.
 */

import type { Armature } from "../types"

export const cascadeStream: Armature = {
  id: "cascade-stream",
  name: "Cascade stream",
  weight: 1,
  tags: ["technical", "mystical", "occult"],
  layout: "axis",
  ratioAffinity: [[16, 9], [1, 1], [2, 3]],
  slots: [
    {
      id: "stages",
      role: "satellite",
      region: { x: 0.08, y: 0.08, w: 0.84, h: 0.84 },
      count: [4, 7],
      motifKeys: ["voxel-mass", "chamber", "instrument", "glyph-seal", "lattice", "polyhedron", "sunburst", "waveform"],
      penRole: "structure",
      scale: [0.1, 0.15],
    },
  ],
  connectorIntents: [{ from: "stages", to: "stages", route: "stream", density: 0.7 }],
  apparatusIntents: [{ kind: "frame" }, { kind: "corner-reg" }, { kind: "colophon" }],
}
