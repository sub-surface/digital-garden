/**
 * centered-radial — (mystical / astrolabe) one dominant ring/orrery focal mass,
 * satellites orbiting on a circle, annotation script down the margins. Wears an
 * outer frame + seal + corner registration (apparatus arrives fuller in M3).
 */

import type { Armature } from "../types"

export const centeredRadial: Armature = {
  id: "centered-radial",
  name: "Centered radial",
  weight: 1,
  tags: ["mystical", "occult", "astronomical"],
  layout: "radial",
  ratioAffinity: [[1, 1]],
  slots: [
    {
      id: "focal",
      role: "focal",
      region: { x: 0.28, y: 0.28, w: 0.44, h: 0.44 },
      count: [1, 1],
      motifKeys: ["orrery-rings", "voxel-mass"],
      penRole: "structure",
      scale: [0.34, 0.46],
    },
    {
      id: "satellites",
      role: "satellite",
      region: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
      count: [3, 6],
      motifKeys: ["voxel-mass"],
      penRole: "structure",
      scale: [0.1, 0.16],
    },
    {
      id: "margin-left",
      role: "margin",
      region: { x: 0.04, y: 0.2, w: 0.15, h: 0.6 },
      count: [0, 1],
      motifKeys: ["asemic-script"],
      penRole: "annotation",
      scale: [0.15, 0.15],
    },
    {
      id: "margin-right",
      role: "margin",
      region: { x: 0.81, y: 0.2, w: 0.15, h: 0.6 },
      count: [1, 1],
      motifKeys: ["asemic-script"],
      penRole: "annotation",
      scale: [0.15, 0.15],
    },
  ],
  connectorIntents: [
    { from: "focal", to: "satellites", route: "leader", density: 0.5 },
  ],
  apparatusIntents: [{ kind: "frame" }, { kind: "corner-reg" }, { kind: "seal" }, { kind: "colophon" }],
}
