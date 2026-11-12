import { useCallback, useEffect, useRef, useState } from "react"
import { sfx } from "@/lib/sfx"
import { ignoreGameKey, readStoredInt, writeStored } from "./gameUtils"
import { cssVarReader, useGameLoop } from "./useGameLoop"
import styles from "./TetrisPage.module.scss"

/**
 * Tetris — standard 10×20 well, 7-bag randomiser, next + hold, soft/hard drop,
 * rotation in the piece's own box (so pieces turn in place, not drift), simple
 * wall and floor kicks, and a lock delay that a move or turn resets (up to 15). Themed monochrome: every piece is the site accent colour with a
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
  id: number
  /** Top-left of the piece's size×size box in the well, and its quarter-turns. */
  x: number
  y: number
  rot: number
  cells: number[][] // derived from the above; [x,y] in the well
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

/** A shape's offsets after `rot` clockwise quarter-turns inside its own box. */
function shapeCells(type: string, rot: number): number[][] {
  const { coords, size } = SHAPES[type]
  if (type === "O") return coords
  let out = coords
  for (let r = 0; r < ((rot % 4) + 4) % 4; r++) out = out.map(([x, y]) => [size - 1 - y, x])
  return out
}

function place(type: string, x: number, y: number, rot: number): Active {
  return { type, id: KEYS.indexOf(type) + 1, x, y, rot, cells: shapeCells(type, rot).map(([cx, cy]) => [cx + x, cy + y]) }
}

function spawn(type: string): Active {
  return place(type, Math.floor((COLS - SHAPES[type].size) / 2), 0, 0)
}

// Optional (dx, dy) offset lets the ghost-piece probe slide a piece down
// without allocating a shifted copy of its cells every frame.
const collides = (grid: Grid, cells: number[][], dx = 0, dy = 0) =>
  cells.some(([cx, cy]) => {
    const x = cx + dx, y = cy + dy
    return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x] !== 0)
  })

// per-type opacity so pieces are distinguishable in monochrome
const ALPHA = [0, 1, 0.85, 0.7, 0.6, 0.5, 0.42, 0.34]
const accent = cssVarReader("--color-accent-base", "#b4424c")

export function TetrisPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<"ready" | "playing" | "paused" | "over">("ready")
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [best, setBest] = useState(() => readStoredInt("tetris-best"))

  const grid = useRef<Grid>(emptyGrid())
  const active = useRef<Active | null>(null)
  const bag = useRef<string[]>([])
  const next = useRef<string>("I")
  const [preview, setPreview] = useState<{ next: string; hold: string | null }>({ next: "I", hold: null })
  /** The held piece, and whether this piece has already used the hold. */
  const hold = useRef<string | null>(null)
  const holdUsed = useRef(false)
  /** Lock delay: time resting on the stack, and how many moves have reset it. */
  const lockAcc = useRef(0)
  const lockResets = useRef(0)
  const [level, setLevel] = useState(1)
  const dropAcc = useRef(0)
  const levelRef = useRef(1)
  // Score / lines are ref-authoritative so game-over (which can land in the same
  // event as a hard drop or line clear) persists the true final score — a
  // state-mirroring effect lags a render behind and dropped those last points.
  const scoreRef = useRef(0)
  const linesRef = useRef(0)
  const addScore = useCallback((n: number) => {
    scoreRef.current += n
    setScore(scoreRef.current)
  }, [])

  const pull = () => {
    if (bag.current.length === 0) bag.current = makeBag()
    return bag.current.pop()!
  }

  const reset = useCallback(() => {
    grid.current = emptyGrid()
    bag.current = makeBag()
    next.current = pull()
    active.current = spawn(pull())
    hold.current = null
    holdUsed.current = false
    dropAcc.current = 0
    lockAcc.current = 0
    lockResets.current = 0
    levelRef.current = 1
    scoreRef.current = 0
    linesRef.current = 0
    setScore(0); setLines(0); setLevel(1)
    setPreview({ next: next.current, hold: null })
  }, [])

  const start = useCallback(() => { reset(); setStatus("playing") }, [reset])

  const lockAndClear = useCallback(() => {
    const g = grid.current
    const a = active.current
    if (!a) return // nothing to lock (e.g. before start / after game over)
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
      addScore([0, 100, 300, 500, 800][cleared] * levelRef.current)
      linesRef.current += cleared
      levelRef.current = Math.floor(linesRef.current / 10) + 1
      setLines(linesRef.current)
      setLevel(levelRef.current)
    }

    // next piece
    const t = next.current
    next.current = pull()
    const na = spawn(t)
    if (collides(g, na.cells)) {
      setStatus("over")
      setBest((b) => Math.max(b, scoreRef.current))
      writeStored("tetris-best", Math.max(readStoredInt("tetris-best"), scoreRef.current))
      sfx.play("death")
      active.current = null
      return
    }
    active.current = na
    holdUsed.current = false
    lockAcc.current = 0
    lockResets.current = 0
    setPreview({ next: next.current, hold: hold.current })
    dropAcc.current = 0 // fresh piece gets a full gravity interval
  }, [addScore])

  /** A move or turn while resting on the stack buys more time, up to a limit. */
  const touched = () => {
    const a = active.current
    if (a && collides(grid.current, a.cells, 0, 1) && lockResets.current < 15) {
      lockAcc.current = 0
      lockResets.current++
    }
  }

  const move = useCallback((dx: number, dy: number): boolean => {
    const a = active.current
    if (!a) return false
    if (collides(grid.current, a.cells, dx, dy)) return false
    active.current = place(a.type, a.x + dx, a.y + dy, a.rot)
    if (dx) touched()
    return true
  }, [])

  const tryRotate = useCallback((dir: 1 | -1 = 1) => {
    const a = active.current
    if (!a || a.type === "O") return
    // Kicks: in place, a step either side, two steps (the I needs them), then
    // up one, so a piece can turn while sitting in a notch on the floor.
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]]) {
      const turned = place(a.type, a.x + dx, a.y + dy, a.rot + dir)
      if (!collides(grid.current, turned.cells)) {
        active.current = turned
        touched()
        sfx.play("rotate")
        return
      }
    }
  }, [])

  /** Swap the falling piece for the held one (once per piece). */
  const doHold = useCallback(() => {
    const a = active.current
    if (!a || holdUsed.current) return
    const held = hold.current
    hold.current = a.type
    holdUsed.current = true
    let incoming = held
    if (!incoming) { incoming = next.current; next.current = pull() }
    const na = spawn(incoming)
    if (collides(grid.current, na.cells)) return
    active.current = na
    dropAcc.current = 0
    lockAcc.current = 0
    lockResets.current = 0
    setPreview({ next: next.current, hold: hold.current })
    sfx.play("rotate")
  }, [])

  const hardDrop = useCallback(() => {
    if (!active.current) return // no piece in play — nothing to drop
    let dropped = 0
    while (move(0, 1)) dropped++
    if (dropped > 0) addScore(dropped * 2)
    lockAndClear()
  }, [move, lockAndClear, addScore])

  // input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && status === "playing" && e.key === "Shift") { doHold(); return }
      if (ignoreGameKey(e)) return
      if (status === "ready" || status === "over") {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); start() }
        return
      }
      if (e.key === "p" || e.key === "P") {
        setStatus((s) => (s === "playing" ? "paused" : "playing"))
        return
      }
      if (status !== "playing") return
      switch (e.key.length === 1 ? e.key.toLowerCase() : e.key) {
        case "ArrowLeft": case "a": e.preventDefault(); if (move(-1, 0)) sfx.play("move"); break
        case "ArrowRight": case "d": e.preventDefault(); if (move(1, 0)) sfx.play("move"); break
        case "ArrowDown": case "s": e.preventDefault(); if (move(0, 1)) addScore(1); break
        case "ArrowUp": case "w": case "x": e.preventDefault(); tryRotate(1); break
        case "z": case "q": e.preventDefault(); tryRotate(-1); break
        case "c": e.preventDefault(); doHold(); break
        case " ": e.preventDefault(); hardDrop(); break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [status, start, move, tryRotate, hardDrop, addScore, doHold])

  // game loop + render
  const idleDrawn = useRef<string | null>(null) // status whose static frame is already on the canvas
  useGameLoop((dt) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    if (status === "playing") {
      idleDrawn.current = null
      if (active.current) {
        const resting = collides(grid.current, active.current.cells, 0, 1)
        if (resting) {
          // Half a second on the stack before it sets (resets on a move or turn).
          lockAcc.current += dt
          if (lockAcc.current >= 500) lockAndClear()
        } else {
          lockAcc.current = 0
          dropAcc.current += dt
          const interval = Math.max(80, 600 - (levelRef.current - 1) * 55)
          if (dropAcc.current >= interval) {
            dropAcc.current = 0
            move(0, 1)
          }
        }
      }
    } else if (idleDrawn.current === status) {
      return // ready / paused / over: nothing moves, so don't repaint 60x a second
    } else {
      idleDrawn.current = status
    }

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
      let gy = 0
      while (!collides(g, a.cells, 0, gy + 1)) gy++
      ctx.globalAlpha = 0.12
      ctx.fillStyle = col
      a.cells.forEach(([x, y]) => {
        if (y + gy >= 0) ctx.fillRect(x * cw + 1, (y + gy) * ch + 1, cw - 2, ch - 2)
      })
      ctx.globalAlpha = ALPHA[a.id]
      a.cells.forEach(([x, y]) => {
        if (y >= 0) ctx.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2)
      })
    }
    ctx.globalAlpha = 1
  })

  return (
    <div className={styles.tetrisContainer}>
      <header className={styles.header}>
        <h1>Tetris</h1>
        <p>
          <span className="on-desktop">Arrows/WASD move &amp; rotate · Z turn back · C or Shift hold · Space hard-drop · P pause.</span>
          <span className="on-touch">Buttons below the well.</span>
        </p>
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
          <div className={styles.stat}><span>next</span><Mini type={preview.next} /></div>
          <div className={styles.stat}><span>hold</span><Mini type={preview.hold} /></div>
          <div className={styles.stat}><span>score</span><strong>{score}</strong></div>
          <div className={styles.stat}><span>lines</span><strong>{lines}</strong></div>
          <div className={styles.stat}><span>level</span><strong>{level}</strong></div>
          <div className={styles.stat}><span>best</span><strong>{best}</strong></div>
        </div>
      </div>

      {/* Touch controls — only shown on coarse-pointer devices via CSS.
          Disabled unless a round is in play (the handlers also no-op safely). */}
      <div className={styles.touchPad}>
        <button disabled={status !== "playing"} onClick={() => { if (move(-1, 0)) sfx.play("move") }} aria-label="Move left">←</button>
        <button disabled={status !== "playing"} onClick={doHold} aria-label="Hold">⇄</button>
        <button disabled={status !== "playing"} onClick={() => tryRotate(1)} aria-label="Rotate">⟳</button>
        <button disabled={status !== "playing"} onClick={() => { if (move(1, 0)) sfx.play("move") }} aria-label="Move right">→</button>
        <button disabled={status !== "playing"} onClick={() => { if (move(0, 1)) addScore(1) }} aria-label="Soft drop">↓</button>
        <button disabled={status !== "playing"} onClick={hardDrop} aria-label="Hard drop">⤓</button>
      </div>
    </div>
  )
}

/** A small picture of a piece, for the next / hold slots. */
function Mini({ type }: { type: string | null }) {
  const cells = type ? SHAPES[type].coords : []
  const on = new Set(cells.map(([x, y]) => `${x},${y}`))
  return (
    <div className={styles.mini} aria-label={type ?? "empty"}>
      {Array.from({ length: 8 }, (_, i) => {
        const x = i % 4, y = Math.floor(i / 4)
        return <i key={i} data-on={on.has(`${x},${y}`) || undefined} style={type ? { opacity: on.has(`${x},${y}`) ? ALPHA[KEYS.indexOf(type) + 1] : undefined } : undefined} />
      })}
    </div>
  )
}
