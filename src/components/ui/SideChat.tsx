import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useStore } from "@/store"
import { ChatRoom } from "./ChatRoom"
import { WikiAuthModal } from "./WikiAuthModal"
import type { ChatRoom as ChatRoomType } from "@/types/chat"
import styles from "./SideChat.module.scss"

export function SideChat() {
  const isOpen = useStore((s) => s.isSideChatOpen)
  const setSideChatOpen = useStore((s) => s.setSideChatOpen)
  const { session, username, avatar_url } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [room, setRoom] = useState<ChatRoomType | null>(null)
  const [rooms, setRooms] = useState<ChatRoomType[]>([])

  useEffect(() => {
    if (!isOpen || !session) return
    fetch("/api/chat/rooms", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { rooms: ChatRoomType[] }) => {
        const active = (data.rooms ?? []).filter((r) => !r.archived)
        setRooms(active)
        if (!room && active.length > 0) {
          setRoom(active.find((r) => r.name === "general") ?? active[0])
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session])

  function handlePopout() {
    window.open("https://chat.subsurfaces.net", "philchat", "width=400,height=700")
  }

  if (!isOpen) return null

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {rooms.length > 1 ? (
            <select
              className={styles.roomSelect}
              value={room?.id ?? ""}
              onChange={(e) => {
                const r = rooms.find((r) => r.id === e.target.value)
                if (r) setRoom(r)
              }}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.name}
                </option>
              ))}
            </select>
          ) : (
            <span className={styles.roomLabel}>
              #{room?.name ?? "general"}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.headerBtn}
            onClick={handlePopout}
            title="Pop out"
            aria-label="Pop out chat"
          >
            &#x2197;
          </button>
          <button
            className={styles.headerBtn}
            onClick={() => setSideChatOpen(false)}
            title="Close"
            aria-label="Close chat"
          >
            &times;
          </button>
        </div>
      </div>

      <div className={styles.chatContainer}>
        {!session ? (
          <div className={styles.loginArea}>
            <button
              className={styles.loginBtn}
              onClick={() => setShowAuth(true)}
            >
              Log in to chat
            </button>
          </div>
        ) : room ? (
          <ChatRoom
            key={room.id}
            roomId={room.id}
            roomName={room.name}
            accessToken={session.access_token}
            currentUserId={session.user.id}
            currentUsername={username}
            currentAvatarUrl={avatar_url}
          />
        ) : (
          <div className={styles.emptyState}>loading...</div>
        )}
      </div>

      {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
