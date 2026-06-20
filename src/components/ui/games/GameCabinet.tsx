import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import styles from "./GameCabinet.module.scss"

export type CabinetStatus = "ready" | "playing" | "won" | "lost"

interface ScoreSpec {
  /** Current score, shown in the status bar. */
  value: number
  /**
   * localStorage key for the persisted best. When set, the cabinet tracks and
   * shows the best, updating it whenever `value` exceeds it (call `commitBest`
   * on game-over, or let it track live — it always keeps the max seen).
   */
  bestKey?: string
  /** Label for the score readout (default "score"). */
  label?: string
}

interface CabinetProps {
  title: string
  blurb?: string
  status: CabinetStatus
  /** The play surface — canvas / SVG / grid. */
  children: ReactNode
  /** Start / restart handler, wired to the overlay button. */
  onStart?: () => void
  /** Score tracking + best-persistence. Omit for score-less toys. */
  score?: ScoreSpec
  /** Message shown over the board on win/lose (e.g. "caught your own tail"). */
  endMessage?: string
  /** Footer hint, e.g. "arrow keys or WASD". */
  hint?: string
  /** Enable the zen / fullscreen toggle (generalises heXO's zen mode). */
  zen?: boolean
  /** Extra controls rendered in the status bar (reset, pause, presets…). */
  controls?: ReactNode
}

/**
 * Shared arcade cabinet frame: title + blurb, a play surface with a start/again
 * overlay, a score/best bar (localStorage-persisted), an optional zen/fullscreen
 * mode, and an accent-aware win flourish (`data-win`). Game logic stays in the
 * child; the cabinet owns the chrome so every game looks and behaves alike.
 */
export function GameCabinet({
  title,
  blurb,
  status,
  children,
  onStart,
  score,
  endMessage,
  hint,
  zen = false,
  controls,
}: CabinetProps) {
  const [best, setBest] = useState(() => {
    if (!score?.bestKey || typeof localStorage === "undefined") return 0
    const v = localStorage.getItem(score.bestKey)
    return v ? parseInt(v, 10) || 0 : 0
  })
  const [isZen, setIsZen] = useState(false)

  // Keep best as the running max; persist whenever it grows.
  useEffect(() => {
    if (!score?.bestKey) return
    if (score.value > best) {
      setBest(score.value)
      localStorage.setItem(score.bestKey, String(score.value))
    }
  }, [score?.value, score?.bestKey, best])

  // Esc exits zen.
  useEffect(() => {
    if (!isZen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setIsZen(false) }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [isZen])

  const toggleZen = useCallback(() => setIsZen((z) => !z), [])
  const overlayRef = useRef<HTMLDivElement>(null)

  const showOverlay = status !== "playing"

  return (
    <div
      className={styles.cabinet}
      data-zen={isZen || undefined}
      data-win={status === "won" || undefined}
      data-status={status}
    >
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {blurb && <p className={styles.blurb}>{blurb}</p>}
      </header>

      <div className={styles.board}>
        {children}

        {showOverlay && (
          <div className={styles.overlay} ref={overlayRef}>
            {endMessage && (status === "won" || status === "lost") && (
              <div className={styles.endMessage} data-win={status === "won" || undefined}>
                {endMessage}
              </div>
            )}
            {onStart && (
              <button className={styles.startBtn} onClick={onStart}>
                {status === "ready" ? "Start" : "Again"}
              </button>
            )}
            {hint && <div className={styles.hint}>{hint}</div>}
          </div>
        )}

        {zen && (
          <button
            className={styles.zenToggle}
            onClick={toggleZen}
            title={isZen ? "Exit zen (Esc)" : "Zen mode"}
            aria-label={isZen ? "Exit zen mode" : "Enter zen mode"}
          >
            {isZen ? "✕" : "⤢"}
          </button>
        )}
      </div>

      {(score || controls) && (
        <div className={styles.statusBar}>
          {controls && <div className={styles.controls}>{controls}</div>}
          {score && (
            <div className={styles.scores}>
              <span>
                {score.label ?? "score"} <strong>{score.value}</strong>
              </span>
              {score.bestKey && (
                <span>
                  best <strong>{best}</strong>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
