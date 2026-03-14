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
  currentUsername: string | null
  currentAvatarUrl: string | null
}

export function ChatRoom({ roomId, roomName, accessToken, currentUserId, currentUsername, currentAvatarUrl }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [popup, setPopup] = useState<{ username: string; anchor: HTMLElement } | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const lastReadRef = useRef<string | null>(null)
  const inputRef = useRef<{ focus: () => void }>(null)

  const broadcastTyping = useTypingBroadcast(roomId, currentUserId)

  // Persist last-read timestamp per room in localStorage
  useEffect(() => {
    const key = `chat-lastread-${roomId}`
    lastReadRef.current = localStorage.getItem(key)
  }, [roomId])

  function markAsRead() {
    if (messages.length === 0) return
    const latest = messages[messages.length - 1].created_at
    const key = `chat-lastread-${roomId}`
    localStorage.setItem(key, latest)
    lastReadRef.current = latest
  }

  // Track scroll position + auto-load older messages on scroll to top
  function handleScroll() {
    const el = listRef.current
    if (!el) return
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    atBottomRef.current = isBottom
    setAtBottom(isBottom)
    if (isBottom) markAsRead()

    // Auto-load when scrolled near top
    if (el.scrollTop < 150 && hasMore && !loadingMore) {
      loadMore()
    }
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
      setMessages((data.messages ?? []).reverse())
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
    const el = listRef.current
    const prevScrollHeight = el?.scrollHeight ?? 0
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/chat/messages?room=${roomId}&limit=50&before=${encodeURIComponent(oldest)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) return
      const data = await res.json() as { messages: ChatMessage[]; has_more: boolean }
      setMessages((prev) => [...(data.messages ?? []).reverse(), ...prev])
      setHasMore(data.has_more ?? false)

      // Preserve scroll position after prepending older messages
      requestAnimationFrame(() => {
        if (el) {
          el.scrollTop = el.scrollHeight - prevScrollHeight
        }
      })
    } catch {
      // Silently ignore load-more failure
    } finally {
      setLoadingMore(false)
    }
  }

  // Scroll to bottom after initial load + mark as read
  useEffect(() => {
    if (!loading) {
      scrollToBottom()
      markAsRead()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Scroll to bottom when new messages arrive (only if near bottom)
  useEffect(() => {
    if (messages.length > 0 && atBottomRef.current) {
      scrollToBottom()
      markAsRead()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        async (payload) => {
          const newMsg = payload.new as ChatMessage
          let enriched: ChatMessage
          if (newMsg.user_id === currentUserId) {
            enriched = { ...newMsg, profiles: { username: currentUsername ?? "unknown", avatar_url: currentAvatarUrl }, reactions: [] }
          } else {
            try {
              const res = await fetch(`/api/chat/messages?room=${roomId}&limit=10`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              })
              if (res.ok) {
                const data = await res.json() as { messages: ChatMessage[] }
                const found = data.messages.find(m => m.id === newMsg.id)
                enriched = found ?? { ...newMsg, profiles: null, reactions: [] }
              } else {
                enriched = { ...newMsg, profiles: null, reactions: [] }
              }
            } catch {
              enriched = { ...newMsg, profiles: null, reactions: [] }
            }
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === enriched.id)) return prev
            return [...prev, enriched]
          })
        }
      )
      .subscribe()

    return () => {
      supabase?.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "TEXTAREA" || target.tagName === "INPUT"

      // Escape: clear reply, close popup
      if (e.key === "Escape") {
        if (replyTo) { setReplyTo(null); return }
        if (popup) { setPopup(null); return }
      }

      // Don't intercept when typing in an input
      if (isInput) return

      // / to focus message input
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
    } catch {
      // POST failure — silently ignore for now
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
        <>
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
        </>
      )}

      {popup && (
        <MiniProfilePopup
          username={popup.username}
          anchorEl={popup.anchor}
          onClose={() => setPopup(null)}
        />
      )}

      {/* Scroll-to-bottom FAB */}
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
