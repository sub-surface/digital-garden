/**
 * The sky, computed: seasons, the sun and the moon. Pure, no DOM, so the
 * prompt's `sky` command, Settings and tests can all use it.
 */

export type Season = "spring" | "summer" | "autumn" | "winter"
export type Flurry = "blossom" | "motes" | "leaves" | "snow"
export type Particle = Flurry | "rain"

/** What drifts past at the turn of each season. */
export const FLURRY: Record<Season, Flurry> = {
  spring: "blossom",
  summer: "motes",
  autumn: "leaves",
  winter: "snow",
}

// Equinoxes and solstices, near enough (they wander by a day year to year).
// Northern-hemisphere names; the south swaps them.
const TURNS: { month: number; day: number; season: Season }[] = [
  { month: 2, day: 20, season: "spring" },
  { month: 5, day: 21, season: "summer" },
  { month: 8, day: 22, season: "autumn" },
  { month: 11, day: 21, season: "winter" },
]
const OPPOSITE: Record<Season, Season> = { spring: "autumn", summer: "winter", autumn: "spring", winter: "summer" }
const DAY = 86_400_000

/** How many days either side of a turn count as "the turn of the season". */
export const TURN_WINDOW_DAYS = 4

function turnsAround(date: Date) {
  const y = date.getFullYear()
  return [y - 1, y, y + 1].flatMap((year) =>
    TURNS.map((t) => ({ season: t.season, at: new Date(year, t.month, t.day) })),
  )
}

export function seasonOf(date: Date, southern = false): Season {
  const past = turnsAround(date).filter((t) => t.at <= date).pop()!
  return southern ? OPPOSITE[past.season] : past.season
}

/** The season turning near `date` (±TURN_WINDOW_DAYS), if any. */
export function seasonTurn(date: Date, southern = false): { season: Season; days: number } | null {
  for (const t of turnsAround(date)) {
    const days = Math.round((date.getTime() - t.at.getTime()) / DAY)
    if (Math.abs(days) <= TURN_WINDOW_DAYS) return { season: southern ? OPPOSITE[t.season] : t.season, days }
  }
  return null
}

export function nextTurn(date: Date, southern = false): { season: Season; at: Date } {
  const next = turnsAround(date).find((t) => t.at > date)!
  return { season: southern ? OPPOSITE[next.season] : next.season, at: next.at }
}

// ── the sun ──

const rad = Math.PI / 180

/** Solar elevation in degrees (NOAA's approximation; good to a fraction of a degree). */
export function solarElevation(date: Date, lat: number, lon: number): number {
  const jd = date.getTime() / DAY + 2440587.5
  const n = jd - 2451545
  const L = (280.46 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * rad
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad
  const epsilon = (23.439 - 0.0000004 * n) * rad
  const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda))
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda))
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24
  const hourAngle = (gmst * 15 + lon) * rad - ra
  return Math.asin(Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(hourAngle)) / rad
}

export type LightPhase = "night" | "dawn" | "morning" | "day" | "golden" | "dusk"

export function lightPhase(date: Date, lat: number, lon: number): LightPhase {
  const elev = solarElevation(date, lat, lon)
  const rising = solarElevation(new Date(date.getTime() + 600_000), lat, lon) > elev
  if (elev < -6) return "night"
  if (elev < 6) return rising ? "dawn" : "dusk"
  if (elev < 20) return rising ? "morning" : "golden"
  return "day"
}

/**
 * A guess at where the reader is when we have no location: the timezone's
 * meridian, and a mid-northern latitude. Enough for "is it evening".
 */
export function guessPlace(date = new Date()): { lat: number; lon: number } {
  return { lat: 48, lon: -date.getTimezoneOffset() / 4 }
}

// ── the moon ──

const SYNODIC = 29.530588853
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
const MOON_NAMES = [
  "new moon", "waxing crescent", "first quarter", "waxing gibbous",
  "full moon", "waning gibbous", "last quarter", "waning crescent",
] as const

export function moonPhase(date: Date): { age: number; fraction: number; name: (typeof MOON_NAMES)[number] } {
  const age = (((date.getTime() - NEW_MOON) / DAY) % SYNODIC + SYNODIC) % SYNODIC
  const fraction = age / SYNODIC
  return { age, fraction, name: MOON_NAMES[Math.round(fraction * 8) % 8] }
}

// ── weather ──

/** WMO weather codes (Open-Meteo) → what falls, if anything. */
export function weatherParticle(code: number): { kind: Particle; heavy: boolean } | null {
  if (code >= 71 && code <= 77) return { kind: "snow", heavy: code >= 75 }
  if (code === 85 || code === 86) return { kind: "snow", heavy: code === 86 }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) {
    return { kind: "rain", heavy: code === 65 || code === 67 || code === 82 || code >= 95 }
  }
  return null
}

export function weatherWords(code: number): string {
  if (code === 0) return "clear"
  if (code <= 2) return "a few clouds"
  if (code === 3) return "overcast"
  if (code === 45 || code === 48) return "fog"
  if (code >= 51 && code <= 57) return "drizzle"
  if (code >= 61 && code <= 67) return "rain"
  if (code >= 71 && code <= 77) return "snow"
  if (code >= 80 && code <= 82) return "showers"
  if (code === 85 || code === 86) return "snow showers"
  if (code >= 95) return "thunder"
  return "weather"
}
