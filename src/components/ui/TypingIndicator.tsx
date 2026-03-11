import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { RealtimeChannel } from "@supabase/supabase-js"
import styles from "./Chat.module.scss"

// Module-level channel map so TypingIndicator and useTypingBroadcast share the
// same Supabase Realtime Presence channel instance per room.
const channelMap = new Map<string, RealtimeChannel>()
// Reference counts so we only remove when the last consumer unmounts.
const refCounts = new Map<string, number>()

function getOrCreateChannel(roomId: string): RealtimeChannel | null {
  if (!supabase) return null
  if (!channelMap.has(roomId)) {
    const ch = supabase.channel(`typing:${roomId}`)
    channelMap.set(roomId, ch)
    refCounts.set(roomId, 0)
  }
  return channelMap.get(roomId)!
}

function retainChannel(roomId: string) {
  refCounts.set(roomId, (refCounts.get(roomId) ?? 0) + 1)
}

function releaseChannel(roomId: string) {
  const count = (refCounts.get(roomId) ?? 1) - 1
  refCounts.set(roomId, count)
  if (count <= 0 && supabase) {
    const ch = channelMap.get(roomId)
    if (ch) supabase.removeChannel(ch)
    channelMap.delete(roomId)
    refCounts.delete(roomId)
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns a stable function to call when the local user starts or stops typing.
 * Shares the Presence channel with TypingIndicator for the same roomId.
 */
export function useTypingBroadcast(
  roomId: string,
  currentUserId: string
): (typing: boolean) => void {
  // We don't subscribe here — TypingIndicator owns the subscription lifecycle.
  // If used standalone (no TypingIndicator mounted), we create the channel but
  // don't subscribe; track() will silently no-op on an unsubscribed channel.
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!supabase) return
    const ch = getOrCreateChannel(roomId)
    channelRef.current = ch
    retainChannel(roomId)
    return () => {
      channelRef.current = null
      releaseChannel(roomId)
    }
  }, [roomId])

  // Keep a ref to the latest userId so the stable callback always uses it.
  const userIdRef = useRef(currentUserId)
  useEffect(() => {
    userIdRef.current = currentUserId
  }, [currentUserId])

  // Stable function identity across renders.
  const broadcast = useRef((typing: boolean) => {
    channelRef.current?.track({ user_id: userIdRef.current, typing })
  })

  return broadcast.current
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  roomId: string
  currentUserId: string
}

interface PresenceEntry {
  user_id: string
  typing: boolean
}

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
  const [typingNames, setTypingNames] = useState<string[]>([])

  useEffect(() => {
    if (!supabase) return

    const ch = getOrCreateChannel(roomId)!
    retainChannel(roomId)

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<PresenceEntry>()
      const names: string[] = []
      for (const entries of Object.values(state)) {
        for (const entry of entries) {
          if (entry.typing && entry.user_id !== currentUserId) {
            names.push(entry.user_id)
          }
        }
      }
      setTypingNames(names)
    })

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ user_id: currentUserId, typing: false })
      }
    })

    return () => {
      releaseChannel(roomId)
    }
  }, [roomId, currentUserId])

  const label = buildLabel(typingNames)

  return (
    <div className={styles.typingIndicator}>
      {label || null}
    </div>
  )
}
