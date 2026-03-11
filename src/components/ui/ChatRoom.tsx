import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { ChatMessage } from "@/types/chat"
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
}

export function ChatRoom({ roomId, roomName, accessToken, currentUserId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [popup, setPopup] = useState<{ username: string; anchor: HTMLElement } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  const broadcastTyping = useTypingBroadcast(roomId, currentUserId)

  // Track scroll position to determine if user is near bottom
  function handleScroll() {
    const el = listRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }

  function scrollToBottom() {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/chat/messages?room=${roomId}&limit=50`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return
      const data = await res.json() as { messages: ChatMessage[]; has_more: boolean }
      setMessages(data.messages ?? [])
      setHasMore(data.has_more ?? false)
    } catch {
      // Fetch failure — leave empty state
    } finally {
      setLoading(false)
    }
  }, [roomId, accessToken])

  async function loadMore() {
    if (!hasMore || loadingMore || messages.length === 0) return
    const oldest = messages[0].created_at
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/chat/messages?room=${roomId}&limit=50&before=${encodeURIComponent(oldest)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) return
      const data = await res.json() as { messages: ChatMessage[]; has_more: boolean }
      setMessages((prev) => [...(data.messages ?? []), ...prev])
      setHasMore(data.has_more ?? false)
    } catch {
      // Silently ignore load-more failure
    } finally {
      setLoadingMore(false)
    }
  }

  // Scroll to bottom after initial load
  useEffect(() => {
    if (!loading) {
      scrollToBottom()
    }
  }, [loading])

  // Scroll to bottom when new messages arrive (only if near bottom)
  useEffect(() => {
    if (messages.length > 0 && atBottomRef.current) {
      scrollToBottom()
    }
  }, [messages])

  // Fetch initial messages when room changes
  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Supabase Realtime subscription
  useEffect(() => {
    if (!supabase) return

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage
          setMessages((prev) => {
            // Avoid duplicates (optimistic inserts)
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    return () => {
      supabase?.removeChannel(channel)
    }
  }, [roomId])

  async function handleReact(messageId: string, emote: string) {
    // Determine toggle direction from current local state
    const msg = messages.find(m => m.id === messageId)
    const alreadyReacted = msg?.reactions?.find(r => r.emote === emote)?.reacted ?? false
    const method = alreadyReacted ? "DELETE" : "POST"

    // Optimistic update
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
    } catch { /* ignore */ }
  }

  async function handleDelete(messageId: string) {
    try {
      await fetch(`/api/chat/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      // Soft-delete: mark locally so UI updates immediately
      setMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, deleted_at: new Date().toISOString() } : m)
      )
    } catch { /* ignore */ }
  }

  async function handleSend(body: string, replyToId?: string) {
    try {
      await fetch("/api/chat/messages", {
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
      // Realtime will deliver the new message; no optimistic insert needed
    } catch {
      // POST failure — silently ignore for now
    }
    setReplyTo(null)
  }

  return (
    <>
      <div className={styles.chatRoomHeader}>
        <span>{roomName}</span>
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
        />
      )}

      {popup && (
        <MiniProfilePopup
          username={popup.username}
          anchorEl={popup.anchor}
          onClose={() => setPopup(null)}
        />
      )}

      {hasMore && !loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "0.25rem 0" }}>
          <button
            className={styles.loadMoreBtn}
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "loading…" : "load earlier messages"}
          </button>
        </div>
      )}

      <TypingIndicator roomId={roomId} currentUserId={currentUserId} />

      <MessageInput
        roomId={roomId}
        onSend={handleSend}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onTyping={broadcastTyping}
      />
    </>
  )
}
