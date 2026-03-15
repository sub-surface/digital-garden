import { useState, useRef, useEffect, type ReactNode } from "react"
import type { ChatMessage, ChatReaction } from "@/types/chat"
import { parseMessageBody } from "@/lib/parseMessageBody"
import styles from "./Chat.module.scss"

interface Props {
  msg: ChatMessage
  compact?: boolean
  onReply: (msg: ChatMessage) => void
  onReact?: (messageId: string, emote: string) => void
  onDelete?: (messageId: string) => void
  isOwn?: boolean
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
      <span className={styles.ytPlay}>▶</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className={styles.ytLink} onClick={e => e.stopPropagation()}>
        {url}
      </a>
    </button>
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

function renderInlineTokens(text: string, keyPrefix: string) {
  const tokens = parseMessageBody(text)
  return tokens.map((tok, i) => {
    const key = `${keyPrefix}-${i}`
    if (tok.type === "text") return <span key={key}>{tok.value}</span>
    if (tok.type === "emote") return (
      <img key={key} src={`/emotes/${tok.name}.gif`} alt={`:${tok.name}:`} className={styles.emote}
        onError={(e) => {
          const img = e.currentTarget as HTMLImageElement
          if (!img.dataset.pngFallback) {
            img.dataset.pngFallback = "1"
            img.src = `/emotes/${tok.name}.png`
          } else {
            img.replaceWith(document.createTextNode(`:${tok.name}:`))
          }
        }}
      />
    )
    if (tok.type === "image") return (
      <LazyEmbed key={key}>
        <img src={tok.url} alt="" className={styles.embedImg}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
        />
      </LazyEmbed>
    )
    if (tok.type === "youtube") return (
      <LazyEmbed key={key}>
        <YouTubeThumbnail videoId={tok.videoId} url={tok.url} />
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

function isEmoteOnly(body: string): boolean {
  const trimmed = body.trim()
  return /^:[a-zA-Z0-9_-]+:$/.test(trimmed)
}

function MessageBodyRenderer({ body }: { body: string }) {
  const lines = body.split("\n")
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
  return <>{nodes}</>
}

export function MessageRow({ msg, compact = false, onReply, onReact, onDelete, isOwn, reactions, onUsernameClick }: Props & { onUsernameClick?: (username: string, el: HTMLElement) => void }) {
  const username = msg.profiles?.username ?? "unknown"
  const avatarUrl = msg.profiles?.avatar_url ?? null

  return (
    <div className={styles.messageRow}>
      {compact ? (
        <div className={styles.avatarPlaceholder} />
      ) : (
        <div className={styles.avatar}>
          {avatarUrl ? (
            <img className={styles.avatarImg} src={avatarUrl} alt={username} />
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
              onClick={(e) => onUsernameClick?.(username, e.currentTarget)}
            >
              {username}
            </button>
            <span className={styles.timestamp}>{formatRelativeTime(msg.created_at)}</span>
          </div>
        )}

        {msg.reply_to_message && (
          <div className={styles.replyBar}>
            <strong>@{msg.reply_to_message.profiles?.username ?? "unknown"}</strong>:{" "}
            {msg.reply_to_message.body.slice(0, 80)}
            {msg.reply_to_message.body.length > 80 ? "…" : ""}
          </div>
        )}

        {msg.deleted_at ? (
          <span className={styles.deleted}>[message deleted]</span>
        ) : (
          <div className={isEmoteOnly(msg.body) ? styles.messageBodyEmoteOnly : styles.messageBody}>
            <MessageBodyRenderer body={msg.body} />
          </div>
        )}

        {reactions && reactions.length > 0 && (
          <div className={styles.reactionStrip}>
            {reactions.map((r) => (
              <button
                key={r.emote}
                className={`${styles.reactionBtn} ${r.reacted ? styles.reactionBtnActive : ""}`}
                onClick={() => onReact?.(msg.id, r.emote)}
                title={r.emote}
              >
                <img src={`/emotes/${r.emote}.gif`} alt={r.emote} className={styles.reactionEmote}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                />
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!msg.deleted_at && (
        <div className={styles.msgActions}>
          <button className={styles.stonkBtn} onClick={() => onReact?.(msg.id, "stonk")} aria-label="Stonk">▲</button>
          <button className={styles.replyBtn} onClick={() => onReply(msg)} aria-label="Reply">reply</button>
          {isOwn && (
            <button className={styles.deleteBtn} onClick={() => onDelete?.(msg.id)} aria-label="Delete">del</button>
          )}
        </div>
      )}
    </div>
  )
}
