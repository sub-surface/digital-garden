import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { apiGet } from "@/lib/api"
import { ChatRoom } from "@/components/ui/chat/ChatRoom"
import { WikiAuthModal } from "@/components/ui/wiki/WikiAuthModal"
import type { ChatRoom as ChatRoomType } from "@/types/chat"
import styles from "./Dock.module.scss"
import chatStyles from "@/components/ui/chat/Chat.module.scss"

/**
 * philchat in the dock (it was the wiki's SideChat). Mounted only while the
 * chat tab is showing, so its realtime subscription closes when you leave.
 */
export function DockChat() {
  const { session, username, avatar_url } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [room, setRoom] = useState<ChatRoomType | null>(null)
  const [rooms, setRooms] = useState<ChatRoomType[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    apiGet<{ rooms: ChatRoomType[] }>("/api/chat/rooms", { token: session.access_token })
      .then((data) => {
        if (cancelled) return
        const active = (data.rooms ?? []).filter((r) => !r.archived)
        setRooms(active)
        setRoom((current) => current ?? active.find((r) => r.name === "general") ?? active[0] ?? null)
      })
      .catch((e) => {
        console.warn("DockChat: room list fetch failed:", e)
        if (!cancelled) setError("couldn't reach philchat")
      })
    return () => {
      cancelled = true
    }
  }, [session])

  const popout = (
    <button
      className={chatStyles.headerBtn}
      onClick={() => window.open("https://chat.subsurfaces.net", "philchat", "width=400,height=700")}
      title="Pop out"
      aria-label="Pop out chat"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </button>
  )

  return (
    <div className={styles.chat}>
      {!session ? (
        <div className={styles.centered}>
          <button className={styles.loginBtn} onClick={() => setShowAuth(true)}>
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
          headerExtra={popout}
        />
      ) : (
        <div className={styles.centered}>{error ?? "loading..."}</div>
      )}
      {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
