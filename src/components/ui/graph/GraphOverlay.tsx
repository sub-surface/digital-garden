import { useEffect, useRef, lazy, Suspense } from "react"
import { useStore } from "@/store"
import styles from "./GraphOverlay.module.scss"

const ConstellationPage = lazy(() => import("./ConstellationPage").then(m => ({ default: m.ConstellationPage })))

export function GraphOverlay() {
  const isOpen = useStore((s) => s.isGraphOpen)
  const setOpen = useStore((s) => s.setGraphOpen)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, setOpen])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} ref={overlayRef}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>Constellation</h2>
          <button className={styles.closeBtn} onClick={() => setOpen(false)}>
            &times;
          </button>
        </div>
        <div className={styles.content}>
          <Suspense fallback={<div>Charting the sky...</div>}>
            <ConstellationPage embedded />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
