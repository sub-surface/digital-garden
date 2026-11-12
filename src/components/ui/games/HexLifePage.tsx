import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import styles from "./HexLifePage.module.scss"
import { useProgramHost } from "./ProgramHostContext"
import { cssVarReader, startFrameLoop } from "./useGameLoop"
import { ignoreGameKey } from "./gameUtils"
import {
  clear, fromAxial, hashWorld, makeWorld, orient, parseRule, ruleText as formatRule, seed, stamp, step, toAxial,
  type Rule, type World,
} from "@/lib/hexlife"
import { HEXLIFE_PRESETS, type HexPattern } from "./hexLifePresets"

/**
 * Hex Life: cellular automata on hexagons (six neighbours, not eight).
 *
 * The world is a torus, tiled across the screen so it reads as an endless
 * plane at any zoom. Rules come in three families, all typed as text: B/S
 * counts ("B2/S34"), shape-aware counts ("B2o/S2m34", where o, m and p tell
 * apart neighbours side by side, one apart and opposite), and Generations
 * ("/C3", where a dying cell lingers as a fading trail). The presets each
 * carry a few objects that a soup census actually found in that rule, ready
 * to stamp. A cycle detector names what a settled world is doing.
 */

type ColorMode = "accent" | "age" | "trails" | "mono"
const COLOR_MODES: { id: ColorMode; name: string }[] = [
  { id: "accent", name: "Accent" },
  { id: "age", name: "Age" },
  { id: "trails", name: "Trails" },
  { id: "mono", name: "Mono" },
]
type Tool = "paint" | "erase" | "stamp" | "pan"
type SeedKind = "soup" | "field" | "mirror"
const SIZES = [96, 160, 256] as const
const SQ3 = Math.sqrt(3)
const HISTORY = 240

/** What the cycle detector last concluded. */
type Verdict = { kind: "running" } | { kind: "dead"; gen: number } | { kind: "cycle"; period: number; since: number }

export function HexLifePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navigate = useNavigate()
  const popCard = useStore((s) => s.popCard)
  const programHost = useProgramHost()

  const close = useCallback(() => {
    if (programHost.close) return programHost.close()
    const stack = useStore.getState().panelStack
    if (stack.length > 0) popCard()
    else navigate({ to: "/$", params: { _splat: "arcade" } as never })
  }, [popCard, navigate, programHost])

  // ── simulation state lives in refs; React state mirrors it for the panel ──
  const worldRef = useRef<World>(makeWorld(160, 160))
  const echoRef = useRef<Float32Array>(new Float32Array(160 * 160))
  const [presetIdx, setPresetIdx] = useState(0)
  const [ruleText, setRuleText] = useState(HEXLIFE_PRESETS[0].rule)
  const [ruleError, setRuleError] = useState("")
  const ruleRef = useRef<Rule>(parseRule(HEXLIFE_PRESETS[0].rule) as Rule)
  const [size, setSize] = useState<(typeof SIZES)[number]>(160)
  const [speed, setSpeed] = useState(14)
  const speedRef = useRef(speed); speedRef.current = speed
  const [density, setDensity] = useState(HEXLIFE_PRESETS[0].density)
  const densityRef = useRef(density); densityRef.current = density
  const [seedKind, setSeedKind] = useState<SeedKind>(HEXLIFE_PRESETS[0].seed)
  const seedKindRef = useRef(seedKind); seedKindRef.current = seedKind
  const [colorMode, setColorMode] = useState<ColorMode>("accent")
  const colorModeRef = useRef(colorMode); colorModeRef.current = colorMode
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused); pausedRef.current = paused
  const [autoSoup, setAutoSoup] = useState(false)
  const autoSoupRef = useRef(autoSoup); autoSoupRef.current = autoSoup
  const [tool, setTool] = useState<Tool>("paint")
  const toolRef = useRef(tool); toolRef.current = tool
  const [patternIdx, setPatternIdx] = useState(0)
  const patternRef = useRef<HexPattern | null>(HEXLIFE_PRESETS[0].patterns[0] ?? null)
  const [turn, setTurn] = useState(0)
  const turnRef = useRef(0); turnRef.current = turn
  const [menuOpen, setMenuOpen] = useState(true)
  const [readout, setReadout] = useState({ gen: 0, pop: 0, verdict: { kind: "running" } as Verdict, history: [] as number[] })

  const stepFlag = useRef(false)
  const dirtyRef = useRef(true) // repaint wanted
  const hashes = useRef(new Map<number, number>())
  const verdictRef = useRef<Verdict>({ kind: "running" })
  const historyRef = useRef<number[]>([])
  const popRef = useRef(0)
  const settledAt = useRef(-1)

  const preset = HEXLIFE_PRESETS[presetIdx] ?? null
  const patterns = preset?.patterns ?? []
  useEffect(() => { patternRef.current = HEXLIFE_PRESETS[presetIdx]?.patterns[patternIdx] ?? null }, [presetIdx, patternIdx])

  /** Forget the cycle detector's memory (after any edit or reseed). */
  const resetWatch = useCallback(() => {
    hashes.current.clear()
    verdictRef.current = { kind: "running" }
    settledAt.current = -1
    dirtyRef.current = true
  }, [])

  const reseed = useCallback(() => {
    const w = worldRef.current
    const d = densityRef.current
    const kind = seedKindRef.current
    if (kind === "field") seed(w, d)
    else if (kind === "soup") seed(w, d, Math.random, 0.22)
    else {
      // a soup with the hexagon's twelve symmetries, about the centre
      clear(w)
      const R = Math.max(6, Math.round(Math.min(w.W, w.H) * 0.09))
      const cx = w.W >> 1, cy = w.H >> 1
      for (let q = 0; q <= R; q++) for (let r = 0; r <= R - q; r++) {
        if (r > q || Math.random() >= d) continue
        const cells: [number, number][] = []
        for (let k = 0; k < 6; k++) { cells.push(orient([q, r], k)); cells.push(orient([q, r], k, true)) }
        stamp(w, cx, cy, cells)
      }
    }
    echoRef.current.fill(0)
    historyRef.current = []
    resetWatch()
  }, [resetWatch])

  const clearAll = useCallback(() => {
    clear(worldRef.current)
    echoRef.current.fill(0)
    historyRef.current = []
    resetWatch()
  }, [resetWatch])

  const reseedRef = useRef(reseed); reseedRef.current = reseed
  const clearRef = useRef(clearAll); clearRef.current = clearAll

  /** Apply rule text; returns false (and shows why) when it doesn't parse. */
  const applyRule = useCallback((text: string) => {
    setRuleText(text)
    const r = parseRule(text)
    if (typeof r === "string") { setRuleError(r); return false }
    setRuleError("")
    ruleRef.current = r
    resetWatch()
    return true
  }, [resetWatch])

  const choosePreset = useCallback((i: number) => {
    const p = HEXLIFE_PRESETS[i]
    setPresetIdx(i)
    setPatternIdx(0)
    setDensity(p.density)
    densityRef.current = p.density
    setSeedKind(p.seed)
    seedKindRef.current = p.seed
    applyRule(p.rule)
    reseedRef.current()
  }, [applyRule])

  const toggleCount = (which: "b" | "s", n: number) => {
    const r = ruleRef.current
    const t = which === "b" ? r.birth : r.survive
    const masks = [...Array(64).keys()].filter((m) => bitCount(m) === n)
    const on = masks.every((m) => t[m])
    const birth = r.birth.slice(), survive = r.survive.slice()
    for (const m of masks) (which === "b" ? birth : survive)[m] = on ? 0 : 1
    setPresetIdx(-1)
    applyRule(formatRule(birth, survive, r.states))
  }

  const resize = useCallback((n: (typeof SIZES)[number]) => {
    setSize(n)
    worldRef.current = makeWorld(n, n)
    echoRef.current = new Float32Array(n * n)
    reseedRef.current()
  }, [])

  // Esc closes; Space plays/pauses, N steps, R reseeds, C clears, H hides the
  // panel, [ and ] turn the stamp, S toggles stamp mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return
      if (e.key === "Escape") { if (!programHost.embedded) close(); return }
      const k = e.key.toLowerCase()
      if (k === " ") { e.preventDefault(); setPaused((p) => !p) }
      else if (k === "n" || k === ".") stepFlag.current = true
      else if (k === "r") reseedRef.current()
      else if (k === "c") clearRef.current()
      else if (k === "h") setMenuOpen((o) => !o)
      else if (k === "[") { setTurn((t) => (t + 5) % 6); dirtyRef.current = true }
      else if (k === "]") { setTurn((t) => (t + 1) % 6); dirtyRef.current = true }
      else if (k === "s") setTool((t) => (t === "stamp" ? "paint" : "stamp"))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close, programHost.embedded])

  // first seed
  useEffect(() => { reseedRef.current() }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const view = { R: 7, x: 0, y: 0, init: false }
    let dpr = 1
    const resizeCanvas = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(canvas.clientWidth * dpr)
      canvas.height = Math.floor(canvas.clientHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!view.init) {
        // centre the world's middle on screen
        const w = worldRef.current
        view.x = canvas.clientWidth / 2 - SQ3 * view.R * (w.W / 2)
        view.y = canvas.clientHeight / 2 - 1.5 * view.R * (w.H / 2)
        view.init = true
      }
      dirtyRef.current = true
    }
    resizeCanvas()

    const accentVar = cssVarReader("--color-accent-base", "#427ab4")
    const textVar = cssVarReader("--color-text", "#e0e0e0")
    const surfaceVar = cssVarReader("--color-bg-surface", "#1a1a1f")

    // Hexagon vertex offsets, rebuilt only when the zoom changes.
    let hexFor = -1
    const hx = new Float64Array(6), hy = new Float64Array(6)
    const buildHex = () => {
      if (hexFor === view.R) return
      hexFor = view.R
      const r = view.R * (view.R > 5 ? 0.9 : 1.02)
      for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; hx[i] = r * Math.cos(a); hy[i] = r * Math.sin(a) }
    }
    const addHex = (p: Path2D, cx: number, cy: number) => {
      p.moveTo(cx + hx[0], cy + hy[0])
      for (let i = 1; i < 6; i++) p.lineTo(cx + hx[i], cy + hy[i])
      p.closePath()
    }

    let hover: { x: number; y: number } | null = null

    const render = () => {
      const w = worldRef.current
      const W = canvas.clientWidth, H = canvas.clientHeight
      const R = view.R, dx = SQ3 * R, dy = 1.5 * R
      ctx.clearRect(0, 0, W, H)
      buildHex()
      const mode = colorModeRef.current
      const accent = accentVar(), text = textVar()
      // buckets: 0 grid, 1..8 strength levels for the live colour, 9..16 faded (dying/echo)
      const LEVELS = 8
      const live: Path2D[] = Array.from({ length: LEVELS }, () => new Path2D())
      const ghost: Path2D[] = Array.from({ length: LEVELS }, () => new Path2D())
      const grid = new Path2D()
      const drawGrid = R >= 6
      const y0 = Math.floor(-view.y / dy) - 1, y1 = Math.ceil((H - view.y) / dy) + 1
      const echo = echoRef.current
      const states = ruleRef.current.states
      for (let y = y0; y <= y1; y++) {
        const wy = ((y % w.H) + w.H) % w.H
        const shift = y & 1 ? 0.5 : 0
        const x0 = Math.floor((-view.x) / dx - shift) - 1, x1 = Math.ceil((W - view.x) / dx - shift) + 1
        const cy = view.y + y * dy
        for (let x = x0; x <= x1; x++) {
          const wx = ((x % w.W) + w.W) % w.W
          const i = wy * w.W + wx
          const v = w.cells[i]
          const cx = view.x + (x + shift) * dx
          if (v === 1) {
            let lvl = LEVELS - 1
            if (mode === "age") lvl = Math.min(LEVELS - 1, Math.floor(Math.log2(1 + w.age[i]) * 1.4))
            addHex(live[lvl], cx, cy)
          } else if (v > 1) {
            // Generations: a dying cell fades with each step it has left
            const lvl = Math.max(0, Math.floor((LEVELS - 1) * (1 - (v - 1) / (states - 1))))
            addHex(ghost[lvl], cx, cy)
          } else if (mode === "trails" && echo[i] > 0.04) {
            addHex(ghost[Math.min(LEVELS - 1, Math.floor(echo[i] * LEVELS))], cx, cy)
          } else if (drawGrid) addHex(grid, cx, cy)
        }
      }
      if (drawGrid) { ctx.globalAlpha = 0.18; ctx.fillStyle = surfaceVar(); ctx.fill(grid) }
      const liveColour = mode === "mono" ? text : accent
      for (let l = 0; l < LEVELS; l++) {
        ctx.fillStyle = liveColour
        ctx.globalAlpha = 0.12 + 0.5 * ((l + 1) / LEVELS)
        ctx.fill(ghost[l])
        if (mode === "age") {
          // young cells in the accent, old ones paling toward the text colour
          ctx.globalAlpha = 1
          ctx.fillStyle = `color-mix(in srgb, ${accent} ${100 - (l * 80) / (LEVELS - 1)}%, ${text})`
        } else ctx.globalAlpha = 1
        ctx.fill(live[l])
      }
      // stamp preview
      const pat = patternRef.current
      if (hover && toolRef.current === "stamp" && pat) {
        const p = new Path2D()
        const [aq, ar] = toAxial(hover.x, hover.y)
        for (const [q, r] of pat.cells) {
          const [oq, or] = orient([q, r], turnRef.current)
          const [x, y] = fromAxial(aq + oq, ar + or)
          addHex(p, view.x + (x + (y & 1 ? 0.5 : 0)) * dx, view.y + y * dy)
        }
        ctx.globalAlpha = 0.45; ctx.fillStyle = text; ctx.fill(p)
      }
      ctx.globalAlpha = 1
    }

    const advance = () => {
      const w = worldRef.current
      const pop = step(w, ruleRef.current)
      popRef.current = pop
      const echo = echoRef.current
      if (colorModeRef.current === "trails") for (let i = 0; i < echo.length; i++) echo[i] = w.cells[i] === 1 ? 1 : echo[i] * 0.86
      const h = historyRef.current
      h.push(pop); if (h.length > HISTORY) h.shift()
      // cycle detection: a repeated state means the world is now periodic
      if (verdictRef.current.kind === "running") {
        if (pop === 0 && ruleRef.current.states === 2) verdictRef.current = { kind: "dead", gen: w.gen }
        else {
          const hash = hashWorld(w)
          const seen = hashes.current.get(hash)
          if (seen !== undefined) verdictRef.current = { kind: "cycle", period: w.gen - seen, since: seen }
          else {
            hashes.current.set(hash, w.gen)
            if (hashes.current.size > 600) hashes.current.delete(hashes.current.keys().next().value!)
          }
        }
        if (verdictRef.current.kind !== "running") settledAt.current = performance.now()
      }
      // soup mode: a world that has died or settled is replaced after a breath
      if (autoSoupRef.current && settledAt.current > 0 && performance.now() - settledAt.current > 2500) reseedRef.current()
      dirtyRef.current = true
    }

    let acc = 0, lastReadout = 0
    const stopLoop = startFrameLoop((dt) => {
      acc += dt
      const stepMs = 1000 / Math.max(1, speedRef.current)
      if (stepFlag.current) { stepFlag.current = false; advance(); acc = 0 }
      else if (!pausedRef.current) {
        let n = 0
        while (acc >= stepMs && n < 8) { advance(); acc -= stepMs; n++ }
        if (acc > stepMs * 8) acc = 0
      } else acc = 0
      if (dirtyRef.current) { dirtyRef.current = false; render() }
      const now = performance.now()
      if (now - lastReadout > 200) {
        lastReadout = now
        const w = worldRef.current
        setReadout({ gen: w.gen, pop: popRef.current, verdict: verdictRef.current, history: historyRef.current.slice() })
      }
    })

    // ── input: one pointer paints/erases/stamps/pans; two pinch and pan ──
    const cellAt = (clientX: number, clientY: number): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect()
      const px = clientX - r.left - view.x, py = clientY - r.top - view.y
      const R = view.R, dx = SQ3 * R, dy = 1.5 * R
      const ey = Math.round(py / dy)
      let best = { x: 0, y: 0 }, bd = Infinity
      for (let y = ey - 1; y <= ey + 1; y++) {
        const shift = y & 1 ? 0.5 : 0
        const ex = Math.round(px / dx - shift)
        for (let x = ex - 1; x <= ex + 1; x++) {
          const d = ((x + shift) * dx - px) ** 2 + (y * dy - py) ** 2
          if (d < bd) { bd = d; best = { x, y } }
        }
      }
      return best
    }
    const wrapIdx = (x: number, y: number) => {
      const w = worldRef.current
      return (((y % w.H) + w.H) % w.H) * w.W + (((x % w.W) + w.W) % w.W)
    }
    const pointers = new Map<number, { x: number; y: number }>()
    let action: "none" | "paint" | "erase" | "pan" = "none"
    let panStart = { x: 0, y: 0, vx: 0, vy: 0 }
    let pinch: { d: number; mx: number; my: number; R: number; vx: number; vy: number } | null = null
    let lastCell = -1
    const pinchFrame = () => {
      const [a, b] = [...pointers.values()]
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
    }
    const zoomAbout = (next: number, ox: number, oy: number, baseR = view.R, bx = view.x, by = view.y) => {
      next = Math.max(2, Math.min(36, next))
      const k = next / baseR
      view.x = ox - (ox - bx) * k
      view.y = oy - (oy - by) * k
      view.R = next
      dirtyRef.current = true
    }
    const touchCell = (clientX: number, clientY: number) => {
      const c = cellAt(clientX, clientY)
      const i = wrapIdx(c.x, c.y)
      if (i === lastCell) return
      lastCell = i
      const w = worldRef.current
      w.cells[i] = action === "erase" ? 0 : 1
      w.age[i] = 0
      resetWatch()
    }
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) { pinch = { ...pinchFrame(), R: view.R, vx: view.x, vy: view.y }; action = "none"; return }
      if (pointers.size > 2) return
      const t = toolRef.current
      const wantsPan = e.button === 1 || e.altKey || t === "pan"
      if (wantsPan) { action = "pan"; panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; return }
      if (t === "stamp" && e.button === 0) {
        const pat = patternRef.current
        if (!pat) return
        const c = cellAt(e.clientX, e.clientY)
        const w = worldRef.current
        const [wx, wy] = [((c.x % w.W) + w.W) % w.W, ((c.y % w.H) + w.H) % w.H]
        stamp(w, wx, wy, pat.cells.map(([q, r]) => [q, r] as const), turnRef.current)
        // dying-state cells of a Generations ship go back in as they were
        if (pat.dying?.length) {
          const [aq, ar] = toAxial(wx, wy)
          for (const [q, r, s] of pat.dying) {
            const [oq, or] = orient([q, r], turnRef.current)
            const [x, y] = fromAxial(aq + oq, ar + or)
            w.cells[wrapIdx(x, y)] = s
          }
        }
        resetWatch()
        return
      }
      action = e.button === 2 || e.shiftKey || t === "erase" ? "erase" : "paint"
      lastCell = -1
      touchCell(e.clientX, e.clientY)
    }
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const r = canvas.getBoundingClientRect()
      if (pinch && pointers.size >= 2) {
        const f = pinchFrame()
        const ox = pinch.mx - r.left, oy = pinch.my - r.top
        zoomAbout(pinch.R * f.d / Math.max(1, pinch.d), ox, oy, pinch.R, pinch.vx, pinch.vy)
        view.x += f.mx - pinch.mx; view.y += f.my - pinch.my
        return
      }
      if (toolRef.current === "stamp") { hover = cellAt(e.clientX, e.clientY); dirtyRef.current = true }
      if (action === "pan") { view.x = panStart.vx + e.clientX - panStart.x; view.y = panStart.vy + e.clientY - panStart.y; dirtyRef.current = true }
      else if (action === "paint" || action === "erase") touchCell(e.clientX, e.clientY)
    }
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (!pointers.size) action = "none"
    }
    const leave = () => { hover = null; dirtyRef.current = true }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      zoomAbout(view.R * Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.0025), e.clientX - r.left, e.clientY - r.top)
    }
    const noMenu = (e: Event) => e.preventDefault()
    canvas.addEventListener("pointerdown", down)
    canvas.addEventListener("pointermove", move)
    canvas.addEventListener("pointerup", up)
    canvas.addEventListener("pointercancel", up)
    canvas.addEventListener("pointerleave", leave)
    canvas.addEventListener("wheel", wheel, { passive: false })
    canvas.addEventListener("contextmenu", noMenu)
    const ro = new ResizeObserver(resizeCanvas)
    ro.observe(canvas)
    return () => {
      stopLoop()
      ro.disconnect()
      canvas.removeEventListener("pointerdown", down)
      canvas.removeEventListener("pointermove", move)
      canvas.removeEventListener("pointerup", up)
      canvas.removeEventListener("pointercancel", up)
      canvas.removeEventListener("pointerleave", leave)
      canvas.removeEventListener("wheel", wheel)
      canvas.removeEventListener("contextmenu", noMenu)
    }
  }, [resetWatch])

  // repaint when the colour mode or stamp orientation changes
  useEffect(() => { dirtyRef.current = true }, [colorMode, turn, patternIdx])

  const rule = ruleRef.current
  const countOn = (t: Uint8Array, n: number) => {
    const masks = [...Array(64).keys()].filter((m) => bitCount(m) === n)
    const k = masks.filter((m) => t[m]).length
    return k === 0 ? "off" : k === masks.length ? "on" : "part"
  }
  const v = readout.verdict
  const verdictText = v.kind === "dead" ? `died out at gen ${v.gen}`
    : v.kind === "cycle" ? (v.period === 1 ? `still since gen ${v.since}` : `period ${v.period} since gen ${v.since}`)
    : "still changing"

  return (
    <div className={styles.fsRoot} data-embedded={programHost.embedded || undefined}>
      <canvas ref={canvasRef} className={styles.canvas} data-tool={tool} />

      <button className={styles.menuToggle} onClick={() => setMenuOpen((o) => !o)} title={menuOpen ? "Hide controls (H)" : "Show controls (H)"}>
        {menuOpen ? "‹ hide" : "☰ controls"}
      </button>
      <button className={styles.closeBtn} onClick={close} title="Close (Esc)" aria-label="Close Hex Life">✕</button>

      {menuOpen && (
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Hex Life</h2>
          <p className={styles.panelSub}>Cellular automata on hexagons: six neighbours, on an endless tiled torus.</p>

          <div className={styles.row}>
            <button className={styles.primary} onClick={() => setPaused((p) => !p)}>{paused ? "▶ Play" : "❚❚ Pause"}</button>
            <button onClick={() => { stepFlag.current = true }}>Step</button>
          </div>
          <div className={styles.row}>
            <button onClick={reseed}>Reseed</button>
            <button onClick={clearAll}>Clear</button>
          </div>

          <div className={styles.readout}>
            <div className={styles.readoutLine}>
              <span>gen {readout.gen}</span>
              <span>pop {readout.pop}</span>
            </div>
            <Sparkline values={readout.history} />
            <div className={styles.verdict} data-kind={v.kind}>{verdictText}</div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Rules</label>
            <div className={styles.chips}>
              {HEXLIFE_PRESETS.map((p, i) => (
                <button key={p.name} className={`${styles.chip} ${presetIdx === i ? styles.chipActive : ""}`} onClick={() => choosePreset(i)} title={p.blurb}>{p.name}</button>
              ))}
            </div>
            {preset && <p className={styles.blurb}>{preset.blurb}</p>}
          </div>

          <div className={styles.group}>
            <label className={styles.label} htmlFor="hexlife-rule">Rule</label>
            <input
              id="hexlife-rule"
              className={styles.ruleInput}
              value={ruleText}
              spellCheck={false}
              onChange={(e) => { setPresetIdx(-1); applyRule(e.target.value) }}
              aria-invalid={!!ruleError}
            />
            <p className={styles.ruleHint} data-error={!!ruleError || undefined}>
              {ruleError || <>canonical {rule.text}. Letters split 2, 3 and 4 by shape: o side by side, m one apart, p opposite.</>}
            </p>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Born with</label>
            <div className={styles.chips}>
              {[1, 2, 3, 4, 5, 6].map((n) => {
                const s = countOn(rule.birth, n)
                return <button key={n} className={`${styles.numChip} ${s !== "off" ? styles.chipActive : ""}`} data-part={s === "part" || undefined} onClick={() => toggleCount("b", n)}>{n}</button>
              })}
            </div>
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Survives with</label>
            <div className={styles.chips}>
              {[0, 1, 2, 3, 4, 5, 6].map((n) => {
                const s = countOn(rule.survive, n)
                return <button key={n} className={`${styles.numChip} ${s !== "off" ? styles.chipActive : ""}`} data-part={s === "part" || undefined} onClick={() => toggleCount("s", n)}>{n}</button>
              })}
            </div>
          </div>

          {patterns.length > 0 && (
            <div className={styles.group}>
              <label className={styles.label}>Found in this rule</label>
              <div className={styles.chips}>
                {patterns.map((p, i) => (
                  <button
                    key={p.name}
                    className={`${styles.chip} ${tool === "stamp" && patternIdx === i ? styles.chipActive : ""}`}
                    onClick={() => { setPatternIdx(i); setTool("stamp") }}
                    title={p.note}
                  >{p.name}</button>
                ))}
              </div>
              {tool === "stamp" && patterns[patternIdx] && <p className={styles.blurb}>{patterns[patternIdx].note} <span className="on-desktop">[ and ] turn it.</span></p>}
            </div>
          )}

          <div className={styles.group}>
            <label className={styles.label}>Draw</label>
            <div className={styles.chips}>
              {(["paint", "erase", "stamp", "pan"] as const).map((t) => (
                <button key={t} className={`${styles.chip} ${tool === t ? styles.chipActive : ""}`} onClick={() => setTool(t)} disabled={t === "stamp" && !patterns.length}>{t}</button>
              ))}
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Seed</label>
            <div className={styles.chips}>
              {([["soup", "Soup"], ["field", "Field"], ["mirror", "Mirrored"]] as const).map(([k, name]) => (
                <button key={k} className={`${styles.chip} ${seedKind === k ? styles.chipActive : ""}`} onClick={() => { setSeedKind(k); seedKindRef.current = k; reseed() }}>{name}</button>
              ))}
            </div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={autoSoup} onChange={(e) => setAutoSoup(e.target.checked)} />
              New soup when this one settles
            </label>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Speed: {speed} gen/s</label>
            <input type="range" min={1} max={60} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Seed density: {Math.round(density * 100)}%</label>
            <input type="range" min={2} max={80} value={Math.round(density * 100)} onChange={(e) => setDensity(+e.target.value / 100)} />
          </div>

          <div className={styles.group}>
            <label className={styles.label}>World</label>
            <div className={styles.chips}>
              {SIZES.map((n) => <button key={n} className={`${styles.chip} ${size === n ? styles.chipActive : ""}`} onClick={() => resize(n)}>{n}²</button>)}
            </div>
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Colour</label>
            <div className={styles.chips}>
              {COLOR_MODES.map((c) => (
                <button key={c.id} className={`${styles.chip} ${colorMode === c.id ? styles.chipActive : ""}`} onClick={() => setColorMode(c.id)}>{c.name}</button>
              ))}
            </div>
          </div>

          <p className={styles.meta}>
            <span className="on-desktop">draw with the tool · right-click or shift erases · alt- or middle-drag pans · scroll zooms<br />space play · N step · R reseed · C clear · S stamp · [ ] turn · H hide</span>
            <span className="on-touch">one finger uses the tool · two fingers pan and pinch</span>
          </p>
        </div>
      )}
    </div>
  )
}

function bitCount(m: number) { let c = 0; for (let i = 0; i < 6; i++) c += (m >> i) & 1; return c }
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <svg className={styles.spark} viewBox="0 0 100 24" aria-hidden="true" />
  const max = Math.max(1, ...values), min = Math.min(...values)
  const span = Math.max(1, max - min)
  const pts = values.map((v, i) => `${(i / (HISTORY - 1)) * 100},${22 - ((v - min) / span) * 20}`).join(" ")
  return (
    <svg className={styles.spark} viewBox="0 0 100 24" preserveAspectRatio="none" aria-label={`population, last ${values.length} generations`}>
      <polyline points={pts} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
