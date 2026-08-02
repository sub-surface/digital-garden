export const EQ_BANDS = [
  { frequency: 60, label: "60" },
  { frequency: 250, label: "250" },
  { frequency: 1_000, label: "1K" },
  { frequency: 4_000, label: "4K" },
  { frequency: 12_000, label: "12K" },
] as const

export type EqGains = [number, number, number, number, number]

export interface MusicEffectsSettings {
  eqEnabled: boolean
  eqGains: EqGains
  highpassHz: number
  lowpassHz: number
  crossfadeSeconds: number
}

export const DEFAULT_MUSIC_EFFECTS: MusicEffectsSettings = {
  eqEnabled: false,
  eqGains: [0, 0, 0, 0, 0],
  highpassHz: 20,
  lowpassHz: 20_000,
  crossfadeSeconds: 0,
}

export const EQ_PRESETS: Record<string, EqGains> = {
  Flat: [0, 0, 0, 0, 0],
  Warm: [3, 2, 0, -1, -2],
  "Bass lift": [6, 4, 1, -1, -2],
  "V smile": [5, 2, -2, 2, 5],
  Radio: [-8, -3, 3, 2, -7],
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Treat persisted media settings as hostile/old input, never graph parameters. */
export function normalizeMusicEffects(value: unknown): MusicEffectsSettings {
  const candidate = value && typeof value === "object"
    ? value as Partial<MusicEffectsSettings>
    : {}
  const gains = Array.isArray(candidate.eqGains) ? candidate.eqGains : []
  return {
    eqEnabled: candidate.eqEnabled === true,
    eqGains: EQ_BANDS.map((_, index) =>
      clamp(finiteNumber(gains[index], 0), -12, 12),
    ) as unknown as EqGains,
    highpassHz: clamp(finiteNumber(candidate.highpassHz, 20), 20, 2_000),
    lowpassHz: clamp(finiteNumber(candidate.lowpassHz, 20_000), 2_000, 20_000),
    crossfadeSeconds: clamp(finiteNumber(candidate.crossfadeSeconds, 0), 0, 8),
  }
}

/** Equal-power ramps avoid the audible dip of two linear gains at midpoint. */
export function equalPowerCurves(points = 64): { fadeIn: Float32Array; fadeOut: Float32Array } {
  const length = Math.max(2, Math.floor(points))
  const fadeIn = new Float32Array(length)
  const fadeOut = new Float32Array(length)
  for (let index = 0; index < length; index++) {
    const position = index / (length - 1)
    fadeIn[index] = Math.sin(position * Math.PI / 2)
    fadeOut[index] = Math.cos(position * Math.PI / 2)
  }
  return { fadeIn, fadeOut }
}
