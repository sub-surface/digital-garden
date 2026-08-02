import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useStore, BG_MODES } from "@/store"
import type { NoteMetadata } from "@/types/content"
import { ErrorBoundary } from "@/components/ui/ErrorBoundary"
import { useOS, useOSFiles, useOSSettings, focusedWindowId } from "./osStore"
import { useOpenNote } from "./appNavigation"
import { APPS } from "./appRegistry"
import { WindowFrame } from "./WindowFrame"
import { Taskbar, TASKBAR_H, type MenuTarget } from "./Taskbar"
import { OSIcon, type IconName } from "./OSIcon"
import { ContextMenu } from "./ContextMenu"
import { DesktopWidgets } from "./DesktopWidgets"
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
  { id: "home", label: "My Documents", icon: "folder", kind: "app", target: "explorer", title: "My Documents", args: { drive: "home" } },
  { id: "images", label: "Images", icon: "folder", kind: "app", target: "images", title: "Images" },
  { id: "notepad", label: "Notepad", icon: "doc", kind: "app", target: "notepad", title: "Untitled.txt — Notepad" },
  { id: "readme", label: "README.TXT", icon: "doc", kind: "note", target: "i-didnt-read" },
  { id: "readme1st", label: "README.1ST", icon: "doc", kind: "note", target: "readme-1st" },
  { id: "prompt", label: "MS-DOS Prompt", icon: "terminal", kind: "app", target: "prompt", title: "MS-DOS Prompt" },
  { id: "media", label: "Media Player", icon: "music", kind: "app", target: "media", title: "Subsurfaces Media Player" },
  { id: "messenger", label: "Messenger", icon: "chat", kind: "app", target: "messenger", title: "Subsurfaces Messenger" },
  { id: "solitaire", label: "Solitaire", icon: "app", kind: "app", target: "solitaire", title: "Solitaire" },
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
  const [selected, setSelected] = useState<string[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const desktopOrder = useOSSettings((s) => s.desktopOrder)
  const desktopPositions = useOSSettings((s) => s.desktopPositions)
  const setDesktopPosition = useOSSettings((s) => s.setDesktopPosition)
  const setDesktopPositions = useOSSettings((s) => s.setDesktopPositions)
  const resetDesktopOrder = useOSSettings((s) => s.resetDesktopOrder)
  const openWelcome = useOSSettings((s) => s.openWelcome)
  const draggedIcon = useRef<string | null>(null)
  const iconGridRef = useRef<HTMLDivElement>(null)
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)
  const welcomedRef = useRef(false)

  const bounds = useMemo(
    () => ({ width: viewport.width, height: viewport.height, bottomInset: TASKBAR_H }),
    [viewport.width, viewport.height],
  )

  const focused = focusedWindowId(windows)
  const orderedShortcuts = useMemo(() => {
    if (!desktopOrder.length) return SHORTCUTS
    const rank = new Map(desktopOrder.map((id, index) => [id, index]))
    return [...SHORTCUTS].sort((a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
  }, [desktopOrder])
  const gridRows = Math.max(1, Math.floor((viewport.height - TASKBAR_H - 16) / 88))
  const gridCols = Math.max(1, Math.floor((viewport.width - 16) / 80))
  const iconPosition = useCallback((id: string, index: number) => {
    const stored = desktopPositions[id]
    return stored
      ? { col: Math.min(gridCols, Math.max(1, stored.col)), row: Math.min(gridRows, Math.max(1, stored.row)) }
      : { col: Math.floor(index / gridRows) + 1, row: (index % gridRows) + 1 }
  }, [desktopPositions, gridCols, gridRows])
  const moveIcon = useCallback((id: string, col: number, row: number) => {
    const next = { ...desktopPositions }
    const fromIndex = orderedShortcuts.findIndex((shortcut) => shortcut.id === id)
    const from = iconPosition(id, fromIndex)
    const target = orderedShortcuts.find((shortcut, index) => {
      const position = iconPosition(shortcut.id, index)
      return shortcut.id !== id && position.col === col && position.row === row
    })
    next[id] = { col, row }
    if (target) next[target.id] = from
    setDesktopPositions(next)
  }, [desktopPositions, iconPosition, orderedShortcuts, setDesktopPositions])

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
          appId: "browser",
          args: { slug: shortcut.target },
          title: shortcut.label,
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

  useEffect(() => {
    if (!openWelcome || welcomedRef.current || !contentIndex?.index) return
    welcomedRef.current = true
    const note = contentIndex.index
    openWindow({
      appId: "browser",
      args: { slug: note.slug },
      title: `${note.title} — ${note.slug.toUpperCase()}.TXT`,
      w: 740,
      h: 570,
      silent: true,
    })
  }, [contentIndex, openWelcome, openWindow])

  // Global hotkeys. Bare-letter bindings must never fire while the user is
  // typing — the terminal, the Run box and the search overlay all live here.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      if (el.isContentEditable) return true
      if (tag === "TEXTAREA" || tag === "SELECT") return true
      if (tag === "INPUT") return !(el as HTMLInputElement).readOnly
      return false
    }

    const onKey = (e: KeyboardEvent) => {
      // Ctrl+P — the terminal, one keystroke away, anywhere in the OS.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "p" || e.key === "P")) {
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

      if (e.key === "Backspace" && !isTyping(e.target)) {
        e.preventDefault()
        return
      }

      // Ctrl+` is deliberately scoped to this page: a compact in-machine task
      // switcher that does not steal Alt+Tab from the reader's real desktop.
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault()
        const state = useOS.getState()
        const ordered = [...state.windows].sort((a, b) => b.z - a.z)
        if (!ordered.length) return
        const current = focusedWindowId(ordered)
        const index = Math.max(0, ordered.findIndex((win) => win.id === current))
        const next = ordered[(index + 1) % ordered.length]
        if (next.state === "minimized") state.toggleMinimize(next.id)
        state.focusWindow(next.id)
        return
      }

      if (e.key === "Escape") {
        // Embedded programs get first refusal: zen modes and control sheets use
        // Escape internally and call preventDefault before this window handler.
        if (e.defaultPrevented) return
        const overlays = useStore.getState()
        if (overlays.isSearchOpen || overlays.isCheatSheetOpen || overlays.isThemePanelOpen) return
        e.preventDefault()
        const state = useOS.getState()
        const top = focusedWindowId(state.windows)
        if (top) state.closeWindow(top)
        else state.setStartOpen(false)
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
            {
              label: useOSSettings.getState().showWidgets ? "Hide Desktop Widgets" : "Show Desktop Widgets",
              onClick: () => useOSSettings.getState().setShowWidgets(!useOSSettings.getState().showWidgets),
            },
            { label: "Arrange Icons", onClick: resetDesktopOrder },
            { label: "Line up Icons", onClick: resetDesktopOrder, separatorAfter: true },
            { label: "Refresh", onClick: () => window.location.reload(), separatorAfter: true },
            {
              label: "New Text Document",
              onClick: () => {
                const id = useOSFiles.getState().createFile()
                openWindow({ appId: "notepad", args: { fileId: id }, title: "Untitled.txt — Notepad" })
              },
              separatorAfter: true,
            },
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
            setSelected([])
            setStartOpen(false)
            if (e.button === 0) {
              const rect = e.currentTarget.getBoundingClientRect()
              const start = { x: e.clientX - rect.left, y: e.clientY - rect.top }
              marqueeStart.current = start
              setMarquee({ ...start, w: 0, h: 0 })
              e.currentTarget.setPointerCapture(e.pointerId)
            }
          }
        }}
        onPointerMove={(e) => {
          const start = marqueeStart.current
          if (!start) return
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          setMarquee({ x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) })
        }}
        onPointerUp={(e) => {
          const box = marquee
          marqueeStart.current = null
          setMarquee(null)
          if (!box || (box.w < 4 && box.h < 4)) return
          const hits = orderedShortcuts.filter((shortcut, index) => {
            const position = iconPosition(shortcut.id, index)
            const icon = { x: 8 + (position.col - 1) * 80, y: 8 + (position.row - 1) * 88, w: 76, h: 84 }
            return icon.x < box.x + box.w && icon.x + icon.w > box.x && icon.y < box.y + box.h && icon.y + icon.h > box.y
          }).map((shortcut) => shortcut.id)
          setSelected(hits)
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const id = draggedIcon.current
          const grid = iconGridRef.current
          if (!id || !grid) return
          e.preventDefault()
          const rect = grid.getBoundingClientRect()
          const col = Math.min(gridCols, Math.max(1, Math.floor((e.clientX - rect.left) / 80) + 1))
          const row = Math.min(gridRows, Math.max(1, Math.floor((e.clientY - rect.top) / 88) + 1))
          moveIcon(id, col, row)
        }}
      >
        <DesktopWidgets />
        {marquee && <div className={styles.marquee} style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        <div className={styles.iconGrid} ref={iconGridRef}>
          {orderedShortcuts.map((shortcut, shortcutIndex) => {
            const position = iconPosition(shortcut.id, shortcutIndex)
            return (
            <button
              key={shortcut.id}
              className={styles.icon}
              data-selected={selected.includes(shortcut.id)}
              style={{ gridColumn: position.col, gridRow: position.row }}
              onClick={(e) => {
                setSelected([shortcut.id])
                if (!useOSSettings.getState().doubleClickToOpen && e.detail === 1) openShortcut(shortcut)
              }}
              onDoubleClick={() => {
                if (useOSSettings.getState().doubleClickToOpen) openShortcut(shortcut)
              }}
              draggable
              onDragStart={() => { draggedIcon.current = shortcut.id }}
              onDragEnd={() => { draggedIcon.current = null }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const from = draggedIcon.current
                if (!from || from === shortcut.id) return
                moveIcon(from, position.col, position.row)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") openShortcut(shortcut)
                if (e.ctrlKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
                  e.preventDefault()
                  const col = position.col + (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0)
                  const row = position.row + (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0)
                  moveIcon(shortcut.id, Math.min(gridCols, Math.max(1, col)), Math.min(gridRows, Math.max(1, row)))
                }
              }}
            >
              <OSIcon name={shortcut.icon} size={32} className={styles.iconGlyph} />
              <span className={styles.iconLabel}>{shortcut.label}</span>
            </button>
          )})}
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
              menus={app.menus?.(win)}
            >
              <ProgramBoundary
                appId={win.appId}
                title={win.title}
                windowId={win.id}
                resetKeys={[win.appId, JSON.stringify(win.args)]}
              >
                <Suspense fallback={<ProgramLoading title={win.title} />}>
                  <Component args={win.args} windowId={win.id} />
                </Suspense>
              </ProgramBoundary>
            </WindowFrame>
          )
        })}
      </div>

      <Taskbar onOpenShortcut={openShortcut} />
    </>
  )
}

function ProgramLoading({ title }: { title: string }) {
  return (
    <div className={styles.programLoading} role="status">
      Loading {title}…
    </div>
  )
}

export function ProgramBoundary({
  appId,
  title,
  windowId,
  resetKeys,
  children,
}: {
  appId: string
  title: string
  windowId: string
  resetKeys?: unknown[]
  children: ReactNode
}) {
  const closeWindow = useOS((state) => state.closeWindow)
  return (
    <ErrorBoundary
      label={`${appId} program`}
      resetKeys={[windowId, ...(resetKeys ?? [])]}
      fallback={(error, reset) => {
        const chunkError = /dynamically imported module|Failed to fetch|Importing a module script failed|ChunkLoadError/i.test(error.message)
        return (
          <div className={styles.programError} role="alert">
            <div className={styles.programErrorDialog}>
              <OSIcon name="computer" size={32} />
              <div className={styles.programErrorCopy}>
                <strong>{title} has performed an illegal operation.</strong>
                <span>The program will stay isolated from the rest of the desktop.</span>
                <code>{error.message}</code>
              </div>
            </div>
            <div className={styles.programErrorActions}>
              <button type="button" onClick={reset}>Retry</button>
              {chunkError && <button type="button" onClick={() => window.location.reload()}>Reload Windows</button>}
              <button type="button" onClick={() => closeWindow(windowId)}>Close</button>
            </div>
          </div>
        )
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

/**
 * A small crib sheet, top-right. Win95 never had one; a site that hands you an
 * OS with no manual should. F1 toggles it, and the choice persists.
 */
const HOTKEYS: [string, string][] = [
  ["B", "next background"],
  ["Ctrl+P", "command prompt"],
  ["Ctrl+`", "next task"],
  ["Esc", "close active window"],
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
