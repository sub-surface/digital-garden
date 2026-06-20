import { useEffect, useRef, useState } from "react"
import styles from "./GameOfLife.module.scss"

interface GameOfLifeProps {
  cols?: number
  rows?: number
  /** Pixels per cell for the backing canvas (display scales responsively). */
  cellPx?: number
  /** Initial live-cell probability when seeding. */
  density?: number
  /** Milliseconds per generation. */
  stepMs?: number
  /** Start running on mount. */
  autoplay?: boolean
  /** Caption under the board. Pass null for none. */
  caption?: string | null
}

/**
 * Conway's Game of Life — a single reusable square-grid implementation.
 *
 * Previously this logic lived inline inside `MachineGod.tsx` (the machine-god
 * article) while the arcade only had a *hexagonal* automaton (Hex Life). This
 * is the shared square-Conway engine: the article, the index, and the arcade
 * "Life" page all render this one component so behaviour can't drift.
 *
 * Toroidal grid, accent-coloured cells, click/drag to toggle (intervene),
 * reseed + play/pause.
 */
export function GameOfLife({
  cols = 64,
  rows = 40,
  cellPx = 5,
  density = 0.28,
  stepMs = 110,
  autoplay = true,
  caption = "Conway's Game of Life. Click cells to intervene.",
}: GameOfLifeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [running, setRunning] = useState(autoplay)
  const gridRef = useRef<Uint8Array | null>(null)

  const seed = () => {
    const g = new Uint8Array(cols * rows)
    for (let i = 0; i < g.length; i++) g[i] = Math.random() < density ? 1 : 0
    gridRef.current = g
  }
  const clear = () => {
    gridRef.current = new Uint8Array(cols * rows)
  }

  // (Re)seed when dimensions change.
  useEffect(() => {
    seed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let acc = 0
    let lastT = 0

    const draw = () => {
      const g = gridRef.current
      if (!g) return
      const cw = canvas.width / cols
      const ch = canvas.height / rows
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const accent =
        getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").trim() ||
        "#b4424c"
      ctx.fillStyle = accent
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (g[y * cols + x]) ctx.fillRect(x * cw, y * ch, cw - 0.5, ch - 0.5)
        }
      }
    }

    const step = () => {
      const g = gridRef.current
      if (!g) return
      const next = new Uint8Array(cols * rows)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let n = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue
              const nx = (x + dx + cols) % cols
              const ny = (y + dy + rows) % rows
              n += g[ny * cols + nx]
            }
          }
          const alive = g[y * cols + x]
          next[y * cols + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0
        }
      }
      gridRef.current = next
    }

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (!lastT) lastT = t
      acc += t - lastT
      lastT = t
      if (running && acc >= stepMs) {
        step()
        acc = 0
      }
      draw()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, cols, rows, stepMs])

  // Click / drag to toggle cells.
  const paint = (e: React.MouseEvent<HTMLCanvasElement>, force?: 0 | 1) => {
    const canvas = canvasRef.current
    const g = gridRef.current
    if (!canvas || !g) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * cols)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * rows)
    if (x < 0 || x >= cols || y < 0 || y >= rows) return
    g[y * cols + x] = force ?? (g[y * cols + x] ^ 1)
  }

  return (
    <div className={styles.gol}>
      <canvas
        ref={canvasRef}
        width={cols * cellPx}
        height={rows * cellPx}
        className={styles.canvas}
        onMouseDown={(e) => paint(e)}
        onMouseMove={(e) => { if (e.buttons === 1) paint(e, 1) }}
      />
      <div className={styles.controls}>
        <button className={styles.btn} onClick={seed}>Reseed</button>
        <button className={styles.btn} onClick={() => setRunning((r) => !r)}>
          {running ? "Pause" : "Play"}
        </button>
        <button className={styles.btn} onClick={clear}>Clear</button>
      </div>
      {caption && <p className={styles.caption}>{caption}</p>}
    </div>
  )
}
