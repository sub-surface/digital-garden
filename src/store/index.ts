import { create } from "zustand"
import type { PanelCard, ContentIndex } from "@/types/content"

interface GardenStore {
  // Theme
  theme: "light" | "dark"
  setTheme: (theme: "light" | "dark") => void
  toggleTheme: () => void

  // Accent Base
  accentBase: string
  setAccentBase: (color: string) => void

  // Palette (Mono, Complimentary cycle)
  palette: "mono" | "complimentary"
  cyclePalette: () => void
  setPalette: (p: GardenStore["palette"]) => void

  // Theme Panel
  isThemePanelOpen: boolean
  toggleThemePanel: () => void
  setThemePanel: (open: boolean) => void

  // Reader mode
  isReaderMode: boolean
  toggleReaderMode: () => void

  // Music
  isMusicOpen: boolean
  toggleMusic: () => void

  // Background
  bgMode: "simplex" | "dots" | "network" | "terminal" | "chess"
  bgStyle: "vectors" | "glyphs" | "off"
  setBgMode: (mode: GardenStore["bgMode"]) => void
  cycleBgMode: () => void
  setBgStyle: (style: GardenStore["bgStyle"]) => void

  // Panel navigation
  panelStack: PanelCard[]
  pushCard: (card: Omit<PanelCard, "depth">, fromDepth: number) => void
  popCard: () => void
  removeCard: (index: number) => void
  clearStack: () => void

  // Content index (loaded at startup)
  contentIndex: ContentIndex | null
  setContentIndex: (index: ContentIndex) => void
}

const getInitialTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "dark"
  const stored = localStorage.getItem("theme")
  if (stored === "light" || stored === "dark") return stored
  return "dark"
}

const getInitialPalette = (): GardenStore["palette"] => {
  if (typeof window === "undefined") return "mono"
  const stored = localStorage.getItem("palette") as GardenStore["palette"]
  const palettes = ["mono", "complimentary"]
  if (palettes.includes(stored)) return stored
  return "mono"
}

const getInitialAccent = (): string => {
  if (typeof window === "undefined") return "#b4424c"
  return localStorage.getItem("accentBase") || "#b4424c"
}

export const useStore = create<GardenStore>((set) => ({
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

  // Palette
  palette: getInitialPalette(),
  setPalette: (palette) => {
    localStorage.setItem("palette", palette)
    document.documentElement.setAttribute("data-palette", palette)
    set({ palette })
  },
  cyclePalette: () =>
    set((s) => {
      const palettes: GardenStore["palette"][] = ["mono", "complimentary"]
      const idx = palettes.indexOf(s.palette)
      const next = palettes[(idx + 1) % palettes.length]
      localStorage.setItem("palette", next)
      document.documentElement.setAttribute("data-palette", next)
      return { palette: next }
    }),

  // Theme Panel
  isThemePanelOpen: false,
  toggleThemePanel: () => set((s) => ({ isThemePanelOpen: !s.isThemePanelOpen })),
  setThemePanel: (isThemePanelOpen) => set({ isThemePanelOpen }),

  // Reader mode
  isReaderMode: false,
  toggleReaderMode: () => set((s) => ({ isReaderMode: !s.isReaderMode })),

  // Music
  isMusicOpen: false,
  toggleMusic: () => set((s) => ({ isMusicOpen: !s.isMusicOpen })),

  // Background
  bgMode: "simplex",
  bgStyle: "vectors",
  setBgMode: (bgMode) => set({ bgMode }),
  cycleBgMode: () =>
    set((s) => {
      const modes: GardenStore["bgMode"][] = [
        "simplex",
        "dots",
        "network",
        "terminal",
        "chess",
      ]
      const idx = modes.indexOf(s.bgMode)
      return { bgMode: modes[(idx + 1) % modes.length] }
    }),
  setBgStyle: (bgStyle) => set({ bgStyle }),

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

  // Content index
  contentIndex: null,
  setContentIndex: (contentIndex) => set({ contentIndex }),
}))

// Initialize attributes on load
if (typeof window !== "undefined") {
  document.documentElement.setAttribute("data-theme", getInitialTheme())
  document.documentElement.setAttribute("data-palette", getInitialPalette())
  document.documentElement.style.setProperty("--color-accent-base", getInitialAccent())
}
