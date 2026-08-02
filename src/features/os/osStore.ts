/**
 * Window state for SUBSURFACES 95.
 *
 * Deliberately a standalone store, NOT a slice of the main garden store and NOT
 * in PERSISTED_KEYS: restoring a desktop full of windows from three weeks ago is
 * hostile, and the OS shell must not add keys to the site-wide persisted blob.
 * Session-scoped by construction — a reload is a fresh desktop.
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { BgMode } from "@/store"
import { playOSSound, type OSSound } from "./osSounds"
import {
  isMediaSkin,
  isMediaVizMode,
  type MediaSkin,
  type MediaVizMode,
} from "./media/mediaTheme"

/** Bump with an explicit migrate() branch whenever a persisted shape changes. */
const OS_PERSIST_VERSION = 1
const OS_MEDIA_PERSIST_VERSION = 2

// ---------------------------------------------------------------------------
// Settings — persisted, unlike window state.
//
// A separate store with its own zustand/persist key rather than entries in the
// garden's PERSISTED_KEYS: these are settings for a different machine, and the
// main site should not carry them. Still zustand/persist, not hand-rolled
// localStorage calls (CLAUDE.md gotcha #16).
// ---------------------------------------------------------------------------

export type BootSequence = "off" | "post" | "full"
export type ScreenSaverMode = "constellation" | BgMode
export type OSWidgetId = "clock" | "calendar" | "weather" | "feeds"
export interface OSCustomFeed { id: string; title: string; url: string }

interface OSSettings {
  /** off = straight to desktop; post = the BIOS check; full = the procedural TUI. */
  bootSequence: BootSequence
  setBootSequence: (b: BootSequence) => void

  showHotkeys: boolean
  setShowHotkeys: (v: boolean) => void
  toggleHotkeys: () => void

  saverEnabled: boolean
  setSaverEnabled: (v: boolean) => void
  /** Idle seconds before CONSTELLATION.SCR takes over. */
  saverDelay: number
  setSaverDelay: (v: number) => void
  saverMode: ScreenSaverMode
  setSaverMode: (v: ScreenSaverMode) => void

  doubleClickToOpen: boolean
  setDoubleClickToOpen: (v: boolean) => void

  openWelcome: boolean
  setOpenWelcome: (v: boolean) => void
  showLogon: boolean
  setShowLogon: (v: boolean) => void

  soundEnabled: boolean
  setSoundEnabled: (v: boolean) => void
  soundVolume: number
  setSoundVolume: (v: number) => void
  soundEvents: Record<OSSound, boolean>
  setSoundEvent: (sound: OSSound, enabled: boolean) => void

  showWidgets: boolean
  setShowWidgets: (v: boolean) => void
  networkWidgetsEnabled: boolean
  setNetworkWidgetsEnabled: (v: boolean) => void
  weatherEnabled: boolean
  setWeatherEnabled: (v: boolean) => void
  weatherLocation: { lat: number; lon: number } | null
  setWeatherLocation: (value: { lat: number; lon: number } | null) => void
  widgetPositions: Partial<Record<OSWidgetId, { x: number; y: number }>>
  setWidgetPosition: (id: OSWidgetId, value: { x: number; y: number }) => void
  customFeeds: OSCustomFeed[]
  addCustomFeeds: (feeds: Omit<OSCustomFeed, "id">[]) => number
  removeCustomFeed: (id: string) => void

  desktopOrder: string[]
  setDesktopOrder: (ids: string[]) => void
  desktopPositions: Record<string, { col: number; row: number }>
  setDesktopPosition: (id: string, col: number, row: number) => void
  setDesktopPositions: (positions: Record<string, { col: number; row: number }>) => void
  resetDesktopOrder: () => void
}

export const useOSSettings = create<OSSettings>()(
  persist(
    (set) => ({
      bootSequence: "post",
      setBootSequence: (bootSequence) => set({ bootSequence }),

      showHotkeys: true,
      setShowHotkeys: (showHotkeys) => set({ showHotkeys }),
      toggleHotkeys: () => set((s) => ({ showHotkeys: !s.showHotkeys })),

      saverEnabled: true,
      setSaverEnabled: (saverEnabled) => set({ saverEnabled }),
      saverDelay: 90,
      setSaverDelay: (saverDelay) => set({ saverDelay }),
      saverMode: "constellation",
      setSaverMode: (saverMode) => set({ saverMode }),

      doubleClickToOpen: true,
      setDoubleClickToOpen: (doubleClickToOpen) => set({ doubleClickToOpen }),

      openWelcome: true,
      setOpenWelcome: (openWelcome) => set({ openWelcome }),
      showLogon: true,
      setShowLogon: (showLogon) => set({ showLogon }),

      soundEnabled: true,
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      soundVolume: 0.32,
      setSoundVolume: (soundVolume) => set({ soundVolume }),
      soundEvents: { startup: true, open: false, close: false, notify: true },
      setSoundEvent: (sound, enabled) => set((state) => ({
        soundEvents: { ...state.soundEvents, [sound]: enabled },
      })),

      showWidgets: true,
      setShowWidgets: (showWidgets) => set({ showWidgets }),
      networkWidgetsEnabled: false,
      setNetworkWidgetsEnabled: (networkWidgetsEnabled) => set({ networkWidgetsEnabled }),
      weatherEnabled: false,
      setWeatherEnabled: (weatherEnabled) => set({ weatherEnabled }),
      weatherLocation: null,
      setWeatherLocation: (weatherLocation) => set({ weatherLocation }),
      widgetPositions: {},
      setWidgetPosition: (id, value) => set((state) => ({
        widgetPositions: { ...state.widgetPositions, [id]: value },
      })),
      customFeeds: [],
      addCustomFeeds: (candidates) => {
        let added = 0
        set((state) => {
          const urls = new Set(state.customFeeds.map((feed) => feed.url.toLowerCase()))
          const customFeeds = [...state.customFeeds]
          for (const candidate of candidates.slice(0, 50)) {
            let url: URL
            try { url = new URL(candidate.url) } catch { continue }
            if (!/^https?:$/.test(url.protocol) || urls.has(url.href.toLowerCase())) continue
            urls.add(url.href.toLowerCase())
            customFeeds.push({
              id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `feed-${Date.now()}-${added}`,
              title: candidate.title.trim().slice(0, 80) || url.hostname,
              url: url.href,
            })
            added++
          }
          return { customFeeds }
        })
        return added
      },
      removeCustomFeed: (id) => set((state) => ({ customFeeds: state.customFeeds.filter((feed) => feed.id !== id) })),

      desktopOrder: [],
      setDesktopOrder: (desktopOrder) => set({ desktopOrder }),
      desktopPositions: {},
      setDesktopPosition: (id, col, row) => set((state) => ({
        desktopPositions: { ...state.desktopPositions, [id]: { col, row } },
      })),
      setDesktopPositions: (desktopPositions) => set({ desktopPositions }),
      resetDesktopOrder: () => set({ desktopOrder: [], desktopPositions: {} }),
    }),
    {
      name: "subsurfaces95",
      version: OS_PERSIST_VERSION,
      migrate: (persisted) => persisted as OSSettings,
    },
  ),
)

export type WindowState = "normal" | "minimized" | "maximized" | "shaded"

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
  /** Used for automatic welcome/restoration actions, which should not chime. */
  silent?: boolean
}

interface OSStore {
  windows: OSWindow[]
  nextZ: number
  nextId: number
  isStartOpen: boolean

  openWindow: (input: OpenWindowInput) => void
  closeWindow: (id: string) => void
  focusWindow: (id: string) => void
  /** Restore a minimized window if needed, then bring it to the front. */
  activateWindow: (id: string) => void
  moveWindow: (id: string, x: number, y: number) => void
  resizeWindow: (id: string, geo: WindowGeometry) => void
  /** Merge args into a window; `undefined` removes a stale argument. */
  updateWindowArgs: (id: string, args: Record<string, string | undefined>) => void
  setWindowTitle: (id: string, title: string) => void
  setWindowState: (id: string, state: WindowState) => void
  toggleMinimize: (id: string) => void
  toggleMaximize: (id: string) => void
  toggleShade: (id: string) => void
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

  openWindow: ({ appId, args = {}, title, w, h, multiInstance, silent }) => {
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
    const settings = useOSSettings.getState()
    if (!silent && settings.soundEnabled && settings.soundEvents?.open) playOSSound("open", settings.soundVolume)
  },

  closeWindow: (id) => {
    const exists = get().windows.some((w) => w.id === id)
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) }))
    const settings = useOSSettings.getState()
    if (exists && settings.soundEnabled && settings.soundEvents?.close) playOSSound("close", settings.soundVolume)
  },

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

  activateWindow: (id) =>
    set((s) => {
      const target = s.windows.find((win) => win.id === id)
      if (!target) return {}
      if (target.state !== "minimized" && target.z === s.nextZ - 1) return {}
      return {
        windows: s.windows.map((win) =>
          win.id === id
            ? { ...win, state: win.state === "minimized" ? "normal" : win.state, z: s.nextZ }
            : win,
        ),
        nextZ: s.nextZ + 1,
      }
    }),

  moveWindow: (id, x, y) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)) })),

  resizeWindow: (id, geo) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, ...geo } : w)) })),

  updateWindowArgs: (id, args) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w
        const next = { ...w.args }
        for (const [key, value] of Object.entries(args)) {
          if (value === undefined) delete next[key]
          else next[key] = value
        }
        return { ...w, args: next }
      }),
    })),

  setWindowTitle: (id, title) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)) })),

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

  toggleShade: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id
          ? { ...w, state: w.state === "shaded" ? "normal" : "shaded" }
          : w,
      ),
    })),

  setStartOpen: (open) => set({ isStartOpen: open }),

  closeAll: () => set({ windows: [] }),
}))

export interface OSFile {
  id: string
  name: string
  content: string
  /** Slash-separated path beneath H:\\MY DOCUMENTS. Old persisted files default to root. */
  folder?: string
  updatedAt: string
}

interface OSFilesStore {
  files: OSFile[]
  folders: string[]
  createFile: (name?: string, content?: string, folder?: string) => string
  createFolder: (name?: string, parent?: string) => string
  saveFile: (id: string, content: string, name?: string) => void
  moveFile: (id: string, folder: string) => void
  deleteFile: (id: string) => void
  deleteFolder: (path: string) => void
  importArchive: (value: unknown) => { imported: number; skipped: number }
  clearFiles: () => void
}

const WELCOME_FILE: OSFile = {
  id: "welcome",
  name: "Welcome.txt",
  content:
    "This folder belongs to you.\n\nFiles created in Notepad and Paint are saved in this browser only. " +
    "Settings > Storage shows exactly what the machine remembers and lets you remove it.",
  updatedAt: "1995-08-24T00:00:00.000Z",
}

function cleanFolder(path: string): string {
  return path.split("/").map((part) => part.trim().replace(/[\\:*?\"<>|]/g, "-")).filter(Boolean).join("/")
}

function addFolderTree(folders: Set<string>, path: string) {
  const parts = cleanFolder(path).split("/").filter(Boolean)
  for (let index = 1; index <= parts.length; index++) folders.add(parts.slice(0, index).join("/"))
}

function uniqueFileName(files: OSFile[], requested: string, excludeId?: string, folder = ""): string {
  const cleaned = (requested.trim() || "Untitled.txt").replace(/[\\/:*?\"<>|]/g, "-")
  const withExt = /\.[a-z0-9]{1,5}$/i.test(cleaned) ? cleaned : `${cleaned}.txt`
  const collides = (name: string) => files.some(
    (file) => file.id !== excludeId && (file.folder ?? "") === folder && file.name.toLowerCase() === name.toLowerCase(),
  )
  if (!collides(withExt)) return withExt
  const dot = withExt.lastIndexOf(".")
  const base = withExt.slice(0, dot)
  const ext = withExt.slice(dot)
  let index = 2
  while (collides(`${base} (${index})${ext}`)) index++
  return `${base} (${index})${ext}`
}

export const useOSFiles = create<OSFilesStore>()(
  persist(
    (set, get) => ({
      files: [WELCOME_FILE],
      folders: [],
      createFile: (requested = "Untitled.txt", content = "", requestedFolder = "") => {
        const folder = cleanFolder(requestedFolder)
        const id = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `file-${Date.now()}`
        const file: OSFile = {
          id,
          name: uniqueFileName(get().files, requested, undefined, folder),
          content,
          folder,
          updatedAt: new Date().toISOString(),
        }
        set((state) => ({ files: [...state.files, file] }))
        return id
      },
      createFolder: (requested = "New Folder", requestedParent = "") => {
        const parent = cleanFolder(requestedParent)
        const base = cleanFolder(requested).split("/").pop() || "New Folder"
        const siblings = get().folders.filter((path) => path.split("/").slice(0, -1).join("/") === parent)
        let name = base
        let index = 2
        while (siblings.some((path) => path.split("/").at(-1)?.toLowerCase() === name.toLowerCase())) {
          name = `${base} (${index++})`
        }
        const path = parent ? `${parent}/${name}` : name
        set((state) => ({ folders: [...state.folders, path].sort() }))
        return path
      },
      saveFile: (id, content, requestedName) =>
        set((state) => ({
          files: state.files.map((file) =>
            file.id === id
              ? {
                  ...file,
                  content,
                  name: requestedName ? uniqueFileName(state.files, requestedName, id, file.folder ?? "") : file.name,
                  updatedAt: new Date().toISOString(),
                }
              : file,
          ),
        })),
      moveFile: (id, requestedFolder) => set((state) => {
        const folder = cleanFolder(requestedFolder)
        return {
          files: state.files.map((file) => file.id === id
            ? { ...file, folder, name: uniqueFileName(state.files, file.name, id, folder), updatedAt: new Date().toISOString() }
            : file),
        }
      }),
      deleteFile: (id) => set((state) => ({ files: state.files.filter((file) => file.id !== id) })),
      deleteFolder: (path) => set((state) => ({
        folders: state.folders.filter((folder) => folder !== path && !folder.startsWith(`${path}/`)),
        files: state.files.filter((file) => (file.folder ?? "") !== path && !(file.folder ?? "").startsWith(`${path}/`)),
      })),
      importArchive: (value) => {
        const source = value && typeof value === "object" ? value as { files?: unknown; folders?: unknown } : {}
        const rawFiles = Array.isArray(source.files) ? source.files : []
        const rawFolders = Array.isArray(source.folders) ? source.folders : []
        let imported = 0
        let skipped = 0
        set((state) => {
          const files = [...state.files]
          const folders = new Set(state.folders)
          let totalBytes = files.reduce((sum, file) => sum + file.content.length, 0)
          for (const raw of rawFolders.slice(0, 250)) {
            if (typeof raw === "string" && cleanFolder(raw)) addFolderTree(folders, raw)
          }
          for (const raw of rawFiles.slice(0, 500)) {
            if (!raw || typeof raw !== "object") { skipped++; continue }
            const candidate = raw as Partial<OSFile>
            if (
              typeof candidate.name !== "string" ||
              typeof candidate.content !== "string" ||
              candidate.content.length > 1_000_000 ||
              totalBytes + candidate.content.length > 4_000_000
            ) {
              skipped++
              continue
            }
            const folder = cleanFolder(typeof candidate.folder === "string" ? candidate.folder : "")
            if (folder) addFolderTree(folders, folder)
            files.push({
              id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `file-${Date.now()}-${imported}`,
              name: uniqueFileName(files, candidate.name, undefined, folder),
              content: candidate.content,
              folder,
              updatedAt: new Date().toISOString(),
            })
            totalBytes += candidate.content.length
            imported++
          }
          return { files, folders: [...folders].sort() }
        })
        return { imported, skipped }
      },
      clearFiles: () => set({ files: [], folders: [] }),
    }),
    {
      name: "subsurfaces95-files",
      version: OS_PERSIST_VERSION,
      migrate: (persisted) => persisted as OSFilesStore,
      partialize: (state) => ({ files: state.files, folders: state.folders }),
    },
  ),
)

interface OSMediaStore {
  savedPlaylists: Record<string, string[]>
  savePlaylist: (name: string, slugs: string[]) => void
  deletePlaylist: (name: string) => void
  skin: MediaSkin
  setSkin: (skin: MediaSkin) => void
  visualizerMode: MediaVizMode
  setVisualizerMode: (mode: MediaVizMode) => void
}

/** Named playlists belong to the OS presentation; playback/session remains in MusicContext. */
export const useOSMedia = create<OSMediaStore>()(
  persist(
    (set) => ({
      savedPlaylists: {},
      savePlaylist: (requested, slugs) => set((state) => {
        const name = requested.trim().slice(0, 40) || "Mixtape"
        return { savedPlaylists: { ...state.savedPlaylists, [name]: slugs.filter(Boolean) } }
      }),
      deletePlaylist: (name) => set((state) => {
        const savedPlaylists = { ...state.savedPlaylists }
        delete savedPlaylists[name]
        return { savedPlaylists }
      }),
      skin: "classic",
      setSkin: (skin) => set({ skin }),
      visualizerMode: "spectrum",
      setVisualizerMode: (visualizerMode) => set({ visualizerMode }),
    }),
    {
      name: "subsurfaces95-media",
      version: OS_MEDIA_PERSIST_VERSION,
      migrate: (persisted) => {
        const previous = persisted && typeof persisted === "object"
          ? persisted as Partial<OSMediaStore>
          : {}
        return {
          ...previous,
          skin: isMediaSkin(previous.skin) ? previous.skin : "classic",
          visualizerMode: isMediaVizMode(previous.visualizerMode) ? previous.visualizerMode : "spectrum",
        } as OSMediaStore
      },
    },
  ),
)

/** Highest-z non-minimized window — the one wearing the active title bar. */
export function focusedWindowId(windows: OSWindow[]): string | null {
  const visible = windows.filter((w) => w.state !== "minimized")
  if (visible.length === 0) return null
  return visible.reduce((top, w) => (w.z > top.z ? w : top)).id
}
