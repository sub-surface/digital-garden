import { create } from "zustand"
import type { PanelCard, ContentIndex, NoteMetadata } from "@/types/content"
import { SITE_DEFAULTS, type SiteConfig } from "@/config/site-defaults"

export const ROYGBIV_ACCENTS = [
  "#b4424c", // Red
  "#b47a42", // Orange
  "#b49442", // Amber
  "#42b464", // Green
  "#427ab4", // Blue
  "#424cb4", // Indigo
  "#8a42b4", // Violet
]

interface GardenStore {
  // Config (Live Settings)
  config: SiteConfig
  updateConfig: (updater: (c: SiteConfig) => void) => void

  // Theme
  theme: "light" | "dark"
  setTheme: (theme: "light" | "dark") => void
  toggleTheme: () => void

  // Accent Base
  accentBase: string
  setAccentBase: (color: string) => void
  cycleAccent: () => void

  // Palette (Legacy, now just for data-attributes if needed)
  palette: "mono" | "complimentary"
  setPalette: (p: GardenStore["palette"]) => void

  // Theme Panel
  isThemePanelOpen: boolean
  toggleThemePanel: () => void
  setThemePanel: (open: boolean) => void

  // Reader mode
  isReaderMode: boolean
  toggleReaderMode: () => void

  // Search
  isSearchOpen: boolean
  setSearchOpen: (open: boolean) => void
  toggleSearch: () => void

  // Graph Overlay
  isGraphOpen: boolean
  setGraphOpen: (open: boolean) => void
  toggleGraph: () => void

  // Music
  isMusicOpen: boolean
  toggleMusic: () => void
  isMusicExpanded: boolean
  setIsMusicExpanded: (expanded: boolean) => void
  isPlaylistExpanded: boolean
  setIsPlaylistExpanded: (expanded: boolean) => void

  // Background
  bgMode: "graph" | "vectors" | "dots" | "terminal" | "chess"
  lastBgMode: "graph" | "vectors" | "dots" | "terminal" | "chess"
  bgStyle: "vectors" | "glyphs" | "off"
  setBgMode: (mode: GardenStore["bgMode"]) => void
  toggleGraphBackground: () => void
  cycleBgMode: () => void
  setBgStyle: (style: GardenStore["bgStyle"]) => void

  // Chess
  chessDifficulty: number
  setChessDifficulty: (level: number) => void

  // Panel navigation
  panelStack: PanelCard[]
  pushCard: (card: Omit<PanelCard, "depth">, fromDepth: number) => void
  popCard: () => void
  removeCard: (index: number) => void
  clearStack: () => void

  // Graph state
  activeGraphSlug: string
  setActiveGraphSlug: (slug: string) => void

  // Content index (loaded at startup)
  contentIndex: ContentIndex | null
  setContentIndex: (index: ContentIndex) => void

  // Session overrides (for dev property manager)
  sessionOverrides: Record<string, Partial<NoteMetadata>>
  setOverride: (slug: string, data: Partial<NoteMetadata>) => void
}

const getInitialTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "dark"
  const stored = localStorage.getItem("theme")
  if (stored === "light" || stored === "dark") return stored
  return "dark"
}

const getInitialAccent = (): string => {
  if (typeof window === "undefined") return "#b4424c"
  return localStorage.getItem("accentBase") || "#b4424c"
}

export const useStore = create<GardenStore>((set) => ({
  // Config
  config: SITE_DEFAULTS,
  updateConfig: (updater) => set((s) => {
    const next = { ...s.config }
    updater(next)
    return { config: next }
  }),

  // Theme
  theme: getInitialTheme(),
  setTheme: (theme) => {
    localStorage.setItem("theme", theme)
    document.documentElement.setAttribute("data-theme", theme)
    set({ theme })
  },
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "dark" ? "light" : "dark"
      localStorage.setItem("theme", next)
      document.documentElement.setAttribute("data-theme", next)
      return { theme: next }
    }),

  // Accent
  accentBase: getInitialAccent(),
  setAccentBase: (accentBase) => {
    localStorage.setItem("accentBase", accentBase)
    document.documentElement.style.setProperty("--color-accent-base", accentBase)
    set({ accentBase })
  },
  cycleAccent: () => 
    set((s) => {
      const idx = ROYGBIV_ACCENTS.indexOf(s.accentBase)
      const next = ROYGBIV_ACCENTS[(idx + 1) % ROYGBIV_ACCENTS.length]
      localStorage.setItem("accentBase", next)
      document.documentElement.style.setProperty("--color-accent-base", next)
      return { accentBase: next }
    }),

  // Palette (Fixed to complimentary for the dynamic mixing)
  palette: "complimentary",
  setPalette: (palette) => {
    set({ palette })
  },

  // Theme Panel
  isThemePanelOpen: false,
  toggleThemePanel: () => set((s) => ({ isThemePanelOpen: !s.isThemePanelOpen })),
  setThemePanel: (isThemePanelOpen) => set({ isThemePanelOpen }),

  // Reader mode
  isReaderMode: false,
  toggleReaderMode: () => set((s) => ({ isReaderMode: !s.isReaderMode })),

  // Search
  isSearchOpen: false,
  setSearchOpen: (isSearchOpen) => set({ isSearchOpen }),
  toggleSearch: () => set((s) => ({ isSearchOpen: !s.isSearchOpen })),

  // Graph Overlay
  isGraphOpen: false,
  setGraphOpen: (isGraphOpen) => set({ isGraphOpen }),
  toggleGraph: () => set((s) => ({ isGraphOpen: !s.isGraphOpen })),

  // Music
  isMusicOpen: false,
  toggleMusic: () => set((s) => ({ isMusicOpen: !s.isMusicOpen })),
  isMusicExpanded: false,
  setIsMusicExpanded: (isMusicExpanded) => set({ isMusicExpanded }),
  isPlaylistExpanded: false,
  setIsPlaylistExpanded: (isPlaylistExpanded) => set({ isPlaylistExpanded }),

  // Background
  bgMode: "terminal",
  lastBgMode: "terminal",
  bgStyle: "vectors",
  setBgMode: (bgMode) =>
    set((s) => ({
      bgMode,
      lastBgMode: bgMode === "chess" ? s.lastBgMode : bgMode,
    })),
  toggleGraphBackground: () =>
    set((s) => ({
      bgMode: s.bgMode === "graph" ? s.lastBgMode : "graph",
    })),
  cycleBgMode: () =>
    set((s) => {
      const modes: GardenStore["bgMode"][] = [
        "graph",
        "vectors",
        "dots",
        "terminal",
      ]
      const currentMode = s.bgMode
      const idx = modes.indexOf(currentMode as any)
      const next = modes[(idx + 1) % modes.length]
      return { bgMode: next, lastBgMode: next }
    }),
  setBgStyle: (bgStyle) => set({ bgStyle }),

  // Chess
  chessDifficulty: 1,
  setChessDifficulty: (chessDifficulty) => set({ chessDifficulty }),

  // Panel navigation
  panelStack: [],
  pushCard: (card, fromDepth) =>
    set((s) => {
      const depth = fromDepth + 1
      const trimmed = s.panelStack.slice(0, depth)
      return { panelStack: [...trimmed, { ...card, depth }] }
    }),
  popCard: () =>
    set((s) => ({ panelStack: s.panelStack.slice(0, -1) })),
  removeCard: (index) =>
    set((s) => ({
      panelStack: s.panelStack.slice(0, index),
    })),
  clearStack: () => set({ panelStack: [] }),

  // Graph state
  activeGraphSlug: "index",
  setActiveGraphSlug: (activeGraphSlug) => set({ activeGraphSlug }),

  // Content index
  contentIndex: null,
  setContentIndex: (contentIndex) => set({ contentIndex }),

  // Session overrides
  sessionOverrides: {},
  setOverride: (slug, data) => 
    set((s) => ({
      sessionOverrides: {
        ...s.sessionOverrides,
        [slug]: { ...s.sessionOverrides[slug], ...data }
      }
    })),
}))

// Initialize attributes on load
if (typeof window !== "undefined") {
  document.documentElement.setAttribute("data-theme", getInitialTheme())
  document.documentElement.setAttribute("data-palette", "complimentary")
  document.documentElement.style.setProperty("--color-accent-base", getInitialAccent())
}
