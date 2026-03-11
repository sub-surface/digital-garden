import { forwardRef, type UIEventHandler } from "react"
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
  currentUserId?: string
}

// Two messages are in the same group if same user_id and within 5 minutes
function isSameGroup(a: ChatMessage, b: ChatMessage): boolean {
  if (a.user_id !== b.user_id) return false
  const diff = Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return diff < 5 * 60 * 1000
}

export const MessageList = forwardRef<HTMLDivElement, Props>(function MessageList(
  { messages, onReply, onScroll, onUsernameClick, onReact, onDelete, currentUserId },
  ref
) {
  return (
    <div className={styles.messageList} ref={ref} onScroll={onScroll}>
      {messages.map((msg, idx) => {
        const prev = idx > 0 ? messages[idx - 1] : null
        const compact = prev !== null && isSameGroup(prev, msg) && !msg.reply_to_message
        return (
          <MessageRow
            key={msg.id}
            msg={msg}
            compact={compact}
            onReply={onReply}
            onUsernameClick={onUsernameClick}
            onReact={onReact}
            onDelete={onDelete}
            isOwn={currentUserId ? msg.user_id === currentUserId : false}
            reactions={msg.reactions}
          />
        )
      })}
    </div>
  )
})
