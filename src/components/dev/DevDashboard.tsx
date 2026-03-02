import { useState, useMemo } from "react"
import { useStore } from "@/store"
import type { ContentIndex, NoteMetadata } from "@/types/content"
import styles from "./DevDashboard.module.scss"

function PropertyManager({ slug, onClose }: { slug: string, onClose: () => void }) {
  const contentIndex = useStore(s => s.contentIndex)
  const sessionOverrides = useStore(s => s.sessionOverrides)
  const setOverride = useStore(s => s.setOverride)
  
  const meta = contentIndex?.[slug]
  const current = { ...meta, ...(sessionOverrides[slug] || {}) }
  
  const [title, setTitle] = useState(current.title || "")
  const [type, setType] = useState(current.type || "")
  const [tags, setTags] = useState(current.tags?.join(", ") || "")

  const handleSave = () => {
    setOverride(slug, {
      title,
      type: type || undefined,
      tags: tags.split(",").map((t: string) => t.trim()).filter(Boolean)
    })
    onClose()
  }

  return (
    <div className={styles.propManagerOverlay} onClick={onClose}>
      <div className={styles.propManagerModal} onClick={e => e.stopPropagation()}>
        <h3>Edit Properties: {slug}</h3>
        <div className={styles.formGroup}>
          <label>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label>Type</label>
          <input value={type} onChange={e => setType(e.target.value)} placeholder="book, movie, music..." />
        </div>
        <div className={styles.formGroup}>
          <label>Tags (comma separated)</label>
          <input value={tags} onChange={e => setTags(e.target.value)} />
        </div>
        <div className={styles.modalActions}>
          <button onClick={onClose}>Cancel</button>
          <button className={styles.primary} onClick={handleSave}>Apply Overrides</button>
        </div>
        <p className={styles.disclaimer}>* Changes are session-only and will reset on page reload.</p>
      </div>
    </div>
  )
}

export function DevDashboard() {
  const contentIndex = useStore((s) => s.contentIndex)
  const store = useStore()
  const [filter, setFilter] = useState("")
  const [rebuildStatus, setRebuildStatus] = useState<string | null>(null)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)

  const stats = useMemo(() => {
    if (!contentIndex) return null
    const notes = Object.values(contentIndex)
    return {
      totalNotes: notes.length,
      books: notes.filter((n) => n.type === "book").length,
      movies: notes.filter((n) => n.type === "movie").length,
      music: notes.filter((n) => n.type === "music").length,
      tags: [...new Set(notes.flatMap((n) => n.tags))].length,
      totalLinks: notes.reduce((acc, n) => acc + n.links.length, 0),
      totalBacklinks: notes.reduce((acc, n) => acc + n.backlinks.length, 0),
      withBacklinks: notes.filter((n) => n.backlinks.length > 0).length,
      featured: notes.filter((n) => n.featured).length,
      folders: [...new Set(notes.map((n) => n.folder).filter(Boolean))].length,
    }
  }, [contentIndex])

  const filteredNotes = useMemo(() => {
    if (!contentIndex) return []
    const notes = Object.values(contentIndex)
    if (!filter) return notes.slice(0, 50) // Show first 50 by default
    const lower = filter.toLowerCase()
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(lower) ||
        n.slug.toLowerCase().includes(lower) ||
        n.tags.some((t) => t.toLowerCase().includes(lower)) ||
        (n.type && n.type.toLowerCase().includes(lower)),
    )
  }, [contentIndex, filter])

  const storeSnapshot = useMemo(() => {
    const { contentIndex: _ci, ...rest } = store
    return JSON.stringify(
      { ...rest, panelStack: rest.panelStack.map((c) => ({ slug: c.slug, title: c.title, depth: c.depth })) },
      null,
      2,
    )
  }, [store])

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <h1>__dev</h1>
        <span className={styles.version}>digital-garden-v2</span>
      </div>

      {/* Stats */}
      <div className={styles.section}>
        <h2>Content Index</h2>
        {stats ? (
          <div className={styles.statGrid}>
            <div className={styles.stat}>
              <div className={styles.label}>Total Notes</div>
              <div className={styles.value}>{stats.totalNotes}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.label}>Books</div>
              <div className={styles.value}>{stats.books}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.label}>Movies</div>
              <div className={styles.value}>{stats.movies}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.label}>Music</div>
              <div className={styles.value}>{stats.music}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.label}>Tags</div>
              <div className={styles.value}>{stats.tags}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.label}>Links</div>
              <div className={styles.value}>{stats.totalLinks}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.label}>Backlinks</div>
              <div className={styles.value}>{stats.totalBacklinks}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.label}>With Backlinks</div>
              <div className={styles.value}>{stats.withBacklinks}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.label}>Featured</div>
              <div className={styles.value}>{stats.featured}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.label}>Folders</div>
              <div className={styles.value}>{stats.folders}</div>
            </div>
          </div>
        ) : (
          <p>Content index not loaded. Run <code>npm run prebuild</code>.</p>
        )}
      </div>

      {/* Note browser */}
      <div className={styles.section}>
        <h2>Notes</h2>
        <input
          className={styles.filterInput}
          type="text"
          placeholder="Filter by title, slug, tag, or type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className={styles.noteList}>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Slug</th>
                <th>Type</th>
                <th>Tags</th>
                <th>Links</th>
                <th>BL</th>
              </tr>
            </thead>
            <tbody>
              {filteredNotes.map((n) => (
                <tr key={n.slug}>
                  <td>
                    <button className={styles.editBtn} onClick={() => setEditingSlug(n.slug)}>✎</button>
                    <a href={`/${n.slug}`} style={{ marginLeft: '8px' }}>{n.title}</a>
                  </td>
                  <td style={{ color: "var(--color-text-muted)" }}>{n.slug}</td>
                  <td>{n.type ?? "—"}</td>
                  <td>{n.tags.join(", ") || "—"}</td>
                  <td>{n.links.length}</td>
                  <td>{n.backlinks.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredNotes.length === 0 && <p>No notes match filter.</p>}
        </div>
      </div>

      {/* Store state */}
      <div className={styles.section}>
        <h2>Store State</h2>
        <div className={styles.storeView}>
          <pre>{storeSnapshot}</pre>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.section}>
        <h2>Actions</h2>
        <div className={styles.actions}>
          <button
            className={`${styles.actionBtn} ${styles.primary}`}
            onClick={() => {
              setRebuildStatus("Rebuilding content index...")
              fetch("/content-index.json", { cache: "reload" })
                .then((r) => r.json())
                .then((index: ContentIndex) => {
                  useStore.getState().setContentIndex(index)
                  setRebuildStatus(`Reloaded: ${Object.keys(index).length} notes`)
                })
                .catch((err) => setRebuildStatus(`Error: ${err}`))
            }}
          >
            Reload Content Index
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => {
              useStore.getState().clearStack()
              setRebuildStatus("Panel cleared")
            }}
          >
            Clear Panel Stack
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => {
              localStorage.clear()
              setRebuildStatus("localStorage cleared — reload page")
            }}
          >
            Clear localStorage
          </button>
        </div>
        {rebuildStatus && (
          <p style={{ marginTop: "var(--space-3)", color: "var(--color-text-muted)" }}>
            {rebuildStatus}
          </p>
        )}
      </div>

      {editingSlug && (
        <PropertyManager slug={editingSlug} onClose={() => setEditingSlug(null)} />
      )}
    </div>
  )
}
