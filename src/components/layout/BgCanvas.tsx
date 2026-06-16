import { useEffect, useRef, useMemo } from "react"
import { useStore } from "@/store"

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
  // Skip entirely on mobile — canvas is CSS-hidden at ≤800px, no point running it
  if (typeof window !== "undefined" && window.innerWidth <= 800) return null
  return <BgCanvasInner />
}

function BgCanvasInner() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgMode = useStore((s) => s.bgMode)
  const bgStyle = useStore((s) => s.bgStyle)
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
    lastFrame: 0,
    w: 0,
    h: 0
  })

  // Automatically switch to the matching board background on game pages
  useEffect(() => {
    const slug = activeSlug.toLowerCase()
    const gameMode = slug === "chess" ? "chess" : slug === "hexo" ? "hexo" : null
    if (gameMode) {
      if (bgMode !== gameMode) {
        useStore.getState().setBgMode(gameMode)
      }
    } else {
      // Revert if we were in a game-board mode because of the slug
      if (bgMode === "chess" || bgMode === "hexo") {
        const lastMode = useStore.getState().lastBgMode
        useStore.getState().setBgMode(lastMode)
      }
    }
  }, [activeSlug])

  useEffect(() => {
    stateRef.current.readerTarget = isReaderMode ? 0.04 : 1
  }, [isReaderMode])

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
      // reseed the flock across the new viewport
      stateRef.current.boids = []
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
        drawMurmuration(ctx, state)
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

  for (let r = -1; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      const cx = c * hw + (r % 2 ? hw / 2 : 0)
      const cy = r * vh
      const d = Math.hypot(cx - state.mx, cy - state.my)
      const prox = d < 220 ? (1 - d / 220) * 0.06 : 0
      ctx.globalAlpha = (0.025 + prox) * state.readerAlpha

      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30)
        const x = cx + size * Math.cos(a)
        const y = cy + size * Math.sin(a)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
    }
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

function drawMurmuration(ctx: CanvasRenderingContext2D, state: any) {
  const W = state.w, H = state.h
  const boids: { x: number; y: number; vx: number; vy: number }[] = state.boids

  // (re)seed if empty or the viewport changed a lot
  if (boids.length === 0) {
    for (let i = 0; i < MURM.count; i++) {
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
  const grid: number[][] = Array.from({ length: cols * rows }, () => [])
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
  const alpha = MURM.baseAlpha * state.readerAlpha

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
      b.vx += (cx / n - b.x) * MURM.cohere
      b.vy += (cy / n - b.y) * MURM.cohere
    }
    b.vx += sx * MURM.separate
    b.vy += sy * MURM.separate

    // drifting wind current (simplex flow field) — gives the flock organic sweeps
    const ang = simplex(b.x * MURM.windScale, b.y * MURM.windScale + t * 0.15) * Math.PI * 2
    b.vx += Math.cos(ang) * MURM.wind
    b.vy += Math.sin(ang) * MURM.wind

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
    if (sp > MURM.maxSpeed) { b.vx = (b.vx / sp) * MURM.maxSpeed; b.vy = (b.vy / sp) * MURM.maxSpeed; sp = MURM.maxSpeed }
    else if (sp < MURM.minSpeed && sp > 0) { b.vx = (b.vx / sp) * MURM.minSpeed; b.vy = (b.vy / sp) * MURM.minSpeed; sp = MURM.minSpeed }

    b.x += b.vx; b.y += b.vy
    if (b.x < -10) b.x += W + 20; else if (b.x > W + 10) b.x -= W + 20
    if (b.y < -10) b.y += H + 20; else if (b.y > H + 10) b.y -= H + 20

    // faster birds read a touch brighter — subtle life
    ctx.globalAlpha = alpha * (0.7 + 0.3 * (sp / MURM.maxSpeed))
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
