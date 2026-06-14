import { useEffect, useRef, useState } from "react"
import styles from "./SandPage.module.scss"

/**
 * Falling-sand sandbox — a small cellular automaton. Paint sand, water, wall,
 * plant, and fire; watch them interact (water makes plant grow, fire eats
 * plant and is quenched by water). A toy, no goal.
 */

const COLS = 120
const ROWS = 80

const EMPTY = 0
const SAND = 1
const WATER = 2
const WALL = 3
const PLANT = 4
const FIRE = 5

type Mat = typeof EMPTY | typeof SAND | typeof WATER | typeof WALL | typeof PLANT | typeof FIRE

const MATERIALS: { id: Mat; name: string; color: string }[] = [
  { id: SAND, name: "Sand", color: "#c9a86a" },
  { id: WATER, name: "Water", color: "#3a7ca8" },
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
  [FIRE]: [200, 84, 58],
}

export function SandPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [brush, setBrush] = useState<Mat>(SAND)
  const brushRef = useRef<Mat>(brush)
  brushRef.current = brush
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const gridRef = useRef<Uint8Array>(new Uint8Array(COLS * ROWS))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const img = ctx.createImageData(COLS, ROWS)
    const grid = gridRef.current
    const idx = (x: number, y: number) => y * COLS + x

    const swap = (a: number, b: number) => { const t = grid[a]; grid[a] = grid[b]; grid[b] = t }

    const stepSim = () => {
      // bottom-up so falling materials settle in one pass
      for (let y = ROWS - 1; y >= 0; y--) {
        // alternate scan direction to avoid bias
        const ltr = y % 2 === 0
        for (let k = 0; k < COLS; k++) {
          const x = ltr ? k : COLS - 1 - k
          const i = idx(x, y)
          const m = grid[i]
          if (m === EMPTY || m === WALL) continue

          if (m === SAND) {
            if (y + 1 < ROWS) {
              const below = idx(x, y + 1)
              if (grid[below] === EMPTY || grid[below] === WATER) { swap(i, below); continue }
              for (const dx of Math.random() < 0.5 ? [-1, 1] : [1, -1]) {
                const nx = x + dx
                if (nx >= 0 && nx < COLS) {
                  const d = idx(nx, y + 1)
                  if (grid[d] === EMPTY) { swap(i, d); break }
                }
              }
            }
          } else if (m === WATER) {
            if (y + 1 < ROWS && grid[idx(x, y + 1)] === EMPTY) { swap(i, idx(x, y + 1)); continue }
            const dir = Math.random() < 0.5 ? [-1, 1] : [1, -1]
            let moved = false
            for (const dx of dir) {
              const nx = x + dx
              if (nx >= 0 && nx < COLS && grid[idx(nx, y)] === EMPTY) { swap(i, idx(nx, y)); moved = true; break }
            }
            if (moved) continue
          } else if (m === FIRE) {
            // fire rises, dies out, spreads to plant, quenched by water nearby
            let quenched = false
            for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
              const nx = x + dx, ny = y + dy
              if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
              const ni = idx(nx, ny)
              if (grid[ni] === WATER) quenched = true
              if (grid[ni] === PLANT && Math.random() < 0.35) grid[ni] = FIRE
            }
            if (quenched || Math.random() < 0.06) { grid[i] = EMPTY; continue }
            if (y - 1 >= 0 && grid[idx(x, y - 1)] === EMPTY && Math.random() < 0.4) swap(i, idx(x, y - 1))
          } else if (m === PLANT) {
            // plant grows upward into empty when adjacent to water
            let nearWater = false
            for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
              const nx = x + dx, ny = y + dy
              if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
              if (grid[idx(nx, ny)] === WATER) nearWater = true
            }
            if (nearWater && y - 1 >= 0 && grid[idx(x, y - 1)] === EMPTY && Math.random() < 0.08) {
              grid[idx(x, y - 1)] = PLANT
            }
          }
        }
      }
    }

    const render = () => {
      const data = img.data
      for (let i = 0; i < grid.length; i++) {
        const m = grid[i]
        const p = i * 4
        if (m === EMPTY) { data[p] = 14; data[p + 1] = 14; data[p + 2] = 16; data[p + 3] = 255 }
        else {
          const [r, g, b] = COLOR[m]
          data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
    }

    let raf = 0
    let acc = 0
    let last = 0
    const STEP_MS = 28
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (!last) last = t
      acc += t - last
      last = t
      if (!pausedRef.current && acc >= STEP_MS) { stepSim(); acc = 0 }
      render()
    }
    raf = requestAnimationFrame(loop)

    // painting
    let painting = false
    const paintAt = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect()
      const cx = Math.floor(((clientX - r.left) / r.width) * COLS)
      const cy = Math.floor(((clientY - r.top) / r.height) * ROWS)
      const rad = 2
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
          if (dx * dx + dy * dy > rad * rad + 1) continue
          // don't overwrite walls unless erasing/painting wall
          grid[idx(nx, ny)] = brushRef.current
        }
      }
    }
    const down = (e: MouseEvent) => { painting = true; paintAt(e.clientX, e.clientY) }
    const move = (e: MouseEvent) => { if (painting) paintAt(e.clientX, e.clientY) }
    const up = () => { painting = false }
    const tStart = (e: TouchEvent) => { painting = true; if (e.touches[0]) paintAt(e.touches[0].clientX, e.touches[0].clientY) }
    const tMove = (e: TouchEvent) => { if (painting && e.touches[0]) { e.preventDefault(); paintAt(e.touches[0].clientX, e.touches[0].clientY) } }
    canvas.addEventListener("mousedown", down)
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    canvas.addEventListener("touchstart", tStart, { passive: true })
    canvas.addEventListener("touchmove", tMove, { passive: false })
    canvas.addEventListener("touchend", up)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener("mousedown", down)
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
      canvas.removeEventListener("touchstart", tStart)
      canvas.removeEventListener("touchmove", tMove)
      canvas.removeEventListener("touchend", up)
    }
  }, [])

  const clearAll = () => { gridRef.current.fill(EMPTY) }

  return (
    <div className={styles.sandContainer}>
      <header className={styles.header}>
        <h1>Sandbox</h1>
        <p>Paint materials and watch them fall, flow, grow, and burn.</p>
      </header>

      <div className={styles.stage}>
        <canvas ref={canvasRef} width={COLS} height={ROWS} className={styles.canvas} />
      </div>

      <div className={styles.palette}>
        {MATERIALS.map((m) => (
          <button
            key={m.id}
            className={`${styles.swatch} ${brush === m.id ? styles.active : ""}`}
            onClick={() => setBrush(m.id)}
          >
            <span className={styles.dot} style={{ background: m.color, border: m.id === EMPTY ? "1px dashed currentColor" : "none" }} />
            {m.name}
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <button onClick={() => setPaused((p) => !p)}>{paused ? "Play" : "Pause"}</button>
        <button onClick={clearAll}>Clear</button>
      </div>
    </div>
  )
}
