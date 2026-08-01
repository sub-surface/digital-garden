/**
 * Window state for SUBSURFACES 95.
 *
 * Deliberately a standalone store, NOT a slice of the main garden store and NOT
 * in PERSISTED_KEYS: restoring a desktop full of windows from three weeks ago is
 * hostile, and the OS shell must not add keys to the site-wide persisted blob.
 * Session-scoped by construction — a reload is a fresh desktop.
 */

import { create } from "zustand"

export type WindowState = "normal" | "minimized" | "maximized"

export interface WindowGeometry {
  x: number
  y: number
  w: number
  h: number
}

export interface OSWindow extends WindowGeometry {
  id: string
  appId: string
  /** App arguments — e.g. { slug: "writing/on-diagrams" }. Part of the dedupe key. */
  args: Record<string, string>
  title: string
  z: number
  state: WindowState
  /** Geometry before maximize, restored on un-maximize. */
  restore?: WindowGeometry
}

/** Windows opened with the same app + args focus the existing one instead of duplicating. */
function dedupeKey(appId: string, args: Record<string, string>): string {
  const entries = Object.entries(args).sort(([a], [b]) => a.localeCompare(b))
  return `${appId}::${entries.map(([k, v]) => `${k}=${v}`).join("&")}`
}

export interface OpenWindowInput {
  appId: string
  args?: Record<string, string>
  title: string
  w?: number
  h?: number
  /** Multi-instance apps (Notepad) skip the dedupe check. */
  multiInstance?: boolean
}

interface OSStore {
  windows: OSWindow[]
  nextZ: number
  nextId: number
  isStartOpen: boolean

  openWindow: (input: OpenWindowInput) => void
  closeWindow: (id: string) => void
  focusWindow: (id: string) => void
  moveWindow: (id: string, x: number, y: number) => void
  resizeWindow: (id: string, geo: WindowGeometry) => void
  setWindowState: (id: string, state: WindowState) => void
  toggleMinimize: (id: string) => void
  toggleMaximize: (id: string) => void
  setStartOpen: (open: boolean) => void
  closeAll: () => void
}

const DEFAULT_W = 620
const DEFAULT_H = 460

/**
 * Cascade offset for a new window. Wraps every 8 windows so a long session
 * can't walk them off the bottom-right of the desktop.
 */
function cascade(count: number): { x: number; y: number } {
  const step = (count % 8) * 26
  return { x: 64 + step, y: 48 + step }
}

export const useOS = create<OSStore>((set, get) => ({
  windows: [],
  nextZ: 10,
  nextId: 1,
  isStartOpen: false,

  openWindow: ({ appId, args = {}, title, w, h, multiInstance }) => {
    const state = get()

    if (!multiInstance) {
      const key = dedupeKey(appId, args)
      const existing = state.windows.find((win) => dedupeKey(win.appId, win.args) === key)
      if (existing) {
        // Already open — focus it, and un-minimize if it was hidden.
        set({
          windows: state.windows.map((win) =>
            win.id === existing.id
              ? { ...win, z: state.nextZ, state: win.state === "minimized" ? "normal" : win.state }
              : win,
          ),
          nextZ: state.nextZ + 1,
          isStartOpen: false,
        })
        return
      }
    }

    const { x, y } = cascade(state.windows.length)
    const win: OSWindow = {
      id: `win-${state.nextId}`,
      appId,
      args,
      title,
      x,
      y,
      w: w ?? DEFAULT_W,
      h: h ?? DEFAULT_H,
      z: state.nextZ,
      state: "normal",
    }

    set({
      windows: [...state.windows, win],
      nextZ: state.nextZ + 1,
      nextId: state.nextId + 1,
      isStartOpen: false,
    })
  },

  closeWindow: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

  focusWindow: (id) =>
    set((s) => {
      const target = s.windows.find((w) => w.id === id)
      // Already on top — don't churn z-indices (or re-render) for a no-op click.
      if (!target || target.z === s.nextZ - 1) return {}
      return {
        windows: s.windows.map((w) => (w.id === id ? { ...w, z: s.nextZ } : w)),
        nextZ: s.nextZ + 1,
      }
    }),

  moveWindow: (id, x, y) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)) })),

  resizeWindow: (id, geo) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, ...geo } : w)) })),

  setWindowState: (id, state) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, state } : w)) })),

  toggleMinimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, state: w.state === "minimized" ? "normal" : "minimized" } : w,
      ),
    })),

  toggleMaximize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w
        if (w.state === "maximized") {
          // Restore geometry captured on the way in; fall back to current if absent.
          const geo = w.restore ?? { x: w.x, y: w.y, w: w.w, h: w.h }
          return { ...w, ...geo, state: "normal", restore: undefined }
        }
        return { ...w, state: "maximized", restore: { x: w.x, y: w.y, w: w.w, h: w.h } }
      }),
    })),

  setStartOpen: (open) => set({ isStartOpen: open }),

  closeAll: () => set({ windows: [] }),
}))

/** Highest-z non-minimized window — the one wearing the active title bar. */
export function focusedWindowId(windows: OSWindow[]): string | null {
  const visible = windows.filter((w) => w.state !== "minimized")
  if (visible.length === 0) return null
  return visible.reduce((top, w) => (w.z > top.z ? w : top)).id
}
