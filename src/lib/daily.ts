/**
 * Daily notes (the public logbook): the pure bits shared by the build
 * (scripts/og-daily.ts, scripts/emit-prerender.ts) and the page
 * (components/mdx/Daily.tsx). No DOM, no Node.
 */
import { moonPhase, nextTurn, seasonOf, solarElevation, type Season } from "../features/ambience/sky"

/** Where the almanac is reckoned from (Cardiff). */
export const ALMANAC_PLACE = { lat: 51.48, lon: -3.18, zone: "Europe/London" } as const

const DAY = 864e5

export function isDailySlug(slug: string): boolean {
  return /^daily\//i.test(slug)
}

/** The day's drawing without its title (written by scripts/og-gen.ts beside the OG cards). */
export function dailyArtUrl(slug: string): string {
  return `/og/art/${slug.replace(/\//g, "-").replace(/\s+/g, "-").toLowerCase()}.jpg`
}

/** Any date the content index or frontmatter holds → `YYYY-MM-DD` (UTC), or null. */
export function dailyIso(raw: unknown): string | null {
  if (!raw) return null
  const d = raw instanceof Date ? raw : new Date(String(raw))
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** "10 November: p(doom), from the garage" → "p(doom), from the garage". */
export function dailyHeadline(title: string): string {
  return title.replace(/^\s*\d{1,2}\s+[A-Za-z]+\s*:\s*/, "") || title
}

export interface Almanac {
  season: Season
  /** Day of the year, 1-based. */
  doy: number
  /** ISO week number. */
  week: number
  moon: { fraction: number; age: number; name: string }
  /** Minutes of daylight. */
  lit: number
  sunrise: Date | null
  sunset: Date | null
  /** The sun's highest elevation that day, in degrees. */
  peak: number
  next: { season: Season; days: number }
}

/** The quiet facts of a day: `iso` is `YYYY-MM-DD`. */
export function almanac(iso: string): Almanac {
  const start = new Date(`${iso}T00:00:00Z`)
  const { lat, lon } = ALMANAC_PLACE
  let lit = 0
  let peak = -90
  let sunrise: Date | null = null
  let sunset: Date | null = null
  for (let m = 0; m < 1440; m += 2) {
    const at = new Date(start.getTime() + m * 60e3)
    const e = solarElevation(at, lat, lon)
    if (e > -0.833) {
      lit += 2
      if (!sunrise) sunrise = at
      sunset = at
    }
    if (e > peak) peak = e
  }
  const noon = new Date(start.getTime() + DAY / 2)
  const moon = moonPhase(noon)
  const doy = Math.round((start.getTime() - Date.UTC(start.getUTCFullYear(), 0, 1)) / DAY) + 1
  // ISO week: the week holding this date's Thursday.
  const thu = new Date(start.getTime() + (3 - ((start.getUTCDay() + 6) % 7)) * DAY)
  const week = Math.floor((thu.getTime() - Date.UTC(thu.getUTCFullYear(), 0, 1)) / DAY / 7) + 1
  const turn = nextTurn(noon)
  return {
    season: seasonOf(noon),
    doy,
    week,
    moon,
    lit,
    sunrise,
    sunset,
    peak,
    next: { season: turn.season, days: Math.max(0, Math.ceil((turn.at.getTime() - noon.getTime()) / DAY)) },
  }
}

const clock = (d: Date | null) =>
  d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ALMANAC_PLACE.zone }) : "none"

export function daylight(a: Almanac): string {
  return `${Math.floor(a.lit / 60)}h ${String(a.lit % 60).padStart(2, "0")}m of light`
}

/** Three ways of saying the day; cards pick one by seed, the page shows the first two. */
export function almanacLines(a: Almanac): [string, string, string] {
  return [
    `day ${a.doy}  ·  ${a.moon.name}  ·  ${daylight(a)}`,
    `sunrise ${clock(a.sunrise)}  ·  sunset ${clock(a.sunset)}  ·  ${a.next.days} day${a.next.days === 1 ? "" : "s"} to ${a.next.season}`,
    `week ${a.week}  ·  moon ${Math.round(a.moon.age)} days old  ·  noon sun ${Math.round(a.peak)}°`,
  ]
}

/**
 * Build-time: every published daily note gets its navigation (previous / next,
 * calendar, almanac) above the body and its threads below, so the notes
 * themselves hold only frontmatter and prose.
 */
export function withDailyChrome(source: string, iso: string): string {
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source)
  const head = fm ? fm[0] : ""
  const body = source.slice(head.length)
  return `${head}\n<DailyNav date="${iso}" />\n\n${body.trimEnd()}\n\n<DailyThreads date="${iso}" />\n`
}
