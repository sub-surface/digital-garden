import type { Particle } from "@/features/ambience/sky"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { PanelCard, ContentIndex, NoteMetadata } from "@/types/content"
import { SITE_DEFAULTS, type SiteConfig } from "@/config/site-defaults"
import { isPhoneViewport } from "@/config/breakpoints"
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

/** All ambient modes are user-selectable; chess/hexo are page-scoped boards. */
export type BgMode =
  | "murmuration" | "graph" | "vectors" | "dots" | "terminal"
  | "chamber" | "isometric" | "orrery" | "lightning" | "attractor" | "cartography"
  | "prose" | "sediment" | "palimpsest" | "rivers" | "cutup" | "concordance" | "teletype"
  | "chess" | "hexo"

/** The user-facing cycle/picker order (page-scoped boards excluded). */
export const BG_MODES = [
  "murmuration", "graph", "vectors", "dots", "terminal",
  "chamber", "isometric", "orrery", "lightning", "attractor", "cartography",
  "prose", "sediment", "palimpsest", "rivers", "cutup", "concordance", "teletype",
] as const

/**
 * Persisted modes that were renamed or retired (2026-11-09), so a saved
 * setting lands somewhere sensible instead of falling back to the default.
 */
const BG_MODE_RENAMES: Record<string, BgMode> = {
  lorenz: "attractor",
  dendrite: "lightning",
  schematic: "isometric",
  "plate-scan": "cartography",
}

/**
 * Single source of truth for ambient-mode display names (ROADMAP §28.11).
 * ThemePanel's picker and a bar tooltip used to carry
 * separate label lists that drifted (e.g. "Plate Scan" vs "Plate-scan") —
 * this spelling wins. `desc` is only used by ThemePanel.
 */
export const BG_META: Record<string, { label: string; desc: string }> = {
  murmuration: { label: "Murmuration", desc: "A flock that flees your cursor" },
  graph: { label: "Graph", desc: "The knowledge graph, drifting" },
  vectors: { label: "Vectors", desc: "A flow field of little arrows" },
  dots: { label: "Dots", desc: "A monochrome constellation lattice" },
  terminal: { label: "Terminal", desc: "Glyph rain and boot pops" },
  chamber: { label: "Chamber", desc: "Bubble-chamber particle tracks" },
  isometric: { label: "Isometric", desc: "Wireframe solids, cursor parallax" },
  orrery: { label: "Orrery", desc: "The solar system as it stands today" },
  lightning: { label: "Lightning", desc: "Strikes that fork across the sky" },
  attractor: { label: "Attractor", desc: "Strange attractors, each becoming the next" },
  cartography: { label: "Cartography", desc: "Contour lines around drifting hills" },
  prose: { label: "Prose", desc: "The page's own words, scattering and settling" },
  sediment: { label: "Sediment", desc: "Words settling into strata, oldest deepest" },
  palimpsest: { label: "Palimpsest", desc: "Passages scraped back and written over" },
  rivers: { label: "Rivers", desc: "Water running down the gaps in justified type" },
  cutup: { label: "Cut-up", desc: "Sentences from the garden, cut and respliced" },
  concordance: { label: "Concordance", desc: "Every word in the garden as a star" },
  teletype: { label: "Teletype", desc: "The margins, typed out far back" },
}

export type DockTab = "prompt" | "chat" | "music"

export interface WeatherNow {
  code: number
  temperature: number | null
  isDay: boolean
  lat: number
  lon: number
  fetchedAt: number
}
export interface DockRequest {
  /** Increments per request, so the same request twice still fires. */
  id: number
  input?: string
  run?: string
}
const PROMPT_HISTORY_MAX = 100
// Request ids keep rising even after the mailbox is emptied.
let dockRequestSeq = 0

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
  /** Keep the animated background at full strength while reading. */
  readerShowBg: boolean
  setReaderShowBg: (show: boolean) => void
  // Sky (src/features/ambience): seasonal flurries (on), light that follows
  // the sun (off), live weather from the connection's rough location (off).
  seasonal: boolean
  skyLight: boolean
  liveWeather: boolean
  setSky: (patch: Partial<Pick<GardenStore, "seasonal" | "skyLight" | "liveWeather">>) => void
  /** Session: the latest live weather, for Settings and the `sky` command. */
  weatherNow: WeatherNow | null
  setWeatherNow: (w: WeatherNow | null) => void
  /** A flurry someone asked for (the `season` command, Settings' "show me"). */
  flurryRequest: { id: number; kind?: Particle } | null
  requestFlurry: (kind?: Particle) => void
  /** Glorp may drop by now and then (GlorpPeek). */
  glorpVisits: boolean
  setGlorpVisits: (on: boolean) => void
  /** Ask glorp over right now (the `glorp` command). */
  glorpCall: number
  callGlorp: () => void
  /** Settings sections the reader has folded away. */
  settingsCollapsed: string[]
  toggleSettingsSection: (id: string) => void

  // The dock: one right-hand panel holding the prompt and (wiki/garden) chat.
  // It replaced five overlays: search, command palette, cheat sheet, the
  // Ctrl+P terminal window and the wiki's SideChat.
  dock: DockTab | null
  /** Something to do in the prompt when it next opens: type `input`, or run `run`. */
  dockRequest: DockRequest | null
  openDock: (tab: DockTab, request?: Omit<DockRequest, "id">) => void
  closeDock: () => void
  toggleDock: (tab: DockTab) => void
  dockWidth: number
  setDockWidth: (width: number) => void
  /** Prompt history, newest last (persisted, capped). */
  promptHistory: string[]
  pushPromptHistory: (line: string) => void

  // Graph Overlay
  isGraphOpen: boolean
  setGraphOpen: (open: boolean) => void

  // Music
  isMusicOpen: boolean
  toggleMusic: () => void
  isMusicExpanded: boolean
  /** On desktop, opening the player opens the dock's turntable tab (and closing one closes the other). */
  setIsMusicExpanded: (expanded: boolean) => void
  /** The player is in its own Picture-in-Picture window (set by MusicPlayer). */
  isMusicPopped: boolean
  setIsMusicPopped: (popped: boolean) => void
  isPlaylistExpanded: boolean
  setIsPlaylistExpanded: (expanded: boolean) => void

  // Background
  bgMode: BgMode
  lastBgMode: BgMode
  bgStyle: "vectors" | "glyphs" | "off"
  /** Global intensity multiplier applied to EVERY background mode (0–1),
   * folded into the reader-dim pipeline so all modes honour it for free. */
  bgOpacity: number
  setBgMode: (mode: GardenStore["bgMode"]) => void
  cycleBgMode: () => void
  setBgStyle: (style: GardenStore["bgStyle"]) => void
  setBgOpacity: (v: number) => void

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

/** Keys persisted to localStorage under "garden-settings". Everything else is
 * session state (overlays, panel stack, content index) and must NOT persist. */
const PERSISTED_KEYS = [
  "theme", "accentBase", "readerMeasureCh", "readerScale", "dockWidth", "promptHistory",
  "chessBot", "chatDensity", "chatFontScale", "bgOpacity",
  "bgMode", "bgStyle", "readerShowBg", "settingsCollapsed",
  "seasonal", "skyLight", "liveWeather", "glorpVisits",
] as const

/** Reader typography steps (ThemePanel steppers, QuickControls, `[ ] - =` keys). */
export const READER_MEASURE_STEPS = [50, 60, 70, 80, 90, 100, 110, 120] as const
export const READER_SCALE_STEPS = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.2, 1.35, 1.5, 1.7] as const

/**
 * The next step from `current` in direction `dir`, clamped at the ends. Works
 * for values that aren't on the list (persisted from older step sets): it moves
 * to the nearest step that is strictly bigger / smaller, never backwards.
 */
export function stepReader(steps: readonly number[], current: number, dir: 1 | -1): number {
  const eps = 1e-9
  if (dir > 0) return steps.find((v) => v > current + eps) ?? steps[steps.length - 1]
  for (let k = steps.length - 1; k >= 0; k--) if (steps[k] < current - eps) return steps[k]
  return steps[0]
}

/**
 * On desktop the turntable lives in the dock, as its "music" tab, instead of
 * floating over the page. Phones keep the floating player above the PhoneBar.
 */
function dockedPlayer(): boolean {
  return typeof window !== "undefined" && !isPhoneViewport()
}

/** Opening or leaving the dock's music tab opens or closes the player (unless it's popped out). */
function playerFollowsDock(s: { isMusicExpanded: boolean; isMusicPopped: boolean }, next: DockTab | null) {
  if (!dockedPlayer() || s.isMusicPopped) return {}
  return { isMusicExpanded: next === "music" }
}

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
      readerShowBg: false,
      setReaderShowBg: (readerShowBg) => set({ readerShowBg }),
      seasonal: true,
      skyLight: false,
      liveWeather: false,
      setSky: (patch) => set(patch),
      weatherNow: null,
      setWeatherNow: (weatherNow) => set({ weatherNow }),
      flurryRequest: null,
      requestFlurry: (kind) => set((s) => ({ flurryRequest: { id: (s.flurryRequest?.id ?? 0) + 1, kind } })),
      glorpVisits: true,
      setGlorpVisits: (glorpVisits) => set({ glorpVisits }),
      glorpCall: 0,
      callGlorp: () => set((s) => ({ glorpCall: s.glorpCall + 1 })),
      settingsCollapsed: [],
      toggleSettingsSection: (id) =>
        set((s) => ({
          settingsCollapsed: s.settingsCollapsed.includes(id)
            ? s.settingsCollapsed.filter((x) => x !== id)
            : [...s.settingsCollapsed, id],
        })),
      cycleReaderMeasure: (dir) =>
        set((s) => ({ readerMeasureCh: stepReader(READER_MEASURE_STEPS, s.readerMeasureCh, dir) })),
      cycleReaderScale: (dir) =>
        set((s) => ({ readerScale: stepReader(READER_SCALE_STEPS, s.readerScale, dir) })),

      dock: null,
      dockRequest: null,
      openDock: (tab, request) =>
        set((s) => ({
          dock: tab,
          dockRequest: request ? { ...request, id: ++dockRequestSeq } : s.dockRequest,
          ...playerFollowsDock(s, tab),
        })),
      closeDock: () => set((s) => ({ dock: null, ...playerFollowsDock(s, null) })),
      toggleDock: (tab) =>
        set((s) => {
          const next = s.dock === tab ? null : tab
          return { dock: next, ...playerFollowsDock(s, next) }
        }),
      dockWidth: legacy("sidechat-width", (v) => Math.max(300, parseInt(v, 10) || 380), 380),
      setDockWidth: (dockWidth) => set({ dockWidth }),
      promptHistory: [],
      pushPromptHistory: (line) =>
        set((s) => {
          const prev = s.promptHistory
          if (prev[prev.length - 1] === line) return {}
          return { promptHistory: [...prev, line].slice(-PROMPT_HISTORY_MAX) }
        }),

      // Graph Overlay
      isGraphOpen: false,
      setGraphOpen: (isGraphOpen) => set({ isGraphOpen }),

      // Music
      isMusicOpen: false,
      toggleMusic: () => set((s) => ({ isMusicOpen: !s.isMusicOpen })),
      isMusicExpanded: false,
      setIsMusicExpanded: (isMusicExpanded) =>
        set((s) => {
          if (!dockedPlayer() || s.isMusicPopped) return { isMusicExpanded }
          if (isMusicExpanded) return { isMusicExpanded, dock: "music" }
          return { isMusicExpanded, dock: s.dock === "music" ? null : s.dock }
        }),
      isMusicPopped: false,
      setIsMusicPopped: (isMusicPopped) => set({ isMusicPopped }),
      isPlaylistExpanded: false,
      setIsPlaylistExpanded: (isPlaylistExpanded) => set({ isPlaylistExpanded }),

      // Background
      bgMode: "murmuration",
      lastBgMode: "murmuration",
      bgStyle: "vectors",
      bgOpacity: legacy("bgOpacity", (v) => Math.min(1, Math.max(0, parseFloat(v))) || 1, 1),
      setBgMode: (bgMode) =>
        set((s) => ({
          bgMode,
          lastBgMode: bgMode === "chess" || bgMode === "hexo" ? s.lastBgMode : bgMode,
        })),
      cycleBgMode: () =>
        set((s) => {
          const idx = BG_MODES.indexOf(s.bgMode as typeof BG_MODES[number])
          const next = BG_MODES[(idx + 1) % BG_MODES.length]
          return { bgMode: next, lastBgMode: next }
        }),
      setBgStyle: (bgStyle) => set({ bgStyle }),
      setBgOpacity: (bgOpacity) => set({ bgOpacity: Math.min(1, Math.max(0, bgOpacity)) }),

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
      partialize: (s) => {
        const out = Object.fromEntries(PERSISTED_KEYS.map((k) => [k, s[k]])) as Pick<GardenStore, typeof PERSISTED_KEYS[number]>
        // Remember the background you chose, never one a page switched to
        // (the chess/hexo boards, or SIGIL's chamber).
        out.bgMode = (BG_MODES as readonly string[]).includes(s.lastBgMode) ? s.lastBgMode : "murmuration"
        return out
      },
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<GardenStore>) }
        merged.bgMode = BG_MODE_RENAMES[merged.bgMode] ?? merged.bgMode
        if (!(BG_MODES as readonly string[]).includes(merged.bgMode)) merged.bgMode = "murmuration"
        merged.lastBgMode = merged.bgMode
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
