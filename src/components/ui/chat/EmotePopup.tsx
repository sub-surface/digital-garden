import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import styles from "./EmotePopup.module.scss"

interface Props {
  name: string
  src: string
  anchor: { x: number; y: number }
  onClose: () => void
}

export function EmotePopup({ name, src, anchor, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  // Position: try to center on anchor point, but clamp to viewport
  const style: React.CSSProperties = {
    left: Math.min(Math.max(anchor.x - 60, 8), window.innerWidth - 136),
    top: Math.min(Math.max(anchor.y - 140, 8), window.innerHeight - 160),
  }

  return createPortal(
    <div className={styles.popup} ref={ref} style={style}>
      <img
        className={styles.emoteImg}
        src={src}
        alt={`:${name}:`}
        onError={(e) => {
          const img = e.currentTarget as HTMLImageElement
          if (!img.dataset.pngFallback) {
            img.dataset.pngFallback = "1"
            img.src = src.replace(/\.gif$/, ".png")
          }
        }}
      />
      <span className={styles.emoteName}>:{name}:</span>
    </div>,
    document.body
  )
}
