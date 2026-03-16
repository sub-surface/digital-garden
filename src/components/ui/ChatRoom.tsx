import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react"
import type { ChatMessage, ChatRoom as ChatRoomType, PinnedMessage } from "@/types/chat"
import { parseMessageBody } from "@/lib/parseMessageBody"
import { useAuth } from "@/hooks/useAuth"
import { useChatMessages } from "@/hooks/useChatMessages"
import { useChatScroll } from "@/hooks/useChatScroll"
import { useChatToast } from "@/hooks/useChatToast"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"
import { TypingIndicator, useTypingBroadcast } from "./TypingIndicator"
import { MiniProfilePopup } from "./MiniProfilePopup"
import { ChatSettings } from "./ChatSettings"
import styles from "./Chat.module.scss"

interface SearchResult {
  id: string
  body: string
  created_at: string
  profiles?: { username?: string }
}

interface Props {
  roomId: string
  roomName: string
  accessToken: string
  currentUserId: string
  currentUsername: string | null
  currentAvatarUrl: string | null
  rooms?: ChatRoomType[]
  onRoomChange?: (room: ChatRoomType) => void
  onRefreshRooms?: () => void
  /** Extra buttons rendered at the right end of the header (e.g. popout, close) */
  headerExtra?: ReactNode
}

function renderPinBody(body: string): ReactNode[] {
  const truncated = body.length > 80 ? body.slice(0, 80) + "..." : body
  const tokens = parseMessageBody(truncated)
  return tokens.map((tok, i) => {
    if (tok.type === "emote") {
      return (
        <img
          key={i}
          src={`/emotes/${tok.name}.gif`}
          alt={`:${tok.name}:`}
          className={styles.emote}
          style={{ height: "1.2em" }}
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
    }
    if (tok.type === "text") return <span key={i}>{tok.value}</span>
    if (tok.type === "url") return <span key={i}>{tok.label}</span>
    return null
  })
}

export function ChatRoom({ roomId, roomName, accessToken, currentUserId, currentUsername, currentAvatarUrl, rooms, onRoomChange, onRefreshRooms, headerExtra }: Props) {
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [popup, setPopup] = useState<{ username: string; anchor: HTMLElement } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([])
  const [showPinTicker, setShowPinTicker] = useState(true)
  const [channelOpen, setChannelOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [activePinIndex, setActivePinIndex] = useState(0)
  const pinTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [showNewRoom, setShowNewRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState("")
  const [newRoomSlug, setNewRoomSlug] = useState("")
  const { role, name_color, updateProfile } = useAuth()
  const inputRef = useRef<{ focus: () => void }>(null)
  const lastReadRef = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)
  const channelRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Fetch pinned messages
  useEffect(() => {
    fetch(`/api/chat/pins?room=${encodeURIComponent(roomId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => { setPinnedMessages(data.pins ?? []); setShowPinTicker(true) })
      .catch(() => setPinnedMessages([]))
  }, [roomId, accessToken])

  // Auto-cycle pinned messages
  useEffect(() => {
    if (pinnedMessages.length <= 1) {
      if (pinTimerRef.current) clearInterval(pinTimerRef.current)
      setActivePinIndex(0)
      return
    }
    pinTimerRef.current = setInterval(() => {
      setActivePinIndex((i) => (i + 1) % pinnedMessages.length)
    }, 6000)
    return () => { if (pinTimerRef.current) clearInterval(pinTimerRef.current) }
  }, [pinnedMessages.length])

  async function handlePin(messageId: string) {
    const msg = messages.find(m => m.id === messageId)
    const isPinned = !!msg?.pinned_at
    try {
      const res = await fetch(`/api/chat/messages/${messageId}/pin`, {
        method: isPinned ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error()
      // Update local message state
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, pinned_at: isPinned ? null : new Date().toISOString(), pinned_by: isPinned ? null : currentUserId }
            : m
        )
      )
      // Refresh pinned messages list
      fetch(`/api/chat/pins?room=${encodeURIComponent(roomId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => { setPinnedMessages(data.pins ?? []); setShowPinTicker(true) })
        .catch(() => {})
    } catch {
      showToast(isPinned ? "Failed to unpin" : "Failed to pin")
    }
  }

  const { atBottom, handleScroll, scrollToBottom } = useChatScroll({
    listRef,
    messages,
    loading,
    hasMore,
    loadMore,
    prevScrollHeightRef,
    onAtBottom: markAsRead,
  })

  // Close channel dropdown on outside click
  useEffect(() => {
    if (!channelOpen) return
    function handleClick(e: MouseEvent) {
      if (channelRef.current && !channelRef.current.contains(e.target as Node)) {
        setChannelOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [channelOpen])

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    searchTimerRef.current = setTimeout(() => {
      setSearchLoading(true)
      fetch(`/api/chat/search?q=${encodeURIComponent(q)}&limit=20`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => setSearchResults(data.messages ?? []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false))
    }, 300)
  }, [searchQuery, accessToken])

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "TEXTAREA" || target.tagName === "INPUT"

      if (e.key === "Escape") {
        if (searchOpen) { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); return }
        if (channelOpen) { setChannelOpen(false); return }
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
  }, [replyTo, popup, searchOpen, channelOpen])

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

  async function handleEdit(messageId: string, newBody: string) {
    const prev = messages.find((m) => m.id === messageId)
    if (!prev) return
    setEditingMessageId(null)
    // Optimistic update
    setMessages((msgs) =>
      msgs.map((m) =>
        m.id === messageId ? { ...m, body: newBody, edited_at: new Date().toISOString() } : m
      )
    )
    try {
      const res = await fetch(`/api/chat/messages/${messageId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ body: newBody }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Rollback
      setMessages((msgs) =>
        msgs.map((m) =>
          m.id === messageId ? { ...m, body: prev.body, edited_at: prev.edited_at } : m
        )
      )
      showToast("Failed to edit message")
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

  // Derive known users from messages for autocomplete
  const knownUsers = useMemo(() => {
    const names = new Set<string>()
    for (const m of messages) {
      if (m.profiles?.username) names.add(m.profiles.username)
    }
    return [...names]
  }, [messages])

  const isAdmin = role === "admin"

  async function handleCreateRoom() {
    const name = newRoomName.trim()
    const slug = newRoomSlug.trim()
    if (!name || !slug) return
    try {
      const res = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name, slug }),
      })
      if (!res.ok) throw new Error()
      setNewRoomName("")
      setNewRoomSlug("")
      setShowNewRoom(false)
      onRefreshRooms?.()
    } catch {
      showToast("Failed to create room")
    }
  }

  async function handleArchiveRoom(id: string) {
    try {
      const res = await fetch(`/api/chat/rooms/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ archived: true }),
      })
      if (!res.ok) throw new Error()
      onRefreshRooms?.()
    } catch {
      showToast("Failed to archive room")
    }
  }

  const hasRoomSelector = rooms && rooms.length > 0 && onRoomChange

  return (
    <>
      <div className={styles.chatRoomHeader}>
        <div className={styles.chatContentWrapper}>
          {/* Channel selector */}
          {hasRoomSelector ? (
            <div ref={channelRef} style={{ position: "relative" }}>
              <button
                className={styles.channelSelector}
                onClick={() => setChannelOpen((v) => !v)}
              >
                {roomName}
                <span className={styles.channelCaret}>&#9662;</span>
              </button>
              {channelOpen && (
                <div className={styles.channelDropdown}>
                  {rooms.map((r) => (
                    <div key={r.id} className={styles.channelRow}>
                      <button
                        className={`${styles.channelOption} ${r.id === roomId ? styles.channelOptionActive : ""}`}
                        onClick={() => {
                          onRoomChange(r)
                          setChannelOpen(false)
                        }}
                      >
                        {r.name}
                      </button>
                      {isAdmin && r.id !== roomId && (
                        <button
                          className={styles.channelArchiveBtn}
                          onClick={(e) => { e.stopPropagation(); handleArchiveRoom(r.id) }}
                          title="Archive room"
                          aria-label={`Archive ${r.name}`}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                  {isAdmin && (
                    showNewRoom ? (
                      <div className={styles.newRoomForm}>
                        <input
                          className={styles.newRoomInput}
                          placeholder="name"
                          value={newRoomName}
                          onChange={(e) => setNewRoomName(e.target.value)}
                          autoFocus
                        />
                        <input
                          className={styles.newRoomInput}
                          placeholder="slug"
                          value={newRoomSlug}
                          onChange={(e) => setNewRoomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        />
                        <div className={styles.newRoomActions}>
                          <button className={styles.newRoomBtn} onClick={handleCreateRoom}>create</button>
                          <button className={styles.newRoomBtn} onClick={() => { setShowNewRoom(false); setNewRoomName(""); setNewRoomSlug("") }}>cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className={styles.channelOption}
                        onClick={() => setShowNewRoom(true)}
                      >
                        + new room
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ) : (
            <span className={styles.channelSelector} style={{ cursor: "default" }}>
              {roomName}
            </span>
          )}

          {/* Right-side actions */}
          <div className={styles.headerActions}>
            {/* Search */}
            <div className={styles.headerSearch}>
              {searchOpen && (
                <>
                  <input
                    ref={searchInputRef}
                    className={styles.headerSearchInput}
                    type="text"
                    placeholder="search messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onBlur={() => {
                      // Delay to allow clicking results
                      setTimeout(() => {
                        setSearchOpen(false)
                        setSearchQuery("")
                        setSearchResults([])
                      }, 200)
                    }}
                    autoComplete="off"
                  />
                  {searchQuery.trim() && (
                    <div className={styles.headerSearchResults}>
                      {searchLoading && (
                        <div className={styles.headerSearchEmpty}>searching...</div>
                      )}
                      {!searchLoading && searchResults.length === 0 && (
                        <div className={styles.headerSearchEmpty}>no results</div>
                      )}
                      {searchResults.map((r) => (
                        <div
                          key={r.id}
                          className={styles.headerSearchResultItem}
                          onClick={() => {
                            setSearchOpen(false)
                            setSearchQuery("")
                            setSearchResults([])
                          }}
                        >
                          <div className={styles.headerSearchResultMeta}>
                            {r.profiles?.username ?? "unknown"} · {new Date(r.created_at).toLocaleDateString()}
                          </div>
                          <div className={styles.headerSearchResultBody}>
                            {r.body.length > 100 ? r.body.slice(0, 100) + "..." : r.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              <button
                className={styles.headerBtn}
                onClick={() => setSearchOpen((v) => !v)}
                title="Search messages"
                aria-label="Search messages"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </button>
            </div>

            {/* Pin toggle */}
            {pinnedMessages.length > 0 && (
              <button
                className={styles.headerBtn}
                onClick={() => setShowPinTicker((v) => !v)}
                title={showPinTicker ? "Hide pinned messages" : "Show pinned messages"}
                aria-label="Toggle pinned messages"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="17" x2="12" y2="22"/>
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                </svg>
              </button>
            )}

            {/* Settings gear */}
            <button
              ref={settingsBtnRef}
              className={styles.headerBtn}
              onClick={() => setShowSettings((v) => !v)}
              title="Chat settings"
              aria-label="Chat settings"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            {headerExtra}
          </div>
        </div>
      </div>

      {showSettings && (
        <ChatSettings
          anchorRef={settingsBtnRef}
          currentColor={name_color}
          onSave={async (color) => {
            await updateProfile({ name_color: color })
            setShowSettings(false)
          }}
          onClose={() => setShowSettings(false)}
          isAdmin={isAdmin}
          accessToken={accessToken}
        />
      )}

      {/* Pinned message ticker */}
      {showPinTicker && pinnedMessages.length > 0 && (() => {
        const safeIdx = Math.min(activePinIndex, pinnedMessages.length - 1)
        const pin = pinnedMessages[safeIdx]
        return (
          <div
            className={styles.pinTicker}
            onMouseEnter={() => { if (pinTimerRef.current) clearInterval(pinTimerRef.current) }}
            onMouseLeave={() => {
              if (pinnedMessages.length > 1) {
                pinTimerRef.current = setInterval(() => {
                  setActivePinIndex((i) => (i + 1) % pinnedMessages.length)
                }, 6000)
              }
            }}
          >
            <div className={styles.chatContentWrapper}>
              <span className={styles.pinTickerIcon}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="17" x2="12" y2="22"/>
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                </svg>
              </span>
              <span className={styles.pinTickerUser}>{pin.profiles?.username ?? "unknown"}</span>
              <span className={styles.pinTickerBody}>
                {renderPinBody(pin.body)}
              </span>
              {pinnedMessages.length > 1 && (
                <div className={styles.pinTickerDots}>
                  {pinnedMessages.map((_, i) => (
                    <button
                      key={i}
                      className={`${styles.pinTickerDot} ${i === safeIdx ? styles.pinTickerDotActive : ""}`}
                      onClick={() => setActivePinIndex(i)}
                    />
                  ))}
                </div>
              )}
              <button
                className={styles.pinTickerClose}
                onClick={() => setShowPinTicker(false)}
                aria-label="Dismiss pinned message"
              >
                &times;
              </button>
            </div>
          </div>
        )
      })()}

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
          onEdit={handleEdit}
          onPin={isAdmin ? handlePin : undefined}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          editingMessageId={editingMessageId}
          onCancelEdit={() => setEditingMessageId(null)}
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
        onEditLast={() => {
          const last = messages.findLast((m) => m.user_id === currentUserId && !m.deleted_at)
          if (last) setEditingMessageId(last.id)
        }}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onTyping={broadcastTyping}
        knownUsers={knownUsers}
      />
    </>
  )
}
