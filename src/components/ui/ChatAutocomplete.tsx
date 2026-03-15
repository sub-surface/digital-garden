import { useState, useEffect, useRef, useCallback } from "react"
import styles from "./ChatAutocomplete.module.scss"

export type AutocompleteType = "emote" | "mention" | "command"

export interface AutocompleteItem {
  type: AutocompleteType
  label: string      // display text
  value: string      // text to insert
  icon?: string      // emote image src
}

interface Props {
  items: AutocompleteItem[]
  selectedIndex: number
  onSelect: (item: AutocompleteItem) => void
  position: { bottom: number; left: number }
}

export function ChatAutocomplete({ items, selectedIndex, onSelect, position }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (items.length === 0) return null

  return (
    <div
      className={styles.autocomplete}
      style={{ bottom: position.bottom, left: position.left }}
      ref={listRef}
    >
      {items.map((item, i) => (
        <button
          key={`${item.type}-${item.label}`}
          className={`${styles.item} ${i === selectedIndex ? styles.itemActive : ""}`}
          onMouseDown={(e) => {
            e.preventDefault() // prevent textarea blur
            onSelect(item)
          }}
        >
          {item.type === "emote" && item.icon && (
            <img
              src={item.icon}
              alt={item.label}
              className={styles.emoteThumb}
              onError={(e) => {
                const img = e.currentTarget
                if (!img.dataset.pngFallback) {
                  img.dataset.pngFallback = "1"
                  img.src = item.icon!.replace(".gif", ".png")
                }
              }}
            />
          )}
          {item.type === "mention" && <span className={styles.mentionAt}>@</span>}
          {item.type === "command" && <span className={styles.commandSlash}>/</span>}
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Emote cache (shared across instances) ──

let emoteCache: string[] | null = null
let emoteFetchPromise: Promise<string[]> | null = null

export function fetchEmoteNames(): Promise<string[]> {
  if (emoteCache) return Promise.resolve(emoteCache)
  if (emoteFetchPromise) return emoteFetchPromise
  emoteFetchPromise = fetch("/emotes/index.json")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data: unknown) => {
      if (!Array.isArray(data)) return []
      const names = data.map((d) => (typeof d === "string" ? d : (d as { name: string }).name))
      emoteCache = names
      return names
    })
    .catch(() => {
      emoteCache = ["kek", "based", "nahh", "gigachad", "cope", "pepehands", "pog", "wave"]
      return emoteCache
    })
  return emoteFetchPromise
}

// ── Static commands ──

export const CHAT_COMMANDS: { name: string; description: string }[] = [
  { name: "gif", description: "Search for a GIF" },
  { name: "shrug", description: "¯\\_(ツ)_/¯" },
  { name: "me", description: "Action text" },
]

// ── Hook to manage autocomplete state ──

interface UseAutocompleteOpts {
  body: string
  cursorPos: number
  knownUsers: string[]
}

interface AutocompleteState {
  items: AutocompleteItem[]
  selectedIndex: number
  trigger: { type: AutocompleteType; start: number; query: string } | null
}

export function useAutocomplete({ body, cursorPos, knownUsers }: UseAutocompleteOpts) {
  const [emoteNames, setEmoteNames] = useState<string[]>([])
  const [state, setState] = useState<AutocompleteState>({
    items: [],
    selectedIndex: 0,
    trigger: null,
  })

  // Load emotes once
  useEffect(() => {
    fetchEmoteNames().then(setEmoteNames)
  }, [])

  // Detect trigger and compute suggestions
  useEffect(() => {
    const textBeforeCursor = body.slice(0, cursorPos)

    // Check for : trigger (emote)
    const emoteMatch = textBeforeCursor.match(/:([a-zA-Z0-9_-]*)$/)
    if (emoteMatch) {
      const query = emoteMatch[1].toLowerCase()
      if (query.length >= 1) {
        const matches = emoteNames
          .filter((n) => n.toLowerCase().includes(query))
          .slice(0, 8)
          .map((n): AutocompleteItem => ({
            type: "emote",
            label: n,
            value: `:${n}: `,
            icon: `/emotes/${n}.gif`,
          }))
        setState({ items: matches, selectedIndex: 0, trigger: { type: "emote", start: emoteMatch.index!, query } })
        return
      }
    }

    // Check for @ trigger (mention)
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/)
    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase()
      if (query.length >= 1) {
        const matches = knownUsers
          .filter((u) => u.toLowerCase().includes(query))
          .slice(0, 8)
          .map((u): AutocompleteItem => ({
            type: "mention",
            label: u,
            value: `@${u} `,
          }))
        setState({ items: matches, selectedIndex: 0, trigger: { type: "mention", start: mentionMatch.index!, query } })
        return
      }
    }

    // Check for / trigger (command) — only at start of input
    const cmdMatch = textBeforeCursor.match(/^\/([a-zA-Z]*)$/)
    if (cmdMatch) {
      const query = cmdMatch[1].toLowerCase()
      const matches = CHAT_COMMANDS
        .filter((c) => c.name.includes(query))
        .map((c): AutocompleteItem => ({
          type: "command",
          label: `${c.name} — ${c.description}`,
          value: `/${c.name} `,
        }))
      setState({ items: matches, selectedIndex: 0, trigger: { type: "command", start: 0, query } })
      return
    }

    // No trigger
    setState({ items: [], selectedIndex: 0, trigger: null })
  }, [body, cursorPos, emoteNames, knownUsers])

  const moveSelection = useCallback((delta: number) => {
    setState((prev) => {
      if (prev.items.length === 0) return prev
      const next = (prev.selectedIndex + delta + prev.items.length) % prev.items.length
      return { ...prev, selectedIndex: next }
    })
  }, [])

  const getSelected = useCallback((): AutocompleteItem | null => {
    if (state.items.length === 0 || !state.trigger) return null
    return state.items[state.selectedIndex] ?? null
  }, [state])

  return {
    ...state,
    moveSelection,
    getSelected,
    isActive: state.items.length > 0 && state.trigger !== null,
  }
}
