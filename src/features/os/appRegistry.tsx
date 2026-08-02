/**
 * Lightweight application registry for SUBSURFACES 95.
 *
 * Desktop chrome imports this module eagerly, so it contains metadata and
 * lazy loaders only. Program implementations stay behind dynamic boundaries
 * until a window actually opens.
 */

import { lazy, type ComponentType } from "react"
import { SYSTEM_PAGE_META } from "@/config/system-pages-meta"
import { useOS, useOSFiles, type OSWindow } from "./osStore"
import type { AppProps } from "./apps"
import type { IconName } from "./OSIcon"
import type { OSMenu } from "./osMenus"

export interface OSApp {
  icon: IconName
  defaultSize?: { w: number; h: number }
  menus?: (win: OSWindow) => OSMenu[]
  multiInstance?: boolean
  Component: ComponentType<AppProps>
}

type AppModule = typeof import("./apps")
type AppExport = {
  [Key in keyof AppModule]: AppModule[Key] extends ComponentType<AppProps> ? Key : never
}[keyof AppModule]

function lazyApp(name: AppExport): ComponentType<AppProps> {
  return lazy(async () => {
    const module = await import("./apps")
    return { default: module[name] as ComponentType<AppProps> }
  })
}

const BrowserApp = lazyApp("BrowserApp")
const NotepadApp = lazyApp("NotepadApp")
const ProgramApp = lazyApp("ProgramApp")
const PromptApp = lazyApp("PromptApp")
const RunApp = lazyApp("RunApp")
const ShutDownApp = lazyApp("ShutDownApp")
const LogOffApp = lazyApp("LogOffApp")
const ExplorerApp = lazyApp("ExplorerApp")
const FindApp = lazyApp("FindApp")
const ImagesApp = lazyApp("ImagesApp")
const ComputerApp = lazyApp("ComputerApp")
const FloppyApp = lazyApp("FloppyApp")
const BinApp = lazyApp("BinApp")
const DisplayApp = lazyApp("DisplayApp")
const MediaPlayerApp = lazyApp("MediaPlayerApp")
const MediaPaneApp = lazyApp("MediaPaneApp")
const TaskManagerApp = lazyApp("TaskManagerApp")
const AccountApp = lazyApp("AccountApp")
const OwnerApp = lazyApp("OwnerApp")
const ProfileApp = lazyApp("ProfileApp")
const NewPageApp = lazyApp("NewPageApp")
const EditPageApp = lazyApp("EditPageApp")
const MessengerApp = lazyApp("MessengerApp")
const SolitaireApp = lazy(() =>
  import("./Solitaire").then((module) => ({ default: module.SolitaireApp })),
)

const closeMenus = (win: OSWindow): OSMenu[] => [{
  label: "File",
  items: [{ label: "Close", onSelect: () => useOS.getState().closeWindow(win.id) }],
}]

const browserMenus = (win: OSWindow): OSMenu[] => [
  {
    label: "File",
    items: [
      {
        label: "Open in main site",
        onSelect: () => window.open(`https://subsurfaces.net/${win.args.slug}`, "_blank", "noopener"),
        separatorAfter: true,
      },
      { label: "Close", onSelect: () => useOS.getState().closeWindow(win.id) },
    ],
  },
  {
    label: "Edit",
    items: [{
      label: win.args.reader === "1" ? "Exit reader mode" : "View in reader mode",
      onSelect: () => useOS.getState().updateWindowArgs(win.id, { reader: win.args.reader === "1" ? "0" : "1" }),
    }],
  },
  {
    label: "Help",
    items: [{
      label: "About this document",
      onSelect: () => useOS.getState().openWindow({
        appId: "display",
        args: {},
        title: "Display Properties",
        w: 470,
        h: 480,
      }),
    }],
  },
]

const explorerMenus = (win: OSWindow): OSMenu[] => [
  {
    label: "File",
    items: [
      {
        label: "New Text Document",
        onSelect: () => {
          const id = useOSFiles.getState().createFile()
          useOS.getState().openWindow({
            appId: "notepad",
            args: { fileId: id },
            title: "Untitled.txt — Notepad",
          })
        },
        separatorAfter: true,
      },
      { label: "Close", onSelect: () => useOS.getState().closeWindow(win.id) },
    ],
  },
  { label: "View", items: [{ label: "Refresh", onSelect: () => useOS.getState().focusWindow(win.id) }] },
]

export const APPS: Record<string, OSApp> = {
  browser: { icon: "article", defaultSize: { w: 740, h: 570 }, menus: browserMenus, Component: BrowserApp },
  notepad: { icon: "doc", defaultSize: { w: 600, h: 460 }, menus: closeMenus, multiInstance: true, Component: NotepadApp },
  help: { icon: "help", defaultSize: { w: 560, h: 500 }, menus: browserMenus, Component: BrowserApp },
  program: { icon: "app", defaultSize: { w: 860, h: 640 }, Component: ProgramApp },
  explorer: { icon: "folder", defaultSize: { w: 660, h: 440 }, menus: explorerMenus, Component: ExplorerApp },
  find: { icon: "folder", defaultSize: { w: 720, h: 500 }, menus: closeMenus, Component: FindApp },
  images: { icon: "folder", defaultSize: { w: 700, h: 500 }, menus: closeMenus, Component: ImagesApp },
  computer: { icon: "computer", defaultSize: { w: 460, h: 320 }, menus: closeMenus, Component: ComputerApp },
  prompt: { icon: "terminal", defaultSize: { w: 680, h: 420 }, multiInstance: true, Component: PromptApp },
  media: { icon: "music", defaultSize: { w: 640, h: 590 }, menus: closeMenus, Component: MediaPlayerApp },
  "media-pane": { icon: "music", defaultSize: { w: 500, h: 420 }, menus: closeMenus, Component: MediaPaneApp },
  solitaire: { icon: "app", defaultSize: { w: 720, h: 610 }, menus: closeMenus, Component: SolitaireApp },
  taskmgr: { icon: "computer", defaultSize: { w: 520, h: 360 }, menus: closeMenus, Component: TaskManagerApp },
  account: { icon: "computer", defaultSize: { w: 470, h: 500 }, menus: closeMenus, Component: AccountApp },
  owner: { icon: "computer", defaultSize: { w: 780, h: 580 }, menus: closeMenus, Component: OwnerApp },
  profile: { icon: "computer", defaultSize: { w: 760, h: 610 }, menus: closeMenus, Component: ProfileApp },
  newpage: { icon: "doc", defaultSize: { w: 760, h: 620 }, menus: closeMenus, Component: NewPageApp },
  edit: { icon: "doc", defaultSize: { w: 780, h: 640 }, menus: closeMenus, multiInstance: true, Component: EditPageApp },
  messenger: { icon: "chat", defaultSize: { w: 720, h: 580 }, menus: closeMenus, Component: MessengerApp },
  run: { icon: "app", defaultSize: { w: 420, h: 210 }, Component: RunApp },
  logoff: { icon: "user", defaultSize: { w: 410, h: 230 }, Component: LogOffApp },
  shutdown: { icon: "computer", defaultSize: { w: 400, h: 250 }, Component: ShutDownApp },
  floppy: { icon: "doc", defaultSize: { w: 420, h: 220 }, Component: FloppyApp },
  bin: { icon: "bin", defaultSize: { w: 600, h: 380 }, menus: closeMenus, Component: BinApp },
  display: { icon: "display", defaultSize: { w: 500, h: 520 }, menus: closeMenus, Component: DisplayApp },
}

export const CORE_PROGRAM_MENU = [
  { appId: "solitaire", title: "Solitaire" },
  { appId: "messenger", title: "Subsurfaces Messenger" },
]

/** System pages worth surfacing under Start → Programs. */
export const PROGRAM_MENU = Object.entries(SYSTEM_PAGE_META)
  .filter(([, meta]) => meta.layout === "game" || meta.layout === "article")
  .map(([slug, meta]) => ({ slug, title: meta.title }))
  .sort((a, b) => a.title.localeCompare(b.title))
