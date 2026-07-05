/**
 * Pen registers → colour. A palette binds each of the five semantic roles to a
 * vector hex. Because pens are semantic, re-roll-palette is instant and total:
 * the geometry never changes, only the role→colour map.
 *
 * M1 ships the named palettes only. Accent-derived palettes (pulling from the
 * site's ROYGBIV accent vars) and the era-device remap land in M2.
 */

import type { Palette, PenRole, Pen } from "./types"

type RoleColors = Record<PenRole, string>

function palette(id: string, name: string, colors: RoleColors, names: Record<PenRole, string>): Palette {
  const pens: Pen[] = (Object.keys(colors) as PenRole[]).map((role) => ({
    role,
    color: colors[role],
    name: names[role],
  }))
  return { id, name, pens, source: "named" }
}

/** Substrate (paper/ground) colour a palette wants under its ink. */
export const PALETTE_GROUND: Record<string, string> = {
  manuscript: "#efe6d0",
  phosphor: "#07110a",
  blueprint: "#0d2340",
}

export const PALETTES: Palette[] = [
  palette(
    "manuscript",
    "Manuscript",
    {
      structure: "#2a1d12", // oxblood-brown ink
      annotation: "#6b4a2f", // faded sepia
      highlight: "#9c1f1f", // rubric red
      shadow: "#8a7a5c", // muted umber
      apparatus: "#b58a3c", // gold leaf
    },
    {
      structure: "iron gall",
      annotation: "sepia",
      highlight: "rubric",
      shadow: "umber",
      apparatus: "gold",
    },
  ),
  palette(
    "phosphor",
    "Phosphor",
    {
      structure: "#39ff9e",
      annotation: "#1f9c62",
      highlight: "#c6ffe4",
      shadow: "#0f5a38",
      apparatus: "#2ad080",
    },
    {
      structure: "P1 green",
      annotation: "dim",
      highlight: "bloom",
      shadow: "afterglow",
      apparatus: "grid",
    },
  ),
  palette(
    "blueprint",
    "Blueprint",
    {
      structure: "#e8f2ff",
      annotation: "#8fb8e8",
      highlight: "#ffffff",
      shadow: "#3d5f8a",
      apparatus: "#c0d8f5",
    },
    {
      structure: "chalk",
      annotation: "wash",
      highlight: "white",
      shadow: "shade",
      apparatus: "reg",
    },
  ),
]

export const DEFAULT_PALETTE_ID = "manuscript"

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

export function penColor(palette: Palette, role: PenRole): string {
  return palette.pens.find((p) => p.role === role)?.color ?? "#000000"
}

/** Read a CSS custom property off :root, with a fallback (browser only). */
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/**
 * A palette bound to the site's live ROYGBIV accent system (as SIGIL does), so a
 * plate can match the current theme. Roles map to the accent / secondary / text
 * / muted / border vars. Built at render time in the browser; falls back to the
 * OLED-dark tokens headlessly.
 */
export function accentPalette(): Palette {
  return {
    id: "accent",
    name: "Site accent",
    source: "accent",
    pens: [
      { role: "structure", color: cssVar("--color-text", "#e0e0e0"), name: "text" },
      { role: "annotation", color: cssVar("--color-text-muted", "#8e8e93"), name: "muted" },
      { role: "highlight", color: cssVar("--color-accent-base", "#b4424c"), name: "accent" },
      { role: "shadow", color: cssVar("--color-border", "#2a2a30"), name: "border" },
      { role: "apparatus", color: cssVar("--color-secondary", "#6a6a72"), name: "secondary" },
    ],
  }
}

export function groundColor(palette: Palette): string {
  if (palette.source === "accent") return cssVar("--color-bg", "#0a0a0a")
  return PALETTE_GROUND[palette.id] ?? "#0a0a0a"
}
