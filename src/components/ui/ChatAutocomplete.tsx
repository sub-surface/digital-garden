import { useState, useEffect, useRef, useCallback } from "react"
import { emoteSrc } from "@/lib/emoteIndex"
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
                (e.currentTarget as HTMLImageElement).style.display = "none"
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

export function fetchEmoteNames(): Promise<string[]> {
  return import("@/lib/emoteIndex").then(({ fetchEmoteIndex, getEmoteCache }) =>
    fetchEmoteIndex().then(() => getEmoteCache()?.map((e) => e.name) ?? [])
  )
}

// ── Static commands ──

export const CHAT_COMMANDS: { name: string; description: string; adminOnly?: boolean }[] = [
  { name: "gif",       description: "Search for a GIF" },
  { name: "shrug",     description: "¯\\_(ツ)_/¯" },
  { name: "flip",      description: "(╯°□°）╯︵ ┻━┻" },
  { name: "me",        description: "Action text" },
  { name: "mock",      description: "/mock <text> — aLtErNaTiNg CaPs" },
  { name: "color",     description: "/color #hex — set your name colour" },
  { name: "whoami",    description: "Link to your profile" },
  { name: "about",     description: "Link to source repo" },
  { name: "search",    description: "/search <term> — search message history" },
  { name: "goto",      description: "/goto <username> — scroll to their last message" },
  { name: "reply",     description: "/reply <n> — reply to message #n (1=most recent)" },
  { name: "edit",      description: "/edit <n> <text> — edit your message #n" },
  { name: "delete",    description: "/delete <n> — delete your message #n" },
  { name: "react",     description: "/react <n> <emote> — react to message #n" },
  { name: "quote",     description: "/quote <n> — re-post message #n as a quote" },
  { name: "pinned",    description: "Show pinned messages" },
  { name: "pin",       description: "/pin <n> — pin message #n", adminOnly: true },
  { name: "unpin",     description: "/unpin <n> — unpin message #n", adminOnly: true },
  { name: "ban",       description: "/ban <username> [reason]", adminOnly: true },
  { name: "unban",     description: "/unban <username>", adminOnly: true },
  { name: "kick",      description: "/kick <username> — delete their recent messages", adminOnly: true },
]

// ── Hook to manage autocomplete state ──

interface UseAutocompleteOpts {
  body: string
  cursorPos: number
  knownUsers: string[]
  isAdmin?: boolean
}

interface AutocompleteState {
  items: AutocompleteItem[]
  selectedIndex: number
  trigger: { type: AutocompleteType; start: number; query: string } | null
}

export function useAutocomplete({ body, cursorPos, knownUsers, isAdmin }: UseAutocompleteOpts) {
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
            icon: emoteSrc(n),
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
        .filter((c) => c.name.includes(query) && (!c.adminOnly || isAdmin))
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
  }, [body, cursorPos, emoteNames, knownUsers, isAdmin])

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
