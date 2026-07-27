/**
 * One user-facing fidelity choice, all numerical consequences coordinated.
 *
 * Particle count, force resolution, FMM order, and raster resolution used to
 * be independent controls, which made it easy to choose an expensive
 * combination that bought little accuracy. Profiles keep those dimensions in a
 * sensible relationship while the renderer tunes its pixel budget live.
 */

export type FidelityName = "auto" | "deep" | "vast"

export interface FidelityProfile {
  name: FidelityName
  label: string
  description: string
  nMass: number
  nTracer: number
  order: number
  meshSize: number
  minPixels: number
  maxPixels: number
  targetDrawMs: number
}

const DESKTOP: Record<FidelityName, FidelityProfile> = {
  auto: {
    name: "auto",
    label: "Auto",
    description: "A fluid, fully gravitating field with display resolution tuned to this screen.",
    nMass: 10_000,
    nTracer: 50_000,
    order: 5,
    meshSize: 128,
    minPixels: 700_000,
    maxPixels: 2_400_000,
    targetDrawMs: 18,
  },
  deep: {
    name: "deep",
    label: "Deep",
    description: "A finer force mesh for small knots, thin filaments, and close galactic structure.",
    nMass: 20_000,
    nTracer: 120_000,
    order: 6,
    meshSize: 256,
    minPixels: 900_000,
    maxPixels: 3_000_000,
    targetDrawMs: 24,
  },
  vast: {
    name: "vast",
    label: "Vast",
    description: "The largest particle census, tuned for the continuous geometry of the cosmic web.",
    nMass: 24_000,
    nTracer: 240_000,
    order: 5,
    meshSize: 128,
    minPixels: 650_000,
    maxPixels: 1_800_000,
    targetDrawMs: 24,
  },
}

const PHONE: Record<FidelityName, FidelityProfile> = {
  auto: {
    ...DESKTOP.auto,
    nMass: 4_000,
    nTracer: 20_000,
    meshSize: 64,
    minPixels: 320_000,
    maxPixels: 900_000,
    targetDrawMs: 18,
  },
  deep: {
    ...DESKTOP.deep,
    nMass: 8_000,
    nTracer: 48_000,
    meshSize: 128,
    minPixels: 420_000,
    maxPixels: 1_200_000,
    targetDrawMs: 22,
  },
  vast: {
    ...DESKTOP.vast,
    nMass: 10_000,
    nTracer: 90_000,
    meshSize: 64,
    minPixels: 320_000,
    maxPixels: 900_000,
    targetDrawMs: 22,
  },
}

export const FIDELITY_ORDER: FidelityName[] = ["auto", "deep", "vast"]

export function fidelityProfile(name: FidelityName, phone: boolean): FidelityProfile {
  return (phone ? PHONE : DESKTOP)[name]
}
