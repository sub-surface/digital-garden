import { useState, useEffect, useRef, useCallback } from "react"
import type { ChatMessage } from "@/types/chat"
import { useChatMessages } from "@/hooks/useChatMessages"
import { useChatScroll } from "@/hooks/useChatScroll"
import { useChatToast } from "@/hooks/useChatToast"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"
import { TypingIndicator, useTypingBroadcast } from "./TypingIndicator"
import { MiniProfilePopup } from "./MiniProfilePopup"
import styles from "./Chat.module.scss"

interface Props {
  roomId: string
  roomName: string
  accessToken: string
  currentUserId: string
  currentUsername: string | null
  currentAvatarUrl: string | null
}

export function ChatRoom({ roomId, roomName, accessToken, currentUserId, currentUsername, currentAvatarUrl }: Props) {
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [popup, setPopup] = useState<{ username: string; anchor: HTMLElement } | null>(null)
  const inputRef = useRef<{ focus: () => void }>(null)
  const lastReadRef = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { toast, showToast } = useChatToast()
  const broadcastTyping = useTypingBroadcast(roomId, currentUserId)

  const {
    messages,
    setMessages,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    prevScrollHeightRef,
  } = useChatMessages({ roomId, accessToken, currentUserId, currentUsername, currentAvatarUrl, listRef })

  // Persist last-read timestamp per room in localStorage
  useEffect(() => {
    lastReadRef.current = localStorage.getItem(`chat-lastread-${roomId}`)
  }, [roomId])

  const markAsRead = useCallback(() => {
    if (messages.length === 0) return
    const latest = messages[messages.length - 1].created_at
    const key = `chat-lastread-${roomId}`
    localStorage.setItem(key, latest)
    lastReadRef.current = latest
  }, [messages, roomId])

  const { atBottom, handleScroll, scrollToBottom } = useChatScroll({
    listRef,
    messages,
    loading,
    hasMore,
    loadMore,
    prevScrollHeightRef,
    onAtBottom: markAsRead,
  })

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "TEXTAREA" || target.tagName === "INPUT"

      if (e.key === "Escape") {
        if (replyTo) { setReplyTo(null); return }
        if (popup) { setPopup(null); return }
      }

      if (isInput) return

      if (e.key === "/") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [replyTo, popup])

  async function handleReact(messageId: string, emote: string) {
    const msg = messages.find(m => m.id === messageId)
    const alreadyReacted = msg?.reactions?.find(r => r.emote === emote)?.reacted ?? false
    const method = alreadyReacted ? "DELETE" : "POST"

    // Store previous state for rollback
    const prevMessages = messages

    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const reactions = [...(m.reactions ?? [])]
      const idx = reactions.findIndex(r => r.emote === emote)
      if (alreadyReacted) {
        if (idx === -1) return m
        const updated = { ...reactions[idx], count: reactions[idx].count - 1, reacted: false }
        return { ...m, reactions: updated.count <= 0 ? reactions.filter((_, i) => i !== idx) : reactions.map((r, i) => i === idx ? updated : r) }
      } else {
        if (idx === -1) return { ...m, reactions: [...reactions, { emote, count: 1, reacted: true }] }
        return { ...m, reactions: reactions.map((r, i) => i === idx ? { ...r, count: r.count + 1, reacted: true } : r) }
      }
    }))

    try {
      await fetch("/api/chat/reactions", {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ message_id: messageId, emote }),
      })
    } catch {
      setMessages(prevMessages)
      showToast("Reaction failed")
    }
  }

  async function handleDelete(messageId: string) {
    try {
      const res = await fetch(`/api/chat/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error()
      setMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, deleted_at: new Date().toISOString() } : m)
      )
    } catch {
      showToast("Failed to delete message")
    }
  }

  async function handleSend(body: string, replyToId?: string) {
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          room_id: roomId,
          body,
          reply_to: replyToId ?? null,
        }),
      })
      if (!res.ok) throw new Error()
    } catch {
      showToast("Failed to send message")
    }
    setReplyTo(null)
  }

  return (
    <>
      <div className={styles.chatRoomHeader}>
        <div className={styles.chatContentWrapper}>
          <span>{roomName}</span>
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>loading messages…</div>
      ) : (
        <MessageList
          ref={listRef}
          messages={messages}
          onReply={setReplyTo}
          onScroll={handleScroll}
          onReact={handleReact}
          onDelete={handleDelete}
          currentUserId={currentUserId}
          onUsernameClick={(username, el) => setPopup({ username, anchor: el })}
          lastReadTimestamp={lastReadRef.current}
          loadingMore={loadingMore}
        />
      )}

      {popup && (
        <MiniProfilePopup
          username={popup.username}
          anchorEl={popup.anchor}
          onClose={() => setPopup(null)}
        />
      )}

      {toast && <div className={styles.chatToast}>{toast}</div>}

      <button
        className={`${styles.scrollToBottom} ${!atBottom ? styles.scrollToBottomVisible : ""}`}
        onClick={() => { scrollToBottom(); markAsRead() }}
        aria-label="Scroll to bottom"
      >
        ↓
      </button>

      <TypingIndicator roomId={roomId} currentUserId={currentUserId} />

      <MessageInput
        ref={inputRef}
        roomId={roomId}
        onSend={handleSend}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onTyping={broadcastTyping}
      />
    </>
  )
}
