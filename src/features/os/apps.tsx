/**
 * Application registry for SUBSURFACES 95.
 *
 * Adding an app is one entry here, in the spirit of SYSTEM_PAGES. Almost every
 * app is a thin wrapper: the document apps are `NoteBody` in different chrome,
 * and the games are SYSTEM_PAGES entries that `NoteBody` already knows how to
 * mount. See docs/os-95-spec.md §6.
 */

import { useCallback, useMemo, useState } from "react"
import { NoteBody } from "@/components/ui/reader/NoteBody"
import { Terminal } from "@/features/terminal/Terminal"
import { useStore, BG_MODES, BG_META, type BgMode } from "@/store"
import { SYSTEM_PAGE_META } from "@/config/system-pages-meta"
import { PROGRAMS } from "@/features/terminal/commands"
import { classifyLayout } from "@/lib/layout"
import type { NoteMetadata } from "@/types/content"
import { useOS, useOSSettings, type BootSequence } from "./osStore"
import { OSIcon, type IconName } from "./OSIcon"
import styles from "./OS.module.scss"
import explorer from "./Explorer.module.scss"

export interface AppProps {
  args: Record<string, string>
  /** The window this app is mounted in — lets an app close or retitle itself. */
  windowId: string
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
// MS-DOS Prompt — the same terminal module the main site mounts at /terminal.
// The only difference is what `open` does: here it spawns a window instead of
// navigating. That substitution IS the bridge; no command knows about it.
// ---------------------------------------------------------------------------

function PromptApp({ windowId }: AppProps) {
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

  return (
    <Terminal
      surface="window"
      onOpen={onOpen}
      onClose={() => closeWindow(windowId)}
    />
  )
}

// ---------------------------------------------------------------------------
// Run — resolves against the SAME PROGRAMS map the terminal's launchers use,
// plus every app id and every note slug. One name space, three entry points.
// ---------------------------------------------------------------------------

function RunApp({ windowId }: AppProps) {
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

function ShutDownApp({ windowId }: AppProps) {
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

type SettingsTab = "background" | "appearance" | "startup" | "saver" | "about"

const TABS: [SettingsTab, string][] = [
  ["background", "Background"],
  ["appearance", "Appearance"],
  ["startup", "Startup"],
  ["saver", "Screen Saver"],
  ["about", "About"],
]

function DisplayApp() {
  const [tab, setTab] = useState<SettingsTab>("background")

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
    </div>
  )
}

function StartupTab() {
  const bootSequence = useOSSettings((s) => s.bootSequence)
  const setBootSequence = useOSSettings((s) => s.setBootSequence)

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

  return (
    <div className={explorer.props}>
      <label className={explorer.field}>
        <span>Screen saver</span>
        <select
          className={explorer.select}
          value={enabled ? "constellation" : "none"}
          onChange={(e) => setEnabled(e.target.value !== "none")}
        >
          <option value="none">(None)</option>
          <option value="constellation">CONSTELLATION.SCR</option>
        </select>
      </label>

      <p className={explorer.desc}>
        The garden's own knowledge graph. The screen saver is made of your notes.
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

function AboutTab() {
  const contentIndex = useStore((s) => s.contentIndex)
  const notes = contentIndex ? Object.keys(contentIndex).length : 0

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
            <td>subsurfaces.net</td>
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
  prompt: {
    icon: "terminal",
    defaultSize: { w: 680, h: 420 },
    multiInstance: true,
    Component: PromptApp,
  },
  run: { icon: "app", defaultSize: { w: 420, h: 210 }, Component: RunApp },
  shutdown: { icon: "computer", defaultSize: { w: 400, h: 250 }, Component: ShutDownApp },
  floppy: { icon: "doc", defaultSize: { w: 420, h: 220 }, Component: FloppyApp },
  bin: {
    icon: "bin",
    defaultSize: { w: 600, h: 380 },
    menus: ["File", "Edit", "View", "Help"],
    Component: BinApp,
  },
  display: { icon: "display", defaultSize: { w: 470, h: 480 }, Component: DisplayApp },
}

/** System pages worth surfacing under Start → Programs. */
export const PROGRAM_MENU = Object.entries(SYSTEM_PAGE_META)
  .filter(([, meta]) => meta.layout === "game" || meta.layout === "article")
  .map(([slug, meta]) => ({ slug, title: meta.title }))
  .sort((a, b) => a.title.localeCompare(b.title))
