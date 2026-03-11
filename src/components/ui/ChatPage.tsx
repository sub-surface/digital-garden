import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { WikiAuthModal } from "./WikiAuthModal"
import { ChatRoom } from "./ChatRoom"
import { ChatSearch } from "./ChatSearch"
import type { ChatRoom as ChatRoomType } from "@/types/chat"
import styles from "./Chat.module.scss"

export function ChatPage() {
  const { session, loading, username, avatar_url } = useAuth()
  const [rooms, setRooms] = useState<ChatRoomType[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [activeRoom, setActiveRoom] = useState<ChatRoomType | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

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

  return (
    <div className={styles.chatLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          channels
          {" · "}
          <button
            className={styles.sidebarSearchBtn}
            onClick={() => setShowSearch(true)}
            aria-label="Search messages"
          >
            search
          </button>
        </div>
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
                onClick={() => setActiveRoom(room)}
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

      {showSearch && (
        <ChatSearch
          onClose={() => setShowSearch(false)}
          accessToken={session.access_token}
        />
      )}
    </div>
  )
}
