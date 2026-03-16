import { useState, useEffect, useRef, useCallback, KeyboardEvent, type ReactNode } from "react"
import type { ChatMessage } from "@/types/chat"
import { parseMessageBody } from "@/lib/parseMessageBody"
import { fetchEmoteIndex, getEmoteCache, emoteSrc } from "@/lib/emoteIndex"
import { useStore } from "@/store"
import { SPLASH_LOGO } from "./TerminalBootScreen"
import styles from "./Terminal.module.scss"

interface Props {
  messages: ChatMessage[]
  currentUserId: string
  currentUsername: string | null
  roomId: string
  accessToken: string
  onSend: (body: string, replyToId?: string) => Promise<void>
  knownUsers: string[]
  bootEcho?: string
  lastReadTimestamp?: string | null
  onReact?: (messageId: string, emote: string) => void
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
  "/reply": "/reply <n>  — reply to message #n in view",
  "/unread": "show count of unread messages",
  "/nick": "show your current username",
  "/mute": "toggle typing indicator broadcast",
  "/options": "set display options (density, scale)",
}

// /options subcommands — used for autocomplete and dispatch
const OPTIONS_DEFS: Record<string, string> = {
  "density:compact":      "message density → compact",
  "density:comfortable":  "message density → comfortable",
  "density:spacious":     "message density → spacious",
  "scale:s":              "text size → small (0.85×)",
  "scale:m":              "text size → medium (1×)",
  "scale:l":              "text size → large (1.15×)",
}

interface TerminalLine {
  id: string
  text: string
  kind: "msg" | "system" | "help" | "boot"
  username?: string
  nameColor?: string | null
  isDeleted?: boolean
  timestamp?: string
  replyTo?: { username: string; body: string } | null
  reactions?: Array<{ emote: string; count: number; reacted: boolean }>
}


function renderMessageTokens(text: string): ReactNode {
  const tokens = parseMessageBody(text)
  return tokens.map((tok, i) => {
    switch (tok.type) {
      case "text":
        return <span key={i}>{tok.value}</span>
      case "emote":
        return (
          <img
            key={i}
            src={emoteSrc(tok.name)}
            alt={`:${tok.name}:`}
            style={{ height: "14px", width: "auto", verticalAlign: "middle", margin: "0 1px", display: "inline" }}
            onError={(e) => {
              const img = e.currentTarget
              img.replaceWith(document.createTextNode(`:${tok.name}:`))
            }}
          />
        )
      case "url":
        return (
          <a
            key={i}
            href={tok.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#888", textDecoration: "underline" }}
          >
            {tok.label}
          </a>
        )
      case "image":
        return (
          <span key={i} style={{ display: "block" }}>
            <img
              src={tok.url}
              alt=""
              loading="lazy"
              style={{ maxHeight: "120px", maxWidth: "100%", marginTop: "3px", display: "block" }}
            />
          </span>
        )
      case "youtube":
        return (
          <a
            key={i}
            href={tok.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#888", textDecoration: "underline" }}
          >
            [youtube: {tok.videoId}]
          </a>
        )
      case "twitter":
        return (
          <a
            key={i}
            href={tok.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#888", textDecoration: "underline" }}
          >
            [&#x1D54F; @{tok.username}]
          </a>
        )
      case "video":
        return (
          <a
            key={i}
            href={tok.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#888", textDecoration: "underline" }}
          >
            [video]
          </a>
        )
      case "footnote-ref":
        return <span key={i} style={{ color: "#666" }}>[^{tok.index}]</span>
      default:
        return null
    }
  })
}

export function TerminalChatView({
  messages,
  currentUserId,
  currentUsername,
  roomId,
  onSend,
  knownUsers,
  bootEcho,
  lastReadTimestamp,
  onReact,
}: Props) {
  const chatDensity = useStore((s) => s.chatDensity)
  const setChatDensity = useStore((s) => s.setChatDensity)
  const chatFontScale = useStore((s) => s.chatFontScale)
  const setChatFontScale = useStore((s) => s.setChatFontScale)

  const [input, setInput] = useState("")
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [shrugPending, setShrugPending] = useState(false)
  const [localLines, setLocalLines] = useState<TerminalLine[]>([])
  const [cleared, setCleared] = useState<number>(0) // epoch marker to reset
  const [acIndex, setAcIndex] = useState(-1)
  const [replyContext, setReplyContext] = useState<ChatMessage | null>(null)
  const [mutedTyping, setMutedTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lineIdRef = useRef(0)
  const emotesRef = useRef<string[]>([])
  const historyRef = useRef<string[]>([])
  const historyIdxRef = useRef(-1)

  function mkId() {
    return String(++lineIdRef.current)
  }

  // Fetch emotes once on mount
  useEffect(() => {
    const cached = getEmoteCache()
    if (cached) { emotesRef.current = cached.map((e) => e.name); return }
    fetchEmoteIndex().then(() => {
      const c = getEmoteCache()
      if (c) emotesRef.current = c.map((e) => e.name)
    })
  }, [])

  // Build display lines from messages, after last clear epoch
  const msgLines: TerminalLine[] = messages.map((m) => ({
    id: m.id,
    text: m.body,
    kind: "msg",
    username: m.profiles?.username ?? "unknown",
    nameColor: m.profiles?.name_color,
    isDeleted: !!m.deleted_at,
    timestamp: m.created_at,
    replyTo: m.reply_to_message
      ? {
          username: m.reply_to_message.profiles?.username ?? "unknown",
          body: m.reply_to_message.body,
        }
      : null,
    reactions: m.reactions?.filter((r) => r.count > 0) ?? [],
  }))

  // Boot echo line (if provided)
  const bootLine: TerminalLine | null = bootEcho
    ? { id: "boot-echo", text: bootEcho, kind: "boot" }
    : null

  // System load line
  const systemLoadLine: TerminalLine = {
    id: "sysload",
    text: `-- loaded ${messages.length} messages --`,
    kind: "system",
  }

  // All display lines: optional boot echo, system header, then messages (post-clear), then local help/system lines
  const displayLines: TerminalLine[] = [
    ...(bootLine ? [bootLine] : []),
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
      const parts = input.split(" ")
      // /options <subcommand> autocomplete
      if (parts[0] === "/options" && parts.length >= 2) {
        const partial = parts[1].toLowerCase()
        return Object.keys(OPTIONS_DEFS)
          .filter((k) => k.startsWith(partial))
          .map((k) => `/options ${k}`)
      }
      return Object.keys(COMMAND_DEFS).filter((k) => k.startsWith(parts[0]))
    }
    if (input.startsWith("@")) {
      const partial = input.slice(1).toLowerCase()
      return knownUsers
        .filter((u) => u.toLowerCase().startsWith(partial))
        .map((u) => `@${u}`)
    }
    // Emote autocomplete: triggered when input has an open :
    const lastColon = input.lastIndexOf(":")
    const hasOpenEmote =
      lastColon >= 0 && !input.slice(lastColon + 1).includes(":")
    if (hasOpenEmote) {
      const partial = input.slice(lastColon + 1).toLowerCase()
      if (partial.length > 0) {
        return emotesRef.current
          .filter((n) => n.startsWith(partial))
          .slice(0, 12)
          .map((n) => `:${n}:`)
      }
    }
    return []
  })()

  const showAc = acCandidates.length > 0

  // Determine if current AC is an emote (not command, not @mention)
  const isEmoteAc = showAc && acCandidates[0]?.startsWith(":")

  function appendLocalLine(text: string, kind: TerminalLine["kind"] = "system") {
    setLocalLines((prev) => [...prev, { id: mkId(), text, kind }])
  }

  const handleEnter = useCallback(async () => {
    const raw = input.trim()
    if (!raw) return
    setInput("")
    setAcIndex(-1)

    // Add to history (skip /clear to not pollute history)
    if (raw && raw !== "/clear") {
      historyRef.current = [raw, ...historyRef.current].slice(0, 20)
      historyIdxRef.current = -1
    }

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
        historyIdxRef.current = -1
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

      if (cmd === "/reply") {
        const n = parseInt(parts[1] ?? "", 10)
        const visibleMessages = messages.slice(cleared)
        if (isNaN(n) || n < 1 || n > visibleMessages.length) {
          appendLocalLine(`Usage: /reply <n>  (1 = most recent)`)
          return
        }
        const target = visibleMessages[visibleMessages.length - n]
        setReplyContext(target)
        const username = target.profiles?.username ?? "unknown"
        const preview = target.body.slice(0, 60) + (target.body.length > 60 ? "..." : "")
        appendLocalLine(`-- replying to [${username}]: ${preview} --`)
        return
      }

      if (cmd === "/unread") {
        if (!lastReadTimestamp) {
          appendLocalLine("-- no read tracking available --")
          return
        }
        const count = messages.filter((m) => m.created_at > lastReadTimestamp).length
        appendLocalLine(`-- ${count} unread message${count === 1 ? "" : "s"} --`)
        return
      }

      if (cmd === "/nick") {
        appendLocalLine(`nick: ${currentUsername ?? "unknown"}`)
        return
      }

      if (cmd === "/mute") {
        setMutedTyping((v) => {
          const next = !v
          appendLocalLine(`-- typing indicator ${next ? "muted" : "unmuted"} --`)
          return next
        })
        return
      }

      if (cmd === "/options") {
        const sub = parts[1]?.toLowerCase()
        if (!sub) {
          appendLocalLine("usage: /options <subcommand>", "help")
          appendLocalLine("  density options:  compact  comfortable  spacious", "help")
          appendLocalLine("  scale options:    s  m  l", "help")
          appendLocalLine(`  current: density=${chatDensity}  scale=${chatFontScale === 0.85 ? "s" : chatFontScale === 1.15 ? "l" : "m"}`, "help")
          return
        }
        if (sub === "density:compact")     { setChatDensity("compact");     appendLocalLine("-- density: compact --"); return }
        if (sub === "density:comfortable") { setChatDensity("comfortable"); appendLocalLine("-- density: comfortable --"); return }
        if (sub === "density:spacious")    { setChatDensity("spacious");    appendLocalLine("-- density: spacious --"); return }
        if (sub === "scale:s") { setChatFontScale(0.85); appendLocalLine("-- text size: S --"); return }
        if (sub === "scale:m") { setChatFontScale(1.0);  appendLocalLine("-- text size: M --"); return }
        if (sub === "scale:l") { setChatFontScale(1.15); appendLocalLine("-- text size: L --"); return }
        appendLocalLine(`Unknown option: ${sub}  — type /options for list`)
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
    if (replyContext) {
      await onSend(body, replyContext.id)
      setReplyContext(null)
    } else {
      await onSend(body)
    }
  }, [input, messages, currentUserId, currentUsername, roomId, onSend, shrugPending, showTimestamps, cleared, replyContext, lastReadTimestamp, mutedTyping, chatDensity, setChatDensity, chatFontScale, setChatFontScale])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (showAc && acIndex >= 0) {
        // Select autocomplete item
        const sel = acCandidates[acIndex]
        if (input.startsWith("/")) {
          setInput(sel + " ")
        } else if (isEmoteAc) {
          const lastColon = input.lastIndexOf(":")
          setInput(input.slice(0, lastColon) + sel + " ")
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
        } else if (isEmoteAc) {
          const lastColon = input.lastIndexOf(":")
          setInput(input.slice(0, lastColon) + sel + " ")
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
      } else {
        e.preventDefault()
        const next = Math.min(historyIdxRef.current + 1, historyRef.current.length - 1)
        historyIdxRef.current = next
        if (historyRef.current[next] !== undefined) setInput(historyRef.current[next])
      }
      return
    }

    if (e.key === "ArrowDown") {
      if (showAc) {
        e.preventDefault()
        setAcIndex((i) => (i >= acCandidates.length - 1 ? 0 : i + 1))
      } else {
        e.preventDefault()
        const next = historyIdxRef.current - 1
        historyIdxRef.current = Math.max(next, -1)
        setInput(next < 0 ? "" : (historyRef.current[next] ?? ""))
      }
      return
    }

    if (e.key === "Escape") {
      if (replyContext) {
        setReplyContext(null)
        return
      }
      setAcIndex(-1)
      setInput("")
      return
    }
  }

  return (
    <div
      className={styles.terminalView}
      onClick={() => inputRef.current?.focus()}
    >
      <div className={styles.terminalLogoHeader}>
        {SPLASH_LOGO.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      <div className={styles.terminalMessages}>
        {displayLines.map((line) => {
          if (line.kind === "boot") {
            return (
              <div key={line.id} className={styles.terminalBoot}>
                {line.text}
              </div>
            )
          }
          if (line.kind === "system" || line.kind === "help") {
            return (
              <div key={line.id} className={`${styles.terminalMsg} ${styles.terminalSystem}`}>
                {line.text}
              </div>
            )
          }
          // msg line
          const nameColor = isValidColor(line.nameColor) ? line.nameColor : undefined
          return (
            <div key={line.id} className={styles.terminalMsg}>
              {line.replyTo && (
                <span className={styles.terminalReplyRef}>
                  ↳ [{line.replyTo.username}]: {line.replyTo.body.slice(0, 40)}{line.replyTo.body.length > 40 ? "…" : ""}
                </span>
              )}
              <span>
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
                  <span className={styles.terminalBody}>{renderMessageTokens(line.text)}</span>
                )}
              </span>
              {line.reactions && line.reactions.length > 0 && (
                <span className={styles.terminalReactions}>
                  {line.reactions.map((r) => (
                    <button
                      key={r.emote}
                      className={`${styles.terminalReactionBtn} ${r.reacted ? styles.terminalReactionReacted : ""}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onReact?.(line.id, r.emote)
                      }}
                      title={`:${r.emote}:`}
                    >
                      <img
                        src={emoteSrc(r.emote)}
                        alt={`:${r.emote}:`}
                        style={{ height: "13px", width: "auto", verticalAlign: "middle" }}
                        onError={(e) => {
                          const img = e.currentTarget
                          img.replaceWith(document.createTextNode(`:${r.emote}:`))
                        }}
                      />
                      {r.count > 1 && <span className={styles.terminalReactionCount}>{r.count}</span>}
                    </button>
                  ))}
                </span>
              )}
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {replyContext && (
        <div className={styles.terminalReplyBar}>
          ↩ replying to [{replyContext.profiles?.username ?? "unknown"}]: {replyContext.body.slice(0, 50)}{replyContext.body.length > 50 ? "…" : ""}
          <button className={styles.terminalReplyCancel} onClick={() => setReplyContext(null)}>
            [x]
          </button>
        </div>
      )}

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
                  } else if (isEmoteAc) {
                    const lastColon = input.lastIndexOf(":")
                    setInput(input.slice(0, lastColon) + c + " ")
                  } else {
                    const before = input.slice(0, input.lastIndexOf("@"))
                    setInput(before + c + " ")
                  }
                  setAcIndex(-1)
                  inputRef.current?.focus()
                }}
              >
                {isEmoteAc && (
                  <img
                    src={emoteSrc(c.slice(1, -1))}
                    alt=""
                    style={{ height: "14px", width: "auto", verticalAlign: "middle", marginRight: "6px", display: "inline" }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none"
                    }}
                  />
                )}
                {c}
                {(() => {
                  const desc = COMMAND_DEFS[c] ?? OPTIONS_DEFS[c.replace("/options ", "")]
                  return desc ? <span style={{ color: "#555", marginLeft: "0.5rem" }}>{desc}</span> : null
                })()}
              </div>
            ))}
          </div>
        )}
        <span className={styles.terminalPrompt}>{mutedTyping ? "$~" : "$"}</span>
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
