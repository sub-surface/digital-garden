import { useCallback, useEffect, useRef, useState } from "react"
import { sfx } from "@/lib/sfx"
import styles from "./SnakePage.module.scss"

/**
 * Snake — a slightly stranger version.
 *
 *  - The walls wrap (a torus board), so the snake is never cornered by edges.
 *  - The body is drawn as a fading gradient in the site accent colour.
 *  - Two foods: a common seed (+1, grow 1) and a rare bloom (+5, grow 3) that
 *    triggers a brief slow-motion "bloom time".
 *  - Speed ramps with length, but bloom time pulls it back — a small rhythm of
 *    tension and relief rather than a flat difficulty curve.
 */

const COLS = 24
const ROWS = 24
const BASE_MS = 130
const MIN_MS = 60

type Cell = { x: number; y: number }
type Dir = "up" | "down" | "left" | "right"
const DIRS: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" }

const wrap = (n: number, max: number) => (n + max) % max
const eq = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y

function randomCell(exclude: Cell[]): Cell {
  let c: Cell
  do {
    c = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }
  } while (exclude.some((e) => eq(e, c)))
  return c
}

type Status = "ready" | "playing" | "dead"

export function SnakePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<Status>("ready")
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("snake-best") : null
    return v ? parseInt(v, 10) : 0
  })

  // mutable game state kept in refs so the loop doesn't churn React state
  const snake = useRef<Cell[]>([])
  const dir = useRef<Dir>("right")
  const queued = useRef<Dir | null>(null)
  const seed = useRef<Cell>({ x: 0, y: 0 })
  const bloom = useRef<Cell | null>(null)
  const bloomTimer = useRef(0) // ms of slow-mo remaining
  const sinceBloom = useRef(0) // ticks since a bloom existed
  const pendingGrowth = useRef(0) // segments still to add over coming ticks

  const reset = useCallback(() => {
    const start: Cell[] = [
      { x: 6, y: 12 },
      { x: 5, y: 12 },
      { x: 4, y: 12 },
    ]
    snake.current = start
    dir.current = "right"
    queued.current = null
    seed.current = randomCell(start)
    bloom.current = null
    bloomTimer.current = 0
    sinceBloom.current = 0
    pendingGrowth.current = 0
    setScore(0)
  }, [])

  const start = useCallback(() => {
    reset()
    setStatus("playing")
  }, [reset])

  // input
  // queue a turn (shared by keyboard + swipe); starts a game if not playing
  const steer = useCallback((nd: Dir) => {
    if (status !== "playing") { start(); return }
    if (nd !== OPPOSITE[dir.current]) queued.current = nd
  }, [status, start])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
      }
      const nd = map[e.key]
      if (nd) {
        e.preventDefault()
        steer(nd)
      } else if ((e.key === " " || e.key === "Enter") && status !== "playing") {
        e.preventDefault()
        start()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [status, start, steer])

  // touch: swipe to steer
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current
    if (!s) return
    const dx = e.changedTouches[0].clientX - s.x
    const dy = e.changedTouches[0].clientY - s.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) { if (status !== "playing") start(); return }
    if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? "right" : "left")
    else steer(dy > 0 ? "down" : "up")
    touchStart.current = null
  }

  // main loop
  useEffect(() => {
    if (status !== "playing") return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let acc = 0
    let last = 0

    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").trim() || "#b4424c"

    const stepInterval = () => {
      const ramp = Math.max(MIN_MS, BASE_MS - snake.current.length * 2)
      return bloomTimer.current > 0 ? ramp * 1.8 : ramp // slow-mo during bloom
    }

    const tick = () => {
      if (queued.current) { dir.current = queued.current; queued.current = null }
      const head = snake.current[0]
      const d = DIRS[dir.current]
      const next: Cell = { x: wrap(head.x + d.x, COLS), y: wrap(head.y + d.y, ROWS) }

      // self-collision. The tail cell only frees up if we're not growing this tick.
      const willGrow = pendingGrowth.current > 0
      const body = willGrow ? snake.current : snake.current.slice(0, -1)
      if (body.some((c) => eq(c, next))) {
        sfx.play("death")
        setStatus("dead")
        setBest((b) => {
          const nb = Math.max(b, score)
          localStorage.setItem("snake-best", String(nb))
          return nb
        })
        return
      }

      if (eq(next, seed.current)) {
        pendingGrowth.current += 1
        setScore((s) => s + 1)
        seed.current = randomCell([next, ...snake.current])
        sfx.play("eat")
      } else if (bloom.current && eq(next, bloom.current)) {
        pendingGrowth.current += 3
        setScore((s) => s + 5)
        bloom.current = null
        bloomTimer.current = 2600 // ms of slow-mo
        sinceBloom.current = 0
        sfx.play("bloom")
      }

      const newSnake = [next, ...snake.current]
      // Move: drop the tail unless we owe growth this tick.
      if (pendingGrowth.current > 0) pendingGrowth.current--
      else newSnake.pop()
      snake.current = newSnake

      // occasionally spawn a bloom
      sinceBloom.current++
      if (!bloom.current && sinceBloom.current > 18 && Math.random() < 0.04) {
        bloom.current = randomCell([...newSnake, seed.current])
      }
    }

    const draw = () => {
      const cw = canvas.width / COLS
      const ch = canvas.height / ROWS
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const col = accent()

      // bloom (rare food) — pulsing ring
      if (bloom.current) {
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.arc(bloom.current.x * cw + cw / 2, bloom.current.y * ch + ch / 2, cw * 0.42, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 0.3
        ctx.beginPath()
        ctx.arc(bloom.current.x * cw + cw / 2, bloom.current.y * ch + ch / 2, cw * 0.7, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // seed (common food)
      ctx.save()
      ctx.globalAlpha = 0.55
      ctx.fillStyle = col
      ctx.fillRect(seed.current.x * cw + cw * 0.3, seed.current.y * ch + ch * 0.3, cw * 0.4, ch * 0.4)
      ctx.restore()

      // snake — fading gradient from head to tail
      const n = snake.current.length
      snake.current.forEach((c, i) => {
        const t = 1 - i / Math.max(n, 1)
        ctx.globalAlpha = 0.25 + 0.65 * t
        ctx.fillStyle = col
        const pad = i === 0 ? 1 : 1.5
        ctx.fillRect(c.x * cw + pad, c.y * ch + pad, cw - pad * 2, ch - pad * 2)
      })
      ctx.globalAlpha = 1
    }

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      if (!last) last = t
      const dt = t - last
      last = t
      acc += dt
      if (bloomTimer.current > 0) bloomTimer.current = Math.max(0, bloomTimer.current - dt)
      if (acc >= stepInterval()) {
        acc = 0
        tick()
      }
      draw()
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [status, score])

  return (
    <div className={styles.snakeContainer}>
      <header className={styles.header}>
        <h1>Snake</h1>
        <p>Walls wrap. Seeds grow you; the rare bloom is worth five and bends time.</p>
      </header>

      <div
        className={styles.board}
        data-status={status}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: "none" }}
      >
        <canvas ref={canvasRef} width={480} height={480} className={styles.canvas} />
        {status !== "playing" && (
          <div className={styles.overlay}>
            {status === "dead" && <div className={styles.gameOver}>caught your own tail</div>}
            <button className={styles.startBtn} onClick={start}>
              {status === "ready" ? "Start" : "Again"}
            </button>
            <div className={styles.hint}>arrow keys or WASD</div>
          </div>
        )}
      </div>

      <div className={styles.scoreBar}>
        <span>score <strong>{score}</strong></span>
        <span>best <strong>{best}</strong></span>
      </div>
    </div>
  )
}
