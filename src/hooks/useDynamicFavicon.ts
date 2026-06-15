import { useEffect } from "react"
import { useStore } from "@/store"

/**
 * Draws the favicon at runtime so it tracks the live theme + accent.
 *
 * The mark is a "sub-surface" glyph: concentric ripples rising from a single
 * point below a waterline, drawn in the current accent colour over a tile that
 * matches the active theme (dark tile in dark mode, paper tile in light). It
 * redraws whenever `theme` or `accentBase` change — pick a new ROYGBIV accent
 * and the tab icon follows.
 */
export function useDynamicFavicon() {
  const theme = useStore((s) => s.theme)
  const accentBase = useStore((s) => s.accentBase)

  useEffect(() => {
    if (typeof document === "undefined") return

    // Resolve the *applied* accent (store value may be a base the palette tweaks).
    const css = getComputedStyle(document.documentElement)
    const accent = css.getPropertyValue("--color-accent-base").trim() || accentBase
    const isDark = theme === "dark"
    const bg = isDark ? "#0a0a0a" : "#FAFAF8"
    const ink = isDark ? "#e0e0e0" : "#111"

    const S = 64
    const cv = document.createElement("canvas")
    cv.width = cv.height = S
    const ctx = cv.getContext("2d")
    if (!ctx) return

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

    const cx = S / 2
    const waterline = S * 0.4
    const source = { x: cx, y: S * 0.78 }

    // concentric ripples in the accent, brightest near the source, fading out
    ctx.lineCap = "round"
    for (let i = 0; i < 4; i++) {
      const rad = 6 + i * 8.5
      ctx.beginPath()
      // an arc that reads as a ripple spreading upward from the source
      ctx.arc(source.x, source.y, rad, Math.PI * 1.15, Math.PI * 1.85)
      ctx.strokeStyle = accent
      ctx.globalAlpha = 0.9 - i * 0.18
      ctx.lineWidth = 4 - i * 0.6
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // the source point itself (the still origin) in ink
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.arc(source.x, source.y, 3, 0, Math.PI * 2)
    ctx.fill()

    // a faint waterline in ink so the ripples read as sub-surface
    ctx.strokeStyle = ink
    ctx.globalAlpha = 0.25
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(8, waterline)
    ctx.lineTo(S - 8, waterline)
    ctx.stroke()
    ctx.globalAlpha = 1

    const url = cv.toDataURL("image/png")

    // swap (or create) the favicon link
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement("link")
      link.rel = "icon"
      document.head.appendChild(link)
    }
    link.type = "image/png"
    link.href = url
  }, [theme, accentBase])
}
