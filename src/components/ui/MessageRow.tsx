import { useState } from "react"
import type { ChatMessage } from "@/types/chat"
import { parseMessageBody } from "@/lib/parseMessageBody"
import styles from "./Chat.module.scss"

interface Props {
  msg: ChatMessage
  compact?: boolean
  onReply: (msg: ChatMessage) => void
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

function MessageBodyRenderer({ body }: { body: string }) {
  const tokens = parseMessageBody(body)
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.type === "text") return <span key={i}>{tok.value}</span>
        if (tok.type === "emote") return (
          <img key={i} src={`/emotes/${tok.name}.gif`} alt={`:${tok.name}:`} className={styles.emote}
            onError={(e) => { (e.currentTarget as HTMLImageElement).replaceWith(document.createTextNode(`:${tok.name}:`)) }}
          />
        )
        if (tok.type === "image") return (
          <img key={i} src={tok.url} alt="" className={styles.embedImg}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
          />
        )
        if (tok.type === "youtube") return <YouTubeThumbnail key={i} videoId={tok.videoId} url={tok.url} />
        if (tok.type === "url") return (
          <a key={i} href={tok.url} target="_blank" rel="noopener noreferrer" className={styles.msgLink}>
            {tok.label}
          </a>
        )
        return null
      })}
    </>
  )
}

export function MessageRow({ msg, compact = false, onReply }: Props) {
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
            <span className={styles.username}>{username}</span>
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
          <div className={styles.messageBody}>
            <MessageBodyRenderer body={msg.body} />
          </div>
        )}
      </div>

      {!msg.deleted_at && (
        <button
          className={styles.replyBtn}
          onClick={() => onReply(msg)}
          aria-label="Reply"
        >
          reply
        </button>
      )}
    </div>
  )
}
