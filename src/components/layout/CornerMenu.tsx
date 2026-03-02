import { useState, useRef, useEffect } from "react"
import { useStore } from "@/store"
import styles from "./CornerMenu.module.scss"

interface ArcItem {
  label: string
  to?: string
  onClick?: () => void
  devOnly?: boolean
}

export function CornerMenu() {
  const [open, setOpen] = useState(false)
  const clearStack = useStore((s) => s.clearStack)
  const toggleThemePanel = useStore((s) => s.toggleThemePanel)
  const toggleMusic = useStore((s) => s.toggleMusic)
  const containerRef = useRef<HTMLDivElement>(null)

  const ARC_ITEMS: ArcItem[] = [
    { label: "Graph", to: "/graph" },
    { label: "Music", onClick: () => { toggleMusic(); setOpen(false); } },
    { label: "Theme", onClick: () => { toggleThemePanel(); setOpen(false); } },
    ...(import.meta.env.DEV ? [{ label: "Dev", to: "/__dev", devOnly: true }] : []),
  ]

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("click", handler, true)
    return () => document.removeEventListener("click", handler, true)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open])

  const handleNav = (item: ArcItem) => {
    if (item.to) {
      clearStack()
    }
    if (item.onClick) {
      item.onClick()
    }
    setOpen(false)
  }

  // Spaced out arc positions
  const arcRadius = 110
  const startAngle = -90 // Straight up
  const sweepAngle = 100 // Spread over 100 degrees to the left
  const step = ARC_ITEMS.length > 1 ? sweepAngle / (ARC_ITEMS.length - 1) : 0

  return (
    <div className={styles.container} ref={containerRef} data-panel-ignore>
      {/* Origin-centered menu wrapper */}
      <div className={styles.menuWrapper}>
        <div className={styles.arc} data-open={open || undefined}>
          {ARC_ITEMS.map((item, i) => {
            const angle = startAngle - (i * step)
            const rad = (angle * Math.PI) / 180
            const x = Math.cos(rad) * arcRadius
            const y = Math.sin(rad) * arcRadius
            
            const commonProps = {
              className: styles.arcItem,
              onClick: () => handleNav(item),
              "data-panel-ignore": true,
              style: {
                "--arc-x": `${x}px`,
                "--arc-y": `${y}px`,
                "--arc-delay": `${i * 40}ms`,
              } as React.CSSProperties
            }

            if (item.to) {
              return (
                <a key={item.label} href={item.to} {...commonProps}>
                  {item.label}
                </a>
              )
            }

            return (
              <button key={item.label} {...commonProps}>
                {item.label}
              </button>
            )          })}
        </div>

        {/* Toggle button */}
        <button
          className={styles.toggle}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? "\u00d7" : "\u2261"}
        </button>
      </div>

      {/* Static footer info */}
      <div className={styles.static}>
        <a
          href="/about"
          className={styles.aboutLink}
          onClick={() => handleNav({ label: "About", to: "/about" })}
          data-panel-ignore
        >
          About
        </a>
        <span className={styles.copyright}>&copy; Sub-Surface</span>
      </div>
    </div>
  )
}
