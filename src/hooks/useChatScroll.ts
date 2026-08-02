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
  const onAtBottomRef = useRef(onAtBottom)

  useEffect(() => {
    onAtBottomRef.current = onAtBottom
  }, [onAtBottom])

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [listRef])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    atBottomRef.current = isBottom
    setAtBottom(isBottom)
    if (isBottom) onAtBottomRef.current?.()

    // Auto-load when scrolled near top
    if (el.scrollTop < 150 && hasMore) {
      loadMore()
    }
  }, [hasMore, listRef, loadMore])

  // Restore scroll position after older messages are prepended
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || prevScrollHeightRef.current === 0) return
    const newScrollHeight = el.scrollHeight
    if (newScrollHeight > prevScrollHeightRef.current) {
      el.scrollTop = newScrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = 0
    }
  }, [messages, listRef, prevScrollHeightRef])

  // Scroll to bottom after initial load
  useEffect(() => {
    if (!loading) {
      scrollToBottom()
      onAtBottomRef.current?.()
    }
  }, [loading, scrollToBottom])

  // Scroll to bottom when new messages arrive (only if near bottom)
  useEffect(() => {
    if (messages.length > 0 && atBottomRef.current) {
      scrollToBottom()
      onAtBottomRef.current?.()
    }
  }, [messages, scrollToBottom])

  return { atBottom, handleScroll, scrollToBottom }
}
