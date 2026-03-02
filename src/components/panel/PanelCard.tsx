import { useRef, useEffect } from "react"
import { useTelescopicHandlers } from "@/components/ui/TelescopicHandler"
import styles from "./Panel.module.scss"

interface Props {
  title: string
  html: string
  index: number
  onClose: () => void
  onPromote: () => void
}

export function PanelCard({ title, html, index, onClose, onPromote }: Props) {
  const contentRef = useRef<HTMLDivElement>(null)

  // Attach telescopic text handlers to panel content
  useTelescopicHandlers(contentRef)

  // Scroll card into view when it appears
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" })
  }, [])

  return (
    <div
      ref={cardRef}
      className={styles.card}
      style={{
        left: `${(index + 1) * 24}px`,
        zIndex: index + 10,
      }}
      data-index={index}
    >
      {/* Vertical tab header */}
      <div className={styles.cardHeader}>
        <div className={styles.titleWrap} onClick={onPromote} title="Open as main page">
          <span className={styles.title}>{title}</span>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.expandBtn}
            onClick={onPromote}
            aria-label="Open as full page"
            title="Open as full page"
          >
            +
          </button>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close card"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className={styles.contentScroll}>
        <div
          ref={contentRef}
          className={styles.content}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
