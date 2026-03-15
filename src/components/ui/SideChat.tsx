import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useStore } from "@/store"
import { ChatRoom } from "./ChatRoom"
import { WikiAuthModal } from "./WikiAuthModal"
import type { ChatRoom as ChatRoomType } from "@/types/chat"
import styles from "./SideChat.module.scss"
import chatStyles from "./Chat.module.scss"

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

  const extraButtons = (
    <>
      <button
        className={chatStyles.headerBtn}
        onClick={handlePopout}
        title="Pop out"
        aria-label="Pop out chat"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
      <button
        className={chatStyles.headerBtn}
        onClick={() => setSideChatOpen(false)}
        title="Close"
        aria-label="Close chat"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </>
  )

  return (
    <div className={styles.panel}>
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
            rooms={rooms}
            onRoomChange={(r) => setRoom(r)}
            headerExtra={extraButtons}
          />
        ) : (
          <div className={styles.emptyState}>loading...</div>
        )}
      </div>

      {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
