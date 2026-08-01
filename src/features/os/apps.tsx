/**
 * Application registry for SUBSURFACES 95.
 *
 * Adding an app is one entry here, in the spirit of SYSTEM_PAGES. Almost every
 * app is a thin wrapper: the document apps are `NoteBody` in different chrome,
 * and the games are SYSTEM_PAGES entries that `NoteBody` already knows how to
 * mount. See docs/os-95-spec.md §6.
 */

import { useMemo } from "react"
import { NoteBody } from "@/components/ui/reader/NoteBody"
import { useStore, BG_MODES, BG_META, type BgMode } from "@/store"
import { SYSTEM_PAGE_META } from "@/config/system-pages-meta"
import { classifyLayout } from "@/lib/layout"
import type { NoteMetadata } from "@/types/content"
import { useOS } from "./osStore"
import { OSIcon, type IconName } from "./OSIcon"
import styles from "./OS.module.scss"
import explorer from "./Explorer.module.scss"

export interface AppProps {
  args: Record<string, string>
}

export interface OSApp {
  icon: IconName
  defaultSize?: { w: number; h: number }
  menus?: string[]
  multiInstance?: boolean
  Component: React.ComponentType<AppProps>
}

// ---------------------------------------------------------------------------
// Filenames
// ---------------------------------------------------------------------------

/** Extension by layout — articles are documents, system pages are executables. */
export function fileExt(note: Pick<NoteMetadata, "slug" | "layout" | "type" | "system">): string {
  if (note.system) return "EXE"
  const layout = classifyLayout(note.slug, { layout: note.layout, type: note.type })
  if (layout === "game") return "EXE"
  if (note.type === "book" || note.type === "movie") return "NFO"
  return layout === "article" ? "DOC" : "TXT"
}

/**
 * The MS-DOS name, as Explorer's details view would have shown it: six
 * characters, a tilde, an ordinal. Display names stay full-length; this is
 * decoration, and it is the funniest column in the app.
 */
export function dosName(slug: string, ext: string): string {
  const base = slug.split("/").pop() ?? slug
  const clean = base.replace(/[^a-z0-9]/gi, "").toUpperCase()
  const stem = clean.length > 8 ? `${clean.slice(0, 6)}~1` : clean.padEnd(0)
  return `${stem || "UNTITLED"}.${ext}`
}

/** Which document app opens a given note. */
export function appForNote(note: NoteMetadata): string {
  if (note.system) return "program"
  const layout = classifyLayout(note.slug, { layout: note.layout, type: note.type })
  if (layout === "game") return "program"
  return layout === "article" ? "wordpad" : "notepad"
}

/** Shared open-a-note action, used by the desktop, Explorer and the Start menu. */
export function useOpenNote() {
  const openWindow = useOS((s) => s.openWindow)
  return (note: NoteMetadata) => {
    const appId = appForNote(note)
    const ext = fileExt(note)
    openWindow({
      appId,
      args: { slug: note.slug },
      title: `${note.title} — ${dosName(note.slug, ext)}`,
      multiInstance: appId === "notepad",
      ...(appId === "program" ? { w: 860, h: 640 } : {}),
    })
  }
}

// ---------------------------------------------------------------------------
// Document apps — chrome differs, renderer does not.
// ---------------------------------------------------------------------------

function DocApp({ args }: AppProps) {
  return (
    <div className={`${styles.docPad} os-doc`}>
      <NoteBody slug={args.slug} />
    </div>
  )
}

/** System pages (games, shelves, the graph) mount edge-to-edge, no doc padding. */
function ProgramApp({ args }: AppProps) {
  return (
    <div className="os-doc os-doc--full">
      <NoteBody slug={args.slug} />
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

function ExplorerApp({ args }: AppProps) {
  const notes = useNotes()
  const openNote = useOpenNote()
  const openWindow = useOS((s) => s.openWindow)
  const folder = args.folder ?? ""

  const { subfolders, files } = useMemo(() => {
    const subs = new Set<string>()
    const out: NoteMetadata[] = []

    for (const note of notes) {
      if (note.draft) continue // drafts live in the Recycle Bin only
      const noteFolder = note.folder ?? ""
      if (folder === "") {
        if (noteFolder === "") out.push(note)
        else subs.add(noteFolder.split("/")[0])
      } else if (noteFolder === folder) {
        out.push(note)
      } else if (noteFolder.startsWith(`${folder}/`)) {
        subs.add(noteFolder.slice(folder.length + 1).split("/")[0])
      }
    }

    return {
      subfolders: Array.from(subs).sort((a, b) => a.localeCompare(b)),
      files: out.sort((a, b) => a.title.localeCompare(b.title)),
    }
  }, [notes, folder])

  const parent = folder === "" ? null : folder.split("/").slice(0, -1).join("/")

  return (
    <div className={explorer.root}>
      <div className={explorer.path}>C:\GARDEN{folder ? `\\${folder.replace(/\//g, "\\")}` : ""}</div>

      <table className={explorer.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Type</th>
            <th>MS-DOS name</th>
          </tr>
        </thead>
        <tbody>
          {parent !== null && (
            <tr
              className={explorer.row}
              onDoubleClick={() =>
                openWindow({
                  appId: "explorer",
                  args: parent ? { folder: parent } : {},
                  title: parent ? `${parent.split("/").pop()}` : "C:\\GARDEN",
                })
              }
            >
              <td className={explorer.name}>
                <OSIcon name="folder" size={16} />
                <span>..</span>
              </td>
              <td colSpan={3} />
            </tr>
          )}

          {subfolders.map((sub) => {
            const path = folder ? `${folder}/${sub}` : sub
            return (
              <tr
                key={path}
                className={explorer.row}
                onDoubleClick={() =>
                  openWindow({ appId: "explorer", args: { folder: path }, title: sub })
                }
              >
                <td className={explorer.name}>
                  <OSIcon name="folder" size={16} />
                  <span>{sub}</span>
                </td>
                <td />
                <td>File Folder</td>
                <td className={explorer.dos}>{sub.slice(0, 8).toUpperCase()}</td>
              </tr>
            )
          })}

          {files.map((note) => {
            const ext = fileExt(note)
            return (
              <tr key={note.slug} className={explorer.row} onDoubleClick={() => openNote(note)}>
                <td className={explorer.name}>
                  <OSIcon
                    name={ext === "EXE" ? "app" : ext === "DOC" ? "article" : "doc"}
                    size={16}
                  />
                  <span>{note.title}</span>
                </td>
                <td className={explorer.num}>
                  {note.readingTime ? `${note.readingTime * 2}KB` : "—"}
                </td>
                <td>{TYPE_LABEL[ext] ?? "File"}</td>
                <td className={explorer.dos}>{dosName(note.slug, ext)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className={explorer.count}>
        {subfolders.length + files.length} object(s)
      </div>
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
  { letter: "W:", label: "WIKI", icon: "folder" as IconName, action: "wiki" },
  { letter: "X:", label: "CHAT", icon: "chat" as IconName, action: "chat" },
]

function ComputerApp() {
  const openWindow = useOS((s) => s.openWindow)

  return (
    <div className={explorer.root}>
      <div className={explorer.path}>My Computer</div>
      <div className={explorer.drives}>
        {DRIVES.map((d) => (
          <button
            key={d.letter}
            className={explorer.drive}
            onDoubleClick={() => {
              if (d.action === "explorer") {
                openWindow({ appId: "explorer", args: {}, title: "C:\\GARDEN" })
              } else if (d.action === "wiki") {
                window.open("https://wiki.subsurfaces.net", "_blank", "noopener")
              } else if (d.action === "chat") {
                window.open("https://chat.subsurfaces.net", "_blank", "noopener")
              } else {
                openWindow({ appId: "floppy", args: {}, title: "A:\\" })
              }
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
function FloppyApp() {
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

function BinApp() {
  const notes = useNotes()
  const openNote = useOpenNote()
  const drafts = useMemo(() => notes.filter((n) => n.draft), [notes])

  if (drafts.length === 0) {
    return <div className={explorer.empty}>The Recycle Bin is empty.</div>
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
          </tr>
        </thead>
        <tbody>
          {drafts.map((note) => (
            <tr key={note.slug} className={explorer.row} onDoubleClick={() => openNote(note)}>
              <td className={explorer.name}>
                <OSIcon name="doc" size={16} />
                <span>{note.title}</span>
              </td>
              <td className={explorer.dos}>C:\GARDEN\{(note.folder ?? "").replace(/\//g, "\\")}</td>
              <td>{TYPE_LABEL[fileExt(note)] ?? "File"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={explorer.count}>{drafts.length} object(s)</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Display Properties — a Win95 front end for controls the site already has.
// ---------------------------------------------------------------------------

function DisplayApp() {
  const bgMode = useStore((s) => s.bgMode)
  const setBgMode = useStore((s) => s.setBgMode)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const accentBase = useStore((s) => s.accentBase)
  const setAccentBase = useStore((s) => s.setAccentBase)

  return (
    <div className={explorer.props}>
      <label className={explorer.field}>
        <span>Background</span>
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

      <label className={explorer.field}>
        <span>Colour scheme</span>
        <button className={explorer.button} onClick={toggleTheme}>
          {theme === "dark" ? "Windows Standard (High Contrast Black)" : "Windows Standard"}
        </button>
      </label>

      <label className={explorer.field}>
        <span>Accent</span>
        <input
          type="color"
          value={accentBase}
          onChange={(e) => setAccentBase(e.target.value)}
          className={explorer.colour}
        />
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const APPS: Record<string, OSApp> = {
  notepad: {
    icon: "doc",
    defaultSize: { w: 600, h: 460 },
    menus: ["File", "Edit", "Search", "Help"],
    multiInstance: true,
    Component: DocApp,
  },
  wordpad: {
    icon: "article",
    defaultSize: { w: 720, h: 560 },
    menus: ["File", "Edit", "View", "Insert", "Format", "Help"],
    Component: DocApp,
  },
  help: {
    icon: "help",
    defaultSize: { w: 560, h: 500 },
    menus: ["File", "Edit", "Bookmark", "Options", "Help"],
    Component: DocApp,
  },
  program: {
    icon: "app",
    defaultSize: { w: 860, h: 640 },
    Component: ProgramApp,
  },
  explorer: {
    icon: "folder",
    defaultSize: { w: 660, h: 440 },
    menus: ["File", "Edit", "View", "Help"],
    Component: ExplorerApp,
  },
  computer: {
    icon: "computer",
    defaultSize: { w: 460, h: 320 },
    menus: ["File", "Edit", "View", "Help"],
    Component: ComputerApp,
  },
  floppy: { icon: "doc", defaultSize: { w: 420, h: 220 }, Component: FloppyApp },
  bin: {
    icon: "bin",
    defaultSize: { w: 600, h: 380 },
    menus: ["File", "Edit", "View", "Help"],
    Component: BinApp,
  },
  display: { icon: "display", defaultSize: { w: 420, h: 480 }, Component: DisplayApp },
}

/** System pages worth surfacing under Start → Programs. */
export const PROGRAM_MENU = Object.entries(SYSTEM_PAGE_META)
  .filter(([, meta]) => meta.layout === "game" || meta.layout === "article")
  .map(([slug, meta]) => ({ slug, title: meta.title }))
  .sort((a, b) => a.title.localeCompare(b.title))
