/**
 * manuscript-page — (medieval) a two-column asemic text body with an illuminated
 * initial, a rubricated header and marginalia. Wears a frame, corner registration
 * and colophon.
 */

import type { Armature } from "../types"

export const manuscriptPage: Armature = {
  id: "manuscript-page",
  name: "Manuscript page",
  weight: 1,
  tags: ["manuscript", "occult"],
  layout: "free",
  ratioAffinity: [[4, 5], [3, 4], [2, 3]],
  slots: [
    {
      id: "col-left",
      role: "field",
      region: { x: 0.09, y: 0.22, w: 0.39, h: 0.66 },
      count: [1, 1],
      motifKeys: ["asemic-script"],
      penRole: "structure",
      scale: [0.4, 0.4],
    },
    {
      id: "col-right",
      role: "field",
      region: { x: 0.52, y: 0.14, w: 0.39, h: 0.74 },
      count: [1, 1],
      motifKeys: ["asemic-script"],
      penRole: "structure",
      scale: [0.4, 0.4],
    },
    {
      id: "initial",
      role: "margin",
      region: { x: 0.09, y: 0.09, w: 0.13, h: 0.13 },
      count: [1, 1],
      motifKeys: ["glyph-seal", "geometer"],
      penRole: "highlight",
      scale: [0.13, 0.13],
    },
    {
      id: "header",
      role: "caption",
      region: { x: 0.26, y: 0.1, w: 0.4, h: 0.05 },
      count: [1, 1],
      motifKeys: ["asemic-script"],
      penRole: "highlight",
      scale: [0.05, 0.05],
    },
    {
      id: "marginalia",
      role: "margin",
      region: { x: 0.48, y: 0.62, w: 0.08, h: 0.2 },
      count: [0, 1],
      motifKeys: ["instrument", "glyph-seal"],
      penRole: "annotation",
      scale: [0.08, 0.08],
    },
  ],
  connectorIntents: [],
  apparatusIntents: [{ kind: "frame" }, { kind: "corner-reg" }, { kind: "colophon" }],
}
