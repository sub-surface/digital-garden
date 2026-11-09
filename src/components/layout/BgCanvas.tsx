import { useEffect, useRef } from "react"
import { useStore } from "@/store"
import { PHONE_BREAKPOINT } from "@/config/breakpoints"
import { loadGraphData } from "@/lib/content-loader"
import type {
  BgState,
  GraphNode,
  GraphJsonData,
} from "@/types/backgrounds"
import {
  drawMurmuration,
  drawGraph,
  drawField,
  drawTerminalPops,
  drawChamber,
  drawIsometric,
  drawOrrery,
  drawChess,
  drawHexo,
  drawLightning,
  drawAttractor,
  drawCartography,
  drawProse,
  drawSediment,
  drawPalimpsest,
  drawRivers,
  drawCutup,
  drawConcordance,
  drawTeletype,
} from "@/lib/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import type { BgMode } from "@/store"

type Draw = (ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) => void

/** One entry per mode: the whole dispatch. */
const DRAW: Record<BgMode, Draw> = {
  murmuration: drawMurmuration,
  graph: drawGraph,
  vectors: (ctx, state, config) => drawField(ctx, state, "vectors", config),
  dots: (ctx, state, config) => drawField(ctx, state, "dots", config),
  terminal: drawTerminalPops,
  chamber: drawChamber,
  isometric: drawIsometric,
  orrery: drawOrrery,
  lightning: drawLightning,
  attractor: drawAttractor,
  cartography: drawCartography,
  prose: drawProse,
  sediment: drawSediment,
  palimpsest: drawPalimpsest,
  rivers: drawRivers,
  cutup: drawCutup,
  concordance: drawConcordance,
  teletype: drawTeletype,
  chess: (ctx, state) => drawChess(ctx, state),
  hexo: (ctx, state) => drawHexo(ctx, state),
}

/**
 * Phones draw into a virtual viewport 1/PHONE_SCALE times the screen and the
 * canvas shrinks it: every mode keeps its desktop proportions (a flock is a
 * flock, not five big birds) with no per-mode code. Phones also run at
 * the slow 30 fps rate throughout, for the battery.
 */
const PHONE_SCALE = 0.62

/**
 * Frame cap. The modes advance a fixed step per frame and were tuned at
 * 60 Hz, so 60 is both the intended speed and the CPU ceiling; the old 144
 * cap made high-refresh monitors run them 2.4x faster at 2.4x the cost.
 */
const MAX_FPS = 60
const MIN_FRAME_INTERVAL = 1000 / MAX_FPS // ~16.7ms

/** Idle cap for slow, purely time-based ambient modes (and any mode while dimmed by reader mode). */
const SLOW_FRAME_INTERVAL = 1000 / 30
const DIMMED_FRAME_INTERVAL = 1000 / 8
/**
 * Modes whose motion is a pure function of wall-clock time (or static), so a
 * 30 FPS cap does not change their speed, only their temporal resolution.
 * Per-frame-stepped modes (murmuration, graph, chamber, terminal) and the
 * ones with flowing motion that reads better at 60 (lightning, attractor,
 * prose, sediment, rivers, cut-up) are absent.
 */
const SLOW_MODES = new Set<string>([
  "orrery",
  "isometric",
  "cartography",
  "vectors",
  "dots",
  "palimpsest",
  "concordance",
  "teletype",
  "chess",
  "hexo",
])
/** Modes that only change when the cursor moves, alpha eases, or the viewport/colours change. */
const STATIC_MODES = new Set<string>(["chess", "hexo"])
/** Full frame rate is restored for this long after the last cursor movement. */
const MOUSE_ACTIVE_MS = 500
/** No input for this long: the reader is reading. The garden settles to 30 fps. */
const IDLE_SETTLE_MS = 30_000
/** Below this, the canvas is visually empty: skip drawing entirely. */
const ALPHA_EPS = 0.0005

export function BgCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgMode = useStore((s) => s.bgMode)
  const bgStyle = useStore((s) => s.bgStyle)
  const bgOpacity = useStore((s) => s.bgOpacity)
  const readerShowBg = useStore((s) => s.readerShowBg)
  const isReaderMode = useStore((s) => s.isReaderMode)
  const theme = useStore((s) => s.theme)
  const accentBase = useStore((s) => s.accentBase)
  const config = useStore((s) => s.config)
  const activeSlug = useStore((s) => s.activeGraphSlug)

  const stateRef = useRef<BgState>({
    mx: -9999,
    my: -9999,
    readerAlpha: 1,
    readerTarget: 1,
    colorCache: { secondary: "", palette: [], text: "" },
    colorValid: false,
    nodes: [],
    links: [],
    nodeMap: new Map(),
    dotNodes: [],
    pops: [],
    boids: [],
    boidGrid: [],
    emitters: [],
    tracks: [],
    lastFrame: 0,
    w: 0,
    h: 0,
    scale: 1,
    epoch: 0,
    slug: "",
  })

  // Read config through a ref: ThemePanel sliders produce a new config object
  // per tick, and having it as an effect dependency tore down and rebuilt the
  // whole loop (graph mode also refetched and reshuffled its nodes).
  const configRef = useRef(config)
  // Repaints the still frame when the loop is off (reduced motion / bg off).
  const redrawStillRef = useRef<(() => void) | null>(null)

  // True when chamber was auto-selected by the sigil page
  const autoChamberRef = useRef(false)

  // Automatically switch to the matching board background on game pages
  useEffect(() => {
    const slug = activeSlug.toLowerCase()
    const currentMode = useStore.getState().bgMode
    const gameMode =
      slug === "chess"
        ? "chess"
        : slug === "hexo"
        ? "hexo"
        : slug === "sigil" || slug === "collider"
        ? "chamber"
        : null
    if (gameMode) {
      if (currentMode !== gameMode) {
        if (gameMode === "chamber") {
          autoChamberRef.current = true
          useStore.setState({ bgMode: "chamber" })
        } else {
          useStore.getState().setBgMode(gameMode)
        }
      }
    } else {
      // Revert if we were in a game-board mode because of the slug
      if (
        currentMode === "chess" ||
        currentMode === "hexo" ||
        (currentMode === "chamber" && autoChamberRef.current)
      ) {
        autoChamberRef.current = false
        const lastMode = useStore.getState().lastBgMode
        useStore.getState().setBgMode(lastMode)
      }
    }
  }, [activeSlug])

  // The typographic modes draw from the note being read.
  useEffect(() => {
    stateRef.current.slug = activeSlug
  }, [activeSlug])

  useEffect(() => {
    stateRef.current.readerTarget = (isReaderMode && !readerShowBg ? 0.04 : 1) * bgOpacity
  }, [isReaderMode, readerShowBg, bgOpacity])

  useEffect(() => {
    stateRef.current.colorValid = false
    redrawStillRef.current?.()
  }, [theme, accentBase])

  useEffect(() => {
    configRef.current = config
    redrawStillRef.current?.()
  }, [config])

  // Graph nodes for the graph background, via the shared cached loader (this
  // used to be a second, uncached fetch of /graph.json on every effect run).
  useEffect(() => {
    if (bgMode !== "graph") return
    let cancelled = false
    loadGraphData()
      .then((data) => {
        if (cancelled) return
        layoutGraph(stateRef.current, data as GraphJsonData)
      })
      .catch((e) => console.warn("BgCanvas: graph data prefetch failed:", e))
    return () => { cancelled = true }
  }, [bgMode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    let lastW = -1
    let lastH = -1
    let lastDpr = -1
    let phone = false

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      phone = w <= PHONE_BREAKPOINT
      // Clamp DPR to 1.25 on high-DPI desktop screens (50-75% less fill, no
      // visible loss). Phones get 1.5: their lines are drawn at 0.62x, and at
      // 1.25 hairlines would smear.
      const dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 1.25)
      // Mobile URL-bar show/hide and similar fire resize with an unchanged size;
      // resetting canvas.width would clear the canvas and reseed every mode.
      if (w === lastW && h === lastH && dpr === lastDpr) return
      lastW = w
      lastH = h
      lastDpr = dpr
      const scale = phone ? PHONE_SCALE : 1
      stateRef.current.scale = scale
      stateRef.current.w = w / scale
      stateRef.current.h = h / scale

      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0)
      stateRef.current.colorValid = false

      // Reseed viewport-dependent state (modules that keep their own scratch
      // state watch `epoch`)
      stateRef.current.boids = []
      stateRef.current.emitters = []
      stateRef.current.epoch++
    }

    const refreshColors = () => {
      const style = getComputedStyle(document.documentElement)
      const css = (p: string) => style.getPropertyValue(p).trim()
      const primary = css("--color-primary") || "#b4424c"
      stateRef.current.colorCache.secondary = primary
      stateRef.current.colorCache.palette = [
        primary,
        css("--color-secondary") || "#424cb4",
        css("--color-tertiary") || "#42b464",
        css("--color-text-muted") || "#8e8e93",
        css("--color-border") || "#2a2a30",
      ]
      stateRef.current.colorCache.text = css("--color-text") || "#e0e0e0"
      stateRef.current.colorValid = true
    }

    let lastMouseMove = -Infinity
    let lastInput = performance.now()
    const mouseMove = (e: MouseEvent) => {
      // Into drawing coordinates (the phone surface is scaled)
      stateRef.current.mx = e.clientX / stateRef.current.scale
      stateRef.current.my = e.clientY / stateRef.current.scale
      lastMouseMove = e.timeStamp
      lastInput = e.timeStamp
    }
    const anyInput = (e: Event) => { lastInput = e.timeStamp }

    // Coalesce resize bursts (window drags fire per pixel) into one resize per frame:
    // each resize reallocates the canvas and reseeds/rebuilds mode state (e.g. plate-scan dither).
    let resizeRaf = 0
    let redrawStill: (() => void) | null = null
    const onResize = () => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        resize()
        redrawStill?.()
      })
    }

    window.addEventListener("resize", onResize)
    window.addEventListener("mousemove", mouseMove, { passive: true })
    window.addEventListener("keydown", anyInput, { passive: true })
    window.addEventListener("scroll", anyInput, { passive: true, capture: true })
    window.addEventListener("pointerdown", anyInput, { passive: true })
    resize()

    // Draw a single frame of current mode
    const draw = () => {
      const state = stateRef.current
      if (bgStyle === "off") {
        ctx.clearRect(0, 0, state.w, state.h)
        return
      }
      if (!state.colorValid) refreshColors()
      ctx.clearRect(0, 0, state.w, state.h)

      DRAW[bgMode]?.(ctx, state, configRef.current)
    }

    // Honour prefers-reduced-motion: paint one static frame, run no loop
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    // bgStyle "off" also runs no loop (previously a 144 FPS clearRect loop).
    if (reduceMotion || bgStyle === "off") {
      stateRef.current.readerAlpha = stateRef.current.readerTarget
      draw()
      // The loop is off, so a resize (which clears the canvas) must repaint the still.
      redrawStill = draw
      redrawStillRef.current = draw
      return () => {
        redrawStillRef.current = null
        if (resizeRaf) cancelAnimationFrame(resizeRaf)
        window.removeEventListener("resize", onResize)
        window.removeEventListener("mousemove", mouseMove)
        window.removeEventListener("keydown", anyInput)
        window.removeEventListener("scroll", anyInput, { capture: true })
        window.removeEventListener("pointerdown", anyInput)
      }
    }

    let animationId = 0
    let lastPaintTime = 0
    let blank = false
    // Inputs of the last static-mode draw, to skip identical repaints
    let sMx = NaN, sMy = NaN, sAlpha = NaN, sW = 0, sH = 0, sDrawn = false
    const isStaticMode = STATIC_MODES.has(bgMode)
    const isSlowMode = SLOW_MODES.has(bgMode)

    const frame = (timestamp: number) => {
      animationId = requestAnimationFrame(frame)

      const state = stateRef.current
      const dt = timestamp - lastPaintTime

      // Frame pacing: max 60 FPS (-1ms buffer absorbs timestamp jitter).
      // Drops to 8 FPS while reader mode dims the canvas to ~nothing, to 30 for slow
      // wall-clock-driven modes while the cursor is idle.
      const dimmed = state.readerTarget < 0.1 && state.readerAlpha < 0.1
      const idle = timestamp - lastInput > IDLE_SETTLE_MS
      const slow = dimmed || idle || (isSlowMode && timestamp - lastMouseMove > MOUSE_ACTIVE_MS)
      // Under reader mode the canvas is at ~4% (and CSS opacity 0.12): nobody
      // can see motion there, so 8 fps is plenty.
      // Phones never run faster than 30 fps (battery)
      const interval = dimmed ? DIMMED_FRAME_INTERVAL : slow || phone ? SLOW_FRAME_INTERVAL : MIN_FRAME_INTERVAL
      if (dt < interval - 1.0) {
        return
      }
      lastPaintTime = timestamp

      // Time-based easing (equals the old 0.08/frame at 60 Hz) so pacing changes don't alter fade time
      const k = 1 - Math.pow(0.92, Math.min(dt, 100) / 16.667)
      state.readerAlpha += (state.readerTarget - state.readerAlpha) * k
      if (Math.abs(state.readerTarget - state.readerAlpha) < ALPHA_EPS) {
        state.readerAlpha = state.readerTarget
      }

      // Fully transparent (bgOpacity 0): clear once, then draw nothing until it fades back in
      if (state.readerAlpha <= 0) {
        if (!blank) {
          ctx.clearRect(0, 0, state.w, state.h)
          blank = true
          sDrawn = false
        }
        return
      }
      blank = false

      // Static boards only change with cursor / fade / resize / theme colours
      if (isStaticMode) {
        if (
          sDrawn &&
          state.colorValid &&
          state.mx === sMx &&
          state.my === sMy &&
          state.readerAlpha === sAlpha &&
          state.w === sW &&
          state.h === sH
        ) {
          return
        }
        sMx = state.mx; sMy = state.my; sAlpha = state.readerAlpha
        sW = state.w; sH = state.h; sDrawn = true
      }
      draw()
    }

    // Pause the loop entirely when the tab is hidden
    const start = () => {
      if (!animationId) animationId = requestAnimationFrame(frame)
    }
    const stop = () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
        animationId = 0
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener("visibilitychange", onVisibility)

    if (!document.hidden) start()

    return () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("mousemove", mouseMove)
      window.removeEventListener("keydown", anyInput)
      window.removeEventListener("scroll", anyInput, { capture: true })
      window.removeEventListener("pointerdown", anyInput)
      document.removeEventListener("visibilitychange", onVisibility)
      stop()
    }
  }, [bgMode, bgStyle])

  return (
    <canvas
      ref={canvasRef}
      data-testid="bg-canvas"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        background: "transparent",
        display: "block",
      }}
    />
  )
}

function layoutGraph(state: BgState, data: GraphJsonData) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  if (data.nodes) {
    for (const n of data.nodes) {
      if (n.x !== undefined && n.y !== undefined) {
        if (n.x < minX) minX = n.x
        if (n.x > maxX) maxX = n.x
        if (n.y < minY) minY = n.y
        if (n.y > maxY) maxY = n.y
      }
    }
  }
  const hasCoords = isFinite(minX) && maxX > minX && maxY > minY
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  const pad = 60
  const availW = Math.max(100, window.innerWidth - pad * 2)
  const availH = Math.max(100, window.innerHeight - pad * 2)

  const nodes: GraphNode[] = data.nodes
    ? data.nodes.map((n) => {
        const posX = hasCoords && n.x !== undefined
          ? pad + ((n.x - minX) / spanX) * availW
          : Math.random() * window.innerWidth
        const posY = hasCoords && n.y !== undefined
          ? pad + ((n.y - minY) / spanY) * availH
          : Math.random() * window.innerHeight

        return {
          ...n,
          x: posX,
          y: posY,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
        }
      })
    : []
  state.nodes = nodes
  state.links = data.links || []

  const map = new Map<string, GraphNode>()
  nodes.forEach((n) => map.set(n.id, n))
  state.nodeMap = map
}
