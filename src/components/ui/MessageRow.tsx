import { useState, useRef, useEffect, type ReactNode } from "react"
import { getEmoteColor } from "@/lib/emoteColor"
import { createPortal } from "react-dom"
import type { ChatMessage, ChatReaction } from "@/types/chat"
import { parseMessageBody, parseMessageBodyWithFootnotes } from "@/lib/parseMessageBody"
import { type EmoteEntry, fetchEmoteIndex, getEmoteCache, emoteSrc } from "@/lib/emoteIndex"
import { ImageLightbox } from "./ImageLightbox"
import { EmotePopup } from "./EmotePopup"
import styles from "./Chat.module.scss"

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

function useEmoteIndex() {
  const [emotes, setEmotes] = useState<EmoteEntry[]>(getEmoteCache() ?? FALLBACK_EMOTES)

  useEffect(() => {
    const cached = getEmoteCache()
    if (cached) { setEmotes(cached); return }
    let alive = true
    fetchEmoteIndex().then(() => {
      if (alive) setEmotes(getEmoteCache() ?? FALLBACK_EMOTES)
    })
    return () => { alive = false }
  }, [])

  return emotes
}

interface Props {
  msg: ChatMessage
  compact?: boolean
  onReply: (msg: ChatMessage) => void
  onReact?: (messageId: string, emote: string) => void
  onDelete?: (messageId: string) => void
  onEdit?: (messageId: string, newBody: string) => void
  onCancelEdit?: () => void
  onPin?: (messageId: string) => void
  isAdmin?: boolean
  isOwn?: boolean
  isEditing?: boolean
  reactions?: ChatReaction[]
}

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    return days[new Date(iso).getDay()]
  }
  const d = new Date(iso)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[d.getMonth()]} ${d.getDate()}`
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

function YouTubeThumbnail({ videoId, url }: { videoId: string; url: string }) {
  const [loaded, setLoaded] = useState(false)
  return loaded ? (
    <iframe
      className={styles.embedIframe}
      src={`https://www.youtube.com/embed/${videoId}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  ) : (
    <button className={styles.ytThumb} onClick={() => setLoaded(true)} aria-label="Play video">
      <img
        src={`https://img.youtube.com/vi/${videoId}/0.jpg`}
        alt="YouTube thumbnail"
        className={styles.embedImg}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
      />
      <span className={styles.ytPlay}>&#9654;</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className={styles.ytLink} onClick={e => e.stopPropagation()}>
        {url}
      </a>
    </button>
  )
}

function VideoEmbed({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  function handlePlay() {
    setPlaying(true)
    // Wait for state update then play
    requestAnimationFrame(() => videoRef.current?.play())
  }

  return (
    <div className={styles.videoWrap}>
      <video
        ref={videoRef}
        className={styles.embedImg}
        src={url}
        preload="metadata"
        controls={playing}
        playsInline
        onError={(e) => { (e.currentTarget as HTMLVideoElement).style.display = "none" }}
      />
      {!playing && (
        <button className={styles.videoPlayOverlay} onClick={handlePlay} aria-label="Play video">
          <span className={styles.ytPlay}>&#9654;</span>
        </button>
      )}
    </div>
  )
}

function LazyEmbed({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={className}>
      {visible ? children : null}
    </div>
  )
}

function renderInlineSnippet(body: string, maxLen: number): ReactNode[] {
  const truncated = body.length > maxLen ? body.slice(0, maxLen) + "..." : body
  const tokens = parseMessageBody(truncated)
  return tokens.map((tok, i) => {
    if (tok.type === "emote") {
      return (
        <img
          key={i}
          src={emoteSrc(tok.name)}
          alt={`:${tok.name}:`}
          className={styles.emote}
          style={{ height: "1em" }}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement
            img.replaceWith(document.createTextNode(`:${tok.name}:`))
          }}
        />
      )
    }
    if (tok.type === "text") return <span key={i}>{tok.value}</span>
    if (tok.type === "url") return <span key={i}>{tok.label}</span>
    return null
  })
}

function isEmoteOnly(body: string): boolean {
  const trimmed = body.trim()
  return /^:[a-zA-Z0-9_-]+:$/.test(trimmed)
}

function MessageBodyRenderer({
  body,
  onImageClick,
  onEmoteClick,
}: {
  body: string
  onImageClick?: (src: string) => void
  onEmoteClick?: (name: string, src: string, e: React.MouseEvent) => void
}) {
  // Extract footnote definitions before processing
  const footnotes = new Map<number, string>()
  const cleanLines: string[] = []
  for (const line of body.split("\n")) {
    const defMatch = /^\[\^(\d+)\]:\s*(.+)$/.exec(line.trim())
    if (defMatch) {
      footnotes.set(Number(defMatch[1]), defMatch[2])
    } else {
      cleanLines.push(line)
    }
  }
  const cleanBody = cleanLines.join("\n")

  function renderInlineTokens(text: string, keyPrefix: string) {
    const tokens = parseMessageBody(text)
    return tokens.map((tok, i) => {
      const key = `${keyPrefix}-${i}`
      if (tok.type === "text") return <span key={key}>{tok.value}</span>
      if (tok.type === "footnote-ref") return (
        <sup key={key} className={styles.footnoteRef}>{tok.index}</sup>
      )
      if (tok.type === "emote") {
        const src = emoteSrc(tok.name)
        return (
          <img
            key={key}
            src={src}
            alt={`:${tok.name}:`}
            className={styles.emote}
            style={{ cursor: "pointer" }}
            onClick={(e) => onEmoteClick?.(tok.name, src, e)}
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement
              img.replaceWith(document.createTextNode(`:${tok.name}:`))
            }}
          />
        )
      }
      if (tok.type === "image") return (
        <LazyEmbed key={key}>
          <img
            src={tok.url}
            alt=""
            className={styles.embedImg}
            style={{ cursor: "zoom-in" }}
            onClick={() => onImageClick?.(tok.url)}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
          />
        </LazyEmbed>
      )
      if (tok.type === "youtube") return (
        <LazyEmbed key={key}>
          <YouTubeThumbnail videoId={tok.videoId} url={tok.url} />
        </LazyEmbed>
      )
      if (tok.type === "video") return (
        <LazyEmbed key={key}>
          <VideoEmbed url={tok.url} />
        </LazyEmbed>
      )
      if (tok.type === "twitter") return (
        <a key={key} href={tok.url} target="_blank" rel="noopener noreferrer" className={styles.twitterCard}>
          <span className={styles.twitterCardIcon}>{"\u{1D54F}"}</span>
          <span className={styles.twitterCardUser}>@{tok.username}</span>
          <span className={styles.twitterCardLink}>{tok.url}</span>
        </a>
      )
      if (tok.type === "url") return (
        <a key={key} href={tok.url} target="_blank" rel="noopener noreferrer" className={styles.msgLink}>
          {tok.label}
        </a>
      )
      return null
    })
  }

  const lines = cleanBody.split("\n")
  const nodes: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const h1 = line.match(/^# (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    const bq = line.match(/^> (.*)/)
    if (h1) {
      nodes.push(<h1 key={i}>{h1[1]}</h1>)
    } else if (h2) {
      nodes.push(<h2 key={i}>{h2[1]}</h2>)
    } else if (h3) {
      nodes.push(<h3 key={i}>{h3[1]}</h3>)
    } else if (bq) {
      nodes.push(<blockquote key={i}>{bq[1]}</blockquote>)
    } else {
      nodes.push(<span key={i}>{renderInlineTokens(line, String(i))}{i < lines.length - 1 ? "\n" : ""}</span>)
    }
    i++
  }
  const sidenoteEntries = Array.from(footnotes.entries())

  if (footnotes.size === 0) {
    return <div>{nodes}</div>
  }

  return (
    <div className={styles.messageWithSidenotes}>
      <div className={styles.messageBodyCol}>{nodes}</div>
      <aside className={styles.sidenotes}>
        {sidenoteEntries.map(([idx, content]) => (
          <div key={idx} className={styles.sidenote}>
            <sup className={styles.sidenoteNum}>{idx}</sup>
            <span className={styles.sidenoteText}>{content}</span>
          </div>
        ))}
      </aside>
      <div className={styles.sidenotesMobile}>
        {sidenoteEntries.map(([idx, content]) => (
          <details key={idx}>
            <summary>note {idx}</summary>
            {content}
          </details>
        ))}
      </div>
    </div>
  )
}

export function MessageRow({ msg, compact = false, onReply, onReact, onDelete, onEdit, onCancelEdit, onPin, isAdmin, isOwn, isEditing: isEditingProp, reactions, onUsernameClick }: Props & { onUsernameClick?: (username: string, el: HTMLElement) => void }) {
  const username = msg.profiles?.username ?? "unknown"
  const avatarUrl = msg.profiles?.avatar_url ?? null
  const nameColor = msg.profiles?.name_color?.match(/^#[0-9a-fA-F]{3,8}$/)
    ? msg.profiles.name_color
    : undefined

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [emotePopup, setEmotePopup] = useState<{ name: string; src: string; x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState("")
  const editRef = useRef<HTMLTextAreaElement>(null)
  const [reactPickerOpen, setReactPickerOpen] = useState(false)
  const [reactFilter, setReactFilter] = useState("")
  const reactBtnRef = useRef<HTMLButtonElement>(null)
  const reactPickerRef = useRef<HTMLDivElement>(null)
  const allEmotes = useEmoteIndex()

  const [glowColor, setGlowColor] = useState<string | null>(null)
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function triggerGlow(emote: string) {
    const color = await getEmoteColor(emote)
    setGlowColor(color)
    if (glowTimerRef.current) clearTimeout(glowTimerRef.current)
    glowTimerRef.current = setTimeout(() => setGlowColor(null), 900)
  }

  useEffect(() => () => {
    if (glowTimerRef.current) clearTimeout(glowTimerRef.current)
  }, [])

  // External trigger (up-arrow from MessageInput)
  useEffect(() => {
    if (isEditingProp && !editing) startEdit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditingProp])

  useEffect(() => {
    if (editing && editRef.current) {
      const el = editRef.current
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
      // Auto-size to content
      el.style.height = "auto"
      el.style.height = el.scrollHeight + "px"
    }
  }, [editing])

  // Close react picker on outside click
  useEffect(() => {
    if (!reactPickerOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (reactPickerRef.current && !reactPickerRef.current.contains(e.target as Node) &&
          reactBtnRef.current && !reactBtnRef.current.contains(e.target as Node)) {
        setReactPickerOpen(false)
        setReactFilter("")
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [reactPickerOpen])

  function startEdit() {
    setEditBody(msg.body)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    onCancelEdit?.()
  }

  function submitEdit() {
    const trimmed = editBody.trim()
    if (!trimmed || trimmed === msg.body) {
      cancelEdit()
      return
    }
    onEdit?.(msg.id, trimmed)
    setEditing(false)
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submitEdit()
    }
    if (e.key === "Escape") {
      cancelEdit()
    }
  }

  function scrollToReply() {
    if (!msg.reply_to_message) return
    const target = document.querySelector(`[data-message-id="${msg.reply_to_message.id}"]`) as HTMLElement | null
    if (!target) return
    target.scrollIntoView({ behavior: "smooth", block: "center" })
    target.classList.add(styles.messageHighlight)
    setTimeout(() => target.classList.remove(styles.messageHighlight), 1500)
  }

  return (
    <div
      className={styles.messageRow}
      data-message-id={msg.id}
      style={glowColor ? { "--glow-color": glowColor } as React.CSSProperties : undefined}
      data-glow={glowColor ? "1" : undefined}
    >
      {compact ? (
        <div className={styles.avatarPlaceholder} />
      ) : (
        <div className={styles.avatar}>
          {avatarUrl ? (
            <img className={styles.avatarImg} src={avatarUrl} alt={username} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }} />
          ) : (
            getInitials(username)
          )}
        </div>
      )}

      <div className={styles.messageContent}>
        {!compact && (
          <div className={styles.messageHeader}>
            <button
              className={styles.username}
              style={nameColor ? { color: nameColor } : undefined}
              onClick={(e) => onUsernameClick?.(username, e.currentTarget)}
            >
              {username}
            </button>
            <span className={styles.timestamp}>{formatRelativeTime(msg.created_at)}</span>
          </div>
        )}

        {msg.reply_to_message && (
          <button className={styles.replyBar} onClick={scrollToReply} type="button">
            <strong>@{msg.reply_to_message.profiles?.username ?? "unknown"}</strong>:{" "}
            {renderInlineSnippet(msg.reply_to_message.body, 80)}
          </button>
        )}

        {msg.deleted_at ? (
          <span className={styles.deleted}>[message deleted]</span>
        ) : editing ? (
          <div className={styles.editArea}>
            <textarea
              ref={editRef}
              className={styles.editTextarea}
              value={editBody}
              onChange={(e) => {
                setEditBody(e.target.value)
                e.target.style.height = "auto"
                e.target.style.height = e.target.scrollHeight + "px"
              }}
              onKeyDown={handleEditKeyDown}
              rows={1}
              maxLength={2000}
            />
            <div className={styles.editHint}>enter to save · esc to cancel</div>
          </div>
        ) : (
          <div className={isEmoteOnly(msg.body) ? styles.messageBodyEmoteOnly : styles.messageBody}>
            <MessageBodyRenderer
              body={msg.body}
              onImageClick={(src) => setLightboxSrc(src)}
              onEmoteClick={(name, src, e) => setEmotePopup({ name, src, x: e.clientX, y: e.clientY })}
            />
            {msg.edited_at && <span className={styles.editedTag}>(edited)</span>}
          </div>
        )}

        {reactions && reactions.length > 0 && (
          <div className={styles.reactionStrip}>
            {reactions.map((r) => (
              <button
                key={r.emote}
                className={`${styles.reactionBtn} ${r.reacted ? styles.reactionBtnActive : ""}`}
                onClick={() => { onReact?.(msg.id, r.emote); triggerGlow(r.emote) }}
                title={r.emote}
              >
                <img src={emoteSrc(r.emote)} alt={r.emote} className={styles.reactionEmote}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none"
                  }}
                />
                {r.count > 1 && <span>{r.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {!msg.deleted_at && (
        <div className={styles.msgActions}>
          <button
            ref={reactBtnRef}
            className={styles.replyBtn}
            onClick={() => setReactPickerOpen(v => !v)}
            aria-label="React"
          >+</button>
          <button className={styles.replyBtn} onClick={() => onReply(msg)} aria-label="Reply">reply</button>
          {isOwn && (
            <button className={styles.replyBtn} onClick={startEdit} aria-label="Edit">edit</button>
          )}
          {isAdmin && (
            <button className={styles.replyBtn} onClick={() => onPin?.(msg.id)} aria-label={msg.pinned_at ? "Unpin" : "Pin"}>
              {msg.pinned_at ? "unpin" : "pin"}
            </button>
          )}
          {(isOwn || isAdmin) && (
            <button className={styles.deleteBtn} onClick={() => onDelete?.(msg.id)} aria-label="Delete">del</button>
          )}
        </div>
      )}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {emotePopup && (
        <EmotePopup
          name={emotePopup.name}
          src={emotePopup.src}
          anchor={{ x: emotePopup.x, y: emotePopup.y }}
          onClose={() => setEmotePopup(null)}
        />
      )}

      {reactPickerOpen && reactBtnRef.current && createPortal(
        (() => {
          const rect = reactBtnRef.current!.getBoundingClientRect()
          const pickerWidth = 220
          const left = Math.min(rect.left, window.innerWidth - pickerWidth - 8)
          const filtered = reactFilter.trim()
            ? allEmotes.filter(e => e.name.includes(reactFilter.trim().toLowerCase()))
            : allEmotes
          return (
            <div
              ref={reactPickerRef}
              className={styles.reactPicker}
              style={{ top: rect.bottom + 4, left }}
            >
              <input
                className={styles.reactPickerFilter}
                type="text"
                placeholder="filter..."
                value={reactFilter}
                onChange={(e) => setReactFilter(e.target.value)}
                autoComplete="off"
                autoFocus
              />
              <div className={styles.reactPickerGrid}>
                {filtered.map(emote => (
                  <button
                    key={emote.name}
                    className={styles.reactPickerBtn}
                    onClick={() => {
                      onReact?.(msg.id, emote.name)
                      triggerGlow(emote.name)
                      setReactPickerOpen(false)
                      setReactFilter("")
                    }}
                    title={`:${emote.name}:`}
                  >
                    <img
                      src={`/emotes/${emote.name}.${emote.ext}`}
                      alt={`:${emote.name}:`}
                      className={styles.reactPickerEmote}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement
                        if (!img.dataset.pngFallback) {
                          img.dataset.pngFallback = "1"
                          img.src = `/emotes/${emote.name}.png`
                        }
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )
        })(),
        document.body
      )}
    </div>
  )
}
