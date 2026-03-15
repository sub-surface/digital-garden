import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
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
      const res = await fetch(`/api/chat/messages?room=${roomId}&limit=50`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return
      const data = await res.json() as { messages: ChatMessage[]; has_more: boolean }
      setMessages((data.messages ?? []).reverse())
      setHasMore(data.has_more ?? false)
    } catch {
      // Leave empty state
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
      const res = await fetch(
        `/api/chat/messages?room=${roomId}&limit=50&before=${encodeURIComponent(oldest)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) return
      const data = await res.json() as { messages: ChatMessage[]; has_more: boolean }
      setMessages((prev) => [...(data.messages ?? []).reverse(), ...prev])
      setHasMore(data.has_more ?? false)
    } catch {
      // Silently ignore load-more failure
    } finally {
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }, [hasMore, messages, roomId, accessToken])

  // Fetch initial messages when room changes
  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Supabase Realtime subscription
  useEffect(() => {
    if (!supabase) return

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage
          let enriched: ChatMessage
          if (newMsg.user_id === currentUserId) {
            enriched = { ...newMsg, profiles: { username: currentUsername ?? "unknown", avatar_url: currentAvatarUrl }, reactions: [] }
          } else {
            try {
              const res = await fetch(`/api/chat/messages?room=${roomId}&limit=10`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              })
              if (res.ok) {
                const data = await res.json() as { messages: ChatMessage[] }
                const found = data.messages.find(m => m.id === newMsg.id)
                enriched = found ?? { ...newMsg, profiles: null, reactions: [] }
              } else {
                enriched = { ...newMsg, profiles: null, reactions: [] }
              }
            } catch {
              enriched = { ...newMsg, profiles: null, reactions: [] }
            }
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === enriched.id)) return prev
            return [...prev, enriched]
          })
        }
      )
      .subscribe()

    return () => {
      supabase?.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

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
