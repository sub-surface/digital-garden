import { useMemo, useState } from "react"
import { useStore } from "@/store"
import type { NoteMetadata } from "@/types/content"
import { almanac, almanacLines, dailyArtUrl, dailyHeadline, dailyIso, isDailySlug } from "@/lib/daily"
import styles from "./Daily.module.scss"

/**
 * The furniture of a daily note. Both are injected at build time by
 * `withDailyChrome` (src/lib/daily.ts), so a note in content/Daily/ holds only
 * frontmatter and prose:
 *   <DailyNav>     above the body: previous / next, a calendar of the month, the day's almanac
 *   <DailyThreads> below it: other days that share a tag
 */

interface Day { iso: string; note: NoteMetadata }

function useDays(): Day[] {
  const index = useStore((s) => s.contentIndex)
  return useMemo(() => {
    if (!index) return []
    return Object.entries(index)
      .filter(([slug]) => isDailySlug(slug))
      .map(([, note]) => ({ iso: dailyIso(note.date), note }))
      .filter((d): d is Day => d.iso !== null)
      .sort((a, b) => a.iso.localeCompare(b.iso))
  }, [index])
}

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`)
const short = (iso: string) => utc(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })

/** The moon as the cards draw it: an outline, the dark part hatched. */
function Moon({ fraction }: { fraction: number }) {
  const R = 6
  const k = Math.cos(fraction * 2 * Math.PI)
  const lines: string[] = []
  for (let y = -R + 1; y < R; y += 1.5) {
    const half = Math.sqrt(R * R - y * y)
    const [a, b] = fraction < 0.5 ? [-half, half * k] : [-half * k, half]
    if (b - a > 0.6) lines.push(`M${(8 + a).toFixed(1)} ${8 + y}L${(8 + b).toFixed(1)} ${8 + y}`)
  }
  return (
    <svg className={styles.moon} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d={lines.join("")} stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
      <circle cx="8" cy="8" r={R} fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function Calendar({ iso, days }: { iso: string; days: Day[] }) {
  const byIso = useMemo(() => new Map(days.map((d) => [d.iso, d.note])), [days])
  // Months that hold at least one entry, so the arrows never land on an empty page.
  const months = useMemo(() => [...new Set([...days.map((d) => d.iso.slice(0, 7)), iso.slice(0, 7)])].sort(), [days, iso])
  const [month, setMonth] = useState(iso.slice(0, 7))
  const at = months.indexOf(month)
  const [y, m] = month.split("-").map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7 // Monday first
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length }, (_, i) => i + 1)]
  return (
    <div className={styles.calendar}>
      <div className={styles.month}>
        <button type="button" disabled={at <= 0} onClick={() => setMonth(months[at - 1])} aria-label="Earlier month">‹</button>
        <span>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
        <button type="button" disabled={at >= months.length - 1} onClick={() => setMonth(months[at + 1])} aria-label="Later month">›</button>
      </div>
      <div className={styles.grid}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={`h${i}`} className={styles.weekday}>{d}</span>)}
        {cells.map((day, i) => {
          if (day === null) return <span key={i} />
          const key = `${month}-${String(day).padStart(2, "0")}`
          const note = byIso.get(key)
          if (!note) return <span key={i} className={styles.empty}>{day}</span>
          return (
            <a key={i} href={`/${note.slug}`} title={dailyHeadline(note.title)}
              className={`internal-link ${styles.day} ${key === iso ? styles.today : ""}`}>{day}</a>
          )
        })}
      </div>
    </div>
  )
}

export function DailyNav({ date }: { date: string }) {
  const days = useDays()
  const facts = useMemo(() => almanac(date), [date])
  const lines = almanacLines(facts)
  const at = days.findIndex((d) => d.iso === date)
  const prev = at > 0 ? days[at - 1] : null
  const next = at >= 0 && at < days.length - 1 ? days[at + 1] : null
  const here = at >= 0 ? days[at].note : null
  return (
    <>
    {here && (
      <img className={styles.plate} src={dailyArtUrl(here.slug)} width={1200} height={630} alt="" loading="eager"
        onError={(e) => { e.currentTarget.style.display = "none" }} />
    )}
    <nav className={styles.nav} aria-label="Logbook">
      <div className={styles.side}>
        <div className={styles.steps}>
          {prev
            ? <a href={`/${prev.note.slug}`} className="internal-link"><small>← {short(prev.iso)}</small>{dailyHeadline(prev.note.title)}</a>
            : <span />}
          {next
            ? <a href={`/${next.note.slug}`} className={`internal-link ${styles.next}`}><small>{short(next.iso)} →</small>{dailyHeadline(next.note.title)}</a>
            : <span />}
        </div>
        <p className={styles.almanac}>
          <Moon fraction={facts.moon.fraction} />
          <span>{lines[0]}</span>
          <span>{lines[1]}</span>
        </p>
        <p className={styles.links}>
          <a href="/" className="internal-link">home</a> · <a href="/folder/Daily" className="internal-link">all days</a>
        </p>
      </div>
      <Calendar iso={date} days={days} />
    </nav>
    </>
  )
}

export function DailyThreads({ date }: { date: string }) {
  const days = useDays()
  const here = days.find((d) => d.iso === date)
  const threads = useMemo(() => {
    if (!here) return []
    return (here.note.tags ?? [])
      .filter((tag) => tag.toLowerCase() !== "daily")
      .map((tag) => ({
        tag,
        others: days.filter((d) => d.iso !== date && (d.note.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase())).reverse().slice(0, 5),
      }))
      .filter((t) => t.others.length > 0)
  }, [days, here, date])
  if (!threads.length) return null
  return (
    <aside className={styles.threads} aria-label="More from the logbook">
      {threads.map(({ tag, others }) => (
        <p key={tag}>
          <a href={`/tags/${tag}`} className="tag-pill">#{tag}</a>
          {others.map((d) => (
            <a key={d.iso} href={`/${d.note.slug}`} className="internal-link">
              <small>{short(d.iso)}</small> {dailyHeadline(d.note.title)}
            </a>
          ))}
        </p>
      ))}
    </aside>
  )
}
