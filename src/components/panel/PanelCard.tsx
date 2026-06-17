import { useRef, useEffect } from "react"
import { useTelescopicHandlers } from "@/components/ui/TelescopicHandler"
import { NoteBody } from "@/components/ui/reader/NoteBody"
import styles from "./Panel.module.scss"

interface Props {
  title: string
  slug: string
  index: number
  onClose: () => void
  onPromote: () => void
}

export function PanelCard({ title, slug, index, onClose, onPromote }: Props) {
  const contentRef = useRef<HTMLDivElement>(null)

  // Attach telescopic text handlers to panel content
  useTelescopicHandlers(contentRef)

  // Scroll card into view when it appears. Defer to the next frame so layout
  // (and the mount animation) has settled, otherwise the scroll target moves
  // out from under us and the workspace snaps back to the left.
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" })
    })
    return () => cancelAnimationFrame(id)
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
      data-testid="panel-card"
    >
      {/* Vertical tab header */}
      <div className={styles.cardHeader}>
        <div className={styles.actions}>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close card"
          >
            &times;
          </button>
          <button
            className={styles.expandBtn}
            onClick={onPromote}
            aria-label="Open as full page"
            title="Open as full page"
          >
            +
          </button>
        </div>
        <div className={styles.titleWrap} onClick={onPromote} title="Open as main page">
          <span className={styles.title}>{title}</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className={styles.contentScroll}>
        <NoteBody slug={slug} />
      </div>
    </div>
  )
}
