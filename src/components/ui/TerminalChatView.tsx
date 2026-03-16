import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react"
import type { ChatMessage } from "@/types/chat"
import styles from "./Terminal.module.scss"

interface Props {
  messages: ChatMessage[]
  currentUserId: string
  currentUsername: string | null
  roomId: string
  accessToken: string
  onSend: (body: string, replyToId?: string) => Promise<void>
  knownUsers: string[]
}

const NAME_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/

function isValidColor(c?: string | null): c is string {
  return typeof c === "string" && NAME_COLOR_RE.test(c)
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `[${hh}:${mm}] `
}

const COMMAND_DEFS: Record<string, string> = {
  "/help": "list available commands",
  "/me": "/me <action>  — send an action message",
  "/shrug": "append ¯\\_(ツ)_/¯ to your next message",
  "/clear": "clear terminal display (local only)",
  "/timestamps": "toggle timestamp display",
  "/room": "show current room name",
  "/whoami": "show your username",
  "/users": "list users visible in current view",
}

interface TerminalLine {
  id: string
  text: string
  kind: "msg" | "system" | "help"
  username?: string
  nameColor?: string | null
  isDeleted?: boolean
  timestamp?: string
}

let lineId = 0
function mkId() {
  return String(++lineId)
}

export function TerminalChatView({
  messages,
  currentUserId,
  currentUsername,
  roomId,
  onSend,
  knownUsers,
}: Props) {
  const [input, setInput] = useState("")
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [shrugPending, setShrugPending] = useState(false)
  const [localLines, setLocalLines] = useState<TerminalLine[]>([])
  const [cleared, setCleared] = useState<number>(0) // epoch marker to reset
  const [acIndex, setAcIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Build display lines from messages, after last clear epoch
  const msgLines: TerminalLine[] = messages.map((m) => ({
    id: m.id,
    text: m.body,
    kind: "msg",
    username: m.profiles?.username ?? "unknown",
    nameColor: m.profiles?.name_color,
    isDeleted: !!m.deleted_at,
    timestamp: m.created_at,
  }))

  // Combine: system lines from local + message lines (after cleared marker) + local help lines
  const systemLoadLine: TerminalLine = {
    id: "sysload",
    text: `-- loaded ${messages.length} messages --`,
    kind: "system",
  }

  // All display lines: system header, then messages (post-clear), then local help/system lines
  const displayLines: TerminalLine[] = [
    systemLoadLine,
    ...msgLines.slice(cleared),
    ...localLines,
  ]

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" })
  }, [displayLines.length])

  // Keep input focused
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Autocomplete candidates
  const acCandidates: string[] = (() => {
    if (input.startsWith("/")) {
      return Object.keys(COMMAND_DEFS).filter((k) => k.startsWith(input.split(" ")[0]))
    }
    if (input.startsWith("@")) {
      const partial = input.slice(1).toLowerCase()
      return knownUsers
        .filter((u) => u.toLowerCase().startsWith(partial))
        .map((u) => `@${u}`)
    }
    return []
  })()

  const showAc = acCandidates.length > 0

  function appendLocalLine(text: string, kind: TerminalLine["kind"] = "system") {
    setLocalLines((prev) => [...prev, { id: mkId(), text, kind }])
  }

  const handleEnter = useCallback(async () => {
    const raw = input.trim()
    if (!raw) return
    setInput("")
    setAcIndex(-1)

    // Command dispatch
    if (raw.startsWith("/")) {
      const parts = raw.split(" ")
      const cmd = parts[0].toLowerCase()

      if (cmd === "/help") {
        appendLocalLine("Available commands:", "help")
        for (const [k, v] of Object.entries(COMMAND_DEFS)) {
          appendLocalLine(`  ${k.padEnd(14)} ${v}`, "help")
        }
        return
      }

      if (cmd === "/clear") {
        setCleared(messages.length)
        setLocalLines([])
        return
      }

      if (cmd === "/timestamps") {
        setShowTimestamps((v) => !v)
        appendLocalLine(`Timestamps ${showTimestamps ? "OFF" : "ON"}`)
        return
      }

      if (cmd === "/shrug") {
        setShrugPending(true)
        appendLocalLine("Next message will append ¯\\_(ツ)_/¯")
        return
      }

      if (cmd === "/me") {
        const action = parts.slice(1).join(" ")
        if (action) {
          const body = `* ${currentUsername ?? "unknown"} ${action}`
          await onSend(body)
        }
        return
      }

      if (cmd === "/room") {
        appendLocalLine(`Current room: ${roomId}`)
        return
      }

      if (cmd === "/whoami") {
        appendLocalLine(`Username: ${currentUsername ?? "unknown"}  |  id: ${currentUserId}`)
        return
      }

      if (cmd === "/users") {
        const unique = [...new Set(messages.map((m) => m.profiles?.username).filter(Boolean))]
        appendLocalLine(`Users in view: ${unique.join(", ") || "(none)"}`)
        return
      }

      appendLocalLine(`Unknown command: ${cmd}  — type /help for commands`)
      return
    }

    // Regular message
    let body = raw
    if (shrugPending) {
      body = body + " ¯\\_(ツ)_/¯"
      setShrugPending(false)
    }
    await onSend(body)
  }, [input, messages, currentUserId, currentUsername, roomId, onSend, shrugPending, showTimestamps])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (showAc && acIndex >= 0) {
        // Select autocomplete item
        const sel = acCandidates[acIndex]
        if (input.startsWith("/")) {
          setInput(sel + " ")
        } else {
          // @mention — replace the @partial at end
          const before = input.slice(0, input.lastIndexOf("@"))
          setInput(before + sel + " ")
        }
        setAcIndex(-1)
      } else {
        handleEnter()
      }
      return
    }

    if (e.key === "Tab") {
      e.preventDefault()
      if (showAc) {
        const next = (acIndex + 1) % acCandidates.length
        setAcIndex(next)
        const sel = acCandidates[next]
        if (input.startsWith("/")) {
          setInput(sel + " ")
        } else {
          const before = input.slice(0, input.lastIndexOf("@"))
          setInput(before + sel + " ")
        }
      }
      return
    }

    if (e.key === "ArrowUp") {
      if (showAc) {
        e.preventDefault()
        setAcIndex((i) => (i <= 0 ? acCandidates.length - 1 : i - 1))
      }
      return
    }

    if (e.key === "ArrowDown") {
      if (showAc) {
        e.preventDefault()
        setAcIndex((i) => (i >= acCandidates.length - 1 ? 0 : i + 1))
      }
      return
    }

    if (e.key === "Escape") {
      setAcIndex(-1)
      return
    }
  }

  return (
    <div
      className={styles.terminalView}
      onClick={() => inputRef.current?.focus()}
    >
      <div className={styles.terminalMessages}>
        {displayLines.map((line) => {
          if (line.kind === "system" || line.kind === "help") {
            return (
              <span key={line.id} className={`${styles.terminalMsg} ${styles.terminalSystem}`}>
                {line.text}
              </span>
            )
          }
          // msg line
          const nameColor = isValidColor(line.nameColor) ? line.nameColor : undefined
          return (
            <span key={line.id} className={styles.terminalMsg}>
              {showTimestamps && line.timestamp && (
                <span className={styles.terminalTimestamp}>
                  {formatTimestamp(line.timestamp)}
                </span>
              )}
              <span
                className={styles.terminalUsername}
                style={nameColor ? { color: nameColor } : undefined}
              >
                [{line.username}]{" "}
              </span>
              {line.isDeleted ? (
                <span className={styles.terminalBodyDeleted}>[deleted]</span>
              ) : (
                <span className={styles.terminalBody}>{line.text}</span>
              )}
            </span>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.terminalInputRow}>
        {showAc && (
          <div className={styles.terminalAutocomplete}>
            {acCandidates.map((c, i) => (
              <div
                key={c}
                className={`${styles.terminalAutocompleteItem} ${i === acIndex ? styles.terminalAutocompleteItemActive : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (input.startsWith("/")) {
                    setInput(c + " ")
                  } else {
                    const before = input.slice(0, input.lastIndexOf("@"))
                    setInput(before + c + " ")
                  }
                  setAcIndex(-1)
                  inputRef.current?.focus()
                }}
              >
                {c}
                {COMMAND_DEFS[c] ? <span style={{ color: "#555", marginLeft: "0.5rem" }}>{COMMAND_DEFS[c]}</span> : null}
              </div>
            ))}
          </div>
        )}
        <span className={styles.terminalPrompt}>$</span>
        <input
          ref={inputRef}
          className={styles.terminalInput}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setAcIndex(-1)
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Terminal input"
        />
      </div>
    </div>
  )
}
