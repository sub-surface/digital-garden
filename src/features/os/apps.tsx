/**
 * Built-in application implementations for SUBSURFACES 95.
 *
 * Desktop chrome must not import this module directly. `appRegistry.tsx` owns
 * metadata and lazy loaders so these implementations arrive only when a window
 * opens. Most apps remain thin wrappers: document apps are `NoteBody` in
 * different chrome, while games come from SYSTEM_PAGES. See the OS spec §6/§14.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { NoteBody } from "@/components/ui/reader/NoteBody"
import { useStore, BG_MODES, BG_META, type BgMode } from "@/store"
import { SYSTEM_PAGES } from "@/config/system-pages"
import { PROGRAMS } from "@/features/terminal/commands"
import type { NoteMetadata } from "@/types/content"
import { useMusic } from "@/components/ui/music/MusicContext"
import { EQ_BANDS, EQ_PRESETS, type EqGains } from "@/components/ui/music/musicEffects"
import { useAuth } from "@/hooks/useAuth"
import { ImageLightbox } from "@/components/ui/reader/ImageLightbox"
import type { ChatRoom as ChatRoomType } from "@/types/chat"
import { apiGet } from "@/lib/api"
import { useRestoredNotes } from "@/hooks/useRestoredNotes"
import { useContentSearch, type ContentSearchResult } from "@/hooks/useContentSearch"
import { ProgramHostProvider } from "@/components/ui/games/ProgramHostContext"
import {
  useOS,
  useOSFiles,
  useOSMedia,
  useOSSettings,
  type BootSequence,
  type ScreenSaverMode,
} from "./osStore"
import { OSIcon, type IconName } from "./OSIcon"
import { playOSSound } from "./osSounds"
import { APPS } from "./appRegistry"
import { dosName, fileExt, useOpenNote } from "./appNavigation"
import {
  insertNext,
  moveQueueItem,
  queueIndexAfterMove,
  queueIndexAfterRemoval,
  shuffleQueue,
} from "@/components/ui/music/musicQueue"
import { MediaVisualizer } from "./media/MediaVisualizer"
import {
  MEDIA_SKINS,
  MEDIA_VIZ_MODES,
  type MediaPane,
  type MediaSkin,
  type MediaView,
} from "./media/mediaTheme"
import styles from "./OS.module.scss"
import explorer from "./Explorer.module.scss"
import type { AppProps } from "./appTypes"
import { isPaintFile } from "./paintModel"

const Terminal = lazy(() =>
  import("@/features/terminal/Terminal").then((module) => ({ default: module.Terminal })),
)
const WikiAdminPage = lazy(() =>
  import("@/components/ui/wiki/WikiAdminPage").then((module) => ({ default: module.WikiAdminPage })),
)
const WikiProfilePage = lazy(() =>
  import("@/components/ui/wiki/WikiProfilePage").then((module) => ({ default: module.WikiProfilePage })),
)
const WikiNewPage = lazy(() =>
  import("@/components/ui/wiki/WikiNewPage").then((module) => ({ default: module.WikiNewPage })),
)
const WikiEditPage = lazy(() =>
  import("@/components/ui/wiki/WikiEditPage").then((module) => ({ default: module.WikiEditPage })),
)
const ChatRoom = lazy(() =>
  import("@/components/ui/chat/ChatRoom").then((module) => ({ default: module.ChatRoom })),
)

// ---------------------------------------------------------------------------
// Document apps — chrome differs, renderer does not.
// ---------------------------------------------------------------------------

export function BrowserApp({ args }: AppProps) {
  return (
    <div className={styles.browser} data-reader={args.reader === "1" || undefined}>
      <div className={styles.browserAddress}>
        <span>Address</span>
        <input readOnly value={`garden://${args.slug}`} aria-label="Document address" />
      </div>
      <div className={`${styles.docPad} os-doc`}>
        <NoteBody slug={args.slug} />
      </div>
    </div>
  )
}

export function NotepadApp({ args, windowId }: AppProps) {
  const files = useOSFiles((s) => s.files)
  const createFile = useOSFiles((s) => s.createFile)
  const saveFile = useOSFiles((s) => s.saveFile)
  const updateWindowArgs = useOS((s) => s.updateWindowArgs)
  const setWindowTitle = useOS((s) => s.setWindowTitle)
  const openWindow = useOS((s) => s.openWindow)
  const createdRef = useRef(false)
  const file = files.find((candidate) => candidate.id === args.fileId)
  const [name, setName] = useState(file?.name ?? "Untitled.txt")
  const [content, setContent] = useState(file?.content ?? "")
  const [dirty, setDirty] = useState(false)
  const loadedFileId = useRef<string | null>(null)
  const pendingRef = useRef({ id: file?.id, content, name, dirty })
  pendingRef.current = { id: file?.id, content, name, dirty }

  useEffect(() => {
    if (args.fileId || createdRef.current) return
    createdRef.current = true
    const id = createFile()
    updateWindowArgs(windowId, { fileId: id })
  }, [args.fileId, createFile, updateWindowArgs, windowId])

  useEffect(() => {
    if (!file || loadedFileId.current === file.id) return
    loadedFileId.current = file.id
    setName(file.name)
    setContent(file.content)
    setDirty(false)
    setWindowTitle(windowId, `${file.name} — Notepad`)
  }, [file, setWindowTitle, windowId])

  const save = useCallback(() => {
    if (!file) return
    saveFile(file.id, content, name)
    const savedName = useOSFiles.getState().files.find((candidate) => candidate.id === file.id)?.name ?? file.name
    setName(savedName)
    setWindowTitle(windowId, `${savedName} — Notepad`)
    setDirty(false)
  }, [content, file, name, saveFile, setWindowTitle, windowId])

  useEffect(() => {
    if (!file || !dirty) return
    const timer = window.setTimeout(save, 700)
    return () => window.clearTimeout(timer)
  }, [dirty, file, name, content, save])

  // Debouncing keeps localStorage off the keystroke path; flushing on close or
  // pagehide makes the persistence promise honest even inside that 700ms gap.
  useEffect(() => {
    const flush = () => {
      const pending = pendingRef.current
      if (pending.id && pending.dirty) saveFile(pending.id, pending.content, pending.name)
    }
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [saveFile])

  if (!file) return <div className={explorer.empty}>Preparing a local document…</div>

  return (
    <div className={styles.notepad} onKeyDown={(e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        save()
      }
    }}>
      <div className={styles.notepadToolbar}>
        <input
          value={name}
          aria-label="File name"
          onChange={(e) => { setName(e.target.value); setDirty(true) }}
        />
        <button type="button" onClick={save} disabled={!dirty}>Save</button>
        <button
          type="button"
          onClick={() => {
            const id = createFile()
            openWindow({ appId: "notepad", args: { fileId: id }, title: "Untitled.txt — Notepad" })
          }}
        >
          New
        </button>
        <span>{dirty ? "modified" : "saved locally"}</span>
      </div>
      <textarea
        className={styles.notepadText}
        value={content}
        spellCheck
        aria-label={`Contents of ${name}`}
        onChange={(e) => { setContent(e.target.value); setDirty(true) }}
      />
    </div>
  )
}

/** System pages mount directly: the application, never its companion note. */
export function ProgramApp({ args, windowId }: AppProps) {
  const closeWindow = useOS((s) => s.closeWindow)
  const openWindow = useOS((s) => s.openWindow)
  const contentIndex = useStore((s) => s.contentIndex)
  const openNote = useOpenNote()
  const page = SYSTEM_PAGES[args.slug?.toLowerCase()]
  if (!page) {
    return <div className={explorer.error}>Cannot run '{args.slug || "(missing program)"}'.</div>
  }
  const Component = page.component
  return (
    <div className={styles.programHost} data-program={args.slug} data-layout={page.layout}>
      <ProgramHostProvider value={{
        embedded: true,
        close: () => closeWindow(windowId),
        open: (slug) => {
          const note = contentIndex?.[slug]
          if (note) openNote(note)
          else openWindow({ appId: "program", args: { slug }, title: slug, w: 860, h: 640 })
        },
      }}>
        <Suspense fallback={<div className="note-loading">{page.loading}</div>}>
          <Component />
        </Suspense>
      </ProgramHostProvider>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MS-DOS Prompt — the same terminal module the main site mounts at /terminal.
// The only difference is what `open` does: here it spawns a window instead of
// navigating. That substitution IS the bridge; no command knows about it.
// ---------------------------------------------------------------------------

export function PromptApp({ windowId }: AppProps) {
  const openWindow = useOS((s) => s.openWindow)
  const closeWindow = useOS((s) => s.closeWindow)
  const contentIndex = useStore((s) => s.contentIndex)
  const openNote = useOpenNote()

  const onOpen = useCallback(
    (slug: string, title?: string) => {
      const note = contentIndex?.[slug]
      if (note) {
        openNote(note)
        return
      }
      // System pages (games, the graph) have no content-index entry of their
      // own unless prebuild synthesized one — open them as programs regardless.
      openWindow({ appId: "program", args: { slug }, title: title ?? slug, w: 860, h: 640 })
    },
    [contentIndex, openNote, openWindow],
  )

  const onNavigate = useCallback((target: string) => {
    const url = new URL(target, window.location.origin)
    const path = url.pathname.replace(/^\//, "")
    if (url.hostname === "wiki.subsurfaces.net" || url.origin === window.location.origin) {
      if (path === "new") return openWindow({ appId: "newpage", args: {}, title: "Create a Wiki Page", w: 760, h: 620 })
      if (path === "admin") return openWindow({ appId: "owner", args: {}, title: "Owner Workstation", w: 780, h: 580 })
      if (path === "profile") return openWindow({ appId: "profile", args: {}, title: "My Subsurfaces Profile", w: 760, h: 610 })
      if (path.startsWith("edit/")) {
        const slug = decodeURIComponent(path.slice(5))
        return openWindow({ appId: "edit", args: { slug }, title: `Edit ${slug}`, w: 780, h: 640, multiInstance: true })
      }
    }
    window.open(target, "_blank", "noopener")
  }, [openWindow])

  return (
    <Terminal
      surface="window"
      onOpen={onOpen}
      onNavigate={onNavigate}
      onRequireLogin={() => openWindow({ appId: "account", args: {}, title: "Log On to Subsurfaces", w: 470, h: 500 })}
      onClose={() => closeWindow(windowId)}
    />
  )
}

// ---------------------------------------------------------------------------
// Run — resolves against the SAME PROGRAMS map the terminal's launchers use,
// plus every app id and every note slug. One name space, three entry points.
// ---------------------------------------------------------------------------

export function RunApp({ windowId }: AppProps) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const openWindow = useOS((s) => s.openWindow)
  const closeWindow = useOS((s) => s.closeWindow)
  const contentIndex = useStore((s) => s.contentIndex)
  const openNote = useOpenNote()

  const dismiss = () => closeWindow(windowId)

  const submit = () => {
    const raw = value.trim().toLowerCase().replace(/\.exe$/, "")
    if (!raw) return

    const app = APPS[raw]
    if (app) {
      openWindow({
        appId: raw,
        args: {},
        title: raw.toUpperCase(),
        w: app.defaultSize?.w,
        h: app.defaultSize?.h,
        multiInstance: app.multiInstance,
      })
      return dismiss()
    }

    const program = PROGRAMS[raw]
    if (program) {
      openWindow({ appId: "program", args: { slug: program.slug }, title: program.title, w: 860, h: 640 })
      return dismiss()
    }

    const note =
      contentIndex?.[raw] ??
      (contentIndex
        ? Object.values(contentIndex).find((n) => n.slug.toLowerCase().endsWith(`/${raw}`))
        : undefined)
    if (note) {
      openNote(note)
      return dismiss()
    }

    // Failure is visible and names the thing that failed.
    setError(`Cannot find '${value.trim()}'. Check the name and try again.`)
  }

  return (
    <div className={styles.run}>
      <p style={{ margin: 0 }}>
        Type the name of a program, document, or folder, and Windows will open it for you.
      </p>

      <div className={styles.runRow}>
        <span>Open:</span>
        <input
          className={styles.runInput}
          value={value}
          autoFocus
          spellCheck={false}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit()
            if (e.key === "Escape") dismiss()
          }}
          aria-label="Program or document to open"
        />
      </div>

      {error ? (
        <span className={styles.runHint} style={{ color: "#c05a63" }}>
          {error}
        </span>
      ) : (
        <span className={styles.runHint}>
          try: {Object.keys(PROGRAMS).slice(0, 6).join(", ")}, prompt, explorer
        </span>
      )}

      <div className={styles.runActions}>
        <button className={styles.runBtn} onClick={submit}>
          OK
        </button>
        <button className={styles.runBtn} onClick={dismiss}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shut Down — the most recognisable dialog of the decade, and a genuine UX fix:
// the Start item used to navigate off-site with no confirmation at all.
// ---------------------------------------------------------------------------

type ShutdownChoice = "off" | "restart" | "dos"

export function ShutDownApp({ windowId }: AppProps) {
  const [choice, setChoice] = useState<ShutdownChoice>("off")
  const closeWindow = useOS((s) => s.closeWindow)

  const dismiss = () => closeWindow(windowId)

  const confirm = () => {
    if (choice === "off") {
      window.location.href = "https://subsurfaces.net"
      return
    }
    if (choice === "dos") {
      dismiss()
      window.dispatchEvent(new CustomEvent("os:dos-mode"))
      return
    }
    // Restart: clear the once-per-tab flag so the POST actually plays again.
    try {
      sessionStorage.removeItem("subsurfaces95:booted")
    } catch {
      /* storage disabled — the reload still works, it just skips the POST */
    }
    window.location.reload()
  }

  const OPTIONS: { id: ShutdownChoice; label: string }[] = [
    { id: "off", label: "Shut down the computer?" },
    { id: "restart", label: "Restart the computer?" },
    { id: "dos", label: "Restart the computer in MS-DOS mode?" },
  ]

  return (
    <div className={explorer.props}>
      <p style={{ margin: 0 }}>Are you sure you want to:</p>

      {OPTIONS.map((opt) => (
        <label key={opt.id} className={explorer.radioRow}>
          <input
            type="radio"
            name="shutdown"
            checked={choice === opt.id}
            onChange={() => setChoice(opt.id)}
          />
          {opt.label}
        </label>
      ))}

      <div className={styles.runActions}>
        <button className={styles.runBtn} onClick={confirm}>
          Yes
        </button>
        <button className={styles.runBtn} onClick={dismiss}>
          No
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Log Off — deliberately separate from shutdown. The session is shared with
// the garden/wiki/chat, while the local H: drive and machine preferences remain
// on this browser for the next person who logs on.
// ---------------------------------------------------------------------------

export async function logOffOS(signOut: () => Promise<void>) {
  await signOut()
  useOSSettings.getState().setShowLogon(true)
  useOS.getState().closeAll()
  window.dispatchEvent(new CustomEvent("os:logon"))
}

export function LogOffApp({ windowId }: AppProps) {
  const auth = useAuth()
  const closeWindow = useOS((s) => s.closeWindow)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const identity = auth.username ?? auth.session?.user.email ?? "this account"

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await logOffOS(auth.signOut)
    } catch {
      setBusy(false)
      setError("Windows could not log off. Check the connection and try again.")
    }
  }

  return (
    <div className={explorer.props}>
      <div className={explorer.error} style={{ padding: 0 }}>
        <OSIcon name="user" size={34} />
        <div>
          <p><strong>Log off {identity}?</strong></p>
          <span className={explorer.errorHint}>
            Your local files and desktop settings will remain on this browser.
          </span>
        </div>
      </div>
      {error && <span className={styles.runHint} style={{ color: "#b4424c" }}>{error}</span>}
      <div className={styles.runActions}>
        <button className={styles.runBtn} disabled={busy} onClick={() => void confirm()}>
          {busy ? "Logging off..." : "Yes"}
        </button>
        <button className={styles.runBtn} disabled={busy} onClick={() => closeWindow(windowId)}>
          No
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Explorer
// ---------------------------------------------------------------------------

function useNotes(): NoteMetadata[] {
  const contentIndex = useStore((s) => s.contentIndex)
  return useMemo(() => (contentIndex ? Object.values(contentIndex) : []), [contentIndex])
}

export function ExplorerApp({ args, windowId }: AppProps) {
  const notes = useNotes()
  const localFiles = useOSFiles((s) => s.files)
  const localFolders = useOSFiles((s) => s.folders)
  const createFile = useOSFiles((s) => s.createFile)
  const createFolder = useOSFiles((s) => s.createFolder)
  const deleteFile = useOSFiles((s) => s.deleteFile)
  const deleteFolder = useOSFiles((s) => s.deleteFolder)
  const openNote = useOpenNote()
  const openWindow = useOS((s) => s.openWindow)
  const setWindowTitle = useOS((s) => s.setWindowTitle)
  const doubleClick = useOSSettings((s) => s.doubleClickToOpen)
  const isHome = args.drive === "home"
  const [folder, setFolder] = useState(args.folder ?? "")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)

  const { subfolders, gardenFiles } = useMemo(() => {
    const subs = new Set<string>()
    const out: NoteMetadata[] = []
    for (const note of notes) {
      if (note.draft) continue
      const noteFolder = note.folder ?? ""
      if (folder === "") {
        if (noteFolder === "") out.push(note)
        else subs.add(noteFolder.split("/")[0])
      } else if (noteFolder === folder) out.push(note)
      else if (noteFolder.startsWith(`${folder}/`)) {
        subs.add(noteFolder.slice(folder.length + 1).split("/")[0])
      }
    }
    const q = query.trim().toLowerCase()
    return {
      subfolders: Array.from(subs).filter((name) => !q || name.toLowerCase().includes(q)).sort(),
      gardenFiles: out.filter((note) => !q || note.title.toLowerCase().includes(q)).sort((a, b) => a.title.localeCompare(b.title)),
    }
  }, [notes, folder, query])

  const visibleLocalFiles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return localFiles.filter((file) => (file.folder ?? "") === folder && (!q || file.name.toLowerCase().includes(q)))
  }, [folder, localFiles, query])
  const visibleLocalFolders = useMemo(() => {
    const q = query.trim().toLowerCase()
    return localFolders.filter((path) => {
      const parts = path.split("/")
      const parentPath = parts.slice(0, -1).join("/")
      return parentPath === folder && (!q || parts.at(-1)?.toLowerCase().includes(q))
    })
  }, [folder, localFolders, query])
  const parent = folder === "" ? null : folder.split("/").slice(0, -1).join("/")
  const address = isHome
    ? `H:\\MY DOCUMENTS${folder ? `\\${folder.replace(/\//g, "\\")}` : ""}`
    : `C:\\GARDEN${folder ? `\\${folder.replace(/\//g, "\\")}` : ""}`

  useEffect(() => {
    setWindowTitle(windowId, isHome ? "My Documents" : address)
  }, [address, isHome, setWindowTitle, windowId])

  const openLocalFile = (id: string, name: string) => {
    const paint = isPaintFile(name)
    openWindow({
      appId: paint ? "paint" : "notepad",
      args: { fileId: id },
      title: `${name} — ${paint ? "Paint" : "Notepad"}`,
      ...(paint ? { w: 720, h: 600 } : {}),
    })
  }
  const activate = (action: () => void, event: React.MouseEvent) => {
    if (!doubleClick && event.detail === 1) action()
    if (doubleClick && event.detail === 2) action()
  }
  const enterFolder = (path: string) => {
    setFolder(path)
    setSelected(null)
  }
  const makeFile = () => {
    const id = createFile("Untitled.txt", "", isHome ? folder : "")
    const file = useOSFiles.getState().files.find((candidate) => candidate.id === id)
    if (file) openLocalFile(file.id, file.name)
  }
  const makeFolder = () => {
    const requested = window.prompt("Folder name:", "New Folder")
    if (requested) createFolder(requested, folder)
  }
  const makePicture = () => openWindow({
    appId: "paint",
    args: {},
    title: "Untitled.pxl — Paint",
    w: 720,
    h: 600,
    multiInstance: true,
  })
  const deleteSelected = () => {
    if (!selected || !window.confirm("Delete the selected local item and anything inside it?")) return
    if (selected.startsWith("file:")) deleteFile(selected.slice(5))
    if (selected.startsWith("folder:")) deleteFolder(selected.slice(7))
    setSelected(null)
  }

  return (
    <div
      className={explorer.root}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Backspace") {
          e.preventDefault()
          if (parent !== null) enterFolder(parent)
        }
      }}
    >
      <div className={explorer.toolbar}>
        <button type="button" disabled={parent === null} onClick={() => parent !== null && enterFolder(parent)}>Up</button>
        {isHome && <button type="button" onClick={makeFile}>New Text Document</button>}
        {isHome && <button type="button" onClick={makePicture}>New Pixel Picture</button>}
        {isHome && <button type="button" onClick={makeFolder}>New Folder</button>}
        {isHome && selected && (
          <button type="button" onClick={deleteSelected}>Delete</button>
        )}
        <input
          className={explorer.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find in this folder"
          aria-label="Filter files"
        />
      </div>
      <label className={explorer.path}>
        <span>Address</span>
        <input readOnly value={address} aria-label="Explorer address" />
      </label>

      <table className={explorer.table}>
        <thead><tr><th>Name</th><th>Size</th><th>Type</th><th>MS-DOS name</th></tr></thead>
        <tbody>
          {!isHome && parent !== null && (
            <tr className={explorer.row} onClick={(e) => activate(() => enterFolder(parent), e)}>
              <td className={explorer.name}><OSIcon name="folder" size={16} /><span>..</span></td>
              <td colSpan={3} />
            </tr>
          )}
          {!isHome && subfolders.map((sub) => {
            const path = folder ? `${folder}/${sub}` : sub
            return (
              <tr key={path} className={explorer.row} data-selected={selected === path} onClick={(e) => { setSelected(path); activate(() => enterFolder(path), e) }}>
                <td className={explorer.name}><OSIcon name="folder" size={16} /><span>{sub}</span></td>
                <td /><td>File Folder</td><td className={explorer.dos}>{sub.slice(0, 8).toUpperCase()}</td>
              </tr>
            )
          })}
          {!isHome && gardenFiles.map((note) => {
            const ext = fileExt(note)
            return (
              <tr key={note.slug} className={explorer.row} data-selected={selected === note.slug} onClick={(e) => { setSelected(note.slug); activate(() => openNote(note), e) }}>
                <td className={explorer.name}><OSIcon name={ext === "EXE" ? "app" : ext === "DOC" ? "article" : "doc"} size={16} /><span>{note.title}</span></td>
                <td className={explorer.num}>{note.readingTime ? `${note.readingTime * 2}KB` : "—"}</td>
                <td>{TYPE_LABEL[ext] ?? "File"}</td><td className={explorer.dos}>{dosName(note.slug, ext)}</td>
              </tr>
            )
          })}
          {isHome && visibleLocalFolders.map((path) => {
            const name = path.split("/").at(-1) ?? path
            return (
              <tr key={path} className={explorer.row} data-selected={selected === `folder:${path}`} onClick={(e) => { setSelected(`folder:${path}`); activate(() => enterFolder(path), e) }}>
                <td className={explorer.name}><OSIcon name="folder" size={16} /><span>{name}</span></td>
                <td /><td>File Folder</td><td className={explorer.dos}>{name.slice(0, 8).toUpperCase()}</td>
              </tr>
            )
          })}
          {isHome && visibleLocalFiles.map((file) => (
            <tr key={file.id} className={explorer.row} data-selected={selected === `file:${file.id}`} onClick={(e) => { setSelected(`file:${file.id}`); activate(() => openLocalFile(file.id, file.name), e) }}>
              <td className={explorer.name}><OSIcon name={isPaintFile(file.name) ? "paint" : "doc"} size={16} /><span>{file.name}</span></td>
              <td className={explorer.num}>{Math.max(1, Math.ceil(file.content.length / 1024))}KB</td>
              <td>{isPaintFile(file.name) ? "Pixel Picture" : "Text Document"}</td><td className={explorer.dos}>{dosName(file.name, isPaintFile(file.name) ? "PXL" : "TXT")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={explorer.count}>{(isHome ? visibleLocalFolders.length + visibleLocalFiles.length : subfolders.length + gardenFiles.length)} object(s) · local files stay in this browser</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Find: All Files — Win95 chrome over the same lazy FlexSearch index as the
// garden overlay. Local H: documents are namespaced into the shared index and
// never leave the browser.
// ---------------------------------------------------------------------------

type FindScope = "all" | "garden" | "local"

export function FindApp({ args }: AppProps) {
  const notes = useStore((state) => state.contentIndex)
  const files = useOSFiles((state) => state.files)
  const openWindow = useOS((state) => state.openWindow)
  const openNote = useOpenNote()
  const [draftQuery, setDraftQuery] = useState(args.query ?? "")
  const [query, setQuery] = useState(args.query ?? "")
  const [scope, setScope] = useState<FindScope>("all")
  const [selected, setSelected] = useState<string | null>(null)
  const localDocuments = useMemo(() => files.map((file) => ({
    id: `local:${file.id}`,
    title: file.name,
    excerpt: isPaintFile(file.name) ? "Local pixel picture" : file.content.slice(0, 4_000),
    kind: "local" as const,
    target: file.id,
  })), [files])
  const search = useContentSearch({
    enabled: true,
    query,
    extraDocuments: localDocuments,
    limit: 250,
  })
  const results = useMemo(
    () => search.results.filter((result) => scope === "all" || result.kind === scope),
    [scope, search.results],
  )
  const selectedResult = results.find((result) => result.id === selected) ?? null

  useEffect(() => {
    if (selected && !results.some((result) => result.id === selected)) setSelected(null)
  }, [results, selected])

  const openResult = (result: ContentSearchResult | null) => {
    if (!result) return
    if (result.kind === "local") {
      const file = files.find((candidate) => candidate.id === result.target)
      if (file) {
        const paint = isPaintFile(file.name)
        openWindow({
          appId: paint ? "paint" : "notepad",
          args: { fileId: file.id },
          title: `${file.name} — ${paint ? "Paint" : "Notepad"}`,
          ...(paint ? { w: 720, h: 600 } : {}),
        })
      }
      return
    }
    const note = notes?.[result.target]
    if (note) openNote(note)
  }

  const locationFor = (result: ContentSearchResult) => {
    if (result.kind === "local") {
      const folder = files.find((file) => file.id === result.target)?.folder
      return `H:\\MY DOCUMENTS${folder ? `\\${folder.replace(/\//g, "\\")}` : ""}`
    }
    const folder = notes?.[result.target]?.folder
    return `C:\\GARDEN${folder ? `\\${folder.replace(/\//g, "\\")}` : ""}`
  }

  return (
    <div className={explorer.root}>
      <form
        className={explorer.findForm}
        onSubmit={(event) => {
          event.preventDefault()
          setSelected(null)
          setQuery(draftQuery.trim())
        }}
      >
        <div className={explorer.findFields}>
          <label>
            Named or containing text:
            <input
              autoFocus
              className={explorer.search}
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="title, phrase, or filename"
            />
          </label>
          <label>
            Look in:
            <select
              className={explorer.search}
              value={scope}
              onChange={(event) => setScope(event.target.value as FindScope)}
            >
              <option value="all">Subsurfaces 95</option>
              <option value="garden">C:\GARDEN</option>
              <option value="local">H:\MY DOCUMENTS</option>
            </select>
          </label>
        </div>
        <div className={explorer.findActions}>
          <button className={explorer.button} type="submit" disabled={!draftQuery.trim()}>
            Find Now
          </button>
          <button
            className={explorer.button}
            type="button"
            disabled={!selectedResult}
            onClick={() => openResult(selectedResult)}
          >
            Open
          </button>
        </div>
      </form>

      <div className={explorer.findHint}>
        Searches published/recovered garden documents and browser-local text files.
      </div>
      <div className={explorer.findResults}>
        <table className={explorer.table}>
          <thead><tr><th>Name</th><th>In Folder</th><th>Type</th></tr></thead>
          <tbody>
            {results.map((result) => (
              <tr
                key={result.id}
                className={explorer.row}
                data-selected={selected === result.id}
                onClick={() => setSelected(result.id)}
                onDoubleClick={() => openResult(result)}
              >
                <td className={explorer.name}>
                  <OSIcon name={result.kind === "local" ? "doc" : "article"} size={16} />
                  <span>{result.title}</span>
                </td>
                <td className={explorer.dos}>{locationFor(result)}</td>
                <td>{result.kind === "local" ? "Text Document" : "Garden Document"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {query && results.length === 0 && (
          <div className={explorer.empty}>
            {search.error ?? (search.ready ? "No files found." : "Preparing the search index...")}
          </div>
        )}
        {!query && <div className={explorer.empty}>Enter a name or phrase to begin.</div>}
      </div>
      {selectedResult && (
        <div className={explorer.findPreview}>{selectedResult.excerpt || "No preview available."}</div>
      )}
      <div className={explorer.count}>
        {search.error
          ? "Search unavailable"
          : query
            ? `${results.length} object(s) found`
            : search.ready ? "Ready" : "Building index..."}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Images — a filesystem view over the media manifest the reader already uses.
// It deliberately lists metadata instead of eagerly downloading dozens of
// multi-megabyte originals; opening a file hands off to the shared lightbox.
// ---------------------------------------------------------------------------

export function ImagesApp() {
  const dimensions = useStore((state) => state.imageDimensions)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [viewerSrc, setViewerSrc] = useState<string | null>(null)

  const images = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return Object.entries(dimensions ?? {})
      .filter(([src]) => src.startsWith("/content/Media/"))
      .map(([src, size]) => {
        const relative = src.slice("/content/Media/".length)
        const parts = relative.split("/")
        return {
          src,
          name: parts.at(-1) ?? relative,
          folder: parts.slice(0, -1).join("\\") || "Images",
          width: size.width,
          height: size.height,
        }
      })
      .filter((image) => !needle || `${image.name} ${image.folder}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dimensions, query])

  const viewerIndex = viewerSrc ? images.findIndex((image) => image.src === viewerSrc) : -1
  const viewer = viewerIndex >= 0 ? images[viewerIndex] : null

  return (
    <div className={explorer.root}>
      <div className={explorer.toolbar}>
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && setViewerSrc(selected)}
        >
          Open
        </button>
        <input
          className={explorer.search}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(null)
          }}
          placeholder="Find an image"
          aria-label="Filter images"
        />
      </div>
      <label className={explorer.path}>
        <span>Address</span>
        <input readOnly value="C:\\GARDEN\\IMAGES" aria-label="Images folder address" />
      </label>

      <table className={explorer.table}>
        <thead><tr><th>Name</th><th>Dimensions</th><th>Folder</th><th>Type</th></tr></thead>
        <tbody>
          {images.map((image) => (
            <tr
              key={image.src}
              className={explorer.row}
              data-selected={selected === image.src}
              onClick={() => setSelected(image.src)}
              onDoubleClick={() => setViewerSrc(image.src)}
            >
              <td className={explorer.name}><OSIcon name="image" size={16} /><span>{image.name}</span></td>
              <td className={explorer.num}>{image.width} × {image.height}</td>
              <td className={explorer.dos}>{image.folder}</td>
              <td>Image</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={explorer.count}>
        {dimensions ? `${images.length} object(s) · double-click to view` : "Reading media index…"}
      </div>

      {viewer && (
        <ImageLightbox
          src={viewer.src}
          alt={viewer.name}
          caption={viewer.name}
          positionLabel={`${viewerIndex + 1} / ${images.length} · ${viewer.width} × ${viewer.height}`}
          onPrevious={viewerIndex > 0 ? () => setViewerSrc(images[viewerIndex - 1].src) : undefined}
          onNext={viewerIndex < images.length - 1 ? () => setViewerSrc(images[viewerIndex + 1].src) : undefined}
          onClose={() => setViewerSrc(null)}
        />
      )}
    </div>
  )
}

const TYPE_LABEL: Record<string, string> = {
  DOC: "Document",
  TXT: "Text Document",
  EXE: "Application",
  NFO: "Information File",
}

// ---------------------------------------------------------------------------
// My Computer
// ---------------------------------------------------------------------------

const DRIVES = [
  { letter: "A:", label: "3½ Floppy", icon: "doc" as IconName, action: "floppy" },
  { letter: "C:", label: "GARDEN", icon: "computer" as IconName, action: "explorer" },
  { letter: "H:", label: "MY DOCUMENTS", icon: "folder" as IconName, action: "home" },
  { letter: "W:", label: "WIKI", icon: "folder" as IconName, action: "wiki" },
  { letter: "X:", label: "CHAT", icon: "chat" as IconName, action: "chat" },
]

export function ComputerApp() {
  const openWindow = useOS((s) => s.openWindow)
  const doubleClickToOpen = useOSSettings((s) => s.doubleClickToOpen)

  const openDrive = (action: string) => {
    if (action === "explorer") {
      openWindow({ appId: "explorer", args: {}, title: "C:\\GARDEN" })
    } else if (action === "home") {
      openWindow({ appId: "explorer", args: { drive: "home" }, title: "My Documents" })
    } else if (action === "wiki") {
      window.open("https://wiki.subsurfaces.net", "_blank", "noopener")
    } else if (action === "chat") {
      window.open("https://chat.subsurfaces.net", "_blank", "noopener")
    } else {
      openWindow({ appId: "floppy", args: {}, title: "A:\\" })
    }
  }

  return (
    <div className={explorer.root}>
      <div className={explorer.path}>My Computer</div>
      <div className={explorer.drives}>
        {DRIVES.map((d) => (
          <button
            key={d.letter}
            className={explorer.drive}
            onClick={(event) => {
              if (!doubleClickToOpen && event.detail === 1) openDrive(d.action)
            }}
            onDoubleClick={() => {
              if (doubleClickToOpen) openDrive(d.action)
            }}
          >
            <OSIcon name={d.icon} size={32} />
            <span>
              {d.label} ({d.letter})
            </span>
          </button>
        ))}
      </div>
      <div className={explorer.count}>{DRIVES.length} object(s)</div>
    </div>
  )
}

/** The empty floppy drive. Errors in character — house law: failure is visible. */
export function FloppyApp() {
  return (
    <div className={explorer.error}>
      <div className={explorer.errorIcon}>✕</div>
      <div>
        <p>
          <strong>A:\ is not accessible.</strong>
        </p>
        <p>The device is not ready.</p>
        <p className={explorer.errorHint}>
          There was a disk. It is described in <em>README.1ST</em>.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recycle Bin — where `draft: true` notes live. The content policy is the
// puzzle; see docs/os-95-spec.md §8.3.
// ---------------------------------------------------------------------------

export function BinApp() {
  const notes = useNotes()
  const openNote = useOpenNote()
  const openWindow = useOS((state) => state.openWindow)
  const { slugs, authenticated, available, error, setRestored } = useRestoredNotes()
  const restored = useMemo(() => new Set(slugs), [slugs])
  const drafts = useMemo(() => notes.filter((n) => n.draft), [notes])
  const inBin = useMemo(() => drafts.filter((note) => !restored.has(note.slug)), [drafts, restored])

  if (inBin.length === 0) {
    return (
      <div className={explorer.empty}>
        <p>The Recycle Bin is empty.</p>
        {drafts.length > 0 && <p>{drafts.length} file(s) recovered to the main garden.</p>}
      </div>
    )
  }

  return (
    <div className={explorer.root}>
      <div className={explorer.path}>Recycle Bin</div>
      <table className={explorer.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Original Location</th>
            <th>Type</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {inBin.map((note) => (
            <tr key={note.slug} className={explorer.row} onDoubleClick={() => openNote(note)}>
              <td className={explorer.name}>
                <OSIcon name="doc" size={16} />
                <span>{note.title}</span>
              </td>
              <td className={explorer.dos}>C:\GARDEN\{(note.folder ?? "").replace(/\//g, "\\")}</td>
              <td>{TYPE_LABEL[fileExt(note)] ?? "File"}</td>
              <td>
                <button
                  className={explorer.button}
                  type="button"
                  disabled={authenticated && !available}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!authenticated) {
                      openWindow({ appId: "account", args: {}, title: "Log On to Subsurfaces", w: 470, h: 500 })
                      return
                    }
                    void setRestored(note.slug, true)
                  }}
                >
                  {!authenticated ? "Log on to restore" : available ? "Restore" : "Recovery unavailable"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={explorer.count}>
        {inBin.length} object(s){restored.size > 0 ? ` · ${restored.size} recovered` : ""}
        {!available ? " · server migration pending" : ""}
        {error ? ` · ${error}` : ""}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Display Properties — a Win95 front end for controls the site already has.
// ---------------------------------------------------------------------------

type SettingsTab = "background" | "appearance" | "startup" | "saver" | "widgets" | "storage" | "about"

const TABS: [SettingsTab, string][] = [
  ["background", "Background"],
  ["appearance", "Appearance"],
  ["startup", "Startup"],
  ["saver", "Screen Saver"],
  ["widgets", "Widgets"],
  ["storage", "Storage"],
  ["about", "About"],
]

export function DisplayApp({ args }: AppProps) {
  const initialTab = TABS.some(([id]) => id === args.tab) ? args.tab as SettingsTab : "background"
  const [tab, setTab] = useState<SettingsTab>(initialTab)

  return (
    <div className={explorer.root}>
      <div className={styles.tabStrip}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={styles.tab}
            data-active={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "background" && <BackgroundTab />}
      {tab === "appearance" && <AppearanceTab />}
      {tab === "startup" && <StartupTab />}
      {tab === "saver" && <SaverTab />}
      {tab === "widgets" && <WidgetsTab />}
      {tab === "storage" && <StorageTab />}
      {tab === "about" && <AboutTab />}
    </div>
  )
}

function BackgroundTab() {
  const bgMode = useStore((s) => s.bgMode)
  const setBgMode = useStore((s) => s.setBgMode)

  return (
    <div className={explorer.props}>
      <label className={explorer.field}>
        <span>Wallpaper</span>
        <select
          value={bgMode}
          onChange={(e) => setBgMode(e.target.value as BgMode)}
          className={explorer.select}
          size={8}
        >
          {BG_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {BG_META[mode]?.label ?? mode}
            </option>
          ))}
        </select>
      </label>
      <p className={explorer.desc}>{BG_META[bgMode]?.desc}</p>
      <p className={styles.runHint}>Press B on the desktop to cycle.</p>
    </div>
  )
}

function AppearanceTab() {
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const accentBase = useStore((s) => s.accentBase)
  const setAccentBase = useStore((s) => s.setAccentBase)
  const cycleAccent = useStore((s) => s.cycleAccent)
  const showHotkeys = useOSSettings((s) => s.showHotkeys)
  const setShowHotkeys = useOSSettings((s) => s.setShowHotkeys)
  const soundEnabled = useOSSettings((s) => s.soundEnabled)
  const setSoundEnabled = useOSSettings((s) => s.setSoundEnabled)
  const soundVolume = useOSSettings((s) => s.soundVolume)
  const setSoundVolume = useOSSettings((s) => s.setSoundVolume)
  const soundEvents = useOSSettings((s) => s.soundEvents)
  const setSoundEvent = useOSSettings((s) => s.setSoundEvent)
  const doubleClickToOpen = useOSSettings((s) => s.doubleClickToOpen)
  const setDoubleClickToOpen = useOSSettings((s) => s.setDoubleClickToOpen)

  return (
    <div className={explorer.props}>
      <label className={explorer.field}>
        <span>Colour scheme</span>
        <button className={explorer.button} onClick={toggleTheme}>
          {theme === "dark" ? "Windows Standard (High Contrast Black)" : "Windows Standard"}
        </button>
      </label>

      <label className={explorer.field}>
        <span>Accent — title bars, Start rail, highlights</span>
        <div className={explorer.runRowInline}>
          <input
            type="color"
            value={accentBase}
            onChange={(e) => setAccentBase(e.target.value)}
            className={explorer.colour}
          />
          <button className={explorer.button} onClick={cycleAccent}>
            Next
          </button>
        </div>
      </label>

      <label className={explorer.radioRow}>
        <input
          type="checkbox"
          checked={showHotkeys}
          onChange={(e) => setShowHotkeys(e.target.checked)}
        />
        Show the shortcut list on the desktop (F1)
      </label>
      <label className={explorer.radioRow}>
        <input type="checkbox" checked={doubleClickToOpen} onChange={(e) => setDoubleClickToOpen(e.target.checked)} />
        Double-click desktop and Explorer items to open
      </label>

      <label className={explorer.radioRow}>
        <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
        Use quiet system sounds
      </label>
      <label className={explorer.field}>
        <span>System sound volume — {Math.round(soundVolume * 100)}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(soundVolume * 100)}
          disabled={!soundEnabled}
          onChange={(e) => setSoundVolume(Number(e.target.value) / 100)}
          onPointerUp={() => { if (soundEvents?.notify) playOSSound("notify", soundVolume) }}
        />
      </label>
      <div className={styles.soundEvents}>
        {(["startup", "open", "close", "notify"] as const).map((sound) => (
          <label className={explorer.radioRow} key={sound}>
            <input
              type="checkbox"
              checked={soundEvents?.[sound] ?? false}
              disabled={!soundEnabled}
              onChange={(event) => setSoundEvent(sound, event.target.checked)}
            />
            {sound === "startup" ? "Startup" : sound === "notify" ? "Notification / test" : `Window ${sound}`}
            <button type="button" className={explorer.button} disabled={!soundEnabled} onClick={() => playOSSound(sound, soundVolume)}>Test</button>
          </label>
        ))}
      </div>
    </div>
  )
}

function StartupTab() {
  const bootSequence = useOSSettings((s) => s.bootSequence)
  const setBootSequence = useOSSettings((s) => s.setBootSequence)
  const openWelcome = useOSSettings((s) => s.openWelcome)
  const setOpenWelcome = useOSSettings((s) => s.setOpenWelcome)
  const showLogon = useOSSettings((s) => s.showLogon)
  const setShowLogon = useOSSettings((s) => s.setShowLogon)

  const OPTIONS: { id: BootSequence; label: string; desc: string }[] = [
    { id: "off", label: "Straight to the desktop", desc: "No sequence. Fastest." },
    { id: "post", label: "Power-on self test", desc: "The BIOS check. A few seconds." },
    {
      id: "full",
      label: "Full procedural sequence",
      desc: "The original endless TUI, seeded and different every time, running until it has said enough.",
    },
  ]

  return (
    <div className={explorer.props}>
      <span>When the machine starts:</span>

      {OPTIONS.map((opt) => (
        <div key={opt.id}>
          <label className={explorer.radioRow}>
            <input
              type="radio"
              name="bootseq"
              checked={bootSequence === opt.id}
              onChange={() => setBootSequence(opt.id)}
            />
            {opt.label}
          </label>
          <p className={explorer.desc} style={{ margin: "2px 0 0 24px" }}>
            {opt.desc}
          </p>
        </div>
      ))}

      <button
        className={explorer.button}
        style={{ alignSelf: "flex-start" }}
        onClick={() => {
          // Clear the once-per-tab flag, then reload so it actually replays.
          try {
            sessionStorage.removeItem("subsurfaces95:booted")
          } catch {
            /* storage disabled — reload still works, it just won't replay */
          }
          window.location.reload()
        }}
      >
        Replay boot now
      </button>

      <label className={explorer.radioRow}>
        <input type="checkbox" checked={openWelcome} onChange={(e) => setOpenWelcome(e.target.checked)} />
        Open Subsurface Territories after logon
      </label>
      <label className={explorer.radioRow}>
        <input type="checkbox" checked={showLogon} onChange={(e) => setShowLogon(e.target.checked)} />
        Show account / guest choice when this machine starts
      </label>

      <p className={styles.runHint}>
        The sequence is seeded — append <code>?seed=WORD</code> to the URL and it boots the same
        way every time.
      </p>
    </div>
  )
}

function SaverTab() {
  const enabled = useOSSettings((s) => s.saverEnabled)
  const setEnabled = useOSSettings((s) => s.setSaverEnabled)
  const delay = useOSSettings((s) => s.saverDelay)
  const setDelay = useOSSettings((s) => s.setSaverDelay)
  const saverMode = useOSSettings((s) => s.saverMode)
  const setSaverMode = useOSSettings((s) => s.setSaverMode)

  return (
    <div className={explorer.props}>
      <label className={explorer.field}>
        <span>Screen saver</span>
        <select
          className={explorer.select}
          value={enabled ? saverMode : "none"}
          onChange={(e) => {
            const value = e.target.value
            setEnabled(value !== "none")
            if (value !== "none") setSaverMode(value as ScreenSaverMode)
          }}
        >
          <option value="none">(None)</option>
          <option value="constellation">CONSTELLATION.SCR</option>
          {BG_MODES.map((mode) => (
            <option key={mode} value={mode}>{BG_META[mode].label.toUpperCase()}.SCR</option>
          ))}
        </select>
      </label>

      <p className={explorer.desc}>
        {saverMode === "constellation"
          ? "The garden's own knowledge graph. The screen saver is made of your notes."
          : "The selected ambient wallpaper takes over while the desktop rests."}
      </p>

      <label className={explorer.field}>
        <span>Wait</span>
        <select
          className={explorer.select}
          value={delay}
          disabled={!enabled}
          onChange={(e) => setDelay(Number(e.target.value))}
        >
          {[30, 60, 90, 180, 300, 600].map((s) => (
            <option key={s} value={s}>
              {s < 60 ? `${s} seconds` : `${s / 60} minute${s === 60 ? "" : "s"}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function WidgetsTab() {
  const show = useOSSettings((state) => state.showWidgets)
  const setShow = useOSSettings((state) => state.setShowWidgets)
  const network = useOSSettings((state) => state.networkWidgetsEnabled)
  const setNetwork = useOSSettings((state) => state.setNetworkWidgetsEnabled)
  const weather = useOSSettings((state) => state.weatherEnabled)
  const setWeather = useOSSettings((state) => state.setWeatherEnabled)
  const location = useOSSettings((state) => state.weatherLocation)
  const setLocation = useOSSettings((state) => state.setWeatherLocation)
  const customFeeds = useOSSettings((state) => state.customFeeds)
  const addCustomFeeds = useOSSettings((state) => state.addCustomFeeds)
  const removeCustomFeed = useOSSettings((state) => state.removeCustomFeed)
  const [locationStatus, setLocationStatus] = useState<string | null>(null)
  const [feedTitle, setFeedTitle] = useState("")
  const [feedUrl, setFeedUrl] = useState("")
  const [feedStatus, setFeedStatus] = useState<string | null>(null)
  const opmlRef = useRef<HTMLInputElement>(null)

  const locate = () => {
    if (!navigator.geolocation) { setLocationStatus("This browser does not provide location access."); return }
    setLocationStatus("Waiting for browser permission…")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const approximate = {
          lat: Number(position.coords.latitude.toFixed(2)),
          lon: Number(position.coords.longitude.toFixed(2)),
        }
        setLocation(approximate)
        setWeather(true)
        setLocationStatus("Approximate coordinates saved in this browser. Weather will now use the Worker proxy.")
      },
      () => setLocationStatus("Location permission was declined or unavailable."),
      { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 10_000 },
    )
  }

  return (
    <div className={explorer.props}>
      <label className={explorer.radioRow}>
        <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />
        Show the desktop clock and widgets
      </label>
      <p className={explorer.desc}>The clock is local and never makes a network request.</p>
      <label className={explorer.radioRow}>
        <input type="checkbox" checked={network} onChange={(event) => setNetwork(event.target.checked)} />
        Allow network widgets (news and weather)
      </label>
      <p className={explorer.desc}>
        Off by default. When enabled, the Subsurfaces Worker fetches and caches a fixed news feed. It does not receive your identity.
      </p>
      <label className={explorer.radioRow}>
        <input
          type="checkbox"
          checked={weather}
          disabled={!network || !location}
          onChange={(event) => setWeather(event.target.checked)}
        />
        Show local weather
      </label>
      <div className={explorer.runRowInline}>
        <button className={explorer.button} type="button" disabled={!network} onClick={locate}>
          {location ? "Update approximate location…" : "Choose approximate location…"}
        </button>
        {location && (
          <button className={explorer.button} type="button" onClick={() => { setLocation(null); setWeather(false) }}>
            Forget location
          </button>
        )}
      </div>
      {location && <p className={explorer.desc}>Stored locally as {location.lat.toFixed(2)}, {location.lon.toFixed(2)} (roughly 1 km precision).</p>}
      {locationStatus && <p className={explorer.desc} role="status">{locationStatus}</p>}
      <div className={styles.settingsRule} />
      <strong>Custom feeds</strong>
      <p className={explorer.desc}>
        Add an RSS/Atom URL or import an OPML subscription list. Custom feeds are requested directly by this browser, only while network widgets are enabled; a publisher may see your IP, and feeds without browser CORS permission will show as unavailable.
      </p>
      <div className={styles.feedAdd}>
        <input className={explorer.select} value={feedTitle} onChange={(event) => setFeedTitle(event.target.value)} placeholder="Feed name" aria-label="Feed name" />
        <input className={explorer.select} value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="https://example.com/feed.xml" aria-label="Feed URL" />
        <button className={explorer.button} type="button" onClick={() => {
          const added = addCustomFeeds([{ title: feedTitle, url: feedUrl }])
          setFeedStatus(added ? "Feed added." : "Enter a new HTTP or HTTPS feed URL.")
          if (added) { setFeedTitle(""); setFeedUrl("") }
        }}>Add</button>
        <button className={explorer.button} type="button" onClick={() => opmlRef.current?.click()}>Import OPML…</button>
        <input
          ref={opmlRef}
          type="file"
          accept=".opml,.xml,text/xml,application/xml"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            try {
              const document = new DOMParser().parseFromString(await file.text(), "application/xml")
              if (document.querySelector("parsererror")) throw new Error("Invalid XML")
              const candidates = [...document.querySelectorAll("outline[xmlUrl]")].map((node) => ({
                title: node.getAttribute("title") || node.getAttribute("text") || "Untitled feed",
                url: node.getAttribute("xmlUrl") || "",
              }))
              const added = addCustomFeeds(candidates)
              setFeedStatus(added ? `Imported ${added} feed${added === 1 ? "" : "s"}.` : "No new feed URLs were found in that file.")
            } catch {
              setFeedStatus("That file is not a readable OPML subscription list.")
            }
            event.target.value = ""
          }}
        />
      </div>
      {customFeeds.length > 0 && (
        <div className={styles.feedList}>
          {customFeeds.map((feed) => (
            <div key={feed.id}><span><strong>{feed.title}</strong><small>{feed.url}</small></span><button className={explorer.button} type="button" onClick={() => removeCustomFeed(feed.id)}>Remove</button></div>
          ))}
        </div>
      )}
      {feedStatus && <p className={explorer.desc} role="status">{feedStatus}</p>}
      <p className={styles.runHint}>Drag widgets by their small heading. Right-click any widget to return here.</p>
    </div>
  )
}

function StorageTab() {
  const files = useOSFiles((s) => s.files)
  const folders = useOSFiles((s) => s.folders)
  const importArchive = useOSFiles((s) => s.importArchive)
  const clearFiles = useOSFiles((s) => s.clearFiles)
  const resetDesktopOrder = useOSSettings((s) => s.resetDesktopOrder)
  const bytes = new Blob([JSON.stringify(files)]).size
  const importRef = useRef<HTMLInputElement>(null)
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  useEffect(() => {
    navigator.storage?.estimate().then((estimate) => {
      if (estimate.usage != null && estimate.quota != null) {
        setStorageEstimate({ usage: estimate.usage, quota: estimate.quota })
      }
    }).catch(() => undefined)
  }, [])

  const download = () => {
    const blob = new Blob([JSON.stringify({ version: 2, files, folders }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "subsurfaces95-files.json"
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className={explorer.props}>
      <p className={explorer.desc}>
        This machine remembers preferences, desktop placement, widget choices, local documents and pictures, Petri, and your music position in this browser. Open windows remain session-only.
      </p>
      <table className={explorer.aboutTable}>
        <tbody>
          <tr><td>Local documents</td><td>{files.length}</td></tr>
          <tr><td>Local folders</td><td>{folders.length}</td></tr>
          <tr><td>Document storage</td><td>{bytes.toLocaleString()} bytes</td></tr>
          {storageEstimate && <tr><td>Browser storage</td><td>{(storageEstimate.usage / 1_048_576).toFixed(1)} / {(storageEstimate.quota / 1_048_576).toFixed(0)} MB</td></tr>}
          <tr><td>Settings key</td><td>subsurfaces95</td></tr>
          <tr><td>Files key</td><td>subsurfaces95-files</td></tr>
          <tr><td>Program data keys</td><td>subsurfaces95-solitaire, subsurfaces95-media, subsurfaces95-petri</td></tr>
          <tr><td>Shared music keys</td><td>music-session, music-volume</td></tr>
        </tbody>
      </table>
      <div className={explorer.runRowInline}>
        <button className={explorer.button} onClick={download} disabled={!files.length}>Export files…</button>
        <button className={explorer.button} onClick={() => importRef.current?.click()}>Import files…</button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            try {
              const result = importArchive(JSON.parse(await file.text()))
              setImportStatus(`Imported ${result.imported}; skipped ${result.skipped}. Name conflicts were preserved as copies.`)
            } catch {
              setImportStatus("That file is not a valid SUBSURFACES 95 archive.")
            }
            event.target.value = ""
          }}
        />
        <button
          className={explorer.button}
          onClick={() => { if (window.confirm("Delete all local documents and pictures?")) clearFiles() }}
          disabled={!files.length}
        >
          Delete local files…
        </button>
      </div>
      {importStatus && <p className={explorer.desc}>{importStatus}</p>}
      <button className={explorer.button} onClick={resetDesktopOrder} style={{ alignSelf: "flex-start" }}>
        Reset desktop icon order
      </button>
    </div>
  )
}

function AboutTab() {
  const contentIndex = useStore((s) => s.contentIndex)
  const notes = contentIndex ? Object.keys(contentIndex).length : 0
  const { username, role } = useAuth()

  return (
    <div className={explorer.props}>
      <div className={explorer.aboutHead}>
        <OSIcon name="computer" size={48} />
        <div>
          <strong>Subsurfaces 95</strong>
          <p className={explorer.desc} style={{ margin: 0 }}>
            A second reading interface for the same garden.
          </p>
        </div>
      </div>

      <table className={explorer.aboutTable}>
        <tbody>
          <tr>
            <td>Registered to</td>
            <td>{username ?? "Guest"}{role ? ` (${role})` : ""}</td>
          </tr>
          <tr>
            <td>Documents</td>
            <td>{notes || "—"}</td>
          </tr>
          <tr>
            <td>Applications</td>
            <td>{Object.keys(APPS).length}</td>
          </tr>
          <tr>
            <td>Programs</td>
            <td>{Object.keys(PROGRAMS).length}</td>
          </tr>
          <tr>
            <td>Physical memory</td>
            <td>16,384 KB</td>
          </tr>
        </tbody>
      </table>

      <p className={styles.runHint}>
        Chrome is 1995. Documents are the garden, rendered exactly as they are on the main site.
      </p>
    </div>
  )
}

function mediaTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00"
  const absolute = Math.max(0, Math.floor(Math.abs(seconds)))
  return `${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`
}

export function MediaPlayerApp() {
  const {
    tracks, currentTrackIndex, currentTrack, isPlaying, currentTime, duration, volume,
    playTrack, togglePlay, stop, nextTrack, prevTrack, seek, setVolume, analyser,
    repeatMode, setRepeatMode, queue, setQueue, queueIndex, setQueueIndex,
    eqEnabled, crossfadeSeconds, isCrossfading,
  } = useMusic()
  const openWindow = useOS((state) => state.openWindow)
  const visualizerDetached = useOS((state) => state.windows.some((win) =>
    win.appId === "media-pane"
    && win.args.pane === "visualizer"
    && win.state !== "minimized"
    && win.state !== "shaded",
  ))
  const savedPlaylists = useOSMedia((state) => state.savedPlaylists)
  const savePlaylist = useOSMedia((state) => state.savePlaylist)
  const deletePlaylist = useOSMedia((state) => state.deletePlaylist)
  const mode = useOSMedia((state) => state.visualizerMode)
  const setMode = useOSMedia((state) => state.setVisualizerMode)
  const skin = useOSMedia((state) => state.skin)
  const setSkin = useOSMedia((state) => state.setSkin)
  const [view, setView] = useState<MediaView>("library")
  const [playlistName, setPlaylistName] = useState("Mixtape")
  const [query, setQuery] = useState("")
  const [showRemaining, setShowRemaining] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const trackBySlug = useMemo(
    () => new Map(tracks.map((track) => [track.slug, track])),
    [tracks],
  )
  const filteredTracks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return tracks
    return tracks.filter((track) =>
      `${track.title} ${track.artist} ${track.year ?? ""}`.toLowerCase().includes(needle),
    )
  }, [query, tracks])
  const savedMixes = useMemo(
    () => Object.entries(savedPlaylists).sort(([left], [right]) => left.localeCompare(right)),
    [savedPlaylists],
  )

  const beginTrack = (slug: string, nextQueueIndex = -1) => {
    if (currentTrack?.slug === slug) {
      setQueueIndex(nextQueueIndex)
      seek(0)
      if (!isPlaying) togglePlay()
    } else {
      playTrack(slug, nextQueueIndex)
    }
  }
  const removeQueueEntry = (index: number) => {
    setQueue(queue.filter((_, itemIndex) => itemIndex !== index))
    setQueueIndex(queueIndexAfterRemoval(queueIndex, index))
  }
  const moveQueueEntry = (from: number, to: number) => {
    setQueue(moveQueueItem(queue, from, to))
    setQueueIndex(queueIndexAfterMove(queueIndex, from, to))
  }
  const shuffle = () => {
    const source = queue.length > 0 ? queue : tracks.map((track) => track.slug)
    const shuffled = shuffleQueue(source)
    setQueue(shuffled)
    setQueueIndex(currentTrack ? shuffled.indexOf(currentTrack.slug) : -1)
    setView("queue")
  }
  const loadMix = (name: string, autoplay: boolean) => {
    const slugs = (savedPlaylists[name] ?? []).filter((slug) => trackBySlug.has(slug))
    setPlaylistName(name)
    setQueue(slugs)
    setQueueIndex(autoplay && slugs.length > 0 ? 0 : -1)
    setView("queue")
    if (autoplay && slugs[0]) beginTrack(slugs[0], 0)
  }
  const cycleRepeat = () => {
    setRepeatMode(repeatMode === "off" ? "all" : repeatMode === "all" ? "track" : "off")
  }
  const openPane = (pane: MediaPane) => {
    const paneMeta = {
      equalizer: { title: "Media Player - Equalizer", w: 420, h: 390 },
      visualizer: { title: "Media Player - Visualizer", w: 560, h: 400 },
      playlist: { title: "Media Player - Playlist", w: 500, h: 470 },
    }[pane]
    openWindow({ appId: "media-pane", args: { pane }, ...paneMeta })
  }
  const shownTime = showRemaining && duration > 0 ? duration - currentTime : currentTime

  return (
    <div className={styles.mediaPlayer} data-media-skin={skin}>
      <div className={styles.mediaDeck}>
        <div className={styles.mediaScreen} aria-live="polite">
          <span className={styles.mediaStatus}>{isCrossfading ? "XFADE" : isPlaying ? "PLAY" : currentTrack ? "PAUSE" : "READY"}</span>
          <button
            className={styles.mediaMarquee}
            onClick={() => setShowRemaining((remaining) => !remaining)}
            title="Toggle elapsed / remaining time"
          >
            <span>{currentTrack ? `${currentTrack.artist} - ${currentTrack.title}` : "SUBSURFACES MEDIA PLAYER"}</span>
          </button>
          <button className={styles.mediaClock} onClick={() => setShowRemaining((remaining) => !remaining)}>
            {showRemaining && duration > 0 ? "-" : ""}{mediaTime(shownTime)}
          </button>
          <span className={styles.mediaPosition}>
            {queueIndex >= 0 ? `${queueIndex + 1}/${queue.length}` : String(currentTrackIndex + 1).padStart(2, "0")}
          </span>
        </div>
        <div className={styles.mediaVizPanel}>
          {visualizerDetached
            ? <div className={`${styles.mediaVisual} ${styles.mediaVisualDetached}`}>VISUALIZER DETACHED</div>
            : <MediaVisualizer analyser={analyser} mode={mode} skin={skin} />}
          <div className={styles.mediaVizModes} aria-label="Visualiser mode">
            {MEDIA_VIZ_MODES.map((candidate) => (
              <button key={candidate.id} data-active={candidate.id === mode} onClick={() => setMode(candidate.id)}>
                {candidate.label}
              </button>
            ))}
          </div>
        </div>
        <input
          className={styles.mediaSeek}
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Track position"
        />
        <div className={styles.mediaControls}>
          <div className={styles.mediaTransport}>
            <button onClick={prevTrack} aria-label="Previous track">|&lt;</button>
            <button onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? "||" : ">"}</button>
            <button onClick={stop} aria-label="Stop">[]</button>
            <button onClick={nextTrack} aria-label="Next track">&gt;|</button>
          </div>
          <button onClick={shuffle} disabled={tracks.length === 0} title="Shuffle into queue">SHUF</button>
          <button onClick={cycleRepeat} title={`Repeat: ${repeatMode}`} aria-label={`Repeat mode: ${repeatMode}`}>
            R:{repeatMode === "track" ? "1" : repeatMode === "all" ? "A" : "-"}
          </button>
          <button data-active={eqEnabled} onClick={() => openPane("equalizer")} title="Open detachable equalizer">EQ</button>
          <button onClick={() => openPane("visualizer")} title="Open detachable visualizer">VIS</button>
          <button onClick={() => openPane("playlist")} title="Open detachable playlist">PL</button>
          <span className={styles.mediaCrossfade} title="Crossfade duration">XF {crossfadeSeconds}s</span>
          <label>VOL
            <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(event) => setVolume(Number(event.target.value) / 100)} />
          </label>
          <select value={skin} onChange={(event) => setSkin(event.target.value as MediaSkin)} aria-label="Player skin">
            {Object.entries(MEDIA_SKINS).map(([id, candidate]) => <option key={id} value={id}>{candidate.label}</option>)}
          </select>
        </div>
      </div>

      <div className={styles.mediaBrowser}>
        <div className={styles.mediaTabs} role="tablist" aria-label="Music browser">
          {(["library", "queue", "mixes"] as const).map((tab) => (
            <button key={tab} role="tab" aria-selected={view === tab} onClick={() => setView(tab)}>
              {tab.toUpperCase()} <span>{tab === "library" ? tracks.length : tab === "queue" ? queue.length : savedMixes.length}</span>
            </button>
          ))}
        </div>

        {view === "library" && (
          <>
            <div className={styles.mediaToolbar}>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, artist, year..." aria-label="Search music library" />
              <span>{filteredTracks.length} TRACKS</span>
            </div>
            <div className={styles.mediaPlaylist} role="tabpanel">
              {filteredTracks.map((track) => {
                const index = tracks.indexOf(track)
                return (
                  <div className={styles.mediaTrack} key={track.slug} data-active={index === currentTrackIndex}>
                    <button className={styles.mediaTrackMain} onClick={() => beginTrack(track.slug)}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span><strong>{track.title}</strong><small>{track.artist}{track.year ? ` / ${track.year}` : ""}</small></span>
                      <time>{track.duration ? mediaTime(track.duration) : "--:--"}</time>
                    </button>
                    <button title="Play next" onClick={() => setQueue(insertNext(queue, queueIndex, track.slug))}>NEXT</button>
                    <button title="Add another copy to queue" onClick={() => setQueue([...queue, track.slug])}>+</button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {view === "queue" && (
          <>
            <div className={styles.mediaToolbar}>
              <span>{queue.length ? `${queue.length} QUEUED / DRAG TO REORDER` : "QUEUE IS EMPTY"}</span>
              <button onClick={() => { setQueue([]); setQueueIndex(-1) }} disabled={queue.length === 0}>CLEAR</button>
            </div>
            <div className={styles.mediaPlaylist} role="tabpanel">
              {queue.map((slug, index) => {
                const track = trackBySlug.get(slug)
                if (!track) return null
                return (
                  <div
                    className={`${styles.mediaTrack} ${styles.mediaQueueTrack}`}
                    key={`${slug}-${index}`}
                    data-active={index === queueIndex}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) moveQueueEntry(dragIndex, index)
                      setDragIndex(null)
                    }}
                  >
                    <button
                      className={styles.mediaDragHandle}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragEnd={() => setDragIndex(null)}
                      title="Drag to reorder"
                      aria-label={`Move ${track.title}`}
                    >::</button>
                    <button className={styles.mediaTrackMain} onClick={() => beginTrack(slug, index)}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span><strong>{track.title}</strong><small>{track.artist}</small></span>
                      <time>{track.duration ? mediaTime(track.duration) : "--:--"}</time>
                    </button>
                    <span className={styles.mediaMoveButtons}>
                      <button onClick={() => moveQueueEntry(index, index - 1)} disabled={index === 0} aria-label="Move up">^</button>
                      <button onClick={() => moveQueueEntry(index, index + 1)} disabled={index === queue.length - 1} aria-label="Move down">v</button>
                    </span>
                    <button onClick={() => removeQueueEntry(index)} aria-label={`Remove ${track.title} from queue`}>x</button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {view === "mixes" && (
          <div className={`${styles.mediaPlaylist} ${styles.mediaMixes}`} role="tabpanel">
            <div className={styles.mediaMixEditor}>
              <input value={playlistName} maxLength={40} onChange={(event) => setPlaylistName(event.target.value)} aria-label="Mix name" />
              <button onClick={() => savePlaylist(playlistName, queue)} disabled={queue.length === 0}>SAVE QUEUE</button>
            </div>
            {savedMixes.length === 0 && <p className={styles.mediaEmpty}>Build a queue, then save it as a mix.</p>}
            {savedMixes.map(([name, slugs]) => (
              <div className={styles.mediaMix} key={name}>
                <span><strong>{name}</strong><small>{slugs.length} track{slugs.length === 1 ? "" : "s"}</small></span>
                <button onClick={() => loadMix(name, false)}>LOAD</button>
                <button onClick={() => loadMix(name, true)}>PLAY</button>
                <button onClick={() => { if (window.confirm(`Delete '${name}'?`)) deletePlaylist(name) }}>DEL</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MediaEqualizerPanel() {
  const {
    eqEnabled,
    setEqEnabled,
    eqGains,
    setEqGain,
    setEqGains,
    highpassHz,
    setHighpassHz,
    lowpassHz,
    setLowpassHz,
    resetEqualizer,
    crossfadeSeconds,
    setCrossfadeSeconds,
    isCrossfading,
  } = useMusic()
  const preset = highpassHz === 20 && lowpassHz === 20_000
    ? Object.entries(EQ_PRESETS).find(([, gains]) =>
      gains.every((gain, index) => gain === eqGains[index]),
    )?.[0] ?? "Custom"
    : "Custom"

  return (
    <div className={styles.mediaEqualizer}>
      <div className={styles.mediaEqHeader}>
        <button data-active={eqEnabled} onClick={() => setEqEnabled(!eqEnabled)}>
          {eqEnabled ? "EQ ON" : "BYPASS"}
        </button>
        <select
          value={preset}
          aria-label="Equalizer preset"
          onChange={(event) => {
            const name = event.target.value
            setEqGains([...(EQ_PRESETS[name] ?? EQ_PRESETS.Flat)] as EqGains)
            setHighpassHz(20)
            setLowpassHz(20_000)
            setEqEnabled(true)
          }}
        >
          <option value="Custom" disabled>Custom</option>
          {Object.keys(EQ_PRESETS).map((name) => <option key={name}>{name}</option>)}
        </select>
        <button onClick={resetEqualizer}>RESET</button>
      </div>
      <div className={styles.mediaEqBands}>
        {EQ_BANDS.map((band, index) => (
          <label key={band.frequency}>
            <output>{eqGains[index] > 0 ? "+" : ""}{eqGains[index]}</output>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={eqGains[index]}
              onChange={(event) => { setEqEnabled(true); setEqGain(index, Number(event.target.value)) }}
              aria-label={`${band.frequency} hertz gain`}
            />
            <span>{band.label}</span>
          </label>
        ))}
      </div>
      <div className={styles.mediaFilters}>
        <label>
          <span>HPF</span>
          <input type="range" min={20} max={2_000} step={10} value={highpassHz} onChange={(event) => { setEqEnabled(true); setHighpassHz(Number(event.target.value)) }} />
          <output>{highpassHz} Hz</output>
        </label>
        <label>
          <span>LPF</span>
          <input type="range" min={2_000} max={20_000} step={100} value={lowpassHz} onChange={(event) => { setEqEnabled(true); setLowpassHz(Number(event.target.value)) }} />
          <output>{lowpassHz >= 20_000 ? "OPEN" : `${(lowpassHz / 1_000).toFixed(1)} kHz`}</output>
        </label>
      </div>
      <div className={styles.mediaCrossfadeControl} data-active={isCrossfading || undefined}>
        <label>
          <span>CROSSFADE</span>
          <input
            type="range"
            min={0}
            max={8}
            step={1}
            value={crossfadeSeconds}
            onChange={(event) => setCrossfadeSeconds(Number(event.target.value))}
            aria-label="Crossfade seconds"
          />
          <output>{crossfadeSeconds === 0 ? "OFF" : `${crossfadeSeconds}s`}</output>
        </label>
        <small>{isCrossfading ? "DECK A/B OVERLAP ACTIVE" : "EQUAL-POWER TRANSITION"}</small>
      </div>
    </div>
  )
}

function MediaDetachedPlaylist() {
  const {
    tracks,
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    seek,
    queue,
    setQueue,
    queueIndex,
    setQueueIndex,
  } = useMusic()
  const savedPlaylists = useOSMedia((state) => state.savedPlaylists)
  const savePlaylist = useOSMedia((state) => state.savePlaylist)
  const [mixName, setMixName] = useState("Mixtape")
  const trackBySlug = useMemo(() => new Map(tracks.map((track) => [track.slug, track])), [tracks])

  const begin = (slug: string, index: number) => {
    if (currentTrack?.slug === slug) {
      setQueueIndex(index)
      seek(0)
      if (!isPlaying) togglePlay()
    } else playTrack(slug, index)
  }
  const move = (from: number, to: number) => {
    setQueue(moveQueueItem(queue, from, to))
    setQueueIndex(queueIndexAfterMove(queueIndex, from, to))
  }
  const remove = (index: number) => {
    setQueue(queue.filter((_, candidate) => candidate !== index))
    setQueueIndex(queueIndexAfterRemoval(queueIndex, index))
  }

  return (
    <div className={styles.mediaDetachedPlaylist}>
      <div className={styles.mediaMixEditor}>
        <input value={mixName} maxLength={40} onChange={(event) => setMixName(event.target.value)} aria-label="Detached mix name" />
        <button onClick={() => savePlaylist(mixName, queue)} disabled={!queue.length}>SAVE</button>
        <select
          value=""
          aria-label="Load saved mix"
          onChange={(event) => {
            const name = event.target.value
            const next = (savedPlaylists[name] ?? []).filter((slug) => trackBySlug.has(slug))
            setMixName(name)
            setQueue(next)
            setQueueIndex(-1)
          }}
        >
          <option value="" disabled>LOAD MIX...</option>
          {Object.keys(savedPlaylists).sort().map((name) => <option key={name}>{name}</option>)}
        </select>
        <button onClick={() => { setQueue([]); setQueueIndex(-1) }} disabled={!queue.length}>CLEAR</button>
      </div>
      <div className={styles.mediaPlaylist}>
        {queue.length === 0 && <p className={styles.mediaEmpty}>The queue is empty. Add tracks in the main player.</p>}
        {queue.map((slug, index) => {
          const track = trackBySlug.get(slug)
          if (!track) return null
          return (
            <div className={`${styles.mediaTrack} ${styles.mediaQueueTrack}`} key={`${slug}-${index}`} data-active={index === queueIndex}>
              <span className={styles.mediaQueueNumber}>{String(index + 1).padStart(2, "0")}</span>
              <button className={styles.mediaTrackMain} onClick={() => begin(slug, index)}>
                <span><strong>{track.title}</strong><small>{track.artist}</small></span>
                <time>{track.duration ? mediaTime(track.duration) : "--:--"}</time>
              </button>
              <span className={styles.mediaMoveButtons}>
                <button onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move ${track.title} up`}>^</button>
                <button onClick={() => move(index, index + 1)} disabled={index === queue.length - 1} aria-label={`Move ${track.title} down`}>v</button>
              </span>
              <button onClick={() => remove(index)} aria-label={`Remove ${track.title}`}>x</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MediaPaneApp({ args }: AppProps) {
  const { analyser, currentTrack } = useMusic()
  const mode = useOSMedia((state) => state.visualizerMode)
  const setMode = useOSMedia((state) => state.setVisualizerMode)
  const skin = useOSMedia((state) => state.skin)
  const setSkin = useOSMedia((state) => state.setSkin)
  const pane: MediaPane = args.pane === "equalizer" || args.pane === "playlist" ? args.pane : "visualizer"

  return (
    <div className={styles.mediaPane} data-media-skin={skin}>
      <div className={styles.mediaPaneToolbar}>
        <span>{currentTrack ? `${currentTrack.artist} - ${currentTrack.title}` : "NO TRACK"}</span>
        <select value={skin} onChange={(event) => setSkin(event.target.value as MediaSkin)} aria-label="Detached pane skin">
          {Object.entries(MEDIA_SKINS).map(([id, candidate]) => <option key={id} value={id}>{candidate.label}</option>)}
        </select>
      </div>
      {pane === "equalizer" && <MediaEqualizerPanel />}
      {pane === "playlist" && <MediaDetachedPlaylist />}
      {pane === "visualizer" && (
        <div className={styles.mediaDetachedVisual}>
          <MediaVisualizer analyser={analyser} mode={mode} skin={skin} large />
          <div className={styles.mediaDetachedModes}>
            {MEDIA_VIZ_MODES.map((candidate) => (
              <button key={candidate.id} data-active={mode === candidate.id} onClick={() => setMode(candidate.id)}>
                {candidate.label}{candidate.webgl ? "*" : ""}
              </button>
            ))}
          </div>
          <small>* lazy WebGL feedback engine</small>
        </div>
      )}
    </div>
  )
}

export function TaskManagerApp({ windowId }: AppProps) {
  const windows = useOS((s) => s.windows)
  const closeWindow = useOS((s) => s.closeWindow)
  const activateWindow = useOS((s) => s.activateWindow)
  return (
    <div className={explorer.root}>
      <table className={explorer.table}>
        <thead><tr><th>Task</th><th>Status</th><th /></tr></thead>
        <tbody>
          {windows.map((win) => (
            <tr key={win.id} className={explorer.row} onDoubleClick={() => activateWindow(win.id)}>
              <td>{win.title}</td>
              <td>{win.state === "minimized" ? "Not visible" : "Running"}</td>
              <td><button className={explorer.button} onClick={() => closeWindow(win.id)}>{win.id === windowId ? "End this task" : "End Task"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={explorer.count}>{windows.length} task(s) · double-click to switch</div>
    </div>
  )
}

export function AccountApp() {
  const auth = useAuth()
  const openWindow = useOS((s) => s.openWindow)
  const [mode, setMode] = useState<"login" | "signup" | "recover">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [newUsername, setNewUsername] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const redirectOrigin = "https://wiki.subsurfaces.net"

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    const result = mode === "signup"
      ? await auth.signUp(email.trim(), newUsername.trim(), password, redirectOrigin)
      : mode === "recover"
        ? await auth.resetPassword(email.trim(), redirectOrigin)
        : await auth.signInWithPassword(email.trim(), password)
    setSubmitting(false)
    setMessage(result.error ?? (mode === "signup"
      ? "Account created. Check your email, then return here to log on."
      : mode === "recover" ? "Password reset instructions sent." : "Logged on."))
  }

  const usernameValid = /^[a-zA-Z0-9-]{3,30}$/.test(newUsername)
  const logOff = async () => {
    setSubmitting(true)
    setMessage(null)
    try {
      await logOffOS(auth.signOut)
    } catch {
      setSubmitting(false)
      setMessage("Windows could not log off. Check the connection and try again.")
    }
  }

  if (auth.loading) return <div className={explorer.empty}>Contacting the domain controller…</div>
  if (!auth.session) {
    return (
      <form className={explorer.props} onSubmit={submit}>
        <div className={explorer.aboutHead}>
          <OSIcon name="computer" size={42} />
          <div><strong>Log On to Subsurfaces</strong><p className={explorer.desc}>One account for wiki, chat and this machine.</p></div>
        </div>
        <div className={explorer.runRowInline}>
          <button type="button" className={explorer.button} onClick={() => { setMode("login"); setMessage(null) }}>Log on</button>
          <button type="button" className={explorer.button} onClick={() => { setMode("signup"); setMessage(null) }}>Create account</button>
          <button type="button" className={explorer.button} onClick={() => { setMode("recover"); setMessage(null) }}>Forgot password</button>
        </div>
        {mode === "signup" && (
          <label className={explorer.field}>User name<input className={explorer.select} value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required /></label>
        )}
        <label className={explorer.field}>Email<input className={explorer.select} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {mode !== "recover" && (
          <label className={explorer.field}>Password<input className={explorer.select} type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        )}
        {mode === "signup" && newUsername && !usernameValid && <p className={explorer.desc}>Use 3–30 letters, numbers or hyphens.</p>}
        {message && <p className={explorer.desc} role="status">{message}</p>}
        <button className={explorer.button} disabled={submitting || (mode === "signup" && !usernameValid)}>
          {submitting ? "Please wait…" : mode === "signup" ? "Create Account" : mode === "recover" ? "Send Reset Link" : "Log On"}
        </button>
      </form>
    )
  }

  return (
    <div className={explorer.props}>
      <div className={explorer.aboutHead}>
        <OSIcon name="computer" size={42} />
        <div><strong>{auth.username ?? auth.session.user.email ?? "User"}</strong><p className={explorer.desc}>{auth.role ?? "local session"}</p></div>
      </div>
      <p className={explorer.desc}>
        Your Subsurfaces account follows you across the garden, wiki, chat, and this machine.
      </p>
      <button className={explorer.button} onClick={() => openWindow({ appId: "profile", args: {}, title: "My Subsurfaces Profile", w: 760, h: 610 })}>Open profile and account settings…</button>
      <button className={explorer.button} onClick={() => auth.claimed_slug
        ? openWindow({ appId: "browser", args: { slug: auth.claimed_slug }, title: "My Wiki Page", w: 740, h: 570 })
        : openWindow({ appId: "newpage", args: {}, title: "Create a Wiki Page", w: 760, h: 620 })}
      >{auth.claimed_slug ? "Open my wiki page…" : "Create my wiki page…"}</button>
      {auth.role === "admin" && (
        <button className={explorer.button} onClick={() => openWindow({ appId: "owner", args: {}, title: "Owner Workstation", w: 780, h: 580 })}>Open owner workstation…</button>
      )}
      <button className={explorer.button} disabled={submitting} onClick={() => void logOff()}>
        {submitting ? "Logging off…" : "Log off"}
      </button>
    </div>
  )
}

export function OwnerApp() {
  return <div className={styles.ownerHost} data-wiki><WikiAdminPage /></div>
}

export function ProfileApp() {
  return <div className={styles.ownerHost} data-wiki><WikiProfilePage /></div>
}

export function NewPageApp() {
  return <div className={styles.ownerHost} data-wiki><WikiNewPage /></div>
}

export function EditPageApp({ args }: AppProps) {
  return <div className={styles.ownerHost} data-wiki><WikiEditPage slug={args.slug} /></div>
}

export function MessengerApp() {
  const auth = useAuth()
  const openWindow = useOS((s) => s.openWindow)
  const [rooms, setRooms] = useState<ChatRoomType[]>([])
  const [room, setRoom] = useState<ChatRoomType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!auth.session) return
    try {
      const result = await apiGet<{ rooms: ChatRoomType[] }>("/api/chat/rooms", { token: auth.session.access_token })
      const active = (result.rooms ?? []).filter((candidate) => !candidate.archived)
      setRooms(active)
      setRoom((current) => active.find((candidate) => candidate.id === current?.id) ?? active.find((candidate) => candidate.name === "general") ?? active[0] ?? null)
      setError(null)
    } catch {
      setError("The chat service could not be reached.")
    }
  }, [auth.session])

  useEffect(() => { void refresh() }, [refresh])

  if (auth.loading) return <div className={explorer.empty}>Dialling chat.subsurfaces.net…</div>
  if (!auth.session) {
    return (
      <div className={explorer.props}>
        <p>Messenger uses your Subsurfaces account.</p>
        <button className={explorer.button} onClick={() => openWindow({ appId: "account", args: {}, title: "Log On to Subsurfaces", w: 470, h: 500 })}>Log on or create an account…</button>
      </div>
    )
  }
  if (error) return <div className={explorer.error}>{error}<button className={explorer.button} onClick={() => void refresh()}>Retry</button></div>
  if (!room) return <div className={explorer.empty}>No active chat rooms.</div>

  return (
    <div className={styles.messengerHost} data-chat style={{ "--chat-font-scale": 1 } as React.CSSProperties}>
      <ChatRoom
        key={room.id}
        roomId={room.id}
        roomName={room.name}
        accessToken={auth.session.access_token}
        currentUserId={auth.session.user.id}
        currentUsername={auth.username}
        currentAvatarUrl={auth.avatar_url}
        rooms={rooms}
        onRoomChange={setRoom}
        onRefreshRooms={() => void refresh()}
      />
    </div>
  )
}
