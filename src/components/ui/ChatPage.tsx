import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/hooks/useAuth"
import { WikiAuthModal } from "./WikiAuthModal"
import { ChatRoom } from "./ChatRoom"
import type { ChatRoom as ChatRoomType } from "@/types/chat"
import styles from "./Chat.module.scss"

interface SearchResult {
  id: string
  body: string
  created_at: string
  profiles?: { username?: string }
}

export function ChatPage() {
  const { session, loading, username, avatar_url } = useAuth()
  const [rooms, setRooms] = useState<ChatRoomType[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [activeRoom, setActiveRoom] = useState<ChatRoomType | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!session) return
    setRoomsLoading(true)
    fetch("/api/chat/rooms", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { rooms: ChatRoomType[] }) => {
        const active = (data.rooms ?? []).filter((r) => !r.archived)
        setRooms(active)
        if (active.length > 0 && !activeRoom) {
          setActiveRoom(active[0])
        }
      })
      .catch(() => {
        // Fetch failure — leave empty list
      })
      .finally(() => setRoomsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const q = searchQuery.trim()
    if (!q || !session) {
      setSearchResults([])
      return
    }
    searchTimerRef.current = setTimeout(() => {
      setSearchLoading(true)
      fetch(`/api/chat/search?q=${encodeURIComponent(q)}&limit=20`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => setSearchResults(data.messages ?? []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false))
    }, 300)
  }, [searchQuery, session])

  // Close sidebar on Escape
  useEffect(() => {
    if (!sidebarOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false)
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [sidebarOpen])

  if (loading) {
    return (
      <div className={styles.chatLayout}>
        <div className={styles.emptyState}>loading…</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className={styles.chatLayout}>
        <div className={styles.loginPrompt}>
          <span>You must be logged in to use chat.</span>
          <button
            className={styles.loginPromptBtn}
            onClick={() => setShowAuth(true)}
          >
            Log in / Sign up
          </button>
        </div>
        {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} />}
      </div>
    )
  }

  function handleRoomSelect(room: ChatRoomType) {
    setActiveRoom(room)
    setSidebarOpen(false)
  }

  return (
    <div className={styles.chatLayout}>
      {/* Mobile sidebar toggle */}
      <button
        className={styles.sidebarToggle}
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label="Toggle channels"
      >
        #
      </button>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className={styles.sidebarBackdrop}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarHeader}>channels</div>
        {roomsLoading ? (
          <div style={{ padding: "6px 16px", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            loading…
          </div>
        ) : (
          <ul className={styles.roomList}>
            {rooms.map((room) => (
              <li
                key={room.id}
                className={`${styles.roomItem} ${activeRoom?.id === room.id ? styles.roomItemActive : ""}`}
                onClick={() => handleRoomSelect(room)}
              >
                <span className={styles.roomName}>{room.name}</span>
              </li>
            ))}
            {rooms.length === 0 && (
              <li style={{ padding: "6px 16px", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                no channels
              </li>
            )}
          </ul>
        )}

        <div className={styles.sidebarSearch}>
          <span className={styles.sidebarSearchLabel}>search</span>
          <input
            id="chat-sidebar-search"
            name="chat-search"
            className={styles.sidebarSearchInput}
            type="search"
            placeholder="type to search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
          />
          {searchQuery.trim() && (
            <div className={styles.sidebarSearchResults}>
              {searchLoading && (
                <div className={styles.sidebarSearchEmpty}>searching…</div>
              )}
              {!searchLoading && searchResults.length === 0 && (
                <div className={styles.sidebarSearchEmpty}>no results</div>
              )}
              {searchResults.map((r) => (
                <div key={r.id} className={styles.sidebarSearchResult}>
                  <div className={styles.sidebarSearchMeta}>
                    {r.profiles?.username ?? "unknown"} · {new Date(r.created_at).toLocaleDateString()}
                  </div>
                  <div className={styles.sidebarSearchBody}>
                    {r.body.length > 120 ? r.body.slice(0, 120) + "…" : r.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className={styles.chatMain}>
        {!activeRoom ? (
          <div className={styles.emptyState}>select a channel to start chatting</div>
        ) : (
          <ChatRoom
            key={activeRoom.id}
            roomId={activeRoom.id}
            roomName={activeRoom.name}
            accessToken={session.access_token}
            currentUserId={session.user.id}
            currentUsername={username}
            currentAvatarUrl={avatar_url}
          />
        )}
      </div>

    </div>
  )
}
