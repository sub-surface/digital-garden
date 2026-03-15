import { useEffect } from "react"
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

  return (
    <div className={styles.overlay} onClick={onClose}>
      <img
        className={styles.image}
        src={src}
        alt={alt ?? ""}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
