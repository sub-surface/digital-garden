import { useState, useEffect, useRef } from "react"
import { useNotifications } from "@/hooks/useNotifications"
import styles from "./NotificationBanner.module.scss"

const AUTO_CYCLE_MS = 8000

export function NotificationBanner() {
  const { notifications, dismiss } = useNotifications()
  const [activeIndex, setActiveIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep activeIndex in bounds when notifications change
  const count = notifications.length
  const safeIndex = count === 0 ? 0 : Math.min(activeIndex, count - 1)

  // Sync body attribute for layout shift
  useEffect(() => {
    if (count > 0) {
      document.body.setAttribute("data-banner", "true")
    } else {
      document.body.removeAttribute("data-banner")
    }
    return () => { document.body.removeAttribute("data-banner") }
  }, [count])

  // Auto-cycle
  useEffect(() => {
    if (count <= 1 || hovered) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      setActiveIndex(i => (i + 1) % count)
    }, AUTO_CYCLE_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [count, hovered])

  if (count === 0) return null

  const active = notifications[safeIndex]

  const handleDismiss = () => {
    dismiss(active.id)
    // Move to next or previous after dismiss
    setActiveIndex(i => Math.max(0, i - 1))
  }

  const handleDotClick = (i: number) => {
    setActiveIndex(i)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  return (
    <div
      className={`${styles.banner} ${styles[`banner_${active.type}`]}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      aria-live="polite"
    >
      {/* Ticker text */}
      <div className={styles.ticker}>
        <div className={styles.tickerInner}>
          <span>{active.message}</span>
          <span aria-hidden="true">{active.message}</span>
        </div>
      </div>

      {/* Action button */}
      {active.action && (
        <button className={styles.actionBtn} onClick={active.action.onClick}>
          {active.action.label}
        </button>
      )}

      {/* Dot pips (only when >1 notification) */}
      {count > 1 && (
        <div className={styles.dots} aria-hidden="true">
          {notifications.map((_, i) => (
            <button
              key={i}
              className={`${styles.dot} ${i === safeIndex ? styles.dotActive : ""}`}
              onClick={() => handleDotClick(i)}
            />
          ))}
        </div>
      )}

      {/* Dismiss */}
      <button
        className={styles.dismissBtn}
        onClick={handleDismiss}
        aria-label={`Dismiss: ${active.message}`}
      >
        &times;
      </button>
    </div>
  )
}
