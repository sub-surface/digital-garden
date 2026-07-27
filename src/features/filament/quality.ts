/**
 * One user-facing fidelity choice, all numerical consequences coordinated.
 *
 * Particle count, force resolution, FMM order, and raster resolution used to
 * be independent controls, which made it easy to choose an expensive
 * combination that bought little accuracy. Profiles keep those dimensions in a
 * sensible relationship while the renderer tunes its internal density raster
 * live. The raster is deliberately smaller than the display surface: it
 * supersamples the force mesh, then the browser performs the final continuous
 * reconstruction. Spending millions of pixels on point noise below the force
 * resolution is slower and less faithful.
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
    minPixels: 300_000,
    maxPixels: 700_000,
    targetDrawMs: 10,
  },
  deep: {
    name: "deep",
    label: "Deep",
    description: "A finer force mesh for small knots, thin filaments, and close galactic structure.",
    nMass: 20_000,
    nTracer: 120_000,
    order: 6,
    meshSize: 256,
    minPixels: 700_000,
    maxPixels: 1_500_000,
    targetDrawMs: 16,
  },
  vast: {
    name: "vast",
    label: "Vast",
    description: "The largest particle census, tuned for the continuous geometry of the cosmic web.",
    nMass: 24_000,
    nTracer: 240_000,
    order: 5,
    meshSize: 128,
    minPixels: 320_000,
    maxPixels: 800_000,
    targetDrawMs: 14,
  },
}

const PHONE: Record<FidelityName, FidelityProfile> = {
  auto: {
    ...DESKTOP.auto,
    nMass: 4_000,
    nTracer: 20_000,
    meshSize: 64,
    minPixels: 160_000,
    maxPixels: 420_000,
    targetDrawMs: 10,
  },
  deep: {
    ...DESKTOP.deep,
    nMass: 8_000,
    nTracer: 48_000,
    meshSize: 128,
    minPixels: 280_000,
    maxPixels: 700_000,
    targetDrawMs: 14,
  },
  vast: {
    ...DESKTOP.vast,
    nMass: 10_000,
    nTracer: 90_000,
    meshSize: 64,
    minPixels: 180_000,
    maxPixels: 500_000,
    targetDrawMs: 12,
  },
}

export const FIDELITY_ORDER: FidelityName[] = ["auto", "deep", "vast"]

export function fidelityProfile(name: FidelityName, phone: boolean): FidelityProfile {
  return (phone ? PHONE : DESKTOP)[name]
}
