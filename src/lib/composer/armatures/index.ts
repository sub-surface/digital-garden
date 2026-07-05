/**
 * Armature registry. Adding an archetype = one file + one line here. The grammar
 * picks an armature (weighted, seed-driven, or user-chosen, optionally biased by
 * vibe tags), then fills each slot with a motif from that slot's allowed keys.
 */

import type { Armature } from "../types"
import { centeredRadial } from "./centered-radial"
import { specimenGrid } from "./specimen-grid"
import { explodedAxis } from "./exploded-axis"
import { heroAnnotated } from "./hero-annotated"
import { surveyField } from "./survey-field"
import { manuscriptPage } from "./manuscript-page"
import { cascadeStream } from "./cascade-stream"
import { constellationWeb } from "./constellation-web"

export const ARMATURES: Armature[] = [
  centeredRadial,
  specimenGrid,
  explodedAxis,
  heroAnnotated,
  surveyField,
  manuscriptPage,
  cascadeStream,
  constellationWeb,
]

const BY_ID: Record<string, Armature> = Object.fromEntries(ARMATURES.map((a) => [a.id, a]))

export function getArmature(id: string): Armature | undefined {
  return BY_ID[id]
}

/** All distinct vibe tags across the registry — feeds the vibe filter. */
export const ALL_VIBES: string[] = [...new Set(ARMATURES.flatMap((a) => a.tags))].sort()
