export const MEDIA_SKINS = {
  classic: {
    label: "Classic",
    background: "#080a08",
    surface: "#1d1f22",
    accent: "#9bd06b",
    bright: "#d8ffac",
    dim: "#4d8439",
    hot: "#ffc85a",
  },
  amber: {
    label: "Amber CRT",
    background: "#100b04",
    surface: "#2a2117",
    accent: "#e6a84f",
    bright: "#ffd58a",
    dim: "#8f5c24",
    hot: "#fff0b0",
  },
  ice: {
    label: "Icebox",
    background: "#050b10",
    surface: "#17232c",
    accent: "#68c5df",
    bright: "#c5f5ff",
    dim: "#39778c",
    hot: "#f1b4ff",
  },
  plum: {
    label: "Night Plum",
    background: "#0c0711",
    surface: "#25182b",
    accent: "#c184d5",
    bright: "#f0c2ff",
    dim: "#734887",
    hot: "#ffb45f",
  },
} as const

export type MediaSkin = keyof typeof MEDIA_SKINS
export type MediaPalette = Omit<(typeof MEDIA_SKINS)[MediaSkin], "label">

export const MEDIA_VIZ_MODES = [
  { id: "spectrum", label: "SPEC", webgl: false },
  { id: "scope", label: "SCOPE", webgl: false },
  { id: "waterfall", label: "FALL", webgl: false },
  { id: "radial", label: "RAD", webgl: false },
  { id: "feedback", label: "MELT", webgl: true },
  { id: "tunnel", label: "WARP", webgl: true },
] as const

export type MediaVizMode = (typeof MEDIA_VIZ_MODES)[number]["id"]
export type MediaPane = "equalizer" | "visualizer" | "playlist"
export type MediaView = "library" | "queue" | "mixes"

export function isMediaSkin(value: unknown): value is MediaSkin {
  return typeof value === "string" && value in MEDIA_SKINS
}

export function isMediaVizMode(value: unknown): value is MediaVizMode {
  return MEDIA_VIZ_MODES.some((mode) => mode.id === value)
}

export function isWebGLVizMode(mode: MediaVizMode): mode is "feedback" | "tunnel" {
  return mode === "feedback" || mode === "tunnel"
}
