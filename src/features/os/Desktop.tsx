import { useCallback, useEffect, useMemo, useState } from "react"
import { useStore, BG_MODES } from "@/store"
import type { NoteMetadata } from "@/types/content"
import { useOS, useOSSettings, focusedWindowId } from "./osStore"
import { APPS, useOpenNote } from "./apps"
import { WindowFrame } from "./WindowFrame"
import { Taskbar, TASKBAR_H, type MenuTarget } from "./Taskbar"
import { OSIcon, type IconName } from "./OSIcon"
import { ContextMenu } from "./ContextMenu"
import { useOSLinks } from "./useOSLinks"
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
  { id: "prompt", label: "MS-DOS Prompt", icon: "terminal", kind: "app", target: "prompt", title: "MS-DOS Prompt" },
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

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

  // Links inside rendered notes open as windows instead of navigating away and
  // remounting the whole desktop.
  const openSlug = useCallback(
    (slug: string, title?: string) => {
      const note = contentIndex?.[slug] as NoteMetadata | undefined
      if (note) {
        openNote(note)
        return
      }
      // Not in the index (a system page, or a link to something unpublished) —
      // open it as a program rather than silently doing nothing.
      openWindow({
        appId: "program",
        args: { slug },
        title: title ?? slug,
        w: 860,
        h: 640,
      })
    },
    [contentIndex, openNote, openWindow],
  )

  useOSLinks(openSlug)

  // Global hotkeys. Bare-letter bindings must never fire while the user is
  // typing — the terminal, the Run box and the search overlay all live here.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
    }

    const onKey = (e: KeyboardEvent) => {
      // Ctrl+P — the terminal, one keystroke away, anywhere in the OS.
      if (e.ctrlKey && !e.shiftKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault()
        const app = APPS.prompt
        openWindow({
          appId: "prompt",
          args: {},
          title: "MS-DOS Prompt",
          w: app?.defaultSize?.w,
          h: app?.defaultSize?.h,
        })
        return
      }

      if (e.key === "F1") {
        e.preventDefault()
        useOSSettings.getState().toggleHotkeys()
        return
      }

      if (!isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // B — next background. The wallpaper is the site's ambient canvas, so
        // this is the same cycle the main site's BgModeToggle walks.
        if (e.key === "b" || e.key === "B") {
          e.preventDefault()
          const { bgMode, setBgMode } = useStore.getState()
          const idx = BG_MODES.indexOf(bgMode as (typeof BG_MODES)[number])
          const next = BG_MODES[(idx + 1) % BG_MODES.length]
          setBgMode(next)
          return
        }
      }

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
  }, [setStartOpen, openWindow])

  return (
    <>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          entries={[
            { label: "Arrange Icons", disabled: true },
            { label: "Line up Icons", disabled: true, separatorAfter: true },
            { label: "Refresh", onClick: () => window.location.reload(), separatorAfter: true },
            { label: "New", disabled: true, separatorAfter: true },
            {
              label: "Properties",
              onClick: () =>
                openWindow({ appId: "display", args: {}, title: "Display Properties", w: 420, h: 480 }),
            },
          ]}
        />
      )}

      <HotkeyHints />

      <div
        className={styles.desktop}
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget) return
          e.preventDefault()
          setStartOpen(false)
          setMenu({ x: e.clientX, y: e.clientY })
        }}
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
              <Component args={win.args} windowId={win.id} />
            </WindowFrame>
          )
        })}
      </div>

      <Taskbar onOpenShortcut={openShortcut} />
    </>
  )
}

/**
 * A small crib sheet, top-right. Win95 never had one; a site that hands you an
 * OS with no manual should. F1 toggles it, and the choice persists.
 */
const HOTKEYS: [string, string][] = [
  ["B", "next background"],
  ["Ctrl+P", "command prompt"],
  ["Ctrl+Esc", "Start menu"],
  ["Alt+Tab", "next window"],
  ["Alt+F4", "close window"],
  ["F1", "hide this"],
]

function HotkeyHints() {
  const show = useOSSettings((s) => s.showHotkeys)
  const setShow = useOSSettings((s) => s.setShowHotkeys)

  if (!show) return null

  return (
    <div className={styles.hints}>
      <div className={styles.hintsHead}>
        <span>Shortcuts</span>
        <button className={styles.hintsClose} onClick={() => setShow(false)} aria-label="Hide shortcuts">
          &times;
        </button>
      </div>
      {HOTKEYS.map(([key, what]) => (
        <div key={key} className={styles.hintRow}>
          <kbd className={styles.kbd}>{key}</kbd>
          <span>{what}</span>
        </div>
      ))}
    </div>
  )
}

export type { Shortcut }
