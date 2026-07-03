import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { PanelCard, ContentIndex, NoteMetadata } from "@/types/content"
import { SITE_DEFAULTS, type SiteConfig } from "@/config/site-defaults"
import type { BotFlavour } from "@/lib/chessBot"

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

function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme)
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
  // Reader typography (persisted): measure (line length) + font scale, as steps.
  readerMeasureCh: number   // body measure in ch (e.g. 70 | 80 | 90)
  readerScale: number       // font-size multiplier (e.g. 0.95 | 1 | 1.1 | 1.2)
  cycleReaderMeasure: (dir: 1 | -1) => void
  cycleReaderScale: (dir: 1 | -1) => void

  // Keyboard cheat sheet (? overlay)
  isCheatSheetOpen: boolean
  toggleCheatSheet: () => void
  setCheatSheet: (open: boolean) => void

  // Command palette (Ctrl/Cmd+P)
  isCommandPaletteOpen: boolean
  toggleCommandPalette: () => void
  setCommandPalette: (open: boolean) => void

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
  bgMode: "graph" | "vectors" | "dots" | "terminal" | "chess" | "hexo" | "murmuration" | "chamber"
  lastBgMode: "graph" | "vectors" | "dots" | "terminal" | "chess" | "hexo" | "murmuration" | "chamber"
  bgStyle: "vectors" | "glyphs" | "off"
  setBgMode: (mode: GardenStore["bgMode"]) => void
  toggleGraphBackground: () => void
  cycleBgMode: () => void
  setBgStyle: (style: GardenStore["bgStyle"]) => void

  // Chess
  chessBot: BotFlavour
  setChessBot: (flavour: BotFlavour) => void

  // Panel navigation
  panelStack: PanelCard[]
  pushCard: (card: Omit<PanelCard, "depth">, fromDepth: number) => void
  popCard: () => void
  removeCard: (index: number) => void
  clearStack: () => void

  // Graph state
  activeGraphSlug: string
  setActiveGraphSlug: (slug: string) => void

  activeLayout: "article" | "note" | "game"
  setActiveLayout: (layout: "article" | "note" | "game") => void

  // Content index (loaded at startup)
  contentIndex: ContentIndex | null
  setContentIndex: (index: ContentIndex) => void
  /** True when the content-index fetch failed — search/graph/random go dark silently otherwise. */
  contentIndexError: boolean
  setContentIndexError: (failed: boolean) => void

  // Image dimensions map (loaded at startup)
  imageDimensions: Record<string, { width: number; height: number }> | null
  setImageDimensions: (dimensions: Record<string, { width: number; height: number }>) => void

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

// ─── Legacy localStorage keys ────────────────────────────────────────────────
// Settings used to be scattered across individual keys. They now live in one
// persisted slice ("garden-settings"); the legacy readers below seed initial
// state so existing users keep their preferences on first run after upgrade.
const isBrowser = typeof window !== "undefined"

function legacy<T>(key: string, parse: (v: string) => T, fallback: T): T {
  if (!isBrowser) return fallback
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  try { return parse(raw) } catch { return fallback }
}

const getInitialTheme = (): "light" | "dark" =>
  legacy("theme", (v) => (v === "light" || v === "dark" ? v : "dark"), "dark")

const getInitialAccent = (): string => legacy("accentBase", String, "#427ab4")

// ?terminal=1 forces terminal chat for the session regardless of persisted pref
const terminalUrlOverride =
  isBrowser && new URLSearchParams(window.location.search).get("terminal") === "1"

/** Keys persisted to localStorage under "garden-settings". Everything else is
 * session state (overlays, panel stack, content index) and must NOT persist. */
const PERSISTED_KEYS = [
  "theme", "accentBase", "readerMeasureCh", "readerScale", "sideChatWidth",
  "chessBot", "chatDensity", "chatFontScale", "chatTerminal",
] as const

export const useStore = create<GardenStore>()(
  persist(
    (set) => ({
      // Config
      config: SITE_DEFAULTS,
      updateConfig: (updater) => set((s) => {
        const next = { ...s.config }
        updater(next)
        return { config: next }
      }),

      // Theme — default matches the site's OLED-dark identity (tokens.scss)
      theme: getInitialTheme(),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      toggleTheme: () =>
        set((s) => {
          const next = s.theme === "dark" ? "light" : "dark"
          applyTheme(next)
          return { theme: next }
        }),

      // Accent
      accentBase: getInitialAccent(),
      setAccentBase: (accentBase) => {
        applyTriadicPalette(accentBase)
        set({ accentBase })
      },
      cycleAccent: () =>
        set((s) => {
          const idx = ROYGBIV_ACCENTS.indexOf(s.accentBase)
          const next = ROYGBIV_ACCENTS[(idx + 1) % ROYGBIV_ACCENTS.length]
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

      // Reader typography — clamped steps
      readerMeasureCh: legacy("reader-measure", (v) => parseInt(v, 10) || 80, 80),
      readerScale: legacy("reader-scale", (v) => parseFloat(v) || 1, 1),
      cycleReaderMeasure: (dir) =>
        set((s) => {
          const steps = [70, 80, 90, 100]
          const i = steps.includes(s.readerMeasureCh) ? steps.indexOf(s.readerMeasureCh) : 1
          const next = steps[Math.min(steps.length - 1, Math.max(0, i + dir))]
          return { readerMeasureCh: next }
        }),
      cycleReaderScale: (dir) =>
        set((s) => {
          const steps = [0.95, 1, 1.1, 1.2, 1.35]
          // includes-guard (not Math.max(1, …)) so index 0 cycles correctly
          const i = steps.includes(s.readerScale) ? steps.indexOf(s.readerScale) : 1
          const next = steps[Math.min(steps.length - 1, Math.max(0, i + dir))]
          return { readerScale: next }
        }),

      // Search
      isCheatSheetOpen: false,
      toggleCheatSheet: () => set((s) => ({ isCheatSheetOpen: !s.isCheatSheetOpen })),
      setCheatSheet: (isCheatSheetOpen) => set({ isCheatSheetOpen }),

      isCommandPaletteOpen: false,
      toggleCommandPalette: () => set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
      setCommandPalette: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),

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
      sideChatWidth: legacy("sidechat-width", (v) => parseInt(v, 10) || 340, 340),
      setSideChatWidth: (sideChatWidth) => set({ sideChatWidth }),

      // Music
      isMusicOpen: false,
      toggleMusic: () => set((s) => ({ isMusicOpen: !s.isMusicOpen })),
      isMusicExpanded: false,
      setIsMusicExpanded: (isMusicExpanded) => set({ isMusicExpanded }),
      isPlaylistExpanded: false,
      setIsPlaylistExpanded: (isPlaylistExpanded) => set({ isPlaylistExpanded }),

      // Background
      bgMode: "murmuration",
      lastBgMode: "murmuration",
      bgStyle: "vectors",
      setBgMode: (bgMode) =>
        set((s) => ({
          bgMode,
          lastBgMode: bgMode === "chess" || bgMode === "hexo" ? s.lastBgMode : bgMode,
        })),
      toggleGraphBackground: () =>
        set((s) => ({
          bgMode: s.bgMode === "graph" ? s.lastBgMode : "graph",
        })),
      cycleBgMode: () =>
        set((s) => {
          const modes: GardenStore["bgMode"][] = [
            "murmuration",
            "graph",
            "vectors",
            "dots",
            "terminal",
            "chamber",
          ]
          const idx = modes.indexOf(s.bgMode)
          const next = modes[(idx + 1) % modes.length]
          return { bgMode: next, lastBgMode: next }
        }),
      setBgStyle: (bgStyle) => set({ bgStyle }),

      // Chess
      chessBot: legacy<BotFlavour>("chessBot", (v) => v as BotFlavour, "casual"),
      setChessBot: (chessBot) => set({ chessBot }),

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
      contentIndexError: false,
      setContentIndexError: (contentIndexError) => set({ contentIndexError }),

      // Image dimensions
      imageDimensions: null,
      setImageDimensions: (imageDimensions) => set({ imageDimensions }),

      // Chat display
      chatDensity: legacy("chatDensity", (v) =>
        (["compact", "comfortable", "spacious"].includes(v) ? v : "comfortable") as GardenStore["chatDensity"],
        "comfortable"),
      setChatDensity: (chatDensity) => set({ chatDensity }),
      chatFontScale: legacy("chatFontScale", (v) => Number(v) || 1, 1),
      setChatFontScale: (chatFontScale) => set({ chatFontScale }),
      chatTerminal: terminalUrlOverride || legacy("chatTerminal", (v) => v === "1", false),
      setChatTerminal: (chatTerminal) => set({ chatTerminal }),

      // Session overrides
      sessionOverrides: {},
      setOverride: (slug, data) =>
        set((s) => ({
          sessionOverrides: {
            ...s.sessionOverrides,
            [slug]: { ...s.sessionOverrides[slug], ...data }
          }
        })),
    }),
    {
      name: "garden-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) =>
        Object.fromEntries(PERSISTED_KEYS.map((k) => [k, s[k]])) as Pick<GardenStore, typeof PERSISTED_KEYS[number]>,
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<GardenStore>) }
        // URL override beats the persisted terminal preference for this session
        if (terminalUrlOverride) merged.chatTerminal = true
        return merged
      },
      onRehydrateStorage: () => (state) => {
        if (!state || typeof document === "undefined") return
        applyTheme(state.theme)
        applyTriadicPalette(state.accentBase)
      },
    },
  ),
)

// Initialize attributes on load. localStorage rehydration is synchronous, so
// getState() already reflects persisted (or legacy-seeded) values here.
if (isBrowser) {
  applyTheme(useStore.getState().theme)
  applyTriadicPalette(useStore.getState().accentBase)
  // Dev-only: expose the store on window for the /__dev dashboard and
  // headless verification scripts. Stripped from production builds.
  if (import.meta.env.DEV) {
    ;(window as unknown as { __store?: typeof useStore }).__store = useStore
  }
}
