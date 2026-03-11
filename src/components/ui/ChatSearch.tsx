import { useState, useEffect, useCallback } from "react"
import styles from "./Chat.module.scss"

interface SearchResult {
  id: string
  room_name: string
  username: string
  body: string
  created_at: string
}

interface Props {
  onClose: () => void
  accessToken: string
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
}

export function ChatSearch({ onClose, accessToken }: Props) {
  const [query, setQuery] = useState("")
  const [room, setRoom] = useState("")
  const [mediaOnly, setMediaOnly] = useState(false)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [searched, setSearched] = useState(false)

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!query.trim()) return

    const params = new URLSearchParams()
    params.set("q", query.trim())
    if (room.trim()) params.set("room", room.trim())
    if (dateFrom) params.set("after", dateFrom)
    if (dateTo) params.set("before", dateTo)
    if (mediaOnly) params.set("media_only", "true")
    params.set("limit", "50")

    setLoading(true)
    setError(false)
    setSearched(true)

    try {
      const res = await fetch(`/api/chat/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error("search failed")
      const data = await res.json() as { results: SearchResult[] }
      setResults(data.results ?? [])
    } catch {
      setError(true)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query, room, dateFrom, dateTo, mediaOnly, accessToken])

  return (
    <div className={styles.searchOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.searchPanel}>
        <div className={styles.searchPanelHeader}>
          <span>search messages</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close search">
            &times;
          </button>
        </div>

        <form className={styles.searchForm} onSubmit={handleSearch}>
          <label className={styles.searchLabel}>query *</label>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="search text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            required
          />

          <label className={styles.searchLabel}>room (optional)</label>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="channel name…"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />

          <label className={styles.searchLabel}>from</label>
          <input
            className={styles.searchInput}
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />

          <label className={styles.searchLabel}>to</label>
          <input
            className={styles.searchInput}
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />

          <label className={styles.searchRow}>
            <input
              type="checkbox"
              checked={mediaOnly}
              onChange={(e) => setMediaOnly(e.target.checked)}
            />
            media only
          </label>

          <button className={styles.searchBtn} type="submit" disabled={!query.trim() || loading}>
            {loading ? "searching…" : "search"}
          </button>
        </form>

        <div className={styles.searchResults}>
          {error && (
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              search failed — try again
            </div>
          )}
          {!error && searched && !loading && results.length === 0 && (
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              no results
            </div>
          )}
          {results.map((r) => (
            <div key={r.id} className={styles.searchResult}>
              <div className={styles.searchResultMeta}>
                [#{r.room_name}] @{r.username} &middot; {formatTimestamp(r.created_at)}
              </div>
              <div className={styles.searchResultBody}>
                {r.body.length > 120 ? r.body.slice(0, 120) + "…" : r.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
