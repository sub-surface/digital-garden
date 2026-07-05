/**
 * survey-field — (cartographic) a full-bleed contour/terrain field with survey
 * marks, sparse specimens sitting on it, and a compass, scale-bar and legend.
 * Wears a ruler frame, compass, scale-bar, legend and colophon.
 */

import type { Armature } from "../types"

export const surveyField: Armature = {
  id: "survey-field",
  name: "Survey field",
  weight: 1,
  tags: ["cartographic", "astronomical"],
  layout: "free",
  ratioAffinity: [[1, 1], [16, 9], [3, 4]],
  slots: [
    {
      id: "terrain",
      role: "field",
      region: { x: 0.05, y: 0.05, w: 0.9, h: 0.86 },
      count: [1, 1],
      motifKeys: ["contour-field"],
      penRole: "structure",
      scale: [0.9, 0.9],
    },
    {
      id: "marks",
      role: "satellite",
      region: { x: 0.12, y: 0.12, w: 0.76, h: 0.72 },
      count: [2, 5],
      motifKeys: ["specimen-panel", "instrument", "glyph-seal", "waveform", "sunburst"],
      penRole: "highlight",
      scale: [0.09, 0.13],
    },
  ],
  connectorIntents: [{ from: "marks", to: "marks", route: "leader", density: 0.3 }],
  apparatusIntents: [{ kind: "frame" }, { kind: "compass" }, { kind: "scale-bar" }, { kind: "legend" }, { kind: "colophon" }],
}
