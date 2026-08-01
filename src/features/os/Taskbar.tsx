import { useEffect, useMemo, useState } from "react"
import { useStore } from "@/store"
import { useOS, focusedWindowId } from "./osStore"
import { APPS, PROGRAM_MENU } from "./apps"
import { OSIcon } from "./OSIcon"
import styles from "./OS.module.scss"

/** Kept in sync with --os-taskbar-h in OS.module.scss. */
export const TASKBAR_H = 32

/**
 * Structural shape, deliberately not imported from Desktop — Desktop imports
 * this module for the component, and a value-level cycle between them would be
 * a real one. Desktop's richer Shortcut is assignable to this.
 */
export interface MenuTarget {
  kind: "app" | "note"
  target: string
  label: string
  title?: string
  args?: Record<string, string>
}

interface Props {
  onOpenShortcut: (target: MenuTarget) => void
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Align the first tick to the next minute so the display never lags by ~59s.
    const msToMinute = 60_000 - (Date.now() % 60_000)
    let interval: ReturnType<typeof setInterval>
    const timeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 60_000)
    }, msToMinute)
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [])
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function Taskbar({ onOpenShortcut }: Props) {
  const windows = useOS((s) => s.windows)
  const isStartOpen = useOS((s) => s.isStartOpen)
  const setStartOpen = useOS((s) => s.setStartOpen)
  const focusWindow = useOS((s) => s.focusWindow)
  const toggleMinimize = useOS((s) => s.toggleMinimize)
  const clock = useClock()

  const focused = focusedWindowId(windows)

  return (
    <>
      {isStartOpen && <StartMenu onOpenShortcut={onOpenShortcut} />}

      <div className={styles.taskbar}>
        <button
          className={styles.startBtn}
          aria-expanded={isStartOpen}
          onClick={() => setStartOpen(!isStartOpen)}
        >
          <OSIcon name="graph" size={16} />
          Start
        </button>

        <div className={styles.taskDivider} />

        <div className={styles.taskList}>
          {windows.map((win) => {
            const app = APPS[win.appId]
            const active = focused === win.id && win.state !== "minimized"
            return (
              <button
                key={win.id}
                className={styles.taskBtn}
                data-active={active}
                onClick={() => {
                  // Clicking the active window's button minimizes it; clicking
                  // any other raises it. Standard taskbar behaviour.
                  if (active) toggleMinimize(win.id)
                  else if (win.state === "minimized") toggleMinimize(win.id)
                  else focusWindow(win.id)
                  if (win.state === "minimized") focusWindow(win.id)
                }}
                title={win.title}
              >
                {app && <OSIcon name={app.icon} size={16} />}
                <span className={styles.taskBtnLabel}>{win.title}</span>
              </button>
            )
          })}
        </div>

        <div className={styles.tray}>{clock}</div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

type Flyout = "programs" | "documents" | "help" | null

function StartMenu({ onOpenShortcut }: Props) {
  const setStartOpen = useOS((s) => s.setStartOpen)
  const openWindow = useOS((s) => s.openWindow)
  const contentIndex = useStore((s) => s.contentIndex)
  const [flyout, setFlyout] = useState<Flyout>(null)

  const recent = useMemo(() => {
    if (!contentIndex) return []
    return Object.values(contentIndex)
      .filter((n) => !n.draft && !n.system && n.date)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 10)
  }, [contentIndex])

  const openApp = (appId: string, title: string, args: Record<string, string> = {}) => {
    const app = APPS[appId]
    openWindow({
      appId,
      args,
      title,
      w: app?.defaultSize?.w,
      h: app?.defaultSize?.h,
      multiInstance: app?.multiInstance,
    })
  }

  return (
    <div className={styles.startMenu} onPointerDown={(e) => e.stopPropagation()}>
      <div className={styles.startRail}>Subsurfaces 95</div>

      <div className={styles.startItems}>
        <MenuRow
          label="Programs"
          icon="app"
          submenu
          onEnter={() => setFlyout("programs")}
          flyout={
            flyout === "programs" && (
              <div className={styles.startFlyout}>
                {PROGRAM_MENU.map((p) => (
                  <button
                    key={p.slug}
                    className={styles.startItem}
                    onClick={() => onOpenShortcut({ kind: "note", target: p.slug, label: p.title })}
                  >
                    <OSIcon name="app" size={16} />
                    {p.title}
                  </button>
                ))}
              </div>
            )
          }
        />

        <MenuRow
          label="Documents"
          icon="doc"
          submenu
          onEnter={() => setFlyout("documents")}
          flyout={
            flyout === "documents" && (
              <div className={styles.startFlyout}>
                {recent.length === 0 && <span className={styles.startEmpty}>(Empty)</span>}
                {recent.map((note) => (
                  <button
                    key={note.slug}
                    className={styles.startItem}
                    onClick={() =>
                      onOpenShortcut({ kind: "note", target: note.slug, label: note.title })
                    }
                  >
                    <OSIcon name="doc" size={16} />
                    {note.title}
                  </button>
                ))}
              </div>
            )
          }
        />

        <MenuRow
          label="Settings"
          icon="display"
          onEnter={() => setFlyout(null)}
          onClick={() => openApp("display", "Display Properties")}
        />

        <MenuRow
          label="Find"
          icon="folder"
          onEnter={() => setFlyout(null)}
          onClick={() => openApp("explorer", "C:\\GARDEN")}
        />

        <MenuRow
          label="Help"
          icon="help"
          submenu
          onEnter={() => setFlyout("help")}
          flyout={
            flyout === "help" && (
              <div className={styles.startFlyout}>
                {HELP_FILES.map((h) => (
                  <button
                    key={h.slug}
                    className={styles.startItem}
                    onClick={() => openApp("help", h.title, { slug: h.slug })}
                  >
                    <OSIcon name="help" size={16} />
                    {h.title}
                  </button>
                ))}
              </div>
            )
          }
        />

        <div className={styles.startSep} />

        <MenuRow
          label="Restart in MS-DOS mode"
          icon="terminal"
          onEnter={() => setFlyout(null)}
          onClick={() => {
            setStartOpen(false)
            window.dispatchEvent(new CustomEvent("os:dos-mode"))
          }}
        />

        <MenuRow
          label="Shut Down..."
          icon="computer"
          onEnter={() => setFlyout(null)}
          onClick={() => {
            window.location.href = "https://subsurfaces.net"
          }}
        />
      </div>
    </div>
  )
}

const HELP_FILES = [
  { slug: "touch-grass", title: "GRASS.HLP" },
  { slug: "its-giving", title: "LEXICON.HLP" },
  { slug: "trust-me-bro", title: "SOURCES.HLP" },
]

interface MenuRowProps {
  label: string
  icon: Parameters<typeof OSIcon>[0]["name"]
  submenu?: boolean
  onEnter: () => void
  onClick?: () => void
  flyout?: React.ReactNode
}

function MenuRow({ label, icon, submenu, onEnter, onClick, flyout }: MenuRowProps) {
  return (
    <div className={styles.startRow} onPointerEnter={onEnter}>
      <button className={styles.startItem} onClick={onClick}>
        <OSIcon name={icon} size={16} />
        <span className={styles.startLabel}>{label}</span>
        {submenu && <span className={styles.startArrow}>▸</span>}
      </button>
      {flyout}
    </div>
  )
}
