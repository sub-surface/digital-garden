/**
 * Motif registry. Adding a motif = one generator file + one line here (mirrors
 * the repo's "add a bg mode cheaply" pattern). The grammar fills slots by motif
 * key; the renderer realizes each node by calling its generator.
 */

import type { MotifDef } from "../types"
import { voxelMass } from "./voxel-mass"
import { orreryRings } from "./orrery-rings"
import { asemicScript } from "./asemic-script"
import { chamber } from "./chamber"
import { nodeGraph } from "./node-graph"
import { contourField } from "./contour-field"
import { lattice } from "./lattice"
import { specimenPanel } from "./specimen-panel"
import { geometer } from "./geometer"
import { instrument } from "./instrument"
import { glyphSeal } from "./glyph-seal"
import { polyhedron } from "./polyhedron"
import { waveform } from "./waveform"
import { sunburst } from "./sunburst"
import { zodiacWheel } from "./zodiac-wheel"

export const MOTIFS: MotifDef[] = [
  voxelMass,
  orreryRings,
  asemicScript,
  chamber,
  nodeGraph,
  contourField,
  lattice,
  specimenPanel,
  geometer,
  instrument,
  glyphSeal,
  polyhedron,
  waveform,
  sunburst,
  zodiacWheel,
]

const BY_KEY: Record<string, MotifDef> = Object.fromEntries(MOTIFS.map((m) => [m.key, m]))

export function getMotif(key: string): MotifDef | undefined {
  return BY_KEY[key]
}

export function motifDefaults(key: string): Record<string, number> {
  const def = BY_KEY[key]
  if (!def) return {}
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]))
}
