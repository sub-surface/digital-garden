import { useStore } from "@/store"
import { useMemo, useRef } from "react"
import type { NoteMetadata } from "@/types/content"
import { isLandableNote } from "@/hooks/useRandomNote"
import { classifyLayout } from "@/lib/layout"
import styles from "./Query.module.scss"

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  fontFamily: "var(--font-code)",
  fontSize: "0.68rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  opacity: 0.55,
  border: "1px solid var(--color-border)",
  borderRadius: "10px",
  padding: "0.05em 0.5em",
}

function TypePill({ note }: { note: NoteMetadata }) {
  return <span style={pillStyle}>{classifyLayout(note.slug, note)}</span>
}

interface QueryProps {
  filter?: string   // e.g. "type=book" or "tag=philosophy" or "folder=Wiki"
  sort?: string     // "date" | "title" | "-date" | "-title" | "random"
  limit?: number
  display?: "list" | "grid" | "table" | "cards"
  /** Comma-separated slugs to leave out (case-insensitive), e.g. templates. */
  exclude?: string
  /**
   * Restrict to "landable" notes (exclude system/shelf/landing pages and private
   * notes). Defaults on for random sort (where stubs are noise), off otherwise.
   */
  notesOnly?: boolean
}

/** Fisher–Yates with a deterministic, render-stable order via a fixed seed. */
function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr]
  let s = seed || 1
  const rand = () => {
    // xorshift32 — cheap, deterministic, no Math.random (stable across renders).
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function applyFilter(notes: NoteMetadata[], filter: string): NoteMetadata[] {
  const parts = filter.split(",").map(s => s.trim()).filter(Boolean)
  return notes.filter(note => {
    return parts.every(part => {
      const [key, val] = part.split("=").map(s => s.trim())
      if (!key || val === undefined) return true
      switch (key) {
        case "type": return note.type?.toLowerCase() === val.toLowerCase()
        case "tag": return note.tags.some(t => t.toLowerCase() === val.toLowerCase())
        case "folder": return note.folder?.toLowerCase().startsWith(val.toLowerCase()) ?? false
        case "growth": return note.growth?.toLowerCase() === val.toLowerCase()
        case "featured": return String(note.featured) === val
        default: return true
      }
    })
  })
}

function applySort(notes: NoteMetadata[], sort: string): NoteMetadata[] {
  const desc = sort.startsWith("-")
  const field = desc ? sort.slice(1) : sort
  return [...notes].sort((a, b) => {
    let av: any, bv: any
    switch (field) {
      case "date":
        av = a.date ? new Date(a.date).getTime() : 0
        bv = b.date ? new Date(b.date).getTime() : 0
        break
      case "title":
        av = a.title.toLowerCase()
        bv = b.title.toLowerCase()
        break
      default:
        return 0
    }
    if (av < bv) return desc ? 1 : -1
    if (av > bv) return desc ? -1 : 1
    return 0
  })
}

function formatDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  // If the raw string contains a time component (e.g. "T12:00"), show it
  const hasTime = /T\d{2}:\d{2}/.test(raw)
  if (hasTime) {
    return d.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
  }
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
}

/** Frontmatter image → URL the browser can load (mirrors rehype-image-paths). */
function imageSrc(raw?: string): string | null {
  if (!raw) return null
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw
  return `/content/Media/${raw.replace(/^(content\/)?Media\//i, "")}`
}

function kindLabel(note: NoteMetadata): string {
  if (note.type) return note.type
  return note.slug.toLowerCase().startsWith("writing/") ? "essay" : classifyLayout(note.slug, note)
}

function EssayCard({ note, lead }: { note: NoteMetadata; lead: boolean }) {
  const src = imageSrc(note.image)
  const initial = note.title.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0).toUpperCase() || "·"
  return (
    <a href={`/${note.slug}`} className={`internal-link ${styles.card} ${lead ? styles.lead : ""}`}>
      <div className={styles.media}>
        {src
          ? <img src={src} alt="" loading="lazy" decoding="async" />
          : <div className={styles.plate} aria-hidden="true"><span className={styles.initial}>{initial}</span></div>}
      </div>
      <div className={styles.body}>
        <span className={styles.kicker}>
          {kindLabel(note)}{note.date ? ` · ${new Date(note.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
        </span>
        <span className={styles.title}>{note.title}</span>
        {note.description && <span className={styles.description}>{note.description}</span>}
        {note.readingTime ? <span className={styles.meta}>{note.readingTime} min read</span> : null}
      </div>
    </a>
  )
}

export function Query({ filter, sort = "-date", limit = 10, display = "list", notesOnly, exclude }: QueryProps) {
  const contentIndex = useStore(s => s.contentIndex)
  // One stable seed per mount, so random sort doesn't reshuffle on every render.
  const seedRef = useRef(((Date.now() & 0xffff) ^ 0x9e37) | 1)

  const isRandom = sort === "random"
  const isCards = display === "cards"
  // Cards are a showcase: hide stubs/system pages and drafts unless asked otherwise.
  const landable = notesOnly ?? (isRandom || isCards)

  const results = useMemo(() => {
    if (!contentIndex) return []
    const excluded = new Set((exclude ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean))
    let notes = Object.entries(contentIndex)
      .filter(([slug, meta]) => !landable || isLandableNote(slug, meta))
      .filter(([slug, meta]) => !excluded.has(slug.toLowerCase()) && !(isCards && meta.draft))
      .map(([, meta]) => meta)
    if (filter) notes = applyFilter(notes, filter)
    notes = isRandom ? shuffle(notes, seedRef.current) : applySort(notes, sort)
    return notes.slice(0, limit)
  }, [contentIndex, filter, sort, limit, landable, isRandom, exclude, isCards])

  if (!contentIndex) return <div className="note-loading">Loading...</div>
  if (results.length === 0) return <p style={{ opacity: 0.5, fontFamily: 'var(--font-code)', fontSize: '0.85rem' }}>No results.</p>

  if (display === "table") {
    return (
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Date</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {results.map(n => (
            <tr key={n.slug}>
              <td><a href={`/${n.slug}`} className="internal-link">{n.title}</a></td>
              <td><TypePill note={n} /></td>
              <td style={{ fontFamily: 'var(--font-code)', fontSize: '0.8rem', opacity: 0.6 }}>{n.date ? formatDate(n.date) : "—"}</td>
              <td style={{ fontSize: '0.8rem' }}>{n.tags.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (isCards) {
    return (
      <div className={styles.cards}>
        {results.map((n, i) => <EssayCard key={n.slug} note={n} lead={i === 0 && results.length > 2} />)}
      </div>
    )
  }

  if (display === "grid") {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)', margin: 'var(--space-6) 0' }}>
        {results.map(n => (
          <a key={n.slug} href={`/${n.slug}`} className="internal-link" style={{ display: 'block', padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'inherit' }}>
            <div style={{ fontWeight: 600, marginBottom: 'var(--space-1)' }}>{n.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <TypePill note={n} />
              {n.date && <span style={{ fontFamily: 'var(--font-code)', fontSize: '0.75rem', opacity: 0.5 }}>{formatDate(n.date)}</span>}
            </div>
          </a>
        ))}
      </div>
    )
  }

  // Default: list
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-4) 0' }}>
      {results.map(n => (
        <li key={n.slug} style={{ marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-4)' }}>
          <a href={`/${n.slug}`} className="internal-link">{n.title}</a>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexShrink: 0 }}>
            <TypePill note={n} />
            {n.date && <span style={{ fontFamily: 'var(--font-code)', fontSize: '0.75rem', opacity: 0.4 }}>{formatDate(n.date)}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
