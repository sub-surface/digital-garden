import { useCallback, useEffect, useMemo, useState } from "react"
import { useStore } from "@/store"
import type { NoteMetadata } from "@/types/content"
import { useOS, focusedWindowId } from "./osStore"
import { APPS, useOpenNote } from "./apps"
import { WindowFrame } from "./WindowFrame"
import { Taskbar, TASKBAR_H, type MenuTarget } from "./Taskbar"
import { OSIcon, type IconName } from "./OSIcon"
import styles from "./OS.module.scss"

/**
 * Desktop shortcuts. Note entries resolve through the content index at click
 * time. Extends MenuTarget so the Start menu and the desktop can share one
 * open action — the handler takes the looser shape.
 */
interface Shortcut extends MenuTarget {
  id: string
  icon: IconName
}

const SHORTCUTS: Shortcut[] = [
  { id: "computer", label: "My Computer", icon: "computer", kind: "app", target: "computer", title: "My Computer" },
  { id: "garden", label: "C:\\GARDEN", icon: "folder", kind: "app", target: "explorer", title: "C:\\GARDEN" },
  { id: "readme", label: "README.TXT", icon: "doc", kind: "note", target: "i-didnt-read" },
  { id: "readme1st", label: "README.1ST", icon: "doc", kind: "note", target: "readme-1st" },
  { id: "bin", label: "Recycle Bin", icon: "bin", kind: "app", target: "bin", title: "Recycle Bin" },
  { id: "constellation", label: "CONSTELLATION", icon: "graph", kind: "note", target: "graph" },
  { id: "display", label: "Display", icon: "display", kind: "app", target: "display", title: "Display Properties" },
]

function useViewport() {
  const [size, setSize] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 800 : window.innerHeight,
  }))

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return size
}

export function Desktop() {
  const windows = useOS((s) => s.windows)
  const openWindow = useOS((s) => s.openWindow)
  const setStartOpen = useOS((s) => s.setStartOpen)
  const contentIndex = useStore((s) => s.contentIndex)
  const openNote = useOpenNote()
  const viewport = useViewport()
  const [selected, setSelected] = useState<string | null>(null)

  const bounds = useMemo(
    () => ({ width: viewport.width, height: viewport.height, bottomInset: TASKBAR_H }),
    [viewport.width, viewport.height],
  )

  const focused = focusedWindowId(windows)

  const openShortcut = useCallback(
    (shortcut: MenuTarget) => {
      if (shortcut.kind === "app") {
        const app = APPS[shortcut.target]
        openWindow({
          appId: shortcut.target,
          args: shortcut.args ?? {},
          title: shortcut.title ?? shortcut.label,
          w: app?.defaultSize?.w,
          h: app?.defaultSize?.h,
          multiInstance: app?.multiInstance,
        })
        return
      }

      // Notes resolve through the index so a renamed or unpublished note fails
      // visibly rather than opening an empty frame.
      const note = contentIndex?.[shortcut.target] as NoteMetadata | undefined
      if (note) {
        openNote(note)
      } else {
        openWindow({
          appId: "notepad",
          args: { slug: shortcut.target },
          title: shortcut.label,
          multiInstance: true,
        })
      }
    },
    [contentIndex, openNote, openWindow],
  )

  // Alt+Tab cycles, Alt+F4 closes, Ctrl+Esc opens Start.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Escape") {
        e.preventDefault()
        setStartOpen(!useOS.getState().isStartOpen)
        return
      }
      if (e.altKey && e.key === "Tab") {
        e.preventDefault()
        const state = useOS.getState()
        const visible = state.windows.filter((w) => w.state !== "minimized")
        if (visible.length < 2) return
        // Focus the *lowest* window — repeated presses walk the whole stack.
        const bottom = visible.reduce((low, w) => (w.z < low.z ? w : low))
        state.focusWindow(bottom.id)
        return
      }
      if (e.altKey && e.key === "F4") {
        e.preventDefault()
        const state = useOS.getState()
        const top = focusedWindowId(state.windows)
        if (top) state.closeWindow(top)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setStartOpen])

  return (
    <>
      <div
        className={styles.desktop}
        onPointerDown={(e) => {
          // A press on the desktop itself clears selection and dismisses Start.
          if (e.target === e.currentTarget) {
            setSelected(null)
            setStartOpen(false)
          }
        }}
      >
        <div className={styles.iconGrid}>
          {SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut.id}
              className={styles.icon}
              data-selected={selected === shortcut.id}
              onClick={() => setSelected(shortcut.id)}
              onDoubleClick={() => openShortcut(shortcut)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openShortcut(shortcut)
              }}
            >
              <OSIcon name={shortcut.icon} size={32} className={styles.iconGlyph} />
              <span className={styles.iconLabel}>{shortcut.label}</span>
            </button>
          ))}
        </div>

        {windows.map((win) => {
          const app = APPS[win.appId]
          if (!app) return null
          const { Component } = app
          return (
            <WindowFrame
              key={win.id}
              win={win}
              icon={app.icon}
              focused={focused === win.id}
              bounds={bounds}
              menus={app.menus}
            >
              <Component args={win.args} />
            </WindowFrame>
          )
        })}
      </div>

      <Taskbar onOpenShortcut={openShortcut} />
    </>
  )
}

export type { Shortcut }
