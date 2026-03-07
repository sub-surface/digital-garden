import { useStore } from "@/store"
import { useMemo } from "react"

export function RecentPage() {
  const contentIndex = useStore((s) => s.contentIndex)

  const notes = useMemo(() => {
    if (!contentIndex) return []
    return Object.values(contentIndex)
      .filter((n) => n.date)
      .sort((a, b) => {
        const da = new Date(a.date!).getTime()
        const db = new Date(b.date!).getTime()
        return isNaN(db - da) ? 0 : db - da
      })
  }, [contentIndex])

  if (!contentIndex) {
    return <div className="note-loading">Loading index...</div>
  }

  return (
    <>
      <h1>Recent</h1>
      {notes.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)', fontSize: '0.9rem' }}>
          No dated notes found.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-8)' }}>
          {notes.map((n) => (
            <li key={n.slug} style={{ marginBottom: 'var(--space-6)', textAlign: 'right', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-4)' }}>
              <a href={`/${n.slug}`} className="internal-link" style={{ fontSize: '1.15rem', fontWeight: 500 }}>
                {n.title}
              </a>
              <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'flex-end', marginTop: 'var(--space-1)', fontFamily: 'var(--font-code)', fontSize: '0.75rem', opacity: 0.5 }}>
                {n.date && <span>{n.date}</span>}
                {n.readingTime && <span>{n.readingTime} min read</span>}
                {n.folder && <span>{n.folder}</span>}
              </div>
              {n.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                  {n.tags.map((t) => (
                    <a key={t} href={`/tags/${t}`} className="tag-pill" style={{ fontFamily: 'var(--font-code)', fontSize: '0.7rem' }}>#{t}</a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
