import { useStore } from "@/store"
import { useMemo } from "react"
import type { NoteMetadata } from "@/types/content"

interface QueryProps {
  filter?: string   // e.g. "type=book" or "tag=philosophy" or "folder=Wiki"
  sort?: string     // "date" | "title" | "-date" | "-title"
  limit?: number
  display?: "list" | "grid" | "table"
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

export function Query({ filter, sort = "-date", limit = 10, display = "list" }: QueryProps) {
  const contentIndex = useStore(s => s.contentIndex)

  const results = useMemo(() => {
    if (!contentIndex) return []
    let notes = Object.values(contentIndex)
    if (filter) notes = applyFilter(notes, filter)
    notes = applySort(notes, sort)
    return notes.slice(0, limit)
  }, [contentIndex, filter, sort, limit])

  if (!contentIndex) return <div className="note-loading">Loading...</div>
  if (results.length === 0) return <p style={{ opacity: 0.5, fontFamily: 'var(--font-code)', fontSize: '0.85rem' }}>No results.</p>

  if (display === "table") {
    return (
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Title</th>
            <th>Date</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {results.map(n => (
            <tr key={n.slug}>
              <td><a href={`/${n.slug}`} className="internal-link">{n.title}</a></td>
              <td style={{ fontFamily: 'var(--font-code)', fontSize: '0.8rem', opacity: 0.6 }}>{n.date ?? "—"}</td>
              <td style={{ fontSize: '0.8rem' }}>{n.tags.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (display === "grid") {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)', margin: 'var(--space-6) 0' }}>
        {results.map(n => (
          <a key={n.slug} href={`/${n.slug}`} className="internal-link" style={{ display: 'block', padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'inherit' }}>
            <div style={{ fontWeight: 600, marginBottom: 'var(--space-1)' }}>{n.title}</div>
            {n.date && <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.75rem', opacity: 0.5 }}>{n.date}</div>}
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
          {n.date && <span style={{ fontFamily: 'var(--font-code)', fontSize: '0.75rem', opacity: 0.4, flexShrink: 0 }}>{n.date}</span>}
        </li>
      ))}
    </ul>
  )
}
