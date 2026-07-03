import { useEffect, useRef } from "react"
import { useStore } from "@/store"
import { useShell } from "@/hooks/useShell"
import { hotkeysForShell, HOTKEY_GROUPS } from "@/config/hotkeys"
import styles from "./KeyboardCheatSheet.module.scss"

/**
 * The `?` overlay — renders the canonical hotkey registry grouped by category.
 * Single source of truth for bindings (see src/config/hotkeys.ts). Esc closes;
 * focus is trapped while open and restored to the trigger on close.
 */
export function KeyboardCheatSheet() {
  const isOpen = useStore((s) => s.isCheatSheetOpen)
  const setOpen = useStore((s) => s.setCheatSheet)
  const shell = useShell()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  // Remember the element to restore focus to, move focus into the dialog.
  useEffect(() => {
    if (!isOpen) return
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    closeBtnRef.current?.focus()
    return () => {
      restoreFocusRef.current?.focus?.()
    }
  }, [isOpen])

  // Esc to close + simple focus trap (the dialog has one focusable: close).
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
      } else if (e.key === "Tab") {
        // Only the close button is focusable — keep focus inside.
        e.preventDefault()
        closeBtnRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen, setOpen])

  if (!isOpen) return null

  const hotkeys = hotkeysForShell(shell)
  const groups = HOTKEY_GROUPS.map((group) => ({
    group,
    items: hotkeys.filter((h) => h.group === group),
  })).filter((g) => g.items.length > 0)

  return (
    <div className={styles.overlay} onClick={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>Keyboard Shortcuts</h2>
          <button
            ref={closeBtnRef}
            className={styles.closeBtn}
            onClick={() => setOpen(false)}
            aria-label="Close keyboard shortcuts"
          >
            &times;
          </button>
        </header>

        <div className={styles.groups}>
          {groups.map(({ group, items }) => (
            <section key={group} className={styles.group}>
              <h3 className={styles.groupTitle}>{group}</h3>
              <ul className={styles.list}>
                {items.map((h) => (
                  <li key={h.label} className={styles.row}>
                    <span className={styles.label}>{h.label}</span>
                    <span className={styles.keys}>
                      {h.keys.map((k, i) => (
                        <kbd key={i} className={styles.kbd}>{k}</kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
