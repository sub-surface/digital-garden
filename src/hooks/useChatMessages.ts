import { useState, useEffect, useRef, useCallback } from "react"
import { subscribeRoom } from "@/lib/chatLive"
import { apiGet } from "@/lib/api"
import type { ChatMessage } from "@/types/chat"

interface UseChatMessagesOpts {
  roomId: string
  accessToken: string
  currentUserId: string
  currentUsername: string | null
  currentAvatarUrl: string | null
  listRef?: React.RefObject<HTMLDivElement | null>
}

export function useChatMessages({
  roomId,
  accessToken,
  currentUserId,
  currentUsername,
  currentAvatarUrl,
  listRef,
}: UseChatMessagesOpts) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadingMoreRef = useRef(false)
  const prevScrollHeightRef = useRef(0)

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<{ messages: ChatMessage[]; has_more: boolean }>(
        `/api/chat/messages?room=${roomId}&limit=50`,
        { token: accessToken },
      )
      setMessages((data.messages ?? []).reverse())
      setHasMore(data.has_more ?? false)
    } catch {
      // Leave empty state (also covers a previously-unchecked non-2xx response)
    } finally {
      setLoading(false)
    }
  }, [roomId, accessToken])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || messages.length === 0) return
    const oldest = messages[0].created_at
    loadingMoreRef.current = true
    prevScrollHeightRef.current = listRef?.current?.scrollHeight ?? 0
    setLoadingMore(true)
    try {
      const data = await apiGet<{ messages: ChatMessage[]; has_more: boolean }>(
        `/api/chat/messages?room=${roomId}&limit=50&before=${encodeURIComponent(oldest)}`,
        { token: accessToken },
      )
      setMessages((prev) => [...(data.messages ?? []).reverse(), ...prev])
      setHasMore(data.has_more ?? false)
    } catch {
      // Silently ignore load-more failure (also covers a previously-unchecked non-2xx response)
    } finally {
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }, [hasMore, messages, roomId, accessToken, listRef])

  // Fetch initial messages when room changes
  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Live updates for this room (one shared socket; see lib/chatLive).
  useEffect(() => {
    return subscribeRoom(roomId, (e) => {
      switch (e.type) {
        case "message":
          setMessages((prev) => (prev.some((m) => m.id === e.message.id) ? prev : [...prev, e.message]))
          break
        case "edit":
          setMessages((prev) => prev.map((m) => (m.id === e.id ? { ...m, body: e.body, edited_at: e.edited_at } : m)))
          break
        case "delete":
          setMessages((prev) => prev.filter((m) => m.id !== e.id))
          break
        case "reaction":
          // Our own reactions are applied locally when we make them.
          if (e.user_id === currentUserId) break
          setMessages((prev) => prev.map((m) => {
            if (m.id !== e.message_id) return m
            const list = [...(m.reactions ?? [])]
            const i = list.findIndex((r) => r.emote === e.emote)
            if (e.op === "add") {
              if (i >= 0) list[i] = { ...list[i], count: list[i].count + 1 }
              else list.push({ emote: e.emote, count: 1, reacted: false })
            } else if (i >= 0) {
              const count = list[i].count - 1
              if (count > 0) list[i] = { ...list[i], count }
              else list.splice(i, 1)
            }
            return { ...m, reactions: list }
          }))
          break
        case "reconnected":
          // Whatever arrived while the socket was down.
          void fetchMessages()
          break
      }
    })
  }, [roomId, currentUserId, fetchMessages])

  return {
    messages,
    setMessages,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    prevScrollHeightRef,
  }
}
