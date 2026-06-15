import { useEffect, useState, useRef } from "react"
import { resolveSeed } from "./bootSeed"
import { useBootPlayback } from "./useBootPlayback"
import styles from "./BootPage.module.scss"

export function BootPage() {
  const [seedDisplay, setSeedDisplay] = useState<string>("")
  const [seed, setSeed] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const liveRegionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const resolved = resolveSeed()
    setSeed(resolved.value)
    setSeedDisplay(resolved.display)
  }, [])

  const { lines, activeText, isPaused, epoch, emittedCount } = useBootPlayback(seed ?? 0)

  // Auto-scroll to bottom when new lines appear
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines, activeText])

  return (
    <div className={styles.bootContainer}>
      <div className={styles.logContainer} ref={logRef} role="log" aria-live="polite" aria-label="Boot sequence output">
        {lines.map((line) => (
          <div
            key={line.id}
            className={`${styles.line} ${styles[`tone-${line.tone}`]}`}
            data-kind={line.kind}
          >
            {line.text}
          </div>
        ))}

        {/* Active line being typed */}
        {activeText && (
          <div className={`${styles.activeLine} ${styles["tone-neutral"]}`}>
            <span className={styles.activeText}>{activeText}</span>
            <span className={styles.cursor} />
          </div>
        )}
      </div>

      <div className={styles.seedCorner}>
        {seedDisplay || "resolving…"} · epoch {epoch.toString().padStart(4, "0")} · {emittedCount}
        {isPaused && " [paused]"}
      </div>

      <div ref={liveRegionRef} className={styles.liveRegion} role="status" aria-live="assertive" aria-atomic="true" />
    </div>
  )
}
