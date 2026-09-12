import { useEffect, useRef } from "react"
import { useLocation } from "@tanstack/react-router"

const STORAGE_KEY = "digital_garden_scroll_positions_v1"

function getSavedPositions(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function savePosition(key: string, top: number) {
  if (!key) return
  try {
    const map = getSavedPositions()
    map[key] = Math.round(top)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Gracefully handle sessionStorage quota or security exceptions
  }
}

function getScrollElement(): HTMLElement {
  return (
    (document.getElementById("main-content") as HTMLElement | null) ??
    (document.scrollingElement as HTMLElement | null) ??
    document.documentElement
  )
}

function findTargetElement(hash: string): HTMLElement | null {
  const raw = hash.replace(/^#/, "")
  if (!raw) return null
  const decoded = decodeURIComponent(raw)

  // 1. Direct exact ID (fastest, supports arbitrary characters like colons, periods)
  let el = document.getElementById(decoded)
  if (el) return el

  // 2. Lowercase ID
  el = document.getElementById(decoded.toLowerCase())
  if (el) return el

  // 3. Name attribute (legacy anchor tags)
  try {
    el = document.querySelector(`[name="${CSS.escape(decoded)}"]`) as HTMLElement | null
    if (el) return el
    el = document.querySelector(`[name="${CSS.escape(decoded.toLowerCase())}"]`) as HTMLElement | null
    if (el) return el
  } catch {
    // Ignore querySelector syntax errors on odd character sequences
  }

  // 4. Citation key or span ID fallback
  try {
    el = document.querySelector(`[id="${CSS.escape(decoded)}"]`) as HTMLElement | null
    if (el) return el
  } catch {
    // Ignore querySelector syntax errors
  }

  return null
}

/**
 * useScrollManager
 *
 * Provides:
 * 1. Smooth anchor scrolling for URLs with hashes (e.g. /Wiki/Bibliography#Haack-Evidence-1993),
 *    handling asynchronous MDX note loading via a MutationObserver + requestAnimationFrame poller.
 * 2. History scroll restoration on Back/Forward (POP) navigations, waiting for dynamic note content
 *    to expand scrollHeight before applying the saved scrollTop.
 * 3. Scroll-to-top on fresh PUSH navigations without a hash.
 */
export function useScrollManager() {
  const location = useLocation()
  const isPopNavigation = useRef(false)
  const isRestoring = useRef(false)
  const currentKeyRef = useRef("")

  // Listen for browser Back/Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      isPopNavigation.current = true
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  // Listen for user scrolling on the main pane or document (capture phase)
  useEffect(() => {
    let timeout: number | null = null

    const handleScroll = () => {
      if (isRestoring.current) return
      if (timeout !== null) return

      timeout = window.setTimeout(() => {
        timeout = null
        const key = currentKeyRef.current
        if (!key || isRestoring.current) return
        const scroller = getScrollElement()
        const top = scroller === document.documentElement ? window.scrollY : scroller.scrollTop
        savePosition(key, top)
      }, 100)
    }

    document.addEventListener("scroll", handleScroll, true)
    return () => {
      document.removeEventListener("scroll", handleScroll, true)
      if (timeout !== null) clearTimeout(timeout)
    }
  }, [])

  // Manage scroll on route changes
  useEffect(() => {
    const isPop = isPopNavigation.current
    isPopNavigation.current = false

    // Save previous page position synchronously before switching key
    const prevKey = currentKeyRef.current
    if (prevKey && !isRestoring.current) {
      const prevScroller = getScrollElement()
      const prevTop = prevScroller === document.documentElement ? window.scrollY : prevScroller.scrollTop
      savePosition(prevKey, prevTop)
    }

    // Unique key for the active history entry
    const historyKey =
      (typeof window !== "undefined" && (window.history.state?.__TSR_key || window.history.state?.key)) ||
      location.pathname + location.search

    currentKeyRef.current = historyKey

    let cancelPending = false
    let observer: MutationObserver | null = null
    let frameId: number | null = null

    const cleanup = () => {
      cancelPending = true
      if (observer) {
        observer.disconnect()
        observer = null
      }
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
        frameId = null
      }
      isRestoring.current = false
    }

    // ── 1. Hash Navigation (Anchor Section Scroll) ──
    if (location.hash) {
      const hash = location.hash
      let attempts = 0
      const maxAttempts = 60 // ~1.5 - 2s at 60fps

      const tryScrollToAnchor = () => {
        const target = findTargetElement(hash)
        if (target) {
          isRestoring.current = true
          target.scrollIntoView({ behavior: "smooth", block: "start" })
          setTimeout(() => {
            isRestoring.current = false
          }, 350)
          cleanup()
          return true
        }
        return false
      }

      if (!tryScrollToAnchor()) {
        const scroller = getScrollElement()
        observer = new MutationObserver(() => {
          if (tryScrollToAnchor()) cleanup()
        })
        observer.observe(scroller, { childList: true, subtree: true })

        const checkFrame = () => {
          if (cancelPending) return
          if (tryScrollToAnchor()) return
          attempts++
          if (attempts < maxAttempts) {
            frameId = requestAnimationFrame(checkFrame)
          } else {
            cleanup()
          }
        }
        frameId = requestAnimationFrame(checkFrame)
      }

      return cleanup
    }

    // ── 2. History Back / Forward (Restore Scroll Position) ──
    if (isPop) {
      const savedPositions = getSavedPositions()
      const savedTop = savedPositions[historyKey]

      if (typeof savedTop === "number" && savedTop > 0) {
        let attempts = 0
        const maxAttempts = 60

        const tryRestore = () => {
          const scroller = getScrollElement()
          const maxScroll = scroller.scrollHeight - scroller.clientHeight

          // If content has grown tall enough to reach saved position, or retries expiring
          if (maxScroll >= savedTop || attempts > 25) {
            isRestoring.current = true
            if (scroller === document.documentElement) {
              window.scrollTo({ top: savedTop, behavior: "instant" })
            } else {
              scroller.scrollTop = savedTop
            }

            if (maxScroll >= savedTop) {
              setTimeout(() => {
                isRestoring.current = false
              }, 150)
              cleanup()
              return true
            }
          }
          return false
        }

        if (!tryRestore()) {
          const scroller = getScrollElement()
          observer = new MutationObserver(() => {
            if (tryRestore()) cleanup()
          })
          observer.observe(scroller, { childList: true, subtree: true })

          const checkFrame = () => {
            if (cancelPending) return
            if (tryRestore()) return
            attempts++
            if (attempts < maxAttempts) {
              frameId = requestAnimationFrame(checkFrame)
            } else {
              cleanup()
            }
          }
          frameId = requestAnimationFrame(checkFrame)
        }

        return cleanup
      }
    }

    // ── 3. Fresh PUSH Navigation without hash (Scroll to top) ──
    const scroller = getScrollElement()
    if (scroller === document.documentElement) {
      window.scrollTo({ top: 0, behavior: "instant" })
    } else {
      scroller.scrollTop = 0
    }

    return cleanup
  }, [location.pathname, location.search, location.hash])
}
