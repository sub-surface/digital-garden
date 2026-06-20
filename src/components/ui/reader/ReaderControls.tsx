import { useStore } from "@/store"
import styles from "./ReaderControls.module.scss"

/**
 * Reader-mode typography controls — a small fixed cluster, only mounted while
 * reader mode is on, for stepping the measure (line length) and font scale.
 * Both persist to localStorage via the store. Exit reader mode here too, since
 * the ambient chrome is hidden.
 */
export function ReaderControls() {
  const isReaderMode = useStore((s) => s.isReaderMode)
  const toggleReaderMode = useStore((s) => s.toggleReaderMode)
  const measure = useStore((s) => s.readerMeasureCh)
  const scale = useStore((s) => s.readerScale)
  const cycleMeasure = useStore((s) => s.cycleReaderMeasure)
  const cycleScale = useStore((s) => s.cycleReaderScale)

  if (!isReaderMode) return null

  return (
    <div className={styles.controls} data-reader-controls aria-label="Reader settings">
      <div className={styles.group}>
        <span className={styles.label}>Width</span>
        <button className={styles.step} onClick={() => cycleMeasure(-1)} aria-label="Narrower" title="Narrower">−</button>
        <span className={styles.value}>{measure}ch</span>
        <button className={styles.step} onClick={() => cycleMeasure(1)} aria-label="Wider" title="Wider">+</button>
      </div>
      <div className={styles.group}>
        <span className={styles.label}>Text</span>
        <button className={styles.step} onClick={() => cycleScale(-1)} aria-label="Smaller text" title="Smaller">−</button>
        <span className={styles.value}>{Math.round(scale * 100)}%</span>
        <button className={styles.step} onClick={() => cycleScale(1)} aria-label="Larger text" title="Larger">+</button>
      </div>
      <button
        className={styles.exit}
        onClick={toggleReaderMode}
        title="Exit reader mode"
        aria-label="Exit reader mode"
      >
        Exit
      </button>
    </div>
  )
}
