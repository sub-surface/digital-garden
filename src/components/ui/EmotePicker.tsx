import { useState, useEffect, useRef } from "react"
import styles from "./Chat.module.scss"

interface EmoteEntry { name: string; ext: string }

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
  onClose: () => void
}

export function EmotePicker({ onSelect, onClose }: Props) {
  const [emotes, setEmotes] = useState<EmoteEntry[]>(FALLBACK_EMOTES)
  const [filter, setFilter] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/emotes/index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: unknown) => {
        if (!Array.isArray(data) || data.length === 0) return
        // Support both {name, ext}[] and legacy string[]
        if (typeof data[0] === "string") {
          setEmotes((data as string[]).map((name) => ({ name, ext: "gif" })))
        } else {
          setEmotes(data as EmoteEntry[])
        }
      })
      .catch(() => {
        // Fall back to hardcoded list
      })
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

  const filtered = filter.trim()
    ? emotes.filter((e) => e.name.includes(filter.trim().toLowerCase()))
    : emotes

  return (
    <div className={styles.emotePicker} ref={ref}>
      <input
        id="emote-picker-filter"
        name="emote-filter"
        className={styles.emotePickerSearch}
        type="text"
        placeholder="filter…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        autoComplete="off"
        autoFocus
      />
      <div className={styles.emoteGrid}>
        {filtered.map((emote) => (
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
    </div>
  )
}
