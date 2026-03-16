import { forwardRef, type UIEventHandler, type ReactNode } from "react"
import type { ChatMessage } from "@/types/chat"
import { MessageRow } from "./MessageRow"
import styles from "./Chat.module.scss"

interface Props {
  messages: ChatMessage[]
  onReply: (msg: ChatMessage) => void
  onScroll?: UIEventHandler<HTMLDivElement>
  onUsernameClick?: (username: string, el: HTMLElement) => void
  onReact?: (messageId: string, emote: string) => void
  onDelete?: (messageId: string) => void
  onEdit?: (messageId: string, newBody: string) => void
  onPin?: (messageId: string) => void
  isAdmin?: boolean
  currentUserId?: string
  editingMessageId?: string | null
  onCancelEdit?: () => void
  lastReadTimestamp?: string | null
  loadingMore?: boolean
}

// Two messages are in the same group if same user_id and within 5 minutes
function isSameGroup(a: ChatMessage, b: ChatMessage): boolean {
  if (a.user_id !== b.user_id) return false
  const diff = Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return diff < 5 * 60 * 1000
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    return days[d.getDay()]
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function getDayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export const MessageList = forwardRef<HTMLDivElement, Props>(function MessageList(
  { messages, onReply, onScroll, onUsernameClick, onReact, onDelete, onEdit, onPin, isAdmin, currentUserId, editingMessageId, onCancelEdit, lastReadTimestamp, loadingMore },
  ref
) {
  const nodes: ReactNode[] = []
  let prevDayKey = ""
  let unreadInserted = false

  for (let idx = 0; idx < messages.length; idx++) {
    const msg = messages[idx]
    const dayKey = getDayKey(msg.created_at)

    // Day separator
    if (dayKey !== prevDayKey) {
      nodes.push(
        <div key={`day-${dayKey}`} className={styles.daySeparator}>
          {formatDayLabel(msg.created_at)}
        </div>
      )
      prevDayKey = dayKey
    }

    // Unread marker — insert before first message newer than lastReadTimestamp
    if (lastReadTimestamp && !unreadInserted && msg.created_at > lastReadTimestamp) {
      nodes.push(
        <div key="unread-marker" className={styles.unreadMarker}>
          new
        </div>
      )
      unreadInserted = true
    }

    const prev = idx > 0 ? messages[idx - 1] : null
    // Don't compact across day boundaries
    const sameDay = prev ? getDayKey(prev.created_at) === dayKey : false
    const compact = prev !== null && sameDay && isSameGroup(prev, msg) && !msg.reply_to_message

    nodes.push(
      <MessageRow
        key={msg.id}
        msg={msg}
        compact={compact}
        onReply={onReply}
        onUsernameClick={onUsernameClick}
        onReact={onReact}
        onDelete={onDelete}
        onEdit={onEdit}
        onPin={onPin}
        isAdmin={isAdmin}
        isOwn={currentUserId ? msg.user_id === currentUserId : false}
        isEditing={editingMessageId === msg.id}
        onCancelEdit={onCancelEdit}
        reactions={msg.reactions}
      />
    )
  }

  return (
    <div className={styles.messageList} ref={ref} onScroll={onScroll} data-chat-scroll>
      <div className={styles.messageListInner}>
        {loadingMore && (
          <div className={styles.loadMoreBtn} style={{ alignSelf: "center", cursor: "default" }}>
            loading…
          </div>
        )}
        {nodes}
      </div>
    </div>
  )
})
