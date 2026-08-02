import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useStore } from "@/store"
import styles from "./ImageLightbox.module.scss"

interface Props {
  src: string
  alt?: string
  caption?: ReactNode
  positionLabel?: string
  onPrevious?: () => void
  onNext?: () => void
  onClose: () => void
}

interface View {
  zoom: number
  x: number
  y: number
}

const RESET_VIEW: View = { zoom: 1, x: 0, y: 0 }
const MIN_ZOOM = 1
const MAX_ZOOM = 8

/** One site-wide viewer: wheel/buttons zoom, drag pans, double-click toggles. */
export function ImageLightbox({
  src,
  alt,
  caption,
  positionLabel,
  onPrevious,
  onNext,
  onClose,
}: Props) {
  const dimensions = useStore((s) => s.imageDimensions?.[src])
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null)
  const [view, setView] = useState<View>(RESET_VIEW)

  const reset = useCallback(() => setView(RESET_VIEW), [])
  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    setView((current) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor))
      if (zoom <= MIN_ZOOM) return RESET_VIEW
      if (!rect || clientX === undefined || clientY === undefined) {
        return { ...current, zoom }
      }
      const anchorX = clientX - (rect.left + rect.width / 2)
      const anchorY = clientY - (rect.top + rect.height / 2)
      const ratio = zoom / current.zoom
      return {
        zoom,
        x: anchorX - (anchorX - current.x) * ratio,
        y: anchorY - (anchorY - current.y) * ratio,
      }
    })
  }, [])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const handled = event.key === "Escape" || event.key === "+" || event.key === "=" ||
        event.key === "-" || event.key === "0" ||
        (event.key === "ArrowLeft" && Boolean(onPrevious)) ||
        (event.key === "ArrowRight" && Boolean(onNext))
      if (!handled) return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "Escape") onClose()
      else if (event.key === "+" || event.key === "=") zoomAt(1.25)
      else if (event.key === "-") zoomAt(0.8)
      else if (event.key === "0") reset()
      else if (event.key === "ArrowLeft") onPrevious?.()
      else if (event.key === "ArrowRight") onNext?.()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose, onNext, onPrevious, reset, zoomAt])

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Image viewer: ${alt}` : "Image viewer"}
      onClick={onClose}
    >
      <div
        ref={stageRef}
        className={styles.stage}
        data-zoomed={view.zoom > 1 || undefined}
        onWheel={(event) => {
          event.preventDefault()
          zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY)
        }}
        onDoubleClick={(event) => {
          if (view.zoom > 1) reset()
          else zoomAt(2, event.clientX, event.clientY)
        }}
        onPointerDown={(event) => {
          if (view.zoom <= 1 || event.button !== 0) return
          dragRef.current = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            x: view.x,
            y: view.y,
          }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          setView((current) => ({
            ...current,
            x: drag.x + event.clientX - drag.clientX,
            y: drag.y + event.clientY - drag.clientY,
          }))
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return
          dragRef.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
      >
        <img
          className={styles.image}
          src={src}
          alt={alt ?? ""}
          width={dimensions?.width}
          height={dimensions?.height}
          draggable={false}
          onLoad={reset}
          onClick={(event) => event.stopPropagation()}
          style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})` }}
        />
      </div>

      <div className={styles.controls} onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => zoomAt(0.8)} disabled={view.zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
        <button type="button" className={styles.zoomValue} onClick={reset} title="Reset zoom (0)">{Math.round(view.zoom * 100)}%</button>
        <button type="button" onClick={() => zoomAt(1.25)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
        <button type="button" onClick={onClose} aria-label="Close image viewer">×</button>
      </div>

      {(caption || positionLabel || onPrevious || onNext) && (
        <div className={styles.footer} onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={onPrevious} disabled={!onPrevious} aria-label="Previous image">←</button>
          <div>
            {caption && <div className={styles.caption}>{caption}</div>}
            {positionLabel && <div className={styles.position}>{positionLabel}</div>}
          </div>
          <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next image">→</button>
        </div>
      )}

      <div className={styles.hint}>scroll to zoom · drag to pan · double-click to reset</div>
    </div>,
    document.body,
  )
}
