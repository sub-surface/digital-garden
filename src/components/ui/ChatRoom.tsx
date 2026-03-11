import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { ChatMessage } from "@/types/chat"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"
import styles from "./Chat.module.scss"

interface Props {
  roomId: string
  roomName: string
  accessToken: string
}

export function ChatRoom({ roomId, roomName, accessToken }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

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

      <MessageInput
        roomId={roomId}
        onSend={handleSend}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </>
  )
}
