import { useState, useEffect, useRef, useCallback, KeyboardEvent, type ReactNode } from "react"
import type { ChatMessage } from "@/types/chat"
import { parseMessageBodyWithFootnotes } from "@/lib/parseMessageBody"
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
  isAdmin?: boolean
  onDelete?: (messageId: string) => Promise<void>
  onEdit?: (messageId: string, newBody: string) => Promise<void>
  onPin?: (messageId: string) => Promise<void>
  onBoot?: () => void
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
  "/help":       "list available commands",
  "/me":         "/me <action> — send an action message",
  "/shrug":      "append ¯\\_(ツ)_/¯",
  "/flip":       "append (╯°□°）╯︵ ┻━┻",
  "/mock":       "/mock <text> — aLtErNaTiNg CaPs",
  "/clear":      "clear terminal display (local only)",
  "/timestamps": "toggle timestamp display  (alias: /ts)",
  "/options":    "set display options (density, scale)  (alias: /opt)",
  "/room":       "show current room",
  "/whoami":     "show link to your profile",
  "/about":      "show link to the source repo",
  "/color":      "/color <#hex> — set your name colour",
  "/boot":       "play the boot sequence",
  "/fastboot":   "toggle skipping the boot sequence",
  "/users":      "list users visible in current view",
  "/mute":       "toggle typing indicator broadcast",
  "/unread":     "show unread message count",
  "/reply":      "/reply <n> — reply to message #n (1=most recent)",
  "/edit":       "/edit <n> <text> — edit your message #n",
  "/delete":     "/delete <n> — delete message #n  (alias: /del)",
  "/react":      "/react <n> <emote> — react to message #n",
  "/pin":        "/pin <n> — pin message #n  [admin]",
  "/unpin":      "/unpin <n> — unpin message #n  [admin]",
  "/pinned":     "show pinned messages in view",
  "/quote":      "/quote <n> — re-post message #n as a quote  (alias: /q)",
  "/goto":       "/goto <username> — scroll to last message from user",
  "/search":     "/search <term> — search full message history  (alias: /s)",
  "/ban":        "/ban <username> [reason] — ban user  [admin]",
  "/unban":      "/unban <username> — unban user  [admin]",
  "/kick":       "/kick <username> — delete all recent messages from user  [admin]",
  "/ts":         "alias for /timestamps",
  "/opt":        "alias for /options",
  "/del":        "alias for /delete",
  "/q":          "alias for /quote",
  "/s":          "alias for /search",
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


function renderTokens(tokens: ReturnType<typeof parseMessageBodyWithFootnotes>["tokens"]): ReactNode {
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
        return <sup key={i} style={{ color: "#7a9fbf", fontSize: "0.7em" }}>{tok.index}</sup>
      default:
        return null
    }
  })
}

function renderMessageBody(text: string): { body: ReactNode; footnotes: Map<number, string> } {
  const { tokens, footnotes } = parseMessageBodyWithFootnotes(text)
  return { body: renderTokens(tokens), footnotes }
}

export function TerminalChatView({
  messages,
  currentUserId,
  currentUsername,
  roomId,
  accessToken,
  onSend,
  knownUsers,
  bootEcho,
  lastReadTimestamp,
  onReact,
  isAdmin,
  onDelete,
  onEdit,
  onPin,
  onBoot,
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
      if ((parts[0] === "/options" || parts[0] === "/opt") && parts.length >= 2) {
        const partial = parts[1].toLowerCase()
        return Object.keys(OPTIONS_DEFS)
          .filter((k) => k.startsWith(partial))
          .map((k) => `${parts[0]} ${k}`)
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

      if (cmd === "/ts") {
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
        appendLocalLine(`-- profile: https://subsurfaces.net/wiki/chatter/${currentUsername ?? "unknown"} --`)
        return
      }

      if (cmd === "/about") {
        appendLocalLine("-- source: https://github.com/sub-surface/digital-garden --")
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

      if (cmd === "/mute") {
        setMutedTyping((v) => {
          const next = !v
          appendLocalLine(`-- typing indicator ${next ? "muted" : "unmuted"} --`)
          return next
        })
        return
      }

      if (cmd === "/options" || cmd === "/opt") {
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

      if (cmd === "/flip") {
        setShrugPending(false)
        const body = parts.slice(1).join(" ")
        if (body) {
          await onSend(body + " (╯°□°）╯︵ ┻━┻")
        } else {
          await onSend("(╯°□°）╯︵ ┻━┻")
        }
        return
      }

      if (cmd === "/mock") {
        const text = parts.slice(1).join(" ")
        if (!text) { appendLocalLine("usage: /mock <text>"); return }
        const mocked = text.split("").map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join("")
        await onSend(mocked)
        return
      }

      if (cmd === "/color") {
        const hex = parts[1]?.trim()
        if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
          appendLocalLine("usage: /color #rrggbb")
          return
        }
        try {
          const res = await fetch("/api/auth/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ name_color: hex }),
          })
          if (!res.ok) throw new Error()
          appendLocalLine(`-- name colour set to ${hex} --`)
        } catch {
          appendLocalLine("-- failed to update colour --")
        }
        return
      }

      if (cmd === "/boot") {
        onBoot?.()
        return
      }

      if (cmd === "/fastboot") {
        const current = localStorage.getItem("terminal-fastboot") === "1"
        const next = !current
        localStorage.setItem("terminal-fastboot", next ? "1" : "0")
        appendLocalLine(`-- fastboot ${next ? "ON (boot will be skipped)" : "OFF (boot will play)"} --`)
        return
      }

      if (cmd === "/edit") {
        const n = parseInt(parts[1] ?? "", 10)
        const newText = parts.slice(2).join(" ").trim()
        const visibleMessages = messages.slice(cleared)
        if (isNaN(n) || n < 1 || n > visibleMessages.length) {
          appendLocalLine("usage: /edit <n> <new text>  (1 = most recent)")
          return
        }
        if (!newText) { appendLocalLine("usage: /edit <n> <new text>"); return }
        const target = visibleMessages[visibleMessages.length - n]
        if (target.profiles?.username !== currentUsername && !isAdmin) {
          appendLocalLine("-- cannot edit: not your message --")
          return
        }
        if (target.deleted_at) { appendLocalLine("-- cannot edit deleted message --"); return }
        await onEdit?.(target.id, newText)
        appendLocalLine(`-- message #${n} edited --`)
        return
      }

      if (cmd === "/delete" || cmd === "/del") {
        const n = parseInt(parts[1] ?? "", 10)
        const visibleMessages = messages.slice(cleared)
        if (isNaN(n) || n < 1 || n > visibleMessages.length) {
          appendLocalLine("usage: /delete <n>  (1 = most recent)")
          return
        }
        const target = visibleMessages[visibleMessages.length - n]
        if (target.profiles?.username !== currentUsername && !isAdmin) {
          appendLocalLine("-- cannot delete: not your message --")
          return
        }
        await onDelete?.(target.id)
        appendLocalLine(`-- message #${n} deleted --`)
        return
      }

      if (cmd === "/react") {
        const n = parseInt(parts[1] ?? "", 10)
        const emote = parts[2]?.replace(/^:|:$/g, "")
        const visibleMessages = messages.slice(cleared)
        if (isNaN(n) || n < 1 || n > visibleMessages.length || !emote) {
          appendLocalLine("usage: /react <n> <emote>  e.g. /react 1 kek")
          return
        }
        const target = visibleMessages[visibleMessages.length - n]
        await onReact?.(target.id, emote)
        appendLocalLine(`-- reacted :${emote}: to message #${n} --`)
        return
      }

      if (cmd === "/pin") {
        if (!isAdmin) { appendLocalLine("-- /pin requires admin --"); return }
        const n = parseInt(parts[1] ?? "", 10)
        const visibleMessages = messages.slice(cleared)
        if (isNaN(n) || n < 1 || n > visibleMessages.length) {
          appendLocalLine("usage: /pin <n>  (1 = most recent)")
          return
        }
        const target = visibleMessages[visibleMessages.length - n]
        await onPin?.(target.id)
        appendLocalLine(`-- message #${n} pinned --`)
        return
      }

      if (cmd === "/unpin") {
        if (!isAdmin) { appendLocalLine("-- /unpin requires admin --"); return }
        const n = parseInt(parts[1] ?? "", 10)
        const visibleMessages = messages.slice(cleared)
        if (isNaN(n) || n < 1 || n > visibleMessages.length) {
          appendLocalLine("usage: /unpin <n>  (1 = most recent)")
          return
        }
        const target = visibleMessages[visibleMessages.length - n]
        await onPin?.(target.id) // onPin toggles pin/unpin
        appendLocalLine(`-- message #${n} unpinned --`)
        return
      }

      if (cmd === "/pinned") {
        const pinned = messages.filter(m => m.pinned_at && !m.deleted_at)
        if (pinned.length === 0) {
          appendLocalLine("-- no pinned messages --")
          return
        }
        appendLocalLine(`-- ${pinned.length} pinned message${pinned.length === 1 ? "" : "s"} --`, "help")
        for (const m of pinned) {
          const preview = m.body.slice(0, 60) + (m.body.length > 60 ? "…" : "")
          appendLocalLine(`  [${m.profiles?.username ?? "unknown"}]: ${preview}`, "help")
        }
        return
      }

      if (cmd === "/quote" || cmd === "/q") {
        const n = parseInt(parts[1] ?? "", 10)
        const visibleMessages = messages.slice(cleared)
        if (isNaN(n) || n < 1 || n > visibleMessages.length) {
          appendLocalLine("usage: /quote <n>  (1 = most recent)")
          return
        }
        const target = visibleMessages[visibleMessages.length - n]
        const username = target.profiles?.username ?? "unknown"
        const preview = target.body.slice(0, 80) + (target.body.length > 80 ? "…" : "")
        await onSend(`> [${username}]: ${preview}`)
        return
      }

      if (cmd === "/goto") {
        const username = parts[1]?.toLowerCase()
        if (!username) { appendLocalLine("usage: /goto <username>"); return }
        const visibleMessages = messages.slice(cleared)
        const target = [...visibleMessages].reverse().find(m => m.profiles?.username?.toLowerCase() === username)
        if (!target) {
          appendLocalLine(`-- no messages from ${username} in view --`)
          return
        }
        const el = document.querySelector(`[data-message-id="${target.id}"]`) as HTMLElement | null
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          appendLocalLine(`-- scrolled to last message from ${username} --`)
        } else {
          appendLocalLine(`-- message found but not rendered in view --`)
        }
        return
      }

      if (cmd === "/search" || cmd === "/s") {
        const term = parts.slice(1).join(" ").trim()
        if (!term) { appendLocalLine("usage: /search <term>"); return }
        appendLocalLine(`-- searching for "${term}"… --`)
        try {
          const res = await fetch(`/api/chat/search?q=${encodeURIComponent(term)}&limit=10&include_deleted=true`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (!res.ok) throw new Error()
          const data = await res.json() as { results?: Array<{ id: string; body: string; created_at: string; profiles?: { username?: string }; deleted_at?: string | null }> }
          const results = data.results ?? []
          if (results.length === 0) {
            appendLocalLine(`-- no results for "${term}" --`)
          } else {
            appendLocalLine(`-- ${results.length} result${results.length === 1 ? "" : "s"} --`, "help")
            for (const r of results) {
              const user = r.profiles?.username ?? "unknown"
              const d = new Date(r.created_at)
              const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
              const deleted = r.deleted_at ? " [deleted]" : ""
              const preview = r.body.slice(0, 60) + (r.body.length > 60 ? "…" : "")
              appendLocalLine(`  [${user}] ${date}${deleted}: ${preview}`, "help")
            }
          }
        } catch {
          appendLocalLine(`-- search failed --`)
        }
        return
      }

      if (cmd === "/ban") {
        if (!isAdmin) { appendLocalLine("-- /ban requires admin --"); return }
        const username = parts[1]
        const reason = parts.slice(2).join(" ") || undefined
        if (!username) { appendLocalLine("usage: /ban <username> [reason]"); return }
        try {
          const res = await fetch("/api/chat/ban", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ username, reason }),
          })
          if (!res.ok) throw new Error()
          appendLocalLine(`-- ${username} banned --`)
        } catch {
          appendLocalLine(`-- failed to ban ${username} --`)
        }
        return
      }

      if (cmd === "/unban") {
        if (!isAdmin) { appendLocalLine("-- /unban requires admin --"); return }
        const username = parts[1]
        if (!username) { appendLocalLine("usage: /unban <username>"); return }
        try {
          const res = await fetch("/api/chat/unban", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ username }),
          })
          if (!res.ok) throw new Error()
          appendLocalLine(`-- ${username} unbanned --`)
        } catch {
          appendLocalLine(`-- failed to unban ${username} --`)
        }
        return
      }

      if (cmd === "/kick") {
        if (!isAdmin) { appendLocalLine("-- /kick requires admin --"); return }
        const username = parts[1]
        if (!username) { appendLocalLine("usage: /kick <username>"); return }
        const targets = messages.slice(cleared).filter(
          m => m.profiles?.username?.toLowerCase() === username.toLowerCase() && !m.deleted_at
        )
        if (targets.length === 0) {
          appendLocalLine(`-- no messages from ${username} in view --`)
          return
        }
        let deleted = 0
        for (const m of targets) {
          try { await onDelete?.(m.id); deleted++ } catch { /* continue */ }
        }
        appendLocalLine(`-- kicked ${username}: deleted ${deleted} message${deleted === 1 ? "" : "s"} --`)
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
  }, [input, messages, currentUserId, currentUsername, roomId, accessToken, onSend, onDelete, onEdit, onPin, onBoot, onReact, isAdmin, shrugPending, showTimestamps, cleared, replyContext, lastReadTimestamp, mutedTyping, chatDensity, setChatDensity, chatFontScale, setChatFontScale])

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
      <div className={styles.terminalMessages}>
        <div className={styles.terminalLogoHeader}>
          {SPLASH_LOGO.map((l, i) => <div key={i}>{l}</div>)}
        </div>
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
                ) : (() => {
                  const { body, footnotes } = renderMessageBody(line.text)
                  return (
                    <>
                      <span className={styles.terminalBody}>{body}</span>
                      {footnotes.size > 0 && Array.from(footnotes.entries()).map(([idx, content]) => (
                        <span key={idx} className={styles.terminalReplyRef}>
                          <sup style={{ color: "#7a9fbf", fontSize: "0.7em" }}>{idx}</sup>{" "}{content}
                        </span>
                      ))}
                    </>
                  )
                })()}
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
                  const desc = COMMAND_DEFS[c] ?? OPTIONS_DEFS[c.replace("/options ", "").replace("/opt ", "")]
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
