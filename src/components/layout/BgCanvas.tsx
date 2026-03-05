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
  { frames: ["<o>", "(o)", " o ", "   "] }
]

const GLYPH_POOL = '░▒▓█─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬■□●○◘▄▀▌▐«»¶§±≡≈∞ΩαβπΣφ♠♣♥♦☺☻♪♫►◄▲▼'

export function BgCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgMode = useStore((s) => s.bgMode)
  const bgStyle = useStore((s) => s.bgStyle)
  const isReaderMode = useStore((s) => s.isReaderMode)
  const theme = useStore((s) => s.theme)
  const palette = useStore((s) => s.palette)
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
    lastFrame: 0,
    w: 0,
    h: 0
  })

  // Automatically switch to chess background on chess page
  useEffect(() => {
    if (activeSlug.toLowerCase() === "chess") {
      if (bgMode !== "chess") {
        useStore.getState().setBgMode("chess")
      }
    } else {
      // Revert if we were in chess mode because of the slug
      if (bgMode === "chess") {
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
  }, [theme, palette])

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
    }

    const refreshColors = () => {
      const style = getComputedStyle(document.documentElement)
      const css = (p: string) => style.getPropertyValue(p).trim()
      const secondary = css("--color-primary") || "#b4424c"
      stateRef.current.colorCache.secondary = secondary
      stateRef.current.colorCache.palette = [
        secondary,
        css("--color-accent-base") || "#ff6b6b",
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

    // Fetch nodes once
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
      .catch(() => {})

    let animationId: number
    const frame = () => {
      const state = stateRef.current
      state.readerAlpha += (state.readerTarget - state.readerAlpha) * 0.08
      
      if (bgStyle !== "off") {
        if (!state.colorValid) refreshColors()
        ctx.clearRect(0, 0, state.w, state.h)

        if (bgMode === "vectors" || bgMode === "dots") {
          drawField(ctx, state, bgMode, bgStyle, config)
        } else if (bgMode === "terminal") {
          drawTerminalPops(ctx, state, config)
        } else if (bgMode === "chess") {

          drawChess(ctx, state)
        } else if (bgMode === "graph") {
          drawGraph(ctx, state, config)
        }
      } else {
        ctx.clearRect(0, 0, state.w, state.h)
      }

      animationId = requestAnimationFrame(frame)
    }

    animationId = requestAnimationFrame(frame)

    return () => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", mouseMove)
      cancelAnimationFrame(animationId)
    }
  }, [bgMode, bgStyle, theme, palette, config])

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
        ctx.fillStyle = state.colorCache.palette[ci]
        ctx.beginPath()
        ctx.arc(x, vy, dotR, 0, Math.PI * 2)
        ctx.fill()
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
