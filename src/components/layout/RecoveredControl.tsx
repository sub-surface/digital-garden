import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { useRestoredNotes } from "@/hooks/useRestoredNotes"
import styles from "./QuickControls.module.scss"

/** Main-garden affordance for notes explicitly recovered from SUBSURFACES 95. */
export function RecoveredControl() {
  const { slugs, setRestored } = useRestoredNotes()
  const contentIndex = useStore((state) => state.contentIndex)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const notes = slugs.map((slug) => contentIndex?.[slug]).filter(Boolean)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [open])

  if (!notes.length) return null
  return (
    <div className={styles.recoveredWrapper} ref={wrapper}>
      <button
        className={styles.recoveredButton}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Files recovered from SUBSURFACES 95"
      >
        recovered/{notes.length}
      </button>
      {open && (
        <div className={styles.recoveredDropdown}>
          <div className={styles.profileDropdownName}>Recovered from the Bin</div>
          {notes.map((note) => note && (
            <div className={styles.recoveredRow} key={note.slug}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate({ to: "/$", params: { _splat: note.slug } as any })
                }}
              >
                {note.title}
              </button>
              <button type="button" title="Return to Recycle Bin" onClick={() => void setRestored(note.slug, false)}>Ã—</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
