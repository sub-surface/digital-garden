import { useEffect, useRef, useState } from "react"
import styles from "./ReadingProgress.module.scss"

/**
 * Thin accent line pinned to the top of the viewport that fills as you read an
 * article. Decorative (aria-hidden). The garden's vertical scroll happens on the
 * `.mainPane` container (id="main-content"), not the window, so we measure that.
 *
 * Mounted only by ArticleLayout, so it's article-only by construction.
 */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    // The scroll container is the main pane; fall back to the documentElement
    // (wiki/other shells) if it isn't present.
    const scroller =
      (document.getElementById("main-content") as HTMLElement | null) ??
      document.scrollingElement ??
      document.documentElement

    const measure = () => {
      frameRef.current = null
      const max = scroller.scrollHeight - scroller.clientHeight
      const next = max > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / max)) : 0
      setProgress(next)
    }

    const onScroll = () => {
      // Coalesce scroll events into one rAF-throttled measurement.
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(measure)
      }
    }

    measure()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })

    return () => {
      scroller.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <div className={styles.track} aria-hidden="true">
      <div className={styles.bar} style={{ transform: `scaleX(${progress})` }} />
    </div>
  )
}
