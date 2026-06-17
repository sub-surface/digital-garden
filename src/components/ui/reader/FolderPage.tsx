import { useStore } from "@/store"
import { useMemo } from "react"

interface Props {
  folderPath?: string
}

export function FolderPage({ folderPath }: Props) {
  const contentIndex = useStore((s) => s.contentIndex)

  const allFolders = useMemo(() => {
    if (!contentIndex) return []
    const folders = new Set<string>()
    Object.values(contentIndex).forEach((n) => {
      if (n.folder) folders.add(n.folder)
    })
    return Array.from(folders).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  }, [contentIndex])

  const notes = useMemo(() => {
    if (!contentIndex || !folderPath) return []
    const target = folderPath.toLowerCase()
    return Object.values(contentIndex).filter((n) => 
      n.folder?.toLowerCase() === target
    )
  }, [contentIndex, folderPath])

  if (!contentIndex) {
    return <div className="note-loading">Loading index...</div>
  }

  // List all folders if no specific path is provided
  if (!folderPath) {
    return (
      <>
        <h1>Folders</h1>
        <ul className="folder-list" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-8)' }}>
          {allFolders.map((f) => (
            <li key={f} style={{ marginBottom: 'var(--space-4)', textAlign: 'right' }}>
              <a href={`/folder/${f}`} className="internal-link" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                {f}
              </a>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <>
      <h1>{folderPath}</h1>
      {notes.length === 0 ? (
        <p>No notes found in "{folderPath}".</p>
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
