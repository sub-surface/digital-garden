import { useState, useEffect, useRef, useCallback } from "react"
import styles from "./GifPicker.module.scss"

interface GifResult {
  url: string
  preview: string
  title: string
}

interface Props {
  onSelect: (markdownImage: string) => void
  onClose: () => void
}

export function GifPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<GifResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchGifs = useCallback((q: string) => {
    setLoading(true)
    setError(false)
    const param = q.trim() || "trending"
    fetch(`/api/chat/gif-search?q=${encodeURIComponent(param)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { results: GifResult[] }) => {
        setResults(data.results ?? [])
      })
      .catch(() => {
        setError(true)
        setResults([])
      })
      .finally(() => setLoading(false))
  }, [])

  // Fetch trending on mount
  useEffect(() => {
    fetchGifs("")
  }, [fetchGifs])

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchGifs(query)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, fetchGifs])

  // Dismiss on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [onClose])

  // Dismiss on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div className={styles.gifPicker} ref={ref}>
      <div className={styles.gifPickerHeader}>
        <input
          id="gif-picker-search"
          name="gif-search"
          className={styles.gifPickerSearch}
          type="text"
          placeholder="search GIFs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        <img src="/brand/powered-by-klipy.svg" alt="Powered by KLIPY" className={styles.gifPickerBrand} />
      </div>
      {loading && (
        <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", padding: "4px 0" }}>
          loading…
        </div>
      )}
      {error && !loading && (
        <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", padding: "4px 0" }}>
          GIF search unavailable
        </div>
      )}
      {!loading && !error && (
        <div className={styles.gifGrid}>
          {results.map((gif, i) => (
            <button
              key={i}
              className={styles.gifBtn}
              title={gif.title}
              onClick={() => {
                onSelect(`![](${gif.url})`)
                onClose()
              }}
              type="button"
            >
              <img src={gif.preview} alt={gif.title} className={styles.gifImg} />
              <img src="/brand/klipy-watermark.svg" alt="" className={styles.gifWatermark} aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
