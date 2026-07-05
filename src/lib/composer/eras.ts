/**
 * Era presets — the emulation pass. The clean SVG is device-independent; an era
 * says how it gets quantized + dithered to a vintage output device. Pens are
 * semantic, eras are devices: the same plate shot through any era is a one-click
 * re-emulation (a big, cheap source of "not samey"). Adding an era = one entry.
 *
 * `vector: true` eras skip the raster pass entirely (the SVG *is* the output —
 * plotter/giclée). Everything else rasterizes → downsamples → quantizes →
 * dithers → upscales nearest-neighbour. Artifacts default OFF (no glow — house
 * rule); paper tint is baked into the greyscale palettes rather than composited.
 */

import type { DitherMethod, RGB } from "./render/dither"
import { hexToRgb } from "./render/dither"

export interface Era {
  id: string
  name: string
  vector?: boolean // no raster pass — show/export the SVG directly
  palette: string[] // device colours (hex); length encodes bit-depth
  resolution: number // long-edge px BEFORE nearest-neighbour upscale
  dither: DitherMethod
  pixelAspect?: number // e.g. CGA non-square pixels (x-stretch factor)
  paperTint?: string // reserved; baked into palettes for M2
  artifacts?: {
    scanline?: number // subtle row darkening 0..1 (default off)
    ntscBleed?: number
    posterizeChannels?: boolean
  }
}

// Known hardware palettes.
const EGA16 = [
  "#000000", "#0000aa", "#00aa00", "#00aaaa", "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa",
  "#555555", "#5555ff", "#55ff55", "#55ffff", "#ff5555", "#ff55ff", "#ffff55", "#ffffff",
]
const C64_16 = [
  "#000000", "#ffffff", "#880000", "#aaffee", "#cc44cc", "#00cc55", "#0000aa", "#eeee77",
  "#dd8855", "#664400", "#ff7777", "#333333", "#777777", "#aaff66", "#0088ff", "#bbbbbb",
]

export const ERAS: Era[] = [
  {
    id: "plotter-ink",
    name: "Plotter ink",
    vector: true,
    palette: ["#1a1a1a"],
    resolution: 2048,
    dither: "none",
  },
  {
    id: "mac-1bit",
    name: "Mac 1-bit",
    palette: ["#000000", "#ffffff"],
    resolution: 512,
    dither: "atkinson",
  },
  {
    id: "phosphor",
    name: "Phosphor",
    palette: ["#04140c", "#39ff9e"],
    resolution: 480,
    dither: "bayer4",
  },
  {
    id: "newsprint",
    name: "Newsprint",
    palette: ["#141210", "#4a4640", "#8a857c", "#c8c2b4", "#efe9db"],
    resolution: 560,
    dither: "bluenoise",
  },
  {
    id: "gameboy-dmg",
    name: "Game Boy DMG",
    palette: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
    resolution: 320,
    dither: "bayer4",
  },
  {
    id: "cga",
    name: "CGA",
    palette: ["#000000", "#55ffff", "#ff55ff", "#ffffff"],
    resolution: 320,
    dither: "bayer4",
    pixelAspect: 1.2,
  },
  {
    id: "ega",
    name: "EGA",
    palette: EGA16,
    resolution: 640,
    dither: "bayer4",
  },
  {
    id: "c64",
    name: "C64",
    palette: C64_16,
    resolution: 360,
    dither: "bayer4",
  },
  {
    id: "hi-res",
    name: "Hi-res",
    vector: true,
    palette: [],
    resolution: 2048,
    dither: "none",
  },
]

const BY_ID: Record<string, Era> = Object.fromEntries(ERAS.map((e) => [e.id, e]))

export const DEFAULT_ERA_ID = "mac-1bit"

export function getEra(id: string): Era {
  return BY_ID[id] ?? BY_ID[DEFAULT_ERA_ID]
}

export function eraPaletteRGB(era: Era): RGB[] {
  return era.palette.map(hexToRgb)
}
