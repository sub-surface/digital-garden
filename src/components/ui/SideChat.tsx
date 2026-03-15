import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/hooks/useAuth"
import { useStore } from "@/store"
import { parseMessageBody } from "@/lib/parseMessageBody"
import { WikiAuthModal } from "./WikiAuthModal"
import type { ChatMessage, ChatRoom } from "@/types/chat"
import styles from "./SideChat.module.scss"

const GENERAL_ROOM_NAME = "general"

function SideChatMessage({ msg }: { msg: ChatMessage }) {
  const username = msg.profiles?.username ?? "unknown"
  const tokens = parseMessageBody(msg.body)

  return (
    <div className={styles.msg}>
      {msg.deleted_at ? (
        <span className={styles.deleted}>[deleted]</span>
      ) : (
        <>
          <span className={styles.user}>{username}</span>
          <span className={styles.sep}>: </span>
          <span className={styles.text}>
            {tokens.map((tok, i) => {
              if (tok.type === "text") return <span key={i}>{tok.value}</span>
              if (tok.type === "emote") return (
                <img key={i} src={`/emotes/${tok.name}.gif`} alt={`:${tok.name}:`} className={styles.emote}
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
              if (tok.type === "url") return (
                <a key={i} href={tok.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {tok.label}
                </a>
              )
              return null
            })}
          </span>
        </>
      )}
    </div>
  )
}

export function SideChat() {
  const isOpen = useStore((s) => s.isSideChatOpen)
  const setSideChatOpen = useStore((s) => s.setSideChatOpen)
  const { session } = useAuth()
  const [showAuth, setShowAuth] = useState(false)

  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [body, setBody] = useState("")
  const [loadingMore, setLoadingMore] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const prevScrollHeightRef = useRef(0)

  // Fetch the general room ID
  useEffect(() => {
    if (!isOpen || !session) return
    fetch("/api/chat/rooms", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data: { rooms: ChatRoom[] }) => {
        const general = (data.rooms ?? []).find(r => r.name === GENERAL_ROOM_NAME)
        if (general) setRoom(general)
      })
      .catch(() => {})
  }, [isOpen, session])

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!room || !session) return
    setLoading(true)
    try {
      const res = await fetch(`/api/chat/messages?room=${room.id}&limit=50`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { messages: ChatMessage[]; has_more: boolean }
      setMessages((data.messages ?? []).reverse())
      setHasMore(data.has_more ?? false)
    } catch {} finally {
      setLoading(false)
    }
  }, [room, session])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  // Scroll to bottom after load
  useEffect(() => {
    if (!loading) {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [loading])

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0 && atBottomRef.current) {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Scroll position restore after load-more
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || prevScrollHeightRef.current === 0) return
    const newH = el.scrollHeight
    if (newH > prevScrollHeightRef.current) {
      el.scrollTop = newH - prevScrollHeightRef.current
      prevScrollHeightRef.current = 0
    }
  }, [messages])

  // Realtime subscription
  useEffect(() => {
    if (!supabase || !room || !session) return
    const channel = supabase
      .channel(`sidechat:${room.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `room_id=eq.${room.id}`,
      }, async (payload) => {
        const newMsg = payload.new as ChatMessage
        // Enrich
        try {
          const res = await fetch(`/api/chat/messages?room=${room.id}&limit=10`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          if (res.ok) {
            const data = await res.json() as { messages: ChatMessage[] }
            const found = data.messages.find(m => m.id === newMsg.id)
            const enriched = found ?? { ...newMsg, profiles: null, reactions: [] }
            setMessages(prev => prev.some(m => m.id === enriched.id) ? prev : [...prev, enriched])
          }
        } catch {
          setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, { ...newMsg, profiles: null, reactions: [] }])
        }
      })
      .subscribe()

    return () => { supabase?.removeChannel(channel) }
  }, [room, session])

  function handleScroll() {
    const el = listRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (el.scrollTop < 100 && hasMore && !loadingMoreRef.current) {
      loadMoreMessages()
    }
  }

  async function loadMoreMessages() {
    if (!hasMore || loadingMoreRef.current || messages.length === 0 || !room || !session) return
    loadingMoreRef.current = true
    prevScrollHeightRef.current = listRef.current?.scrollHeight ?? 0
    setLoadingMore(true)
    try {
      const oldest = messages[0].created_at
      const res = await fetch(
        `/api/chat/messages?room=${room.id}&limit=50&before=${encodeURIComponent(oldest)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) return
      const data = await res.json() as { messages: ChatMessage[]; has_more: boolean }
      setMessages(prev => [...(data.messages ?? []).reverse(), ...prev])
      setHasMore(data.has_more ?? false)
    } catch {} finally {
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }

  async function handleSend() {
    const trimmed = body.trim()
    if (!trimmed || !room || !session) return
    setBody("")
    try {
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ room_id: room.id, body: trimmed }),
      })
    } catch {}
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === "Escape") {
      setSideChatOpen(false)
    }
  }

  function handlePopout() {
    window.open("https://chat.subsurfaces.net", "philchat", "width=400,height=700")
  }

  if (!isOpen) return null

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>#general</span>
        <div className={styles.headerActions}>
          <button className={styles.headerBtn} onClick={handlePopout} title="Pop out" aria-label="Pop out chat">
            ↗
          </button>
          <button className={styles.headerBtn} onClick={() => setSideChatOpen(false)} title="Close" aria-label="Close chat">
            ×
          </button>
        </div>
      </div>

      <div className={styles.output} ref={listRef} onScroll={handleScroll}>
        {loadingMore && <div className={styles.loadingMore}>loading…</div>}
        {loading ? (
          <div className={styles.empty}>loading…</div>
        ) : messages.length === 0 ? (
          <div className={styles.empty}>no messages yet</div>
        ) : (
          messages.map(msg => <SideChatMessage key={msg.id} msg={msg} />)
        )}
      </div>

      <div className={styles.inputArea}>
        {session ? (
          <div className={styles.inputRow}>
            <input
              id="sidechat-input"
              name="sidechat-message"
              className={styles.input}
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message…"
              autoComplete="off"
              maxLength={2000}
            />
          </div>
        ) : (
          <button className={styles.loginBtn} onClick={() => setShowAuth(true)}>
            Log in to chat
          </button>
        )}
      </div>

      {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
