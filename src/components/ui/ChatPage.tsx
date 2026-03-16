import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { WikiAuthModal } from "./WikiAuthModal"
import { ChatRoom } from "./ChatRoom"
import type { ChatRoom as ChatRoomType } from "@/types/chat"
import styles from "./Chat.module.scss"

export function ChatPage() {
  const { session, loading, username, avatar_url } = useAuth()
  const [rooms, setRooms] = useState<ChatRoomType[]>([])
  const [activeRoom, setActiveRoom] = useState<ChatRoomType | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  function fetchRooms() {
    if (!session) return
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
      .catch(() => {})
  }

  useEffect(() => {
    fetchRooms()
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
      <div className={styles.chatMain}>
        {!activeRoom ? (
          <div className={styles.emptyState}>loading…</div>
        ) : (
          <ChatRoom
            key={activeRoom.id}
            roomId={activeRoom.id}
            roomName={activeRoom.name}
            accessToken={session.access_token}
            currentUserId={session.user.id}
            currentUsername={username}
            currentAvatarUrl={avatar_url}
            rooms={rooms}
            onRoomChange={(room) => setActiveRoom(room)}
            onRefreshRooms={fetchRooms}
          />
        )}
      </div>
    </div>
  )
}
