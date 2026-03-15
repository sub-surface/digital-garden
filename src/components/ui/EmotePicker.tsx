import { useState, useEffect, useRef, useCallback } from "react"
import styles from "./EmotePicker.module.scss"

interface EmoteEntry { name: string; ext: string }

interface GifResult {
  url: string
  preview: string
  title: string
}

const FALLBACK_EMOTES: EmoteEntry[] = [
  { name: "kek", ext: "gif" },
  { name: "based", ext: "gif" },
  { name: "nahh", ext: "gif" },
  { name: "gigachad", ext: "gif" },
  { name: "cope", ext: "gif" },
  { name: "pepehands", ext: "gif" },
  { name: "pog", ext: "gif" },
  { name: "wave", ext: "gif" },
]

interface Props {
  onSelect: (emoteCode: string) => void
  onSelectGif?: (markdownImage: string) => void
  onClose: () => void
}

export function EmotePicker({ onSelect, onSelectGif, onClose }: Props) {
  const [tab, setTab] = useState<"emotes" | "gifs">("emotes")
  const [emotes, setEmotes] = useState<EmoteEntry[]>(FALLBACK_EMOTES)
  const [emoteFilter, setEmoteFilter] = useState("")
  const [gifQuery, setGifQuery] = useState("")
  const [gifResults, setGifResults] = useState<GifResult[]>([])
  const [gifLoading, setGifLoading] = useState(false)
  const [gifError, setGifError] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const gifDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch emote index
  useEffect(() => {
    fetch("/emotes/index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: unknown) => {
        if (!Array.isArray(data) || data.length === 0) return
        if (typeof data[0] === "string") {
          setEmotes((data as string[]).map((name) => ({ name, ext: "gif" })))
        } else {
          setEmotes(data as EmoteEntry[])
        }
      })
      .catch(() => {})
  }, [])

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

  // GIF fetching
  const fetchGifs = useCallback((q: string) => {
    setGifLoading(true)
    setGifError(false)
    const param = q.trim() || "trending"
    fetch(`/api/chat/gif-search?q=${encodeURIComponent(param)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { results: GifResult[] }) => setGifResults(data.results ?? []))
      .catch(() => { setGifError(true); setGifResults([]) })
      .finally(() => setGifLoading(false))
  }, [])

  // Fetch trending when switching to GIF tab
  useEffect(() => {
    if (tab === "gifs" && gifResults.length === 0 && !gifLoading) {
      fetchGifs("")
    }
  }, [tab])

  // Debounced GIF search
  useEffect(() => {
    if (tab !== "gifs") return
    if (gifDebounceRef.current) clearTimeout(gifDebounceRef.current)
    gifDebounceRef.current = setTimeout(() => fetchGifs(gifQuery), 300)
    return () => { if (gifDebounceRef.current) clearTimeout(gifDebounceRef.current) }
  }, [gifQuery, tab, fetchGifs])

  const filteredEmotes = emoteFilter.trim()
    ? emotes.filter((e) => e.name.includes(emoteFilter.trim().toLowerCase()))
    : emotes

  return (
    <div className={styles.picker} ref={ref}>
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${tab === "emotes" ? styles.tabActive : ""}`}
          onClick={() => setTab("emotes")}
          type="button"
        >
          Emotes
        </button>
        {onSelectGif && (
          <button
            className={`${styles.tab} ${tab === "gifs" ? styles.tabActive : ""}`}
            onClick={() => setTab("gifs")}
            type="button"
          >
            GIFs
          </button>
        )}
      </div>

      {tab === "emotes" && (
        <>
          <input
            id="emote-picker-filter"
            name="emote-filter"
            className={styles.searchInput}
            type="text"
            placeholder="filter..."
            value={emoteFilter}
            onChange={(e) => setEmoteFilter(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <div className={styles.emoteGrid}>
            {filteredEmotes.map((emote) => (
              <button
                key={emote.name}
                className={styles.emoteBtn}
                title={`:${emote.name}:`}
                onClick={() => onSelect(`:${emote.name}:`)}
                type="button"
              >
                <img
                  src={`/emotes/${emote.name}.${emote.ext}`}
                  alt={`:${emote.name}:`}
                  className={styles.emoteImg}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none"
                  }}
                />
              </button>
            ))}
          </div>
        </>
      )}

      {tab === "gifs" && (
        <>
          <div className={styles.gifSearchRow}>
            <input
              id="gif-picker-search"
              name="gif-search"
              className={styles.searchInput}
              type="text"
              placeholder="search GIFs..."
              value={gifQuery}
              onChange={(e) => setGifQuery(e.target.value)}
              autoComplete="off"
              autoFocus
            />
            <img src="/brand/powered-by-klipy.svg" alt="Powered by KLIPY" className={styles.gifBrand} />
          </div>
          {gifLoading && (
            <div className={styles.gifStatus}>loading...</div>
          )}
          {gifError && !gifLoading && (
            <div className={styles.gifStatus}>GIF search unavailable</div>
          )}
          {!gifLoading && !gifError && (
            <div className={styles.gifGrid}>
              {gifResults.map((gif, i) => (
                <button
                  key={i}
                  className={styles.gifBtn}
                  title={gif.title}
                  onClick={() => {
                    onSelectGif?.(`![](${gif.url})`)
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
        </>
      )}
    </div>
  )
}
