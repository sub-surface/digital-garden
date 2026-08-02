import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { useShell } from "@/hooks/useShell"
import { Terminal } from "./Terminal"
import styles from "./TerminalOverlay.module.scss"

/** The shared Ctrl/Cmd+P surface: the OS prompt, without leaving the note. */
export function TerminalOverlay() {
  const open = useStore((s) => s.isTerminalOpen)
  const setOpen = useStore((s) => s.setTerminal)
  const navigate = useNavigate()
  const shell = useShell()
  const close = useCallback(() => setOpen(false), [setOpen])
  const frameRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: close })

  const onOpen = useCallback(
    (slug: string) => {
      close()
      if (shell === "main") {
        navigate({ to: "/$", params: { _splat: slug } })
      } else {
        // Wiki/chat use the same catch-all router for different surfaces. A
        // garden document therefore needs its canonical host, in a new tab so
        // the terminal's originating workspace remains intact.
        window.open(`https://subsurfaces.net/${slug}`, "_blank", "noopener")
      }
    },
    [close, navigate, shell],
  )

  if (!open) return null

  return (
    <div className={styles.backdrop} onPointerDown={close}>
      <div
        ref={frameRef}
        className={styles.frame}
        role="dialog"
        aria-modal="true"
        aria-label="Subsurfaces terminal"
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={styles.titleBar}>
          <span>MS-DOS Prompt — SUBSURFACES 95</span>
          <button type="button" onClick={close} aria-label="Close terminal">×</button>
        </div>
        <Terminal surface="overlay" onOpen={onOpen} onClose={close} />
      </div>
    </div>
  )
}
