import { useEffect, useRef, useMemo } from "react"
import { useStore } from "@/store"
import { isPhoneViewport } from "@/config/breakpoints"

// ---- Simplex 2D noise (compact) ----
const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
const PM = new Uint8Array(512)
const GR = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]
{
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) PM[i] = p[i & 255]
}

function simplex(x: number, y: number): number {
  const s = (x + y) * F2
  const i = Math.floor(x + s), j = Math.floor(y + s)
  const t = (i + j) * G2
  const x0 = x - (i - t), y0 = y - (j - t)
  const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2
  const ii = i & 255, jj = j & 255
  let n0 = 0, n1 = 0, n2 = 0
  let t0 = 0.5 - x0 * x0 - y0 * y0
  if (t0 > 0) { t0 *= t0; const g = GR[PM[ii + PM[jj]] % 8]; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0) }
  let t1 = 0.5 - x1 * x1 - y1 * y1
  if (t1 > 0) { t1 *= t1; const g = GR[PM[ii + i1 + PM[jj + j1]] % 8]; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1) }
  let t2 = 0.5 - x2 * x2 - y2 * y2
  if (t2 > 0) { t2 *= t2; const g = GR[PM[ii + 1 + PM[jj + 1]] % 8]; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2) }
  return 70 * (n0 + n1 + n2)
}

const MATRIX_SNIPPETS = [
  "SUB-SURFACE CORE v2.0.0", "loading thought-graph...", "mapping territories...", "indexing 120 notes", "calibrating noise field...", "system ready.",
  "0000: 53 55 42 2D 53 55 52 46", "0008: 41 43 45 00 54 45 52 52", "0010: 49 54 4F 52 49 45 53 00",
  "thinking...", "processing...", "re-caffeinating core", "spectral activity high",
  "function simplex(x, y) { return (x + y) * F2 }", "const GR = [[1, 1], [-1, 1]]",
  "Is the machine dreaming?", "Ghost in the shell", "Pattern recognition", "Signal to noise",
  "The medium is the message", "We shape our tools", "Simulacra and Simulation",
  "Hyperreality", "Cybernetics", "Feedback loops", "Neural networks", "Entropy",
  "░", "▒", "▓", "█", "─", "│", "┌", "┐", "└", "┘", "├", "┤", "┬", "┴", "┼", "═", "║", "╔", "╗", "╚", "╝", "╠", "╣", "╦", "╩", "╬",
  "0", "1", "0", "1", "null", "undefined", "NaN", "[object Object]",
]

const TERMINAL_ANIMATIONS = [
  { frames: ["|", "/", "-", "\\"] },
  { frames: [" ", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"] },
  { frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] },
  { frames: ["( ● )", "(  ●)", "(   ●)", "(    )", "(●   )", "( ●  )"] },
  { frames: ["◢", "◣", "◤", "◥"] },
  { frames: ["[    ]", "[=   ]", "[==  ]", "[=== ]", "[====]", "[ ===]", "[  ==]", "[   =]", "[    ]"] },
  { frames: ["* . .", ". * .", ". . *", ". * ."] },
  { frames: ["<o>", "(o)", " o ", "   "] },
  // additional variance
  { frames: ["▖", "▗", "▘", "▝", "▞", "▟", "▙", "▛"] },
  { frames: ["╔═╗", "║ ║", "╚═╝", "   "] },
  { frames: ["·", "•", "●", "◉", "●", "•", "·", " "] },
  { frames: ["∙∙∙", "●∙∙", "∙●∙", "∙∙●", "∙∙∙"] },
  { frames: ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"] },
  { frames: ["⟨ ⟩", "⟨·⟩", "⟨●⟩", "⟨·⟩", "⟨ ⟩"] },
  { frames: ["≡", "≢", "≣", "≡", " "] },
  { frames: ["○", "◌", "◍", "◎", "●", "◎", "◍", "◌"] },
  { frames: ["┌─┐", "│ │", "└─┘"] },
  { frames: ["···", "━━━", "───", "···"] },
  { frames: ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"] },
  { frames: ["∅", "∈", "∉", "∋", "∞", "∝", "∂", "∆"] },
  { frames: ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ"] },
  { frames: ["⌛", "⌚", "⊕", "⊗", "⊙", "⊚"] },
  { frames: ["◇", "◆", "◈", "◇"] },
  { frames: ["✦", "✧", "⋆", "·", "⋆", "✧", "✦"] },
  { frames: ["{  }", "{ ·}", "{··}", "{···}", "{··}", "{ ·}", "{  }"] },
  { frames: ["0", "1", "0", "0", "1", "1", "0", "1"] },
]

const GLYPH_POOL = '░▒▓█─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬■□●○◘▄▀▌▐«»¶§±≡≈∞ΩαβπΣφψχρλμνξ♠♣♥♦☺☻♪♫►◄▲▼◇◆◈✦✧⋆∂∆∅∈∝⟨⟩⊕⊗⊙↑↗→↘↓↙←↖⁰¹²³⁴⁵⁶⁷⁸⁹αβγδεζηθ'

export function BgCanvas() {
  // Skip entirely on mobile — canvas is CSS-hidden at the phone breakpoint, no
  // point running it (isPhoneViewport is SSR-safe: false when there's no window).
  if (isPhoneViewport()) return null
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

  const stateRef = useRef({
    mx: -9999,
    my: -9999,
    readerAlpha: 1,
    readerTarget: 1,
    colorCache: { secondary: "", palette: [] as string[] },
    colorValid: false,
    nodes: [] as any[],
    links: [] as any[],
    nodeMap: new Map<string, any>(),
    ripples: [] as { x: number; y: number; t: number }[],
    drops: [] as { x: number; y: number; text: string; speed: number; opacity: number; color: string }[],
    pops: [] as any[],
    boids: [] as { x: number; y: number; vx: number; vy: number }[],
    boidGrid: [] as number[][],
    emitters: [] as any[],
    tracks: [] as any[],
    anchors: [] as any[],       // schematic
    cubes: [] as any[],         // isometric
    plate: null as HTMLCanvasElement | null,  // plate-scan offscreen still
    plateKey: "",
    lastFrame: 0,
    w: 0,
    h: 0
  })

  // True when chamber was auto-selected by the sigil page (vs picked by the
  // user) — only then does leaving the page revert it. chess/hexo are never
  // user-selectable so they don't need the flag.
  const autoChamberRef = useRef(false)

  // Automatically switch to the matching board background on game pages
  useEffect(() => {
    const slug = activeSlug.toLowerCase()
    const gameMode =
      slug === "chess" ? "chess" :
      slug === "hexo" ? "hexo" :
      slug === "sigil" || slug === "collider" ? "chamber" : null
    if (gameMode) {
      if (bgMode !== gameMode) {
        if (gameMode === "chamber") {
          // Page-scoped switch: bypass setBgMode so lastBgMode (the user's
          // actual choice) is preserved for the revert.
          autoChamberRef.current = true
          useStore.setState({ bgMode: "chamber" })
        } else {
          useStore.getState().setBgMode(gameMode)
        }
      }
    } else {
      // Revert if we were in a game-board mode because of the slug
      if (bgMode === "chess" || bgMode === "hexo" || (bgMode === "chamber" && autoChamberRef.current)) {
        autoChamberRef.current = false
        const lastMode = useStore.getState().lastBgMode
        useStore.getState().setBgMode(lastMode)
      }
    }
  }, [activeSlug])

  // readerAlpha is the universal per-mode alpha multiplier (every draw multiplies
  // by it). Folding the global bgOpacity in here means all modes — current and
  // future — honour the global intensity control for free, and it animates
  // smoothly via the existing lerp toward readerTarget.
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
      const dpr = window.devicePixelRatio || 1
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stateRef.current.colorValid = false
      // reseed viewport-dependent mode state
      stateRef.current.boids = []
      stateRef.current.emitters = []
      stateRef.current.anchors = []
      stateRef.current.cubes = []
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
        .then(res => res.json())
        .then(data => {
          const nodes = data.nodes ? data.nodes.map((n: any) => ({
            ...n,
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            vx: (Math.random() - 0.5) * 0.2,
            vy: (Math.random() - 0.5) * 0.2
          })) : []
          stateRef.current.nodes = nodes
          stateRef.current.links = data.links || []

          const map = new Map()
          nodes.forEach((n: any) => map.set(n.id, n))
          stateRef.current.nodeMap = map
        })
        .catch((e) => console.warn("BgCanvas: graph data prefetch failed:", e))
    }

    // Draw a single frame of whatever the current mode is. Shared by the
    // animation loop and the static (reduced-motion) one-shot paint.
    const draw = () => {
      const state = stateRef.current
      if (bgStyle === "off") { ctx.clearRect(0, 0, state.w, state.h); return }
      if (!state.colorValid) refreshColors()
      ctx.clearRect(0, 0, state.w, state.h)
      if (bgMode === "vectors" || bgMode === "dots") {
        drawField(ctx, state, bgMode, bgStyle, config)
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
      }
    }

    // Honour prefers-reduced-motion: paint one static frame, run no loop.
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
    const frame = () => {
      const state = stateRef.current
      state.readerAlpha += (state.readerTarget - state.readerAlpha) * 0.08
      draw()
      animationId = requestAnimationFrame(frame)
    }

    // Pause the loop entirely when the tab is hidden — no point burning frames
    // in a backgrounded tab. Resume on return.
    const start = () => { if (!animationId) animationId = requestAnimationFrame(frame) }
    const stop = () => { if (animationId) { cancelAnimationFrame(animationId); animationId = 0 } }
    const onVisibility = () => { if (document.hidden) stop(); else start() }
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

function drawField(
  ctx: CanvasRenderingContext2D,
  state: any,
  mode: string,
  style: string,
  config: any
) {
  // Select correct config based on mode
  const p = mode === "vectors" ? config.backgrounds.vectors :
            mode === "dots" ? config.backgrounds.dots :
            config.backgrounds.terminal

  if (!p) return

  const { step, speed, scale: sc } = p
  const now = performance.now() / 1000
  const t = now * speed
  const sy0 = (window.scrollY || 0) % step
  const pad = step * 2

  if (mode === "terminal") {
    ctx.font = `${step * 0.7}px 'IBM Plex Mono', monospace`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
  }

  // Dots render as a living constellation: each node drifts off its grid point on
  // a noise current, and nearby nodes are linked — an aperiodic lattice that
  // echoes the graph view and the quasicrystal aesthetic. Positions are collected
  // here, links drawn in a pass afterwards.
  const dotNodes: Array<{ x: number; y: number; r: number; ci: number; alpha: number }> = []

  for (let x = step / 2 - pad; x < state.w + pad; x += step) {
    for (let vy = step / 2 - sy0 - pad; vy < state.h + pad; vy += step) {
      const docY = vy + (window.scrollY || 0)
      const nx = x * sc, ny = docY * sc

      let a = 0
      a += simplex(nx, ny + t) * 0.55
      a += simplex(nx * 2.2, ny * 2.2 + t * 2.5) * 0.3
      a += simplex(nx * 5, ny * 5 + t * 6) * 0.15
      a *= Math.PI * (p.range || 1.2)

      const dx = x - state.mx, dy = vy - state.my, d = Math.hypot(dx, dy)
      const radius = p.radius || 110
      if (d < radius && d > 0) {
        const f = 1 - d / radius
        const v = Math.atan2(dy, dx) + Math.PI / 2
        a += (v - a) * f * f * (p.vortex || 0.9)
      }

      const intensity = simplex(nx + 100, ny + 100 + t * 1.2) * 0.5 + 0.5
      const baseAlpha = mode === "terminal" ? p.opacity : (0.05 + intensity * 0.15)
      const finalAlpha = baseAlpha * state.readerAlpha
      if (finalAlpha < 0.01) continue

      ctx.globalAlpha = finalAlpha

      if (mode === "vectors") {
        const rx = p.rx, ry = p.ry
        const minRx = rx * 0.3
        const curRx = minRx + intensity * (rx - minRx)
        ctx.fillStyle = state.colorCache.secondary
        ctx.beginPath()
        ctx.ellipse(x, vy, curRx, ry, a, 0, Math.PI * 2)
        ctx.fill()
        
        const tipX = x + curRx * Math.cos(a), tipY = vy + curRx * Math.sin(a)
        const ha = 3 + intensity * 2, hw = Math.PI / 5
        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX - ha * Math.cos(a - hw), tipY - ha * Math.sin(a - hw))
        ctx.lineTo(tipX - ha * Math.cos(a + hw), tipY - ha * Math.sin(a + hw))
        ctx.closePath()
        ctx.fill()
      } else if (mode === "terminal") {
        const ci = PM[(Math.floor(x * 7) + PM[Math.floor(docY * 3) & 255]) & 255] % state.colorCache.palette.length
        const posHash = PM[(Math.floor(x * 13) + PM[Math.floor(docY * 7) & 255]) & 255]
        const tOff = Math.floor(now * 0.15 + posHash * 0.02)
        const ch = GLYPH_POOL[PM[(posHash + tOff) & 255] % GLYPH_POOL.length]
        ctx.fillStyle = state.colorCache.palette[ci]
        ctx.fillText(ch, x, vy)
      } else if (mode === "dots") {
        const ci = PM[(Math.floor(x * 7) + PM[Math.floor(docY * 3) & 255]) & 255] % state.colorCache.palette.length
        const dotR = p.minSize + intensity * (p.maxSize - p.minSize)
        // Drift each node off its grid cell along the same field angle `a`, by up
        // to ~40% of a step — enough to break the rigid lattice into something
        // organic without nodes overlapping.
        const drift = step * 0.4 * (simplex(nx * 1.5, ny * 1.5 - t) * 0.5 + 0.5)
        const dxp = x + Math.cos(a) * drift
        const dyp = vy + Math.sin(a) * drift
        dotNodes.push({ x: dxp, y: dyp, r: dotR, ci, alpha: finalAlpha })
        ctx.fillStyle = state.colorCache.palette[ci]
        ctx.beginPath()
        ctx.arc(dxp, dyp, dotR, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // Constellation links: connect each dot to neighbours within ~1.6 steps. Only
  // scan the local window (next few columns/rows) so this stays O(n·k), not O(n²).
  if (mode === "dots" && dotNodes.length > 1) {
    const maxD = step * 1.6
    const maxD2 = maxD * maxD
    ctx.lineWidth = 1
    for (let i = 0; i < dotNodes.length; i++) {
      const a0 = dotNodes[i]
      // grid order means near-neighbours are within a small index window
      for (let j = i + 1; j < Math.min(i + 24, dotNodes.length); j++) {
        const b0 = dotNodes[j]
        const ddx = a0.x - b0.x, ddy = a0.y - b0.y
        const d2 = ddx * ddx + ddy * ddy
        if (d2 > maxD2) continue
        const closeness = 1 - Math.sqrt(d2) / maxD
        ctx.globalAlpha = closeness * 0.35 * Math.min(a0.alpha, b0.alpha)
        ctx.strokeStyle = state.colorCache.palette[a0.ci]
        ctx.beginPath()
        ctx.moveTo(a0.x, a0.y)
        ctx.lineTo(b0.x, b0.y)
        ctx.stroke()
      }
    }
  }
}

function drawTerminalPops(
  ctx: CanvasRenderingContext2D,
  state: any,
  config: any
) {
  const p = config.backgrounds.terminal
  const { speed, opacity } = p
  const now = performance.now() / 1000

  // Spawn new pops
  if (Math.random() < 0.05) {
    const anim = TERMINAL_ANIMATIONS[Math.floor(Math.random() * TERMINAL_ANIMATIONS.length)]
    state.pops.push({
      x: Math.random() * state.w,
      y: Math.random() * state.h,
      anim,
      frame: 0,
      life: 1.0,
      opacity: opacity * (0.5 + Math.random() * 0.5),
      color: state.colorCache.palette[Math.floor(Math.random() * state.colorCache.palette.length)]
    })
  }

  // Update and Draw
  ctx.font = `14px 'IBM Plex Mono', monospace`
  ctx.textAlign = "center"
  
  state.pops = state.pops.filter((pop: any) => {
    pop.life -= 0.005 * (speed / 0.08)
    pop.frame = Math.floor((1 - pop.life) * 20) % pop.anim.frames.length
    
    if (pop.life <= 0) return false

    // Fade in and out
    const alpha = pop.life > 0.8 ? (1 - pop.life) * 5 : pop.life * 1.25
    ctx.globalAlpha = Math.min(pop.opacity, alpha) * state.readerAlpha
    ctx.fillStyle = pop.color
    ctx.fillText(pop.anim.frames[pop.frame], pop.x, pop.y)
    
    return true
  })
}

function drawChess(ctx: CanvasRenderingContext2D, state: any) {
  const cell = Math.max(state.w, state.h) / 8
  const cols = Math.ceil(state.w / cell) + 1
  const rows = Math.ceil(state.h / cell) + 1

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell, y = r * cell
      const d = Math.hypot(x + cell / 2 - state.mx, y + cell / 2 - state.my)
      const prox = d < 200 ? (1 - d / 200) * 0.04 : 0
      ctx.globalAlpha = (((r + c) % 2 ? 0.035 : 0.015) + prox) * state.readerAlpha
      ctx.fillStyle = state.colorCache.secondary
      ctx.fillRect(x, y, cell, cell)
    }
  }
}

function drawHexo(ctx: CanvasRenderingContext2D, state: any) {
  // Faint pointy-top hexagonal grid, mirroring drawChess's proximity glow.
  const size = Math.max(state.w, state.h) / 22 // hex radius
  const hw = Math.sqrt(3) * size                // horizontal spacing
  const vh = 1.5 * size                         // vertical spacing
  const cols = Math.ceil(state.w / hw) + 2
  const rows = Math.ceil(state.h / vh) + 2

  ctx.strokeStyle = state.colorCache.secondary
  ctx.lineWidth = 1

  // Two passes: all base-alpha hexes batched into ONE path/stroke (one draw
  // call instead of cols×rows), then only cursor-proximate hexes re-stroked
  // individually with their glow alpha.
  const hexPath = (cx: number, cy: number) => {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30)
      const x = cx + size * Math.cos(a)
      const y = cy + size * Math.sin(a)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  const glow: { cx: number; cy: number; prox: number }[] = []
  ctx.globalAlpha = 0.025 * state.readerAlpha
  ctx.beginPath()
  for (let r = -1; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      const cx = c * hw + (r % 2 ? hw / 2 : 0)
      const cy = r * vh
      hexPath(cx, cy)
      const d = Math.hypot(cx - state.mx, cy - state.my)
      if (d < 220) glow.push({ cx, cy, prox: (1 - d / 220) * 0.06 })
    }
  }
  ctx.stroke()

  for (const g of glow) {
    ctx.globalAlpha = g.prox * state.readerAlpha
    ctx.beginPath()
    hexPath(g.cx, g.cy)
    ctx.stroke()
  }
}

function drawGraph(ctx: CanvasRenderingContext2D, state: any, config: any) {
  const p = config.backgrounds.graph
  const color = state.colorCache.secondary
  const nodes = state.nodes
  const links = state.links || []
  const nodeMap = state.nodeMap

  // Drift
  nodes.forEach((n: any) => {
    n.x += n.vx * p.drift
    n.y += n.vy * p.drift
    if (n.x < 0 || n.x > state.w) n.vx *= -1
    if (n.y < 0 || n.y > state.h) n.vy *= -1
  })

  // Draw Links
  ctx.globalAlpha = p.linkOpacity * state.readerAlpha
  ctx.strokeStyle = color
  ctx.lineWidth = p.linkWidth
  ctx.beginPath()
  links.forEach((l: any) => {
    const s = nodeMap.get(l.source)
    const t = nodeMap.get(l.target)
    if (s && t) {
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
    }
  })
  ctx.stroke()

  // Draw Nodes
  nodes.forEach((n: any) => {
    const dx = n.x - state.mx, dy = n.y - state.my, d = Math.hypot(dx, dy)
    const isHovered = d < 100
    ctx.globalAlpha = (isHovered ? p.nodeHoverOpacity : p.nodeOpacity) * state.readerAlpha
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(n.x, n.y, isHovered ? p.nodeHoverSize : p.nodeSize, 0, Math.PI * 2)
    ctx.fill()
  })
}

// ── Bubble-chamber background ──
// Drifting emitters fire particle "tracks" that curve through the simplex flow
// field (plus a constant curl for spiral arcs), leaving stippled trails that
// linger then fade — the particle-track / annotation-stream motif of plotter-era
// scientific plates. Tracks are integrated once at spawn (only alpha ages), so
// redraw is a flat loop of fillRects; the pool is capped. Mostly monochrome with
// a small fraction of accent "signal" tracks.
const CHAMBER_GLYPHS = "⊕⊗⊙∮∇∂≡·°"

function spawnTrack(state: any, p: any, now: number) {
  const e = state.emitters[(Math.random() * state.emitters.length) | 0]
  const charge = Math.random() < 0.5 ? 1 : -1
  let x = e.x, y = e.y
  let ang = Math.random() * Math.PI * 2
  const pts: { x: number; y: number }[] = [{ x, y }]
  for (let i = 0; i < p.steps; i++) {
    const fa = simplex(x * p.fieldScale, y * p.fieldScale + now * p.drift) * Math.PI * 2
    ang += Math.sin(fa - ang) * 0.35 + charge * p.curl   // steer toward field + curl
    x += Math.cos(ang) * p.stepLen
    y += Math.sin(ang) * p.stepLen
    pts.push({ x, y })
  }
  // mostly monochrome (palette[0]); occasional accent "signal" track
  const spot = p.spot ?? 0.15
  const ci = Math.random() < spot ? 1 + ((Math.random() * 3) | 0) : 0
  const head = pts[pts.length - 1]
  state.tracks.push({
    pts,
    life: 1 + Math.random() * 0.6,
    ci,
    glyph: Math.random() < p.glyphChance ? CHAMBER_GLYPHS[(Math.random() * CHAMBER_GLYPHS.length) | 0] : null,
    gx: head.x + 4,
    gy: head.y,
  })
}

function drawChamber(ctx: CanvasRenderingContext2D, state: any, config: any) {
  const p = config.backgrounds.chamber
  if (!p) return
  const W = state.w, H = state.h
  const now = performance.now() / 1000

  // lazy-init emitters + pre-warm a full-ish set of tracks so the very first
  // frame (and the reduced-motion one-shot) already looks composed.
  if (!state.emitters || state.emitters.length !== p.emitters) {
    state.emitters = Array.from({ length: p.emitters }, () => ({ x: W / 2, y: H / 2 }))
    state.tracks = []
    // position emitters before pre-warm so tracks don't all radiate from centre
    for (let i = 0; i < state.emitters.length; i++) {
      const e = state.emitters[i]
      e.x = W * (0.5 + 0.34 * Math.sin(now * 0.05 + i * 2.1))
      e.y = H * (0.5 + 0.30 * Math.cos(now * 0.041 + i * 1.7))
    }
    for (let i = 0; i < p.maxTracks * 0.6; i++) spawnTrack(state, p, now - Math.random() * 4)
  }

  // emitters wander on slow Lissajous curves → the convergence points drift
  for (let i = 0; i < state.emitters.length; i++) {
    const e = state.emitters[i]
    e.x = W * (0.5 + 0.34 * Math.sin(now * 0.05 + i * 2.1))
    e.y = H * (0.5 + 0.30 * Math.cos(now * 0.041 + i * 1.7))
  }

  if (state.tracks.length < p.maxTracks && Math.random() < p.spawnRate) spawnTrack(state, p, now)

  const pal = state.colorCache.palette
  ctx.textAlign = "left"
  ctx.font = "10px 'IBM Plex Mono', monospace"
  state.tracks = state.tracks.filter((tr: any) => {
    tr.life -= p.fade
    if (tr.life <= 0) return false
    const a = Math.min(1, tr.life) * p.opacity * state.readerAlpha
    if (a < 0.008) return true
    ctx.fillStyle = pal[tr.ci] || state.colorCache.secondary
    ctx.globalAlpha = a
    for (let i = 0; i < tr.pts.length; i += p.gap) {
      const pt = tr.pts[i]
      const s = p.dot * (0.5 + 0.5 * (i / tr.pts.length))   // taper toward head
      ctx.fillRect(pt.x, pt.y, s, s)
    }
    // bright origin vertex (the convergence node)
    ctx.globalAlpha = Math.min(1, a * 1.6)
    ctx.fillRect(tr.pts[0].x - 1, tr.pts[0].y - 1, 2.4, 2.4)
    if (tr.glyph) {
      ctx.globalAlpha = a
      ctx.fillText(tr.glyph, tr.gx, tr.gy)
    }
    return true
  })

  // drafting-terminal reticle + live coordinate readout at the cursor
  if (p.reticle && state.mx > -9000) {
    const r = 9
    ctx.globalAlpha = 0.5 * state.readerAlpha
    ctx.strokeStyle = state.colorCache.secondary
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(state.mx - r, state.my); ctx.lineTo(state.mx - 3, state.my)
    ctx.moveTo(state.mx + 3, state.my); ctx.lineTo(state.mx + r, state.my)
    ctx.moveTo(state.mx, state.my - r); ctx.lineTo(state.mx, state.my - 3)
    ctx.moveTo(state.mx, state.my + 3); ctx.lineTo(state.mx, state.my + r)
    ctx.stroke()
    ctx.globalAlpha = 0.35 * state.readerAlpha
    ctx.fillStyle = state.colorCache.secondary
    ctx.font = "9px 'IBM Plex Mono', monospace"
    const pad = (n: number) => n.toFixed(0).padStart(4, "0")
    ctx.fillText(`${pad(state.mx)}·${pad(state.my)}`, state.mx + 12, state.my - 8)
  }
  ctx.globalAlpha = 1
}

// ── Schematic background ──
// Drifting anchor points with right-angle leader lines out to asemic glyph
// clusters that fade in and out; ruler ticks along the viewport edges. The most
// literally "blueprint" of the ambient modes. All geometry derives from each
// anchor's phase, so frame 0 is already composed (reduced-motion safe).
const SCHEMATIC_GLYPHS = "∮∇∂≡⊕⊗·°∆⟁"

function drawSchematic(ctx: CanvasRenderingContext2D, state: any, config: any) {
  const p = config.backgrounds.schematic
  const W = state.w, H = state.h
  const drift = performance.now() / 1000 * (p?.driftSpeed ?? 1)
  const now = drift
  const op = p?.opacity ?? 1
  const pen = state.colorCache.secondary
  const anchorCount = Math.round(p?.anchors ?? 9)

  if (state.anchors.length !== anchorCount) {
    state.anchors = Array.from({ length: anchorCount }, (_, i) => ({
      i, phase: i * 1.37,
      glyphs: Array.from({ length: 2 + (i % 3) }, (_, g) =>
        SCHEMATIC_GLYPHS[(i * 3 + g * 7) % SCHEMATIC_GLYPHS.length]).join(""),
    }))
  }

  // edge ruler ticks
  ctx.strokeStyle = pen
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.05 * op * state.readerAlpha
  ctx.beginPath()
  for (let x = 0; x < W; x += 24) {
    const len = x % 120 === 0 ? 8 : 4
    ctx.moveTo(x, 0); ctx.lineTo(x, len)
    ctx.moveTo(x, H); ctx.lineTo(x, H - len)
  }
  for (let y = 0; y < H; y += 24) {
    const len = y % 120 === 0 ? 8 : 4
    ctx.moveTo(0, y); ctx.lineTo(len, y)
    ctx.moveTo(W, y); ctx.lineTo(W - len, y)
  }
  ctx.stroke()

  ctx.font = "10px 'IBM Plex Mono', monospace"
  ctx.textAlign = "left"
  for (const a of state.anchors) {
    const ax = W * (0.5 + 0.4 * Math.sin(now * 0.04 + a.phase * 2.3))
    const ay = H * (0.5 + 0.38 * Math.cos(now * 0.031 + a.phase * 1.9))
    // visibility breathes on a long cycle — clusters fade in/out
    const vis = Math.max(0, Math.sin(now * 0.13 + a.phase * 3.1))
    if (vis < 0.02) continue
    const alpha = 0.16 * vis * op * state.readerAlpha

    // leader line with a right-angle elbow out to the label point
    const lx = ax + 46 + 34 * Math.sin(a.phase * 5)
    const ly = ay - 30 - 22 * Math.cos(a.phase * 4)
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(lx, ay)
    ctx.lineTo(lx, ly)
    ctx.stroke()
    // anchor node + dimension bracket at the label end
    ctx.fillStyle = pen
    ctx.fillRect(ax - 1.5, ay - 1.5, 3, 3)
    ctx.beginPath()
    ctx.moveTo(lx - 4, ly); ctx.lineTo(lx + 4, ly)
    ctx.stroke()
    ctx.globalAlpha = alpha * 1.4
    ctx.fillText(a.glyphs, lx + 7, ly + 3)
  }
  ctx.globalAlpha = 1
}

// ── Isometric background ──
// Faint wireframe cubes rotating slowly about Y, orthographically projected;
// some carry a glyph column. Cursor parallax: deeper cubes shift less.
function drawIsometric(ctx: CanvasRenderingContext2D, state: any, config: any) {
  const p = config.backgrounds.isometric
  const W = state.w, H = state.h
  const now = performance.now() / 1000
  const spinScale = p?.spin ?? 1
  const parallax = p?.parallax ?? 1
  const op = p?.opacity ?? 1
  const pen = state.colorCache.secondary
  const cubeCount = Math.round(p?.count ?? 10)

  if (state.cubes.length !== cubeCount) {
    state.cubes = Array.from({ length: cubeCount }, (_, i) => ({
      x: ((i * 0.618) % 1) * W,                 // golden-ratio scatter
      y: ((i * 0.382 + 0.19) % 1) * H,
      s: 18 + ((i * 37) % 40),                  // size
      depth: 0.3 + ((i * 53) % 100) / 140,      // parallax factor
      spin: 0.05 + ((i * 29) % 100) / 900,
      phase: i * 1.1,
      glyph: i % 3 === 0 ? GLYPH_POOL[(i * 11) % GLYPH_POOL.length] : null,
    }))
  }

  const px = (state.mx > -9000 ? state.mx - W / 2 : 0)
  const py = (state.my > -9000 ? state.my - H / 2 : 0)
  ctx.strokeStyle = pen
  ctx.lineWidth = 1
  ctx.font = "10px 'IBM Plex Mono', monospace"
  ctx.textAlign = "center"

  for (const c of state.cubes) {
    const ang = now * c.spin * spinScale + c.phase
    const cx = c.x - px * 0.02 * parallax * c.depth
    const cy = c.y - py * 0.02 * parallax * c.depth
    // 8 cube verts rotated about Y, orthographic projection with a fixed tilt
    const cos = Math.cos(ang), sin = Math.sin(ang)
    const tilt = 0.42 // vertical foreshortening of the "3D" y axis
    const v: [number, number][] = []
    for (let i = 0; i < 8; i++) {
      const X = (i & 1 ? 1 : -1), Y = (i & 2 ? 1 : -1), Z = (i & 4 ? 1 : -1)
      const rx = X * cos - Z * sin
      const rz = X * sin + Z * cos
      v.push([cx + rx * c.s, cy + Y * c.s * 0.8 + rz * c.s * tilt])
    }
    ctx.globalAlpha = 0.07 * c.depth * op * state.readerAlpha
    ctx.beginPath()
    // 12 edges: pairs of vert indices differing in one bit
    for (let i = 0; i < 8; i++) for (const b of [1, 2, 4]) {
      const j = i | b
      if (j !== i && j > i) { ctx.moveTo(v[i][0], v[i][1]); ctx.lineTo(v[j][0], v[j][1]) }
    }
    ctx.stroke()
    if (c.glyph) {
      ctx.globalAlpha = 0.12 * c.depth * op * state.readerAlpha
      ctx.fillStyle = pen
      ctx.fillText(c.glyph, cx, cy + 3)
    }
  }
  ctx.globalAlpha = 1
}

// ── Orrery background ──
// Nested astrolabe rings centred on the viewport: thin circles, tick radials,
// and a "body" node per ring, each precessing at its own slow rate.
function drawOrrery(ctx: CanvasRenderingContext2D, state: any, config: any) {
  const p = config.backgrounds.orrery
  const W = state.w, H = state.h
  const now = performance.now() / 1000
  const spinScale = p?.spin ?? 1
  const op = p?.opacity ?? 1
  const pen = state.colorCache.secondary
  const pal = state.colorCache.palette
  const cx = W / 2, cy = H / 2
  const maxR = Math.min(W, H) * 0.44
  const RINGS = Math.round(p?.rings ?? 6)

  ctx.lineWidth = 1
  for (let i = 0; i < RINGS; i++) {
    const r = maxR * ((i + 1) / RINGS)
    const rot = now * 0.03 * spinScale * (i % 2 ? 1 : -1) * (1 + i * 0.35) + i * 0.8
    // slow precession: the ring's ellipse aspect breathes slightly
    const squash = 1 - 0.06 * Math.sin(now * 0.05 + i * 1.3)
    ctx.strokeStyle = pen
    ctx.globalAlpha = 0.05 * op * state.readerAlpha
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * squash, 0, 0, Math.PI * 2)
    ctx.stroke()
    // tick radials
    const ticks = 12 + i * 6
    ctx.beginPath()
    for (let t = 0; t < ticks; t++) {
      const a = (t / ticks) * Math.PI * 2 + rot * 0.4
      const inner = t % 3 === 0 ? 0.965 : 0.985
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash)
      ctx.lineTo(cx + Math.cos(a) * r * inner, cy + Math.sin(a) * r * squash * inner)
    }
    ctx.stroke()
    // orbiting body + a short trailing arc
    const ba = rot
    ctx.globalAlpha = 0.22 * op * state.readerAlpha
    ctx.fillStyle = pal[i % pal.length]
    ctx.beginPath()
    ctx.arc(cx + Math.cos(ba) * r, cy + Math.sin(ba) * r * squash, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.09 * op * state.readerAlpha
    ctx.strokeStyle = pal[i % pal.length]
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * squash, 0, ba - 0.5, ba)
    ctx.stroke()
  }
  // centre node
  ctx.globalAlpha = 0.3 * op * state.readerAlpha
  ctx.fillStyle = pen
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

// ── Plate-scan background ──
// A single Atkinson-dithered generative still (simplex-octave field → 1-bit
// stipple) rendered ONCE to an offscreen canvas, then slowly panned with a
// scanline sweep. Near-zero per-frame cost: one drawImage + one gradient bar.
function buildPlate(state: any, cell: number): HTMLCanvasElement {
  const W = state.w, H = state.h
  const cellPx = Math.max(2, Math.round(cell))   // stipple resolution
  const gw = Math.ceil(W / cellPx), gh = Math.ceil(H / cellPx)
  // grayscale field from simplex octaves
  const gray = new Float32Array(gw * gh)
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let v = simplex(x * 0.02, y * 0.02) * 0.6 + simplex(x * 0.07, y * 0.07) * 0.3 + simplex(x * 0.21, y * 0.21) * 0.1
    gray[y * gw + x] = Math.min(1, Math.max(0, v * 0.5 + 0.5))
  }
  // Atkinson dither: threshold at 0.5, diffuse 6/8 of the error forward
  const off = document.createElement("canvas")
  off.width = W; off.height = H
  const octx = off.getContext("2d")!
  octx.fillStyle = state.colorCache.secondary
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = y * gw + x
    const old = gray[i]
    const bit = old > 0.5 ? 1 : 0
    const err = (old - bit) / 8
    if (bit) octx.fillRect(x * cellPx, y * cellPx, 1.6, 1.6)
    if (x + 1 < gw) gray[i + 1] += err
    if (x + 2 < gw) gray[i + 2] += err
    if (y + 1 < gh) {
      if (x > 0) gray[i + gw - 1] += err
      gray[i + gw] += err
      if (x + 1 < gw) gray[i + gw + 1] += err
    }
    if (y + 2 < gh) gray[i + 2 * gw] += err
  }
  return off
}

function drawPlateScan(ctx: CanvasRenderingContext2D, state: any, config: any) {
  const p = config.backgrounds["plate-scan"]
  const W = state.w, H = state.h
  const now = performance.now() / 1000
  const panSpeed = p?.panSpeed ?? 1
  const scanSpeed = p?.scanSpeed ?? 1
  const op = p?.opacity ?? 1
  const cell = p?.cell ?? 4
  // cell is part of the plate identity — changing it rebuilds the offscreen still
  const key = `${W}x${H}:${state.colorCache.secondary}:${Math.round(cell)}`
  if (state.plateKey !== key) {
    state.plate = buildPlate(state, cell)
    state.plateKey = key
  }

  // slow diagonal pan (wrapped 2×2 tile so edges never show)
  const panX = (now * 3 * panSpeed) % W
  const panY = (now * 1.7 * panSpeed) % H
  ctx.globalAlpha = 0.12 * op * state.readerAlpha
  ctx.drawImage(state.plate!, -panX, -panY)
  ctx.drawImage(state.plate!, W - panX, -panY)
  ctx.drawImage(state.plate!, -panX, H - panY)
  ctx.drawImage(state.plate!, W - panX, H - panY)

  // scanline sweep — a soft bright band drifting down the plate
  const sy = ((now * 26 * scanSpeed) % (H * 1.4)) - H * 0.2
  const grad = ctx.createLinearGradient(0, sy - 40, 0, sy + 40)
  grad.addColorStop(0, "transparent")
  grad.addColorStop(0.5, state.colorCache.secondary)
  grad.addColorStop(1, "transparent")
  ctx.globalAlpha = 0.05 * op * state.readerAlpha
  ctx.fillStyle = grad
  ctx.fillRect(0, sy - 40, W, 80)
  ctx.globalAlpha = 1
}

// ── Murmuration background ──
// A large flock of boids (Reynolds rules + a drifting simplex "wind" current).
// Uses a spatial hash so it stays cheap at high counts. Birds are semi-opaque
// so they read as ambient motion, not a foreground distraction.
const MURM = {
  count: 460,
  percept: 46,
  separation: 18,
  maxSpeed: 2.4,
  minSpeed: 1.1,
  align: 0.045,
  cohere: 0.0010,
  separate: 1.1,
  wind: 0.05,       // strength of the simplex current
  windScale: 0.0013,
  fleeRadius: 130,
  fleeForce: 1.4,
  baseAlpha: 0.34,  // semi-opaque so it's present but calm
}

function drawMurmuration(ctx: CanvasRenderingContext2D, state: any, config: any) {
  const p = config.backgrounds.murmuration
  // Tunable subset from config; the rest of the flock's character stays in MURM.
  const count = Math.round(p?.count ?? MURM.count)
  const maxSpeed = p?.maxSpeed ?? MURM.maxSpeed
  const cohere = p?.cohere ?? MURM.cohere
  const wind = p?.wind ?? MURM.wind
  const baseAlpha = p?.opacity ?? MURM.baseAlpha
  const W = state.w, H = state.h
  const boids: { x: number; y: number; vx: number; vy: number }[] = state.boids

  // (re)seed if empty, count changed, or the viewport changed a lot
  if (boids.length !== count) {
    boids.length = 0
    for (let i = 0; i < count; i++) {
      boids.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      })
    }
  }

  const cell = MURM.percept
  const cols = Math.max(1, Math.ceil(W / cell))
  const rows = Math.max(1, Math.ceil(H / cell))
  // Reuse bucket arrays across frames (truncate instead of reallocate) — the
  // per-frame Array.from(...) allocated hundreds of arrays/frame of GC churn.
  let grid: number[][] = state.boidGrid
  if (!grid || grid.length !== cols * rows) {
    grid = state.boidGrid = Array.from({ length: cols * rows }, () => [])
  } else {
    for (let i = 0; i < grid.length; i++) grid[i].length = 0
  }
  const cellIndex = (x: number, y: number) => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)))
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)))
    return cy * cols + cx
  }
  for (let i = 0; i < boids.length; i++) grid[cellIndex(boids[i].x, boids[i].y)].push(i)

  const t = performance.now() / 1000
  const P2 = MURM.percept * MURM.percept
  const S2 = MURM.separation * MURM.separation
  const FLEE2 = MURM.fleeRadius * MURM.fleeRadius
  const color = state.colorCache.secondary

  ctx.fillStyle = color
  const alpha = baseAlpha * state.readerAlpha

  for (let i = 0; i < boids.length; i++) {
    const b = boids[i]
    let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0

    const bcx = Math.floor(b.x / cell), bcy = Math.floor(b.y / cell)
    for (let gy = bcy - 1; gy <= bcy + 1; gy++) {
      if (gy < 0 || gy >= rows) continue
      for (let gx = bcx - 1; gx <= bcx + 1; gx++) {
        if (gx < 0 || gx >= cols) continue
        for (const j of grid[gy * cols + gx]) {
          if (j === i) continue
          const o = boids[j]
          const dx = o.x - b.x, dy = o.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < P2) {
            ax += o.vx; ay += o.vy
            cx += o.x; cy += o.y
            n++
            if (d2 < S2 && d2 > 0) { sx -= dx / d2; sy -= dy / d2 }
          }
        }
      }
    }

    if (n > 0) {
      b.vx += (ax / n - b.vx) * MURM.align
      b.vy += (ay / n - b.vy) * MURM.align
      b.vx += (cx / n - b.x) * cohere
      b.vy += (cy / n - b.y) * cohere
    }
    b.vx += sx * MURM.separate
    b.vy += sy * MURM.separate

    // drifting wind current (simplex flow field) — gives the flock organic sweeps
    const ang = simplex(b.x * MURM.windScale, b.y * MURM.windScale + t * 0.15) * Math.PI * 2
    b.vx += Math.cos(ang) * wind
    b.vy += Math.sin(ang) * wind

    // flee the cursor
    const mdx = b.x - state.mx, mdy = b.y - state.my
    const md2 = mdx * mdx + mdy * mdy
    if (md2 < FLEE2 && md2 > 0) {
      const f = (FLEE2 - md2) / FLEE2
      const d = Math.sqrt(md2)
      b.vx += (mdx / d) * f * MURM.fleeForce
      b.vy += (mdy / d) * f * MURM.fleeForce
    }

    // clamp speed to a band so the flock keeps moving but never rockets
    let sp = Math.hypot(b.vx, b.vy)
    if (sp > maxSpeed) { b.vx = (b.vx / sp) * maxSpeed; b.vy = (b.vy / sp) * maxSpeed; sp = maxSpeed }
    else if (sp < MURM.minSpeed && sp > 0) { b.vx = (b.vx / sp) * MURM.minSpeed; b.vy = (b.vy / sp) * MURM.minSpeed; sp = MURM.minSpeed }

    b.x += b.vx; b.y += b.vy
    if (b.x < -10) b.x += W + 20; else if (b.x > W + 10) b.x -= W + 20
    if (b.y < -10) b.y += H + 20; else if (b.y > H + 10) b.y -= H + 20

    // faster birds read a touch brighter — subtle life
    ctx.globalAlpha = alpha * (0.7 + 0.3 * (sp / maxSpeed))
    // Rotate+translate the 3 triangle vertices by hand instead of
    // save/translate/rotate/restore. Per-boid ctx.save/restore snapshots the
    // entire canvas state — at 460 boids/frame that dominated the bg cost
    // (the save/rotate/translate/restore hotspots in the profile). Manual math
    // on three points is a fraction of that and draws the identical shape.
    const cos = b.vx, sin = b.vy
    const inv = 1 / (sp || 1)       // unit heading (sp is the clamped speed)
    const c = cos * inv, s = sin * inv
    // local verts: (4.5,0) nose, (-2.6,2.1) and (-2.6,-2.1) tail corners
    ctx.beginPath()
    ctx.moveTo(b.x + 4.5 * c,          b.y + 4.5 * s)
    ctx.lineTo(b.x - 2.6 * c - 2.1 * s, b.y - 2.6 * s + 2.1 * c)
    ctx.lineTo(b.x - 2.6 * c + 2.1 * s, b.y - 2.6 * s - 2.1 * c)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1
}
