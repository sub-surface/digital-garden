export const PETRI_VERSION = 1
const HOUR = 60 * 60 * 1_000

export type PetriAction = "visit" | "feed" | "pet" | "play" | "clean" | "nap" | "dance"
export type PetriMood = "radiant" | "curious" | "peckish" | "lonely" | "mucky" | "sleepy" | "dormant"
export type PetriStage = "spore" | "sprout" | "blob" | "bloom"

export interface PetriNeeds {
  fullness: number
  joy: number
  energy: number
  cleanliness: number
}

export interface PetriState {
  version: typeof PETRI_VERSION
  name: string
  bornAt: number
  updatedAt: number
  seed: number
  needs: PetriNeeds
  bond: number
  growth: number
  visits: number
  lastAction: PetriAction
  nonce: number
}

const clamp = (value: number, minimum = 0, maximum = 100) =>
  Math.min(maximum, Math.max(minimum, value))

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

export function createPetri(now = Date.now(), seed = now >>> 0): PetriState {
  return {
    version: PETRI_VERSION,
    name: "Mote",
    bornAt: now,
    updatedAt: now,
    seed: seed >>> 0,
    needs: { fullness: 74, joy: 76, energy: 70, cleanliness: 82 },
    bond: 8,
    growth: 0,
    visits: 0,
    lastAction: "visit",
    nonce: 0,
  }
}

export function normalizePetri(value: unknown, now = Date.now()): PetriState {
  const fallback = createPetri(now)
  if (!value || typeof value !== "object") return fallback
  const candidate = value as Partial<PetriState>
  const needs = candidate.needs && typeof candidate.needs === "object"
    ? candidate.needs as Partial<PetriNeeds>
    : {}
  const action: PetriAction = ["visit", "feed", "pet", "play", "clean", "nap", "dance"].includes(candidate.lastAction ?? "")
    ? candidate.lastAction as PetriAction
    : "visit"
  return {
    version: PETRI_VERSION,
    name: typeof candidate.name === "string" ? candidate.name.trim().slice(0, 20) || fallback.name : fallback.name,
    bornAt: finite(candidate.bornAt, now),
    updatedAt: finite(candidate.updatedAt, now),
    seed: finite(candidate.seed, fallback.seed) >>> 0,
    needs: {
      fullness: clamp(finite(needs.fullness, fallback.needs.fullness), 5),
      joy: clamp(finite(needs.joy, fallback.needs.joy), 5),
      energy: clamp(finite(needs.energy, fallback.needs.energy), 5),
      cleanliness: clamp(finite(needs.cleanliness, fallback.needs.cleanliness), 5),
    },
    bond: clamp(finite(candidate.bond, fallback.bond)),
    growth: clamp(finite(candidate.growth, fallback.growth), 0, 100),
    visits: Math.max(0, Math.floor(finite(candidate.visits, 0))),
    lastAction: action,
    nonce: Math.max(0, Math.floor(finite(candidate.nonce, 0))),
  }
}

/**
 * Settle elapsed time exactly once. Needs soften but bottom out at five: Petri
 * can become dormant, never die or punish someone for leaving the tab alone.
 */
export function settlePetri(value: PetriState, now = Date.now()): PetriState {
  const state = normalizePetri(value, now)
  const elapsedHours = Math.min(24 * 30, Math.max(0, now - state.updatedAt) / HOUR)
  if (elapsedHours === 0) return state
  return {
    ...state,
    updatedAt: now,
    needs: {
      fullness: clamp(state.needs.fullness - elapsedHours * 2.4, 5),
      joy: clamp(state.needs.joy - elapsedHours * 1.25, 5),
      energy: clamp(state.needs.energy - elapsedHours * 0.75, 5),
      cleanliness: clamp(state.needs.cleanliness - elapsedHours * 1.05, 5),
    },
  }
}

export function actOnPetri(value: PetriState, action: PetriAction, now = Date.now()): PetriState {
  const state = settlePetri(value, now)
  const next = { ...state.needs }
  let bond = state.bond
  let growth = state.growth
  let visits = state.visits

  if (action === "visit") { visits += 1; next.joy += 2 }
  if (action === "feed") { next.fullness += 28; next.energy += 4; next.cleanliness -= 3; bond += 1; growth += 1 }
  if (action === "pet") { next.joy += 20; next.energy += 2; bond += 3; growth += 1 }
  if (action === "play") { next.joy += 27; next.energy -= 14; next.fullness -= 5; next.cleanliness -= 4; bond += 2; growth += 3 }
  if (action === "clean") { next.cleanliness += 38; next.joy -= 2; bond += 1; growth += 1 }
  if (action === "nap") { next.energy += 34; next.fullness -= 4; next.joy += 2; growth += 1 }
  if (action === "dance") { next.joy += 18; next.energy -= 7; next.fullness -= 3; bond += 2; growth += 2 }

  return {
    ...state,
    updatedAt: now,
    needs: {
      fullness: clamp(next.fullness, 5),
      joy: clamp(next.joy, 5),
      energy: clamp(next.energy, 5),
      cleanliness: clamp(next.cleanliness, 5),
    },
    bond: clamp(bond),
    growth: clamp(growth),
    visits,
    lastAction: action,
    nonce: state.nonce + 1,
  }
}

export function petriMood(state: PetriState): PetriMood {
  const { fullness, joy, energy, cleanliness } = state.needs
  if (energy <= 14 && fullness <= 18) return "dormant"
  if (fullness < 28) return "peckish"
  if (cleanliness < 27) return "mucky"
  if (energy < 27) return "sleepy"
  if (joy < 30) return "lonely"
  if ((fullness + joy + energy + cleanliness) / 4 > 82) return "radiant"
  return "curious"
}

export function petriStage(state: PetriState): PetriStage {
  if (state.growth < 6) return "spore"
  if (state.growth < 24) return "sprout"
  if (state.growth < 58) return "blob"
  return "bloom"
}

export const PETRI_TEMPERAMENTS = ["shy", "bouncy", "dreamy", "curious", "mischievous"] as const

export function petriTemperament(state: PetriState) {
  return PETRI_TEMPERAMENTS[state.seed % PETRI_TEMPERAMENTS.length]
}
