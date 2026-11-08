/**
 * The site's rooms, named once, top-left. The one you're in is marked rather
 * than linked (TerminalTitle). Also reachable from the prompt (`mode`).
 */
export const MODES = [
  { id: "notes", label: "notes", href: "https://subsurfaces.net" },
  { id: "wiki", label: "wiki", href: "https://wiki.subsurfaces.net" },
  { id: "os", label: "os", href: "https://os.subsurfaces.net" },
  { id: "arcade", label: "arcade", href: "https://subsurfaces.net/arcade" },
] as const

export type ModeId = (typeof MODES)[number]["id"]
