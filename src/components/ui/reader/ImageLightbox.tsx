import { useEffect } from "react"
import { createPortal } from "react-dom"
import { useStore } from "@/store"
import styles from "./ImageLightbox.module.scss"

interface Props {
  src: string
  alt?: string
  onClose: () => void
}

export function ImageLightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  const dimensions = useStore((s) => s.imageDimensions?.[src])

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <img
        className={styles.image}
        src={src}
        alt={alt ?? ""}
        width={dimensions?.width}
        height={dimensions?.height}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  )
}
