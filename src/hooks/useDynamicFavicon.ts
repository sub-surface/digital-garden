import { useEffect } from "react"
import { useStore } from "@/store"

/**
 * Draws the favicon at runtime so it tracks the live theme + accent.
 *
 * The mark is a "sub-surface" glyph: a still source point below a faint
 * waterline, sending a single ripple ring rising and spreading upward. The ring
 * grows and fades on a ~3s loop, so the tab icon breathes gently. It tracks
 * `theme` (tile + ink) and `accentBase` (ripple colour) live — pick a new
 * ROYGBIV accent and the icon follows.
 *
 * Honours `prefers-reduced-motion`: when reduced, it paints one static frame
 * instead of animating.
 */

const SIZE = 64
const LOOP_MS = 3000

interface FaviconColors {
  bg: string
  ink: string
  accent: string
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  { bg, ink, accent }: FaviconColors,
  /** 0..1 progress through the ripple loop. */
  phase: number,
): void {
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

  const cx = S / 2
  const waterline = S * 0.42
  const source = { x: cx, y: S * 0.8 }

  // A single ripple ring spreading upward from the source. Two phase-offset
  // rings keep the loop continuous: as one fades out at full radius, the next
  // is emerging from the source.
  ctx.lineCap = "round"
  const MIN_R = 4
  const MAX_R = 30
  for (const offset of [0, 0.5]) {
    const p = (phase + offset) % 1
    const rad = MIN_R + p * (MAX_R - MIN_R)
    // fade in quickly, then ebb away as the ring grows
    const alpha = Math.sin(Math.min(1, p * 1.15) * Math.PI) * 0.9
    if (alpha <= 0.02) continue
    ctx.beginPath()
    ctx.arc(source.x, source.y, rad, Math.PI * 1.12, Math.PI * 1.88)
    ctx.strokeStyle = accent
    ctx.globalAlpha = alpha
    ctx.lineWidth = Math.max(1.2, 3.4 * (1 - p * 0.7))
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
  ctx.globalAlpha = 0.22
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(8, waterline)
  ctx.lineTo(S - 8, waterline)
  ctx.stroke()
  ctx.globalAlpha = 1
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

    // swap (or create) the favicon link once; we only rewrite its href per frame
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement("link")
      link.rel = "icon"
      document.head.appendChild(link)
    }
    link.type = "image/png"
    const iconLink = link

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    if (reduceMotion) {
      paintFrame(ctx, colors, 0.32)
      iconLink.href = cv.toDataURL("image/png")
      return
    }

    // Drive the icon from a plain interval, NOT requestAnimationFrame. A favicon
    // needs ~8fps, and an rAF loop would wake ~60–200×/s just to no-op against a
    // throttle — pure overhead. The real cost per draw is the synchronous
    // `toDataURL` PNG encode + tab repaint, so we also pause entirely while the
    // tab is hidden (no point encoding a favicon nobody can see).
    const FRAME_MS = 125 // ~8fps
    const start = performance.now()
    let timer: ReturnType<typeof setInterval> | undefined

    const draw = (): void => {
      const phase = ((performance.now() - start) % LOOP_MS) / LOOP_MS
      paintFrame(ctx, colors, phase)
      iconLink.href = cv.toDataURL("image/png")
    }

    const startLoop = (): void => {
      if (timer) return
      draw()
      timer = setInterval(draw, FRAME_MS)
    }
    const stopLoop = (): void => {
      if (timer) { clearInterval(timer); timer = undefined }
    }
    const onVisibility = (): void => {
      if (document.hidden) stopLoop()
      else startLoop()
    }

    document.addEventListener("visibilitychange", onVisibility)
    if (!document.hidden) startLoop()

    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      stopLoop()
    }
  }, [theme, accentBase])
}
