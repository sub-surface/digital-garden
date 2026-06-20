import { useStore } from "@/store"
import { useMemo, useRef } from "react"
import { isLandableNote } from "@/hooks/useRandomNote"
import type { NoteMetadata } from "@/types/content"

interface OnThisDayProps {
  /** How many to show if several notes share today's date (default 1). */
  limit?: number
}

function formatDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * "On this day" — surfaces a landable note dated to today's calendar day
 * (month + day) in any past year. If none match, falls back to a stable random
 * note so the slot is never empty. Reads `date` from the content index; no
 * backend. Place it anywhere in MDX: `<OnThisDay />`.
 */
export function OnThisDay({ limit = 1 }: OnThisDayProps) {
  const contentIndex = useStore((s) => s.contentIndex)
  const todayRef = useRef(new Date())

  const { matches, fallback } = useMemo(() => {
    const empty = { matches: [] as NoteMetadata[], fallback: null as NoteMetadata | null }
    if (!contentIndex) return empty
    const today = todayRef.current
    const m = today.getMonth()
    const d = today.getDate()

    const landable = Object.entries(contentIndex)
      .filter(([slug, meta]) => isLandableNote(slug, meta))
      .map(([, meta]) => meta)

    const onThisDay = landable
      .filter((n) => {
        if (!n.date) return false
        const nd = new Date(n.date)
        return !isNaN(nd.getTime()) && nd.getMonth() === m && nd.getDate() === d
      })
      // Most recent year first.
      .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime())

    // Stable fallback: pick by day-of-year so it's consistent through the day.
    const fb =
      onThisDay.length === 0 && landable.length
        ? landable[(today.getFullYear() * 366 + m * 31 + d) % landable.length]
        : null

    return { matches: onThisDay.slice(0, limit), fallback: fb }
  }, [contentIndex, limit])

  if (!contentIndex) return <div className="note-loading">Loading...</div>

  const items = matches.length ? matches : fallback ? [fallback] : []
  if (items.length === 0) return null

  const isFallback = matches.length === 0

  return (
    <div style={{ margin: "var(--space-4) 0" }}>
      {items.map((n) => (
        <div
          key={n.slug}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-4)", marginBottom: "var(--space-2)" }}
        >
          <a href={`/${n.slug}`} className="internal-link">{n.title}</a>
          {n.date && (
            <span style={{ fontFamily: "var(--font-code)", fontSize: "0.75rem", opacity: 0.4, flexShrink: 0 }}>
              {formatDate(n.date)}
            </span>
          )}
        </div>
      ))}
      {isFallback && (
        <p style={{ fontFamily: "var(--font-code)", fontSize: "0.72rem", opacity: 0.35, margin: 0 }}>
          nothing from this day yet — here's something else
        </p>
      )}
    </div>
  )
}
