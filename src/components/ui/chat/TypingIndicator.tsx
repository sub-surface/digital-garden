import { useEffect, useRef, useState } from "react"
import { sendTyping, subscribeRoom } from "@/lib/chatLive"
import styles from "./Chat.module.scss"

/**
 * Returns a stable function to call when the local user starts or stops
 * typing. It rides the room's live socket (lib/chatLive), shared with the
 * message list and the TypingIndicator.
 */
export function useTypingBroadcast(roomId: string, _currentUserId: string): (typing: boolean) => void {
  const roomRef = useRef(roomId)
  useEffect(() => { roomRef.current = roomId }, [roomId])
  // A repeat of the same state goes out at most every 3 s (the far side lets it
  // lapse after STALE_MS); a change goes out at once.
  const last = useRef({ typing: false, at: 0 })
  const send = useRef((typing: boolean) => {
    const now = Date.now()
    if (typing === last.current.typing && now - last.current.at < 3000) return
    last.current = { typing, at: now }
    sendTyping(roomRef.current, typing)
  })
  return send.current
}

interface Props {
  roomId: string
  currentUserId: string
}

/** A typing signal not renewed within this long has lapsed (a dropped tab sends no "stopped"). */
const STALE_MS = 8000

function buildLabel(names: string[]): string {
  if (names.length === 0) return ""
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  const visible = names.slice(0, 3)
  const rest = names.length - 3
  if (rest <= 0) {
    return `${visible[0]}, ${visible[1]} and ${visible[2]} are typing…`
  }
  return `${visible[0]}, ${visible[1]}, ${visible[2]} and others are typing…`
}

export function TypingIndicator({ roomId, currentUserId }: Props) {
  const [typing, setTyping] = useState<Map<string, { name: string; at: number }>>(new Map())

  useEffect(() => {
    setTyping(new Map())
    const off = subscribeRoom(roomId, (e) => {
      if (e.type !== "typing" || e.user_id === currentUserId) return
      setTyping((prev) => {
        const next = new Map(prev)
        if (e.typing) next.set(e.user_id, { name: e.username ?? "someone", at: Date.now() })
        else next.delete(e.user_id)
        return next
      })
    })
    const sweep = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now()
        if (![...prev.values()].some((v) => now - v.at > STALE_MS)) return prev
        return new Map([...prev].filter(([, v]) => now - v.at <= STALE_MS))
      })
    }, 2000)
    return () => { off(); clearInterval(sweep) }
  }, [roomId, currentUserId])

  const label = buildLabel([...typing.values()].map((v) => v.name))

  return (
    <div className={styles.typingIndicator}>
      {label || null}
    </div>
  )
}
