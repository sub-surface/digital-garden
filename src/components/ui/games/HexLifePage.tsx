import { useEffect, useRef, useState, useCallback } from "react"
import styles from "./HexLifePage.module.scss"

/**
 * Hex Life — a fullscreen cellular-automaton playground on a hexagonal grid
 * (each cell has 6 neighbours, not 8). In the same family as the neural-CA work
 * behind HeXO Theory: simple local rules, complex emergent worlds.
 *
 * Rules are birth/survive neighbour-count sets (B/S, adapted to the 0..6 hex
 * neighbourhood). Fullscreen canvas, live parameter menu, pan/zoom, paint to seed.
 * Inspired by MaxRobinsonTheGreat/turmites.
 */

// Pointy-top "odd-r" offset-grid neighbour deltas (depend on row parity).
const NB_EVEN: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1],
]
const NB_ODD: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [1, -1], [1, 1], [0, -1], [0, 1],
]

interface Rule {
  name: string
  birth: number[]
  survive: number[]
  blurb: string
}

const PRESETS: Rule[] = [
  // The hex analog of Conway's B3/S23: on a 6-neighbour grid, B2/S34 gives the
  // closest balance of growth and decay — Life-like gliders, blinkers, and still
  // lifes rather than runaway fill or instant death.
  { name: "Conway (hex)", birth: [2], survive: [3, 4], blurb: "the hex analog of Conway's Life — gliders & blinkers" },
  { name: "Coral", birth: [2], survive: [3, 4, 5, 6], blurb: "grows like coral, fills space" },
  { name: "Drift", birth: [2], survive: [2, 3], blurb: "wandering clusters" },
  { name: "Maze", birth: [2], survive: [1, 2, 3, 4, 5], blurb: "branching corridors" },
  { name: "Pulse", birth: [3], survive: [2, 3], blurb: "oscillating clusters" },
  { name: "Decay", birth: [3, 4], survive: [3], blurb: "burns to embers" },
  { name: "Lace", birth: [1], survive: [1, 2], blurb: "delicate filigree" },
  { name: "Bloom", birth: [2, 3], survive: [3, 4], blurb: "flowering fronts" },
]

type ColorMode = "accent" | "rainbow" | "age" | "mono"
const COLOR_MODES: { id: ColorMode; name: string }[] = [
  { id: "accent", name: "Accent" },
  { id: "age", name: "Age" },
  { id: "rainbow", name: "Rainbow" },
  { id: "mono", name: "Mono" },
]

export function HexLifePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // grid dimensions scale with cell size; stored in refs so the sim loop reads live values
  const colsRef = useRef(0)
  const rowsRef = useRef(0)
  const gridRef = useRef<Uint8Array>(new Uint8Array(0))   // 0 = dead, else age (clamped)
  const nextRef = useRef<Uint8Array>(new Uint8Array(0))

  // --- parameters (state for UI + refs for the loop) ---
  const [hexSize, setHexSize] = useState(10)
  const hexSizeRef = useRef(hexSize); hexSizeRef.current = hexSize
  const [speed, setSpeed] = useState(12)          // generations/sec
  const speedRef = useRef(speed); speedRef.current = speed
  const [birth, setBirth] = useState<number[]>(PRESETS[0].birth)
  const birthRef = useRef(birth); birthRef.current = birth
  const [survive, setSurvive] = useState<number[]>(PRESETS[0].survive)
  const surviveRef = useRef(survive); surviveRef.current = survive
  const [wrap, setWrap] = useState(true)
  const wrapRef = useRef(wrap); wrapRef.current = wrap
  const [colorMode, setColorMode] = useState<ColorMode>("accent")
  const colorModeRef = useRef(colorMode); colorModeRef.current = colorMode
  const [density, setDensity] = useState(0.32)
  const densityRef = useRef(density); densityRef.current = density

  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused); pausedRef.current = paused
  const stepFlag = useRef(false)
  const [gen, setGen] = useState(0)
  const [pop, setPop] = useState(0)
  const [menuOpen, setMenuOpen] = useState(true)
  const [activePreset, setActivePreset] = useState(0)

  // pan offset (px), in screen space
  const panRef = useRef({ x: 0, y: 0 })

  const allocGrid = useCallback((cols: number, rows: number, seed: boolean) => {
    const g = new Uint8Array(cols * rows)
    if (seed) {
      const d = densityRef.current
      for (let i = 0; i < g.length; i++) g[i] = Math.random() < d ? 1 : 0
    }
    colsRef.current = cols
    rowsRef.current = rows
    gridRef.current = g
    nextRef.current = new Uint8Array(cols * rows)
  }, [])

  const seedRandom = useCallback(() => {
    const g = gridRef.current
    const d = densityRef.current
    for (let i = 0; i < g.length; i++) g[i] = Math.random() < d ? 1 : 0
    setGen(0)
  }, [])

  const clearAll = useCallback(() => { gridRef.current.fill(0); setGen(0) }, [])

  const applyPreset = useCallback((i: number) => {
    setActivePreset(i)
    setBirth([...PRESETS[i].birth])
    setSurvive([...PRESETS[i].survive])
  }, [])

  const toggleSet = (which: "b" | "s", n: number) => {
    setActivePreset(-1)
    if (which === "b") {
      setBirth((cur) => cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort())
    } else {
      setSurvive((cur) => cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort())
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    const computeGrid = () => {
      const R = hexSizeRef.current
      const hw = Math.sqrt(3) * R
      const vh = 1.5 * R
      const cols = Math.max(8, Math.ceil(canvas.clientWidth / hw) + 2)
      const rows = Math.max(8, Math.ceil(canvas.clientHeight / vh) + 2)
      return { R, hw, vh, cols, rows }
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(canvas.clientWidth * dpr)
      canvas.height = Math.floor(canvas.clientHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const { cols, rows } = computeGrid()
      // reallocate only if dimensions changed; preserve overlap of existing pattern
      if (cols !== colsRef.current || rows !== rowsRef.current) {
        const old = gridRef.current
        const oc = colsRef.current, orr = rowsRef.current
        allocGrid(cols, rows, old.length === 0)
        if (old.length) {
          const g = gridRef.current
          for (let y = 0; y < Math.min(rows, orr); y++)
            for (let x = 0; x < Math.min(cols, oc); x++)
              g[y * cols + x] = old[y * oc + x]
        }
      }
    }
    resize()

    const accentVar = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").trim() || "#b4424c"
    const surfaceVar = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-bg-surface").trim() || "#1a1a1f"

    const step = () => {
      const cols = colsRef.current, rows = rowsRef.current
      const g = gridRef.current, n = nextRef.current
      const B = birthRef.current, S = surviveRef.current
      const wr = wrapRef.current
      for (let y = 0; y < rows; y++) {
        const nb = (y & 1) ? NB_ODD : NB_EVEN
        for (let x = 0; x < cols; x++) {
          let count = 0
          for (let k = 0; k < 6; k++) {
            let nx = x + nb[k][0], ny = y + nb[k][1]
            if (wr) { nx = (nx + cols) % cols; ny = (ny + rows) % rows }
            else if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
            if (g[ny * cols + nx]) count++
          }
          const cur = g[y * cols + x]
          let v: number
          if (cur) v = S.includes(count) ? Math.min(cur + 1, 250) : 0
          else v = B.includes(count) ? 1 : 0
          n[y * cols + x] = v
        }
      }
      gridRef.current = n
      nextRef.current = g
    }

    const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`

    const render = () => {
      const cols = colsRef.current, rows = rowsRef.current
      const g = gridRef.current
      const { R, hw, vh } = computeGrid()
      const pan = panRef.current
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      const live = accentVar()
      const cell = surfaceVar()
      const cm = colorModeRef.current
      let live_count = 0

      for (let y = 0; y < rows; y++) {
        const cy = vh * y + R + pan.y
        if (cy < -R || cy > canvas.clientHeight + R) continue
        for (let x = 0; x < cols; x++) {
          const cx = hw * (x + (y & 1 ? 1 : 0.5)) + pan.x
          if (cx < -R || cx > canvas.clientWidth + R) continue
          const age = g[y * cols + x]
          // hex path
          ctx.beginPath()
          for (let i = 0; i < 6; i++) {
            const ang = Math.PI / 180 * (60 * i - 90)
            const px = cx + R * 0.9 * Math.cos(ang)
            const py = cy + R * 0.9 * Math.sin(ang)
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
          }
          ctx.closePath()
          if (age) {
            live_count++
            if (cm === "accent") ctx.fillStyle = live
            else if (cm === "mono") ctx.fillStyle = "#e8e8ea"
            else if (cm === "age") ctx.fillStyle = hsl(0, 0, Math.min(35 + age * 4, 92))
            else ctx.fillStyle = hsl((x * 7 + y * 11) % 360, 70, 60) // rainbow by position
            ctx.fill()
          } else {
            ctx.fillStyle = cell
            ctx.globalAlpha = 0.22
            ctx.fill()
            ctx.globalAlpha = 1
          }
        }
      }
      return live_count
    }

    let raf = 0, acc = 0, last = 0, frameCount = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (!last) last = t
      acc += t - last
      last = t
      const stepMs = 1000 / Math.max(1, speedRef.current)
      let advanced = false
      if (stepFlag.current) { step(); stepFlag.current = false; advanced = true; acc = 0 }
      else if (!pausedRef.current) {
        while (acc >= stepMs) { step(); acc -= stepMs; advanced = true }
      }
      const lc = render()
      // throttle React state updates to ~6/sec
      if (advanced && (frameCount++ & 7) === 0) {
        if (!pausedRef.current || stepFlag.current) setGen((v) => v + 1)
        setPop(lc)
      }
    }
    raf = requestAnimationFrame(loop)

    // --- interaction: paint + pan ---
    let mode: "none" | "paint" | "erase" | "pan" = "none"
    let panStart = { x: 0, y: 0, ox: 0, oy: 0 }

    const cellAt = (clientX: number, clientY: number): number => {
      const r = canvas.getBoundingClientRect()
      const { R, hw, vh } = computeGrid()
      const pan = panRef.current
      const px = clientX - r.left - pan.x
      const py = clientY - r.top - pan.y
      const cols = colsRef.current, rows = rowsRef.current
      const ey = Math.round((py - R) / vh)
      const ex = Math.round(px / hw - (ey & 1 ? 1 : 0.5))
      let best = -1, bestD = Infinity
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = ex + dx, ny = ey + dy
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
          const cx = hw * (nx + (ny & 1 ? 1 : 0.5))
          const cy = vh * ny + R
          const d = (cx - px) ** 2 + (cy - py) ** 2
          if (d < bestD) { bestD = d; best = ny * cols + nx }
        }
      return best
    }

    const down = (e: MouseEvent) => {
      if (e.button === 1 || e.altKey) {
        mode = "pan"
        panStart = { x: e.clientX, y: e.clientY, ox: panRef.current.x, oy: panRef.current.y }
        return
      }
      mode = (e.button === 2 || e.shiftKey) ? "erase" : "paint"
      const c = cellAt(e.clientX, e.clientY)
      if (c >= 0) gridRef.current[c] = mode === "erase" ? 0 : 1
    }
    const move = (e: MouseEvent) => {
      if (mode === "pan") {
        panRef.current = { x: panStart.ox + (e.clientX - panStart.x), y: panStart.oy + (e.clientY - panStart.y) }
      } else if (mode === "paint" || mode === "erase") {
        const c = cellAt(e.clientX, e.clientY)
        if (c >= 0) gridRef.current[c] = mode === "erase" ? 0 : 1
      }
    }
    const up = () => { mode = "none" }
    const ctxMenu = (e: Event) => e.preventDefault()
    const tStart = (e: TouchEvent) => {
      if (e.touches[0]) { mode = "paint"; const c = cellAt(e.touches[0].clientX, e.touches[0].clientY); if (c >= 0) gridRef.current[c] = 1 }
    }
    const tMove = (e: TouchEvent) => {
      if (mode === "paint" && e.touches[0]) { e.preventDefault(); const c = cellAt(e.touches[0].clientX, e.touches[0].clientY); if (c >= 0) gridRef.current[c] = 1 }
    }

    canvas.addEventListener("mousedown", down)
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    canvas.addEventListener("contextmenu", ctxMenu)
    canvas.addEventListener("touchstart", tStart, { passive: true })
    canvas.addEventListener("touchmove", tMove, { passive: false })
    canvas.addEventListener("touchend", up)
    window.addEventListener("resize", resize)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener("mousedown", down)
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
      canvas.removeEventListener("contextmenu", ctxMenu)
      canvas.removeEventListener("touchstart", tStart)
      canvas.removeEventListener("touchmove", tMove)
      canvas.removeEventListener("touchend", up)
      window.removeEventListener("resize", resize)
    }
  }, [allocGrid])

  return (
    <div className={styles.fsRoot}>
      <canvas ref={canvasRef} className={styles.canvas} />

      <button
        className={styles.menuToggle}
        onClick={() => setMenuOpen((o) => !o)}
        title={menuOpen ? "Hide controls" : "Show controls"}
      >
        {menuOpen ? "‹ hide" : "☰ controls"}
      </button>

      {menuOpen && (
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Hex Life</h2>
          <p className={styles.panelSub}>Cellular automata on hexagons — six neighbours, B/S rules.</p>

          <div className={styles.row}>
            <button className={styles.primary} onClick={() => setPaused((p) => !p)}>
              {paused ? "▶ Play" : "❚❚ Pause"}
            </button>
            <button onClick={() => { stepFlag.current = true }}>Step</button>
          </div>
          <div className={styles.row}>
            <button onClick={seedRandom}>Random</button>
            <button onClick={clearAll}>Clear</button>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Presets</label>
            <div className={styles.chips}>
              {PRESETS.map((r, i) => (
                <button
                  key={r.name}
                  className={`${styles.chip} ${activePreset === i ? styles.chipActive : ""}`}
                  onClick={() => applyPreset(i)}
                  title={r.blurb}
                >{r.name}</button>
              ))}
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Birth (neighbours → a cell is born)</label>
            <div className={styles.chips}>
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} className={`${styles.numChip} ${birth.includes(n) ? styles.chipActive : ""}`} onClick={() => toggleSet("b", n)}>{n}</button>
              ))}
            </div>
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Survive (neighbours → a cell lives)</label>
            <div className={styles.chips}>
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} className={`${styles.numChip} ${survive.includes(n) ? styles.chipActive : ""}`} onClick={() => toggleSet("s", n)}>{n}</button>
              ))}
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Speed — {speed} gen/s</label>
            <input type="range" min={1} max={60} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Cell size — {hexSize}px</label>
            <input type="range" min={4} max={28} value={hexSize} onChange={(e) => setHexSize(+e.target.value)} />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Seed density — {Math.round(density * 100)}%</label>
            <input type="range" min={2} max={80} value={Math.round(density * 100)} onChange={(e) => setDensity(+e.target.value / 100)} />
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Colour</label>
            <div className={styles.chips}>
              {COLOR_MODES.map((c) => (
                <button key={c.id} className={`${styles.chip} ${colorMode === c.id ? styles.chipActive : ""}`} onClick={() => setColorMode(c.id)}>{c.name}</button>
              ))}
            </div>
          </div>

          <label className={styles.checkRow}>
            <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
            Wrap edges (toroidal)
          </label>

          <p className={styles.meta}>
            B{birth.join("")}/S{survive.join("")} · gen {gen} · pop {pop}<br />
            paint to draw · shift/right-click erase · alt-drag to pan
          </p>
        </div>
      )}
    </div>
  )
}
