import { useCallback, useEffect, useRef, useState } from "react"
import { sfx } from "@/lib/sfx"
import styles from "./TetrisPage.module.scss"

/**
 * Tetris — standard 10×20 well, 7-bag randomiser, soft/hard drop, wall kicks
 * kept simple. Themed monochrome: every piece is the site accent colour with a
 * subtle per-type opacity so shapes stay legible without a rainbow palette.
 */

const COLS = 10
const ROWS = 20

type Grid = number[][] // 0 empty, else piece-id (1..7)

interface Piece {
  cells: number[][] // rotation states share one cells def; we rotate dynamically
  id: number
}

// Each tetromino as a list of [x,y] offsets in its spawn orientation, plus a
// pivot for rotation. We rotate around the piece's bounding box.
const SHAPES: Record<string, { coords: number[][]; size: number }> = {
  I: { coords: [[0, 1], [1, 1], [2, 1], [3, 1]], size: 4 },
  O: { coords: [[1, 0], [2, 0], [1, 1], [2, 1]], size: 4 },
  T: { coords: [[1, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
  S: { coords: [[1, 0], [2, 0], [0, 1], [1, 1]], size: 3 },
  Z: { coords: [[0, 0], [1, 0], [1, 1], [2, 1]], size: 3 },
  J: { coords: [[0, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
  L: { coords: [[2, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
}
const KEYS = Object.keys(SHAPES)

interface Active {
  type: string
  cells: number[][] // absolute-ish [x,y] within the well
  id: number
}

const emptyGrid = (): Grid => Array.from({ length: ROWS }, () => Array(COLS).fill(0))

function makeBag(): string[] {
  const bag = [...KEYS]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

function spawn(type: string): Active {
  const s = SHAPES[type]
  const offsetX = Math.floor((COLS - s.size) / 2)
  return {
    type,
    id: KEYS.indexOf(type) + 1,
    cells: s.coords.map(([x, y]) => [x + offsetX, y]),
  }
}

function rotate(active: Active): number[][] {
  if (active.type === "O") return active.cells
  // rotate 90° CW around the piece centroid (rounded)
  const xs = active.cells.map((c) => c[0])
  const ys = active.cells.map((c) => c[1])
  const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2)
  const cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2)
  return active.cells.map(([x, y]) => [cx - (y - cy), cy + (x - cx)])
}

const collides = (grid: Grid, cells: number[][]) =>
  cells.some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x] !== 0))

export function TetrisPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<"ready" | "playing" | "paused" | "over">("ready")
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [best, setBest] = useState(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("tetris-best") : null
    return v ? parseInt(v, 10) : 0
  })

  const grid = useRef<Grid>(emptyGrid())
  const active = useRef<Active | null>(null)
  const bag = useRef<string[]>([])
  const next = useRef<string>("I")
  const dropAcc = useRef(0)
  const level = useRef(1)

  const pull = () => {
    if (bag.current.length === 0) bag.current = makeBag()
    return bag.current.pop()!
  }

  const reset = useCallback(() => {
    grid.current = emptyGrid()
    bag.current = makeBag()
    next.current = pull()
    active.current = spawn(pull())
    dropAcc.current = 0
    level.current = 1
    setScore(0); setLines(0)
  }, [])

  const start = useCallback(() => { reset(); setStatus("playing") }, [reset])

  const lockAndClear = useCallback(() => {
    const g = grid.current
    const a = active.current!
    a.cells.forEach(([x, y]) => { if (y >= 0) g[y][x] = a.id })
    sfx.play("lock")

    // clear full rows
    let cleared = 0
    for (let y = ROWS - 1; y >= 0; y--) {
      if (g[y].every((v) => v !== 0)) {
        g.splice(y, 1)
        g.unshift(Array(COLS).fill(0))
        cleared++
        y++ // recheck same index
      }
    }
    if (cleared > 0) {
      sfx.play(cleared === 4 ? "tetris" : "clear")
      const pts = [0, 100, 300, 500, 800][cleared] * level.current
      setScore((s) => s + pts)
      setLines((l) => {
        const nl = l + cleared
        level.current = Math.floor(nl / 10) + 1
        return nl
      })
    }

    // next piece
    const t = next.current
    next.current = pull()
    const na = spawn(t)
    if (collides(g, na.cells)) {
      setStatus("over")
      setBest((b) => {
        const nb = Math.max(b, scoreRef.current)
        localStorage.setItem("tetris-best", String(nb))
        return nb
      })
      sfx.play("death")
      active.current = null
      return
    }
    active.current = na
  }, [])

  // keep a ref of score for the game-over closure
  const scoreRef = useRef(0)
  useEffect(() => { scoreRef.current = score }, [score])

  const move = useCallback((dx: number, dy: number): boolean => {
    const a = active.current
    if (!a) return false
    const moved = a.cells.map(([x, y]) => [x + dx, y + dy])
    if (collides(grid.current, moved)) return false
    a.cells = moved
    return true
  }, [])

  const tryRotate = useCallback(() => {
    const a = active.current
    if (!a) return
    const rotated = rotate(a)
    // simple wall-kick: try offsets 0, -1, +1, -2, +2
    for (const dx of [0, -1, 1, -2, 2]) {
      const kicked = rotated.map(([x, y]) => [x + dx, y])
      if (!collides(grid.current, kicked)) {
        a.cells = kicked
        sfx.play("rotate")
        return
      }
    }
  }, [])

  const hardDrop = useCallback(() => {
    let dropped = 0
    while (move(0, 1)) dropped++
    if (dropped > 0) setScore((s) => s + dropped * 2)
    lockAndClear()
  }, [move, lockAndClear])

  // input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (status === "ready" || status === "over") {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); start() }
        return
      }
      if (e.key === "p" || e.key === "P") {
        setStatus((s) => (s === "playing" ? "paused" : "playing"))
        return
      }
      if (status !== "playing") return
      switch (e.key) {
        case "ArrowLeft": case "a": e.preventDefault(); if (move(-1, 0)) sfx.play("move"); break
        case "ArrowRight": case "d": e.preventDefault(); if (move(1, 0)) sfx.play("move"); break
        case "ArrowDown": case "s": e.preventDefault(); if (move(0, 1)) setScore((sc) => sc + 1); break
        case "ArrowUp": case "w": e.preventDefault(); tryRotate(); break
        case " ": e.preventDefault(); hardDrop(); break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [status, start, move, tryRotate, hardDrop])

  // game loop + render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let raf = 0
    let last = 0

    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").trim() || "#b4424c"

    // per-type opacity so pieces are distinguishable in monochrome
    const ALPHA = [0, 1, 0.85, 0.7, 0.6, 0.5, 0.42, 0.34]

    const draw = () => {
      const cw = canvas.width / COLS
      const ch = canvas.height / ROWS
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const col = accent()

      // settled blocks
      const g = grid.current
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (g[y][x]) {
            ctx.globalAlpha = ALPHA[g[y][x]]
            ctx.fillStyle = col
            ctx.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2)
          }
        }
      }

      // ghost + active piece
      const a = active.current
      if (a) {
        // ghost
        let gy = 0
        while (!collides(g, a.cells.map(([x, y]) => [x, y + gy + 1]))) gy++
        ctx.globalAlpha = 0.12
        ctx.fillStyle = col
        a.cells.forEach(([x, y]) => {
          if (y + gy >= 0) ctx.fillRect(x * cw + 1, (y + gy) * ch + 1, cw - 2, ch - 2)
        })
        // active
        ctx.globalAlpha = ALPHA[a.id]
        a.cells.forEach(([x, y]) => {
          if (y >= 0) ctx.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2)
        })
      }
      ctx.globalAlpha = 1
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (!last) last = t
      const dt = t - last
      last = t
      if (status === "playing" && active.current) {
        dropAcc.current += dt
        const interval = Math.max(80, 600 - (level.current - 1) * 55)
        if (dropAcc.current >= interval) {
          dropAcc.current = 0
          if (!move(0, 1)) lockAndClear()
        }
      }
      draw()
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [status, move, lockAndClear])

  return (
    <div className={styles.tetrisContainer}>
      <header className={styles.header}>
        <h1>Tetris</h1>
        <p>Arrows/WASD move &amp; rotate · Space hard-drop · P pause.</p>
      </header>

      <div className={styles.layout}>
        <div className={styles.well} data-status={status}>
          <canvas ref={canvasRef} width={250} height={500} className={styles.canvas} />
          {status !== "playing" && status !== "paused" && (
            <div className={styles.overlay}>
              {status === "over" && <div className={styles.gameOver}>stack overflow</div>}
              <button className={styles.startBtn} onClick={start}>
                {status === "ready" ? "Start" : "Again"}
              </button>
              <div className={styles.hint}>arrows / WASD · space</div>
            </div>
          )}
          {status === "paused" && (
            <div className={styles.overlay}>
              <div className={styles.gameOver}>paused</div>
              <button className={styles.startBtn} onClick={() => setStatus("playing")}>Resume</button>
            </div>
          )}
        </div>

        <div className={styles.side}>
          <div className={styles.stat}><span>score</span><strong>{score}</strong></div>
          <div className={styles.stat}><span>lines</span><strong>{lines}</strong></div>
          <div className={styles.stat}><span>best</span><strong>{best}</strong></div>
        </div>
      </div>
    </div>
  )
}
