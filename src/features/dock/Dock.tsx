import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore, type DockTab } from "@/store"
import { useShell } from "@/hooks/useShell"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { Terminal } from "@/features/terminal/Terminal"
import { DockChat } from "./DockChat"
import styles from "./Dock.module.scss"

const MIN_WIDTH = 300
const MAX_WIDTH = 640

/**
 * The dock: one right-hand panel for the prompt and philchat.
 *
 * It replaced five surfaces that each did part of this: the search overlay,
 * the command palette, the `?` cheat sheet, the Ctrl+P MS-DOS window and the
 * wiki's SideChat. It pushes the page over rather than covering it (via
 * --dock-width, read by the shells and QuickControls), so you can read a note
 * and talk to it at once. On phones it is a full-screen sheet.
 *
 * Once opened it stays mounted while closed, so the prompt keeps its
 * scrollback; the chat tab unmounts when you leave it, closing its socket.
 */
export function Dock() {
  const tab = useStore((s) => s.dock)
  const openDock = useStore((s) => s.openDock)
  const closeDock = useStore((s) => s.closeDock)
  const width = useStore((s) => s.dockWidth)
  const setWidth = useStore((s) => s.setDockWidth)
  const shell = useShell()
  const isPhone = usePhoneViewport()
  const navigate = useNavigate()
  const [resizing, setResizing] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  const chatAvailable = shell !== "chat"

  // Push the page over by the dock's width (not on phones: there it covers).
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--dock-width", tab && !isPhone ? `${width}px` : "0px")
    if (tab) root.dataset.dock = tab
    else delete root.dataset.dock
    return () => {
      root.style.removeProperty("--dock-width")
      delete root.dataset.dock
    }
  }, [tab, width, isPhone])

  // Return focus to wherever it was when the dock opened.
  useEffect(() => {
    if (tab) {
      if (!panelRef.current?.contains(document.activeElement)) {
        restoreFocus.current = document.activeElement as HTMLElement | null
      }
      return
    }
    const target = restoreFocus.current
    restoreFocus.current = null
    if (target?.isConnected && panelRef.current?.contains(document.activeElement)) target.focus({ preventScroll: true })
  }, [tab])

  const onOpen = useCallback(
    (slug: string) => {
      if (shell === "chat") {
        window.open(`https://subsurfaces.net/${slug}`, "_blank", "noopener")
        return
      }
      navigate({ to: "/$", params: { _splat: slug } })
      if (isPhone) closeDock()
    },
    [shell, navigate, isPhone, closeDock],
  )

  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    setResizing(true)
    const move = (ev: PointerEvent) =>
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + startX - ev.clientX)))
    const up = () => {
      setResizing(false)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const tabs: { id: DockTab; label: string }[] = [
    { id: "prompt", label: "prompt" },
    ...(chatAvailable ? [{ id: "chat" as const, label: "philchat" }] : []),
  ]

  return (
    <aside
      ref={panelRef}
      className={styles.dock}
      style={{ width: isPhone ? undefined : width }}
      hidden={!tab}
      aria-label="Dock"
      data-panel-ignore
      data-reader-keep
      data-resizing={resizing || undefined}
    >
      {!isPhone && (
        <div
          className={styles.resizeHandle}
          onPointerDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize dock"
        />
      )}
      <div className={styles.column}>
        <header className={styles.bar}>
          <div className={styles.tabs} role="tablist" aria-label="Dock">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={styles.tab}
                onClick={() => openDock(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className={styles.keyHint}>Ctrl P</span>
          <button type="button" className={styles.close} onClick={closeDock} aria-label="Close dock" title="Close (Esc)">
            ×
          </button>
        </header>

        <div className={styles.pane} hidden={tab !== "prompt"} role="tabpanel" aria-label="Prompt">
          <Terminal surface="dock" onOpen={onOpen} onClose={closeDock} active={tab === "prompt"} />
        </div>
        {tab === "chat" && chatAvailable && (
          <div className={styles.pane} role="tabpanel" aria-label="philchat">
            <DockChat />
          </div>
        )}
      </div>
    </aside>
  )
}
