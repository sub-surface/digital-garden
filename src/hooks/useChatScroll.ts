import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import type { ChatMessage } from "@/types/chat"

interface UseChatScrollOpts {
  listRef: React.RefObject<HTMLDivElement | null>
  messages: ChatMessage[]
  loading: boolean
  hasMore: boolean
  loadMore: () => void
  prevScrollHeightRef: React.RefObject<number>
  onAtBottom?: () => void
}

export function useChatScroll({
  listRef,
  messages,
  loading,
  hasMore,
  loadMore,
  prevScrollHeightRef,
  onAtBottom,
}: UseChatScrollOpts) {
  const [atBottom, setAtBottom] = useState(true)
  const atBottomRef = useRef(true)

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    atBottomRef.current = isBottom
    setAtBottom(isBottom)
    if (isBottom) onAtBottom?.()

    // Auto-load when scrolled near top
    if (el.scrollTop < 150 && hasMore) {
      loadMore()
    }
  }, [hasMore, loadMore, onAtBottom])

  // Restore scroll position after older messages are prepended
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || prevScrollHeightRef.current === 0) return
    const newScrollHeight = el.scrollHeight
    if (newScrollHeight > prevScrollHeightRef.current) {
      el.scrollTop = newScrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = 0
    }
  }, [messages, prevScrollHeightRef])

  // Scroll to bottom after initial load
  useEffect(() => {
    if (!loading) {
      scrollToBottom()
      onAtBottom?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Scroll to bottom when new messages arrive (only if near bottom)
  useEffect(() => {
    if (messages.length > 0 && atBottomRef.current) {
      scrollToBottom()
      onAtBottom?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  return { atBottom, handleScroll, scrollToBottom }
}
