import { useEffect, useRef } from "react"
import { useStore } from "@/store"
import { isPhoneViewport } from "@/config/breakpoints"
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
  drawSchematic,
  drawIsometric,
  drawOrrery,
  drawPlateScan,
  drawChess,
  drawHexo,
  drawDendrite,
  drawLorenz,
  drawCartography,
} from "@/lib/backgrounds"

/**
 * Pages that draw their own full-bleed sky and must not have a second ambient
 * canvas showing through them.
 */
const BG_SUPPRESSED = new Set(["filament"])

/** Maximum refresh rate cap: preserves 144Hz fluidity while preventing runaway frame loops on 240Hz+ */
const MAX_FPS = 144
const MIN_FRAME_INTERVAL = 1000 / MAX_FPS // ~6.94ms

export function BgCanvas() {
  const activeSlug = useStore((s) => s.activeGraphSlug)
  // Skip entirely on mobile — canvas is CSS-hidden at the phone breakpoint.
  if (isPhoneViewport()) return null
  if (BG_SUPPRESSED.has(activeSlug.toLowerCase())) return null
  return <BgCanvasInner />
}

function BgCanvasInner() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgMode = useStore((s) => s.bgMode)
  const bgStyle = useStore((s) => s.bgStyle)
  const bgOpacity = useStore((s) => s.bgOpacity)
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
    colorCache: { secondary: "", palette: [] },
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
    anchors: [],
    cubes: [],
    dendrites: [],
    lorenz: null,
    cartoSeed: 0,
    plate: null,
    plateKey: "",
    lastFrame: 0,
    w: 0,
    h: 0,
  })

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

  useEffect(() => {
    stateRef.current.readerTarget = (isReaderMode ? 0.04 : 1) * bgOpacity
  }, [isReaderMode, bgOpacity])

  useEffect(() => {
    stateRef.current.colorValid = false
  }, [theme, accentBase])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      stateRef.current.w = w
      stateRef.current.h = h

      // Carmack/Torvalds optimization: clamp DPR to max 1.25 on high-DPI (Retina/4K)
      // screens to eliminate 50–75% fillrate load without visible loss of sharpness.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stateRef.current.colorValid = false

      // Reseed viewport-dependent state
      stateRef.current.boids = []
      stateRef.current.emitters = []
      stateRef.current.anchors = []
      stateRef.current.cubes = []
      stateRef.current.dendrites = []
      stateRef.current.cartoSeed = 0
      stateRef.current.plateKey = ""
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
      stateRef.current.colorValid = true
    }

    const mouseMove = (e: MouseEvent) => {
      stateRef.current.mx = e.clientX
      stateRef.current.my = e.clientY
    }

    window.addEventListener("resize", resize)
    window.addEventListener("mousemove", mouseMove)
    resize()

    // Fetch graph nodes only when graph background mode is active
    if (bgMode === "graph") {
      fetch("/graph.json")
        .then((res) => res.json())
        .then((data: GraphJsonData) => {
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
          stateRef.current.nodes = nodes
          stateRef.current.links = data.links || []

          const map = new Map<string, GraphNode>()
          nodes.forEach((n) => map.set(n.id, n))
          stateRef.current.nodeMap = map
        })
        .catch((e) => console.warn("BgCanvas: graph data prefetch failed:", e))
    }

    // Draw a single frame of current mode
    const draw = () => {
      const state = stateRef.current
      if (bgStyle === "off") {
        ctx.clearRect(0, 0, state.w, state.h)
        return
      }
      if (!state.colorValid) refreshColors()
      ctx.clearRect(0, 0, state.w, state.h)

      if (bgMode === "vectors" || bgMode === "dots") {
        drawField(ctx, state, bgMode, config)
      } else if (bgMode === "terminal") {
        drawTerminalPops(ctx, state, config)
      } else if (bgMode === "chess") {
        drawChess(ctx, state)
      } else if (bgMode === "hexo") {
        drawHexo(ctx, state)
      } else if (bgMode === "graph") {
        drawGraph(ctx, state, config)
      } else if (bgMode === "murmuration") {
        drawMurmuration(ctx, state, config)
      } else if (bgMode === "chamber") {
        drawChamber(ctx, state, config)
      } else if (bgMode === "schematic") {
        drawSchematic(ctx, state, config)
      } else if (bgMode === "isometric") {
        drawIsometric(ctx, state, config)
      } else if (bgMode === "orrery") {
        drawOrrery(ctx, state, config)
      } else if (bgMode === "plate-scan") {
        drawPlateScan(ctx, state, config)
      } else if (bgMode === "dendrite") {
        drawDendrite(ctx, state, config)
      } else if (bgMode === "lorenz") {
        drawLorenz(ctx, state, config)
      } else if (bgMode === "cartography") {
        drawCartography(ctx, state, config)
      }
    }

    // Honour prefers-reduced-motion: paint one static frame, run no loop
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion) {
      stateRef.current.readerAlpha = stateRef.current.readerTarget
      draw()
      return () => {
        window.removeEventListener("resize", resize)
        window.removeEventListener("mousemove", mouseMove)
      }
    }

    let animationId = 0
    let lastPaintTime = 0

    const frame = (timestamp: number) => {
      animationId = requestAnimationFrame(frame)

      // Throttle to max 144 FPS: -1ms delta buffer prevents frame drops from timestamp jitter on 144Hz displays
      if (timestamp - lastPaintTime < MIN_FRAME_INTERVAL - 1.0) {
        return
      }
      lastPaintTime = timestamp

      const state = stateRef.current
      state.readerAlpha += (state.readerTarget - state.readerAlpha) * 0.08
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
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", mouseMove)
      document.removeEventListener("visibilitychange", onVisibility)
      stop()
    }
  }, [bgMode, bgStyle, theme, accentBase, config])

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
