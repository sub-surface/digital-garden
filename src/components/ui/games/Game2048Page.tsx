import { useCallback, useEffect, useRef, useState } from "react"
import { sfx } from "@/lib/sfx"
import { GameCabinet, type CabinetStatus } from "./GameCabinet"
import styles from "./Game2048Page.module.scss"

/**
 * 2048 — tiles climb the ROYGBIV spectrum as they double, echoing the site's
 * accent-cycle. 2→red, 4→orange, … wrapping through the rainbow.
 */

const SIZE = 4
type Board = number[][]

const ROYGBIV = [
  "#b4424c", // red (default accent)
  "#c8703a", // orange
  "#c9a227", // yellow
  "#5a9e5a", // green
  "#3a7ca8", // blue
  "#5a5ab4", // indigo
  "#8a5ab4", // violet
]

function tileColor(value: number): string {
  // 2 -> index 0 (red), 4 -> 1 (orange), 8 -> 2 ... wrapping through the spectrum
  const step = Math.log2(value) - 1
  return ROYGBIV[((step % ROYGBIV.length) + ROYGBIV.length) % ROYGBIV.length]
}

const empty = (): Board => Array.from({ length: SIZE }, () => Array(SIZE).fill(0))

function spawn(b: Board): boolean {
  const free: [number, number][] = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (b[r][c] === 0) free.push([r, c])
  if (free.length === 0) return false
  const [r, c] = free[Math.floor(Math.random() * free.length)]
  b[r][c] = Math.random() < 0.9 ? 2 : 4
  return true
}

// slide+merge one row to the left; returns [newRow, gainedScore, moved]
function collapse(row: number[]): [number[], number, boolean] {
  const nums = row.filter((n) => n !== 0)
  const out: number[] = []
  let gained = 0
  for (let i = 0; i < nums.length; i++) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const merged = nums[i] * 2
      out.push(merged)
      gained += merged
      i++
    } else {
      out.push(nums[i])
    }
  }
  while (out.length < SIZE) out.push(0)
  const moved = out.some((v, i) => v !== row[i])
  return [out, gained, moved]
}

const rotateCW = (b: Board): Board => b[0].map((_, c) => b.map((row) => row[c]).reverse())
const rotateCCW = (b: Board): Board => b[0].map((_, c) => b.map((row) => row[SIZE - 1 - c]))

type Dir = "left" | "right" | "up" | "down"

function moveBoard(b: Board, dir: Dir): [Board, number, boolean] {
  let work = b.map((r) => [...r])
  // normalise so we always collapse "left"
  if (dir === "up") work = rotateCCW(work)
  else if (dir === "down") work = rotateCW(work)
  else if (dir === "right") work = work.map((r) => [...r].reverse())

  let gained = 0
  let moved = false
  work = work.map((row) => {
    const [nr, g, m] = collapse(row)
    gained += g
    if (m) moved = true
    return nr
  })

  if (dir === "up") work = rotateCW(work)
  else if (dir === "down") work = rotateCCW(work)
  else if (dir === "right") work = work.map((r) => [...r].reverse())

  return [work, gained, moved]
}

const canMove = (b: Board): boolean => {
  for (const d of ["left", "right", "up", "down"] as Dir[]) {
    if (moveBoard(b, d)[2]) return true
  }
  return false
}

export function Game2048Page() {
  const [board, setBoard] = useState<Board>(() => {
    const b = empty(); spawn(b); spawn(b); return b
  })
  const [score, setScore] = useState(0)
  // Best is tracked + persisted by GameCabinet via the `g2048-best` key.
  const [over, setOver] = useState(false)
  const [won, setWon] = useState(false)
  const boardRef = useRef(board)
  boardRef.current = board

  const reset = useCallback(() => {
    const b = empty(); spawn(b); spawn(b)
    setBoard(b); setScore(0); setOver(false); setWon(false)
  }, [])

  const apply = useCallback((dir: Dir) => {
    if (over) return
    const [moved, gained, didMove] = moveBoard(boardRef.current, dir)
    if (!didMove) return
    spawn(moved)
    setBoard(moved)
    if (gained > 0) {
      sfx.play("merge")
      setScore((s) => s + gained)
    } else {
      sfx.play("move")
    }
    if (!won && moved.some((row) => row.some((v) => v >= 2048))) {
      setWon(true); sfx.play("win")
    }
    if (!canMove(moved)) { setOver(true); sfx.play("death") }
  }, [over, won])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
        a: "left", d: "right", w: "up", s: "down",
      }
      const dir = map[e.key]
      if (dir) { e.preventDefault(); apply(dir) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [apply])

  // touch swipe
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    if (Math.abs(dx) > Math.abs(dy)) apply(dx > 0 ? "right" : "left")
    else apply(dy > 0 ? "down" : "up")
    touch.current = null
  }

  // `won` lets play continue, so it isn't a stop state — only `over` ends the
  // game (and the win flourish fires once via the `won` flag on the board).
  const status: CabinetStatus = over ? "lost" : won ? "won" : "playing"
  return (
    <GameCabinet
      title="2048"
      blurb="Merge tiles up the spectrum. Arrows, WASD, or swipe."
      status={over ? "lost" : "playing"}
      onStart={reset}
      score={{ value: score, bestKey: "g2048-best" }}
      endMessage={over ? "no moves left" : undefined}
      controls={<button className={styles.newBtn} onClick={reset}>New</button>}
    >
      <div
        className={styles.boardWrap}
        data-win={status === "won" || undefined}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className={styles.grid}>
          {board.flat().map((v, i) => (
            <div
              key={i}
              className={`${styles.tile} ${v ? styles.filled : ""}`}
              style={v ? { background: tileColor(v), color: v <= 4 ? "rgba(255,255,255,0.92)" : "#fff" } : undefined}
            >
              {v !== 0 ? v : ""}
            </div>
          ))}
        </div>
        {won && !over && <div className={styles.wonFlag}>2048! keep going</div>}
      </div>
    </GameCabinet>
  )
}
