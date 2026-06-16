import { useEffect } from "react"
import { useStore } from "@/store"

/**
 * Draws the favicon once at runtime so it tracks the live theme + accent, then
 * stops. No animation loop — the mark is a single minimal oscillating wave (a
 * sine line in the accent colour over a still surface), repainted only when the
 * theme or accent actually changes. A favicon doesn't need motion, and the old
 * animated version's per-frame `toDataURL` PNG encode was a measurable
 * main-thread cost; this is effectively free.
 *
 * Tracks `theme` (tile + ink) and `accentBase` (the wave) live — pick a new
 * ROYGBIV accent and the icon follows.
 */

const SIZE = 64

interface FaviconColors {
  bg: string
  ink: string
  accent: string
}

function paintWave(ctx: CanvasRenderingContext2D, { bg, ink, accent }: FaviconColors): void {
  const S = SIZE
  ctx.clearRect(0, 0, S, S)

  // rounded-square tile
  const r = 14
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(S, 0, S, S, r)
  ctx.arcTo(S, S, 0, S, r)
  ctx.arcTo(0, S, 0, 0, r)
  ctx.arcTo(0, 0, S, 0, r)
  ctx.closePath()
  ctx.fill()

  const mid = S / 2

  // a faint baseline in ink so the wave reads as an oscillation about a surface
  ctx.strokeStyle = ink
  ctx.globalAlpha = 0.18
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(10, mid)
  ctx.lineTo(S - 10, mid)
  ctx.stroke()
  ctx.globalAlpha = 1

  // the wave: one full sine period across the tile, in the accent colour. Taper
  // the amplitude toward the ends so it reads as a contained signal, not a band.
  const AMP = 14
  const x0 = 9
  const x1 = S - 9
  const span = x1 - x0
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.beginPath()
  for (let i = 0; i <= span; i++) {
    const x = x0 + i
    const u = i / span // 0..1
    // taper: 0 at the ends, 1 in the middle
    const taper = Math.sin(u * Math.PI)
    const y = mid - Math.sin(u * Math.PI * 2) * AMP * taper
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

export function useDynamicFavicon() {
  const theme = useStore((s) => s.theme)
  const accentBase = useStore((s) => s.accentBase)

  useEffect(() => {
    if (typeof document === "undefined") return

    // Resolve the *applied* accent (store value may be a base the palette tweaks).
    const css = getComputedStyle(document.documentElement)
    const accent = css.getPropertyValue("--color-accent-base").trim() || accentBase
    const isDark = theme === "dark"
    const colors: FaviconColors = {
      bg: isDark ? "#0a0a0a" : "#FAFAF8",
      ink: isDark ? "#e0e0e0" : "#111",
      accent,
    }

    const cv = document.createElement("canvas")
    cv.width = cv.height = SIZE
    const ctx = cv.getContext("2d")
    if (!ctx) return

    // swap (or create) the favicon link once
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement("link")
      link.rel = "icon"
      document.head.appendChild(link)
    }
    link.type = "image/png"

    paintWave(ctx, colors)
    link.href = cv.toDataURL("image/png")
  }, [theme, accentBase])
}
