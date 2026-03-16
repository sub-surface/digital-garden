import { create } from "zustand"
import type { PanelCard, ContentIndex, NoteMetadata } from "@/types/content"
import { SITE_DEFAULTS, type SiteConfig } from "@/config/site-defaults"

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0")
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

function applyTriadicPalette(hex: string) {
  const [h, s, l] = hexToHsl(hex)
  const secondary = hslToHex((h + 120) % 360, s, l)
  const tertiary = hslToHex((h + 240) % 360, s, l)
  const el = document.documentElement
  el.style.setProperty("--color-accent-base", hex)
  el.style.setProperty("--color-secondary", secondary)
  el.style.setProperty("--color-tertiary", tertiary)
}

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

  // Side Chat
  isSideChatOpen: boolean
  toggleSideChat: () => void
  setSideChatOpen: (open: boolean) => void
  sideChatWidth: number
  setSideChatWidth: (width: number) => void

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

  activeLayout: "article" | "note"
  setActiveLayout: (layout: "article" | "note") => void

  // Content index (loaded at startup)
  contentIndex: ContentIndex | null
  setContentIndex: (index: ContentIndex) => void

  // Chat display
  chatDensity: "compact" | "comfortable" | "spacious"
  setChatDensity: (d: GardenStore["chatDensity"]) => void
  chatFontScale: number
  setChatFontScale: (s: number) => void
  chatTerminal: boolean
  setChatTerminal: (v: boolean) => void

  // Session overrides (for dev property manager)
  sessionOverrides: Record<string, Partial<NoteMetadata>>
  setOverride: (slug: string, data: Partial<NoteMetadata>) => void
}

const getInitialTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "dark"
  const stored = localStorage.getItem("theme")
  if (stored === "light" || stored === "dark") return stored
  return "light"
}

const getInitialAccent = (): string => {
  if (typeof window === "undefined") return "#427ab4"
  return localStorage.getItem("accentBase") || "#427ab4"
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
    applyTriadicPalette(accentBase)
    set({ accentBase })
  },
  cycleAccent: () =>
    set((s) => {
      const idx = ROYGBIV_ACCENTS.indexOf(s.accentBase)
      const next = ROYGBIV_ACCENTS[(idx + 1) % ROYGBIV_ACCENTS.length]
      localStorage.setItem("accentBase", next)
      applyTriadicPalette(next)
      return { accentBase: next }
    }),

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

  // Side Chat
  isSideChatOpen: false,
  toggleSideChat: () => set((s) => ({ isSideChatOpen: !s.isSideChatOpen })),
  setSideChatOpen: (isSideChatOpen) => set({ isSideChatOpen }),
  sideChatWidth: parseInt(typeof localStorage !== "undefined" ? localStorage.getItem("sidechat-width") ?? "340" : "340", 10),
  setSideChatWidth: (width) => {
    localStorage.setItem("sidechat-width", String(width))
    set({ sideChatWidth: width })
  },

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

  activeLayout: "note",
  setActiveLayout: (activeLayout) => set({ activeLayout }),

  // Content index
  contentIndex: null,
  setContentIndex: (contentIndex) => set({ contentIndex }),

  // Chat display
  chatDensity: (typeof localStorage !== "undefined"
    ? (localStorage.getItem("chatDensity") as "compact" | "comfortable" | "spacious" | null) ?? "comfortable"
    : "comfortable"),
  setChatDensity: (d) => { localStorage.setItem("chatDensity", d); set({ chatDensity: d }) },
  chatFontScale: (typeof localStorage !== "undefined"
    ? Number(localStorage.getItem("chatFontScale") || "1")
    : 1),
  setChatFontScale: (s) => { localStorage.setItem("chatFontScale", String(s)); set({ chatFontScale: s }) },
  chatTerminal: (typeof localStorage !== "undefined"
    ? localStorage.getItem("chatTerminal") === "1"
    : false),
  setChatTerminal: (v) => {
    localStorage.setItem("chatTerminal", v ? "1" : "0")
    set({ chatTerminal: v })
  },

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
  applyTriadicPalette(getInitialAccent())
}
