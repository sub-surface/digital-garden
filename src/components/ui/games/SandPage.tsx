import { useEffect, useRef, useState } from "react"
import { startFrameLoop } from "./useGameLoop"
import { ignoreGameKey } from "./gameUtils"
import styles from "./SandPage.module.scss"

/**
 * Falling-sand sandbox — a small cellular automaton. Paint sand, water, oil,
 * wall, plant and fire; watch them interact. Water feeds plants, fire eats
 * plants and oil, water quenches fire and boils to steam, steam rises and
 * condenses back to rain, oil floats on water. A toy, no goal.
 *
 * Each cell moves at most once per tick (the `stamp` array): scanning
 * bottom-up, a particle that moved *up* into a row not yet scanned used to be
 * moved again, so fire shot up a whole column in one frame and water
 * teleported across a row.
 */

const COLS = 120
const ROWS = 80

const EMPTY = 0
const SAND = 1
const WATER = 2
const WALL = 3
const PLANT = 4
const FIRE = 5
const STEAM = 6
const OIL = 7

type Mat = number

const MATERIALS: { id: Mat; name: string; color: string }[] = [
  { id: SAND, name: "Sand", color: "#c9a86a" },
  { id: WATER, name: "Water", color: "#3a7ca8" },
  { id: OIL, name: "Oil", color: "#6b4f2a" },
  { id: WALL, name: "Wall", color: "#5a5a62" },
  { id: PLANT, name: "Plant", color: "#5a9e5a" },
  { id: FIRE, name: "Fire", color: "#c8543a" },
  { id: EMPTY, name: "Erase", color: "transparent" },
]

const COLOR: Record<number, [number, number, number]> = {
  [SAND]: [201, 168, 106],
  [WATER]: [58, 124, 168],
  [WALL]: [90, 90, 98],
  [PLANT]: [90, 158, 90],
  [FIRE]: [214, 92, 52],
  [STEAM]: [170, 182, 196],
  [OIL]: [107, 79, 42],
}
/** How much each material's per-cell grain varies its colour (±). */
const GRAIN: Record<number, number> = { [SAND]: 22, [WATER]: 8, [WALL]: 10, [PLANT]: 18, [FIRE]: 40, [STEAM]: 14, [OIL]: 8 }
const LIQUID = (m: number) => m === WATER || m === OIL

export function SandPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [brush, setBrush] = useState<Mat>(SAND)
  const brushRef = useRef<Mat>(brush)
  brushRef.current = brush
  const [radius, setRadius] = useState(2)
  const radiusRef = useRef(radius)
  radiusRef.current = radius
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const gridRef = useRef<Uint8Array>(new Uint8Array(COLS * ROWS))

  // 1–7 pick a material · Space pause · C clear · [ ] brush size.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= MATERIALS.length) setBrush(MATERIALS[n - 1].id)
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p) }
      else if (e.key === "c" || e.key === "C") gridRef.current.fill(EMPTY)
      else if (e.key === "[") setRadius((r) => Math.max(0, r - 1))
      else if (e.key === "]") setRadius((r) => Math.min(8, r + 1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const img = ctx.createImageData(COLS, ROWS)
    const grid = gridRef.current
    // Per-cell colour jitter, so a heap of sand reads as grains, not a slab.
    const grain = new Int8Array(COLS * ROWS)
    for (let i = 0; i < grain.length; i++) grain[i] = Math.floor(Math.random() * 255) - 128
    const stamp = new Uint32Array(COLS * ROWS)
    let tick = 1
    const idx = (x: number, y: number) => y * COLS + x
    const inB = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS

    /** Move the particle at a to b (swapping whatever was there), marking both done. */
    const swap = (a: number, b: number) => {
      const t = grid[a]; grid[a] = grid[b]; grid[b] = t
      const g = grain[a]; grain[a] = grain[b]; grain[b] = g
      stamp[a] = tick; stamp[b] = tick
    }
    const set = (i: number, m: number) => { grid[i] = m; stamp[i] = tick }
    const N4 = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const

    const stepSim = () => {
      tick++
      for (let y = ROWS - 1; y >= 0; y--) {
        // alternate scan direction to avoid bias
        const ltr = (y + tick) % 2 === 0
        for (let k = 0; k < COLS; k++) {
          const x = ltr ? k : COLS - 1 - k
          const i = idx(x, y)
          const m = grid[i]
          if (m === EMPTY || m === WALL || stamp[i] === tick) continue

          if (m === SAND) {
            if (y + 1 >= ROWS) continue
            const below = idx(x, y + 1)
            // Sand sinks through liquids (they rise into its place).
            if (grid[below] === EMPTY || (LIQUID(grid[below]) && Math.random() < 0.6)) { swap(i, below); continue }
            const s0 = Math.random() < 0.5 ? -1 : 1
            for (const sx of [s0, -s0]) {
              const nx = x + sx
              if (inB(nx, y + 1) && (grid[idx(nx, y + 1)] === EMPTY || LIQUID(grid[idx(nx, y + 1)]))) { swap(i, idx(nx, y + 1)); break }
            }
          } else if (m === WATER || m === OIL) {
            if (y + 1 < ROWS) {
              const below = idx(x, y + 1)
              if (grid[below] === EMPTY) { swap(i, below); continue }
              // Oil floats: water under-swaps any oil beneath it.
              if (m === WATER && grid[below] === OIL) { swap(i, below); continue }
            }
            const s0 = Math.random() < 0.5 ? -1 : 1
            let moved = false
            for (const sx of [s0, -s0]) {
              const nx = x + sx
              if (!inB(nx, y)) continue
              if (y + 1 < ROWS && grid[idx(nx, y + 1)] === EMPTY) { swap(i, idx(nx, y + 1)); moved = true; break }
            }
            if (moved) continue
            // Spread sideways up to a few cells (oil is thicker).
            const reach = m === WATER ? 3 : 1
            for (const sx of [s0, -s0]) {
              let tx = x
              for (let r = 1; r <= reach; r++) {
                const nx = x + sx * r
                if (!inB(nx, y) || grid[idx(nx, y)] !== EMPTY) break
                tx = nx
              }
              if (tx !== x) { swap(i, idx(tx, y)); break }
            }
          } else if (m === FIRE) {
            // fire spreads to plant and oil, boils water to steam, flickers out
            let quenched = false
            for (const [dx, dy] of N4) {
              const nx = x + dx, ny = y + dy
              if (!inB(nx, ny)) continue
              const ni = idx(nx, ny)
              if (grid[ni] === WATER) { quenched = true; if (Math.random() < 0.5) set(ni, STEAM) }
              else if (grid[ni] === PLANT && Math.random() < 0.3) set(ni, FIRE)
              else if (grid[ni] === OIL && Math.random() < 0.55) set(ni, FIRE)
            }
            if (quenched) { set(i, Math.random() < 0.5 ? STEAM : EMPTY); continue }
            if (Math.random() < 0.07) { set(i, Math.random() < 0.25 ? STEAM : EMPTY); continue }
            const up = y - 1
            if (up >= 0) {
              const nx = x + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.4 ? 1 : 0)
              if (inB(nx, up) && grid[idx(nx, up)] === EMPTY && Math.random() < 0.45) swap(i, idx(nx, up))
            }
          } else if (m === STEAM) {
            // rises and drifts; condenses back to rain now and then, mostly near the top
            if (Math.random() < (y < 6 ? 0.02 : 0.003)) { set(i, WATER); continue }
            const nx = x + (Math.random() < 0.5 ? -1 : 1)
            if (y - 1 >= 0 && grid[idx(x, y - 1)] === EMPTY) { swap(i, idx(x, y - 1)); continue }
            if (y - 1 >= 0 && inB(nx, y - 1) && grid[idx(nx, y - 1)] === EMPTY) { swap(i, idx(nx, y - 1)); continue }
            if (inB(nx, y) && grid[idx(nx, y)] === EMPTY) swap(i, idx(nx, y))
          } else if (m === PLANT) {
            // grows when it touches water, drinking some of it
            for (const [dx, dy] of N4) {
              const nx = x + dx, ny = y + dy
              if (!inB(nx, ny) || grid[idx(nx, ny)] !== WATER || Math.random() > 0.06) continue
              const gx = x + (Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0)
              const gy = y - 1
              if (inB(gx, gy) && grid[idx(gx, gy)] === EMPTY) {
                set(idx(gx, gy), PLANT)
                if (Math.random() < 0.3) set(idx(nx, ny), EMPTY)
              }
              break
            }
          }
        }
      }
    }

    const bg = (() => {
      const light = getComputedStyle(document.documentElement).getPropertyValue("--color-overlay-tint").trim() === "#000"
      return light ? [236, 233, 226] : [14, 14, 16]
    })()
    const render = () => {
      const data = img.data
      for (let i = 0; i < grid.length; i++) {
        const m = grid[i]
        const p = i * 4
        if (m === EMPTY) { data[p] = bg[0]; data[p + 1] = bg[1]; data[p + 2] = bg[2]; data[p + 3] = 255; continue }
        const [r, g, b] = COLOR[m]
        const j = (grain[i] / 128) * (GRAIN[m] ?? 0) * (m === FIRE ? Math.random() + 0.3 : 1)
        data[p] = r + j; data[p + 1] = g + j; data[p + 2] = b + j * (m === FIRE ? 0.3 : 1); data[p + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
    }

    let acc = 0
    const STEP_MS = 28
    const stopLoop = startFrameLoop((dt) => {
      acc += dt
      if (!pausedRef.current && acc >= STEP_MS) { stepSim(); acc = 0 }
      render()
    })

    // painting
    let painting = false
    let lastX = -1, lastY = -1 // previous stroke cell, so fast drags paint a line, not dots
    const dab = (cx: number, cy: number) => {
      const rad = radiusRef.current
      const b = brushRef.current
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const nx = cx + dx, ny = cy + dy
          if (!inB(nx, ny)) continue
          if (dx * dx + dy * dy > rad * rad + 1) continue
          const i = idx(nx, ny)
          // don't overwrite walls unless erasing/painting wall
          if (grid[i] === WALL && b !== WALL && b !== EMPTY) continue
          // loose materials pour rather than fill solid, so a heap has texture
          if ((b === SAND || b === WATER || b === OIL) && grid[i] === EMPTY && Math.random() < 0.35) continue
          grid[i] = b
          grain[i] = Math.floor(Math.random() * 255) - 128
        }
      }
    }
    const paintAt = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect()
      const cx = Math.floor(((clientX - r.left) / r.width) * COLS)
      const cy = Math.floor(((clientY - r.top) / r.height) * ROWS)
      if (lastX < 0) dab(cx, cy)
      else {
        const n = Math.max(Math.abs(cx - lastX), Math.abs(cy - lastY), 1)
        for (let k = 1; k <= n; k++) dab(Math.round(lastX + ((cx - lastX) * k) / n), Math.round(lastY + ((cy - lastY) * k) / n))
      }
      lastX = cx; lastY = cy
    }
    // Holding still keeps pouring (a held mouse used to paint once and stop).
    let held: { x: number; y: number } | null = null
    const pour = setInterval(() => { if (painting && held) { lastX = -1; paintAt(held.x, held.y) } }, 60)
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      painting = true; lastX = -1; held = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture?.(e.pointerId)
      paintAt(e.clientX, e.clientY)
    }
    const move = (e: PointerEvent) => { if (painting) { held = { x: e.clientX, y: e.clientY }; paintAt(e.clientX, e.clientY) } }
    const up = () => { painting = false; lastX = -1; held = null }
    canvas.addEventListener("pointerdown", down)
    canvas.addEventListener("pointermove", move)
    canvas.addEventListener("pointerup", up)
    canvas.addEventListener("pointercancel", up)

    return () => {
      stopLoop()
      clearInterval(pour)
      canvas.removeEventListener("pointerdown", down)
      canvas.removeEventListener("pointermove", move)
      canvas.removeEventListener("pointerup", up)
      canvas.removeEventListener("pointercancel", up)
    }
  }, [])

  const clearAll = () => { gridRef.current.fill(EMPTY) }

  return (
    <div className={styles.sandContainer}>
      <header className={styles.header}>
        <h1>Sandbox</h1>
        <p>Paint materials and watch them fall, flow, grow, burn and boil.</p>
      </header>

      <div className={styles.stage}>
        <canvas ref={canvasRef} width={COLS} height={ROWS} className={styles.canvas} style={{ touchAction: "none" }} />
      </div>

      <div className={styles.palette}>
        {MATERIALS.map((m, i) => (
          <button
            key={m.id}
            className={`${styles.swatch} ${brush === m.id ? styles.active : ""}`}
            onClick={() => setBrush(m.id)}
            title={`${i + 1}`}
          >
            <span className={styles.dot} style={{ background: m.color, border: m.id === EMPTY ? "1px dashed currentColor" : "none" }} />
            {m.name}
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <button onClick={() => setPaused((p) => !p)}>{paused ? "Play" : "Pause"}</button>
        <button onClick={clearAll}>Clear</button>
        <label className={styles.brushSize}>
          brush
          <input type="range" min={0} max={8} value={radius} onChange={(e) => setRadius(+e.target.value)} />
        </label>
      </div>
      <p className={styles.keys}>
        <span className="on-desktop">1–7 material · [ ] brush · Space pause · C clear</span>
      </p>
    </div>
  )
}
