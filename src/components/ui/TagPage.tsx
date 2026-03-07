import { useStore } from "@/store"
import { useMemo } from "react"

interface Props {
  tag?: string
}

export function TagPage({ tag }: Props) {
  const contentIndex = useStore((s) => s.contentIndex)

  const allTags = useMemo(() => {
    if (!contentIndex) return []
    const tags = new Set<string>()
    Object.values(contentIndex).forEach((n) => {
      n.tags.forEach((t) => tags.add(t))
    })
    return Array.from(tags).sort()
  }, [contentIndex])

  const notes = useMemo(() => {
    if (!contentIndex || !tag) return []
    return Object.values(contentIndex).filter((n) => 
      n.tags.some(t => t.toLowerCase() === tag.toLowerCase())
    )
  }, [contentIndex, tag])

  if (!contentIndex) {
    return <div className="note-loading">Loading index...</div>
  }

  // List all tags if no specific tag is provided
  if (!tag) {
    return (
      <>
        <h1>Tags</h1>
        <div className="tag-cloud" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', justifyContent: 'flex-end', marginTop: 'var(--space-8)' }}>
          {allTags.map((t) => (
            <a 
              key={t} 
              href={`/tags/${t}`} 
              className="tag-pill" 
              style={{ fontSize: '1.1rem', padding: 'var(--space-2) var(--space-4)' }}
            >
              #{t}
            </a>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <h1>#{tag}</h1>
      {notes.length === 0 ? (
        <p>No notes tagged with "{tag}".</p>
      ) : (
        <ul className="notes-list" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-8)' }}>
          {notes.map((n) => (
            <li key={n.slug} style={{ marginBottom: 'var(--space-4)', textAlign: 'right' }}>
              <a href={`/${n.slug}`} className="internal-link" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                {n.title}
              </a>
              <div style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '2px' }}>{n.slug}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
