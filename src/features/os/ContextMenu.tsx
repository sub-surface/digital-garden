import { useEffect, useRef } from "react"
import styles from "./OS.module.scss"

export interface MenuEntry {
  label: string
  onClick?: () => void
  /** Rendered greyed and inert — Win95 menus were full of these and so is this one. */
  disabled?: boolean
  separatorAfter?: boolean
}

interface Props {
  x: number
  y: number
  entries: MenuEntry[]
  onClose: () => void
}

export function ContextMenu({ x, y, entries, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    // Capture phase: a press anywhere else should dismiss before that press is
    // handled as a click on whatever is underneath.
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  // Flip the menu back inside the viewport when opened near an edge.
  const style: React.CSSProperties = {
    left: Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1280) - 190),
    top: Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 800) - 40 - entries.length * 24),
  }

  return (
    <div className={styles.contextMenu} style={style} ref={ref} role="menu">
      {entries.map((entry, i) => (
        <div key={`${entry.label}-${i}`}>
          <button
            className={styles.startItem}
            data-disabled={entry.disabled}
            role="menuitem"
            onClick={() => {
              if (entry.disabled) return
              entry.onClick?.()
              onClose()
            }}
          >
            {entry.label}
          </button>
          {entry.separatorAfter && <div className={styles.startSep} />}
        </div>
      ))}
    </div>
  )
}
