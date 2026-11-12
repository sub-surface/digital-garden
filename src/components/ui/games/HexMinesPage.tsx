import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { GameCabinet } from "./GameCabinet"
import { sfx } from "@/lib/sfx"
import { readStoredInt, writeStored } from "./gameUtils"
import styles from "./HexMinesPage.module.scss"

/**
 * Hexagonal Minesweeper — each cell has 6 neighbours instead of 8.
 * Left-click reveals (flood-fills on zero), right-click flags, clicking a
 * number whose flags are all placed opens the rest of its ring (chording).
 * The first click always opens a patch: neither it nor its ring holds a mine.
 * Three board sizes, each with its own best time. Themed monochrome.
 */

const SIZES = [
  { name: "small", radius: 4, fraction: 0.14 },
  { name: "medium", radius: 5, fraction: 0.16 },
  { name: "large", radius: 7, fraction: 0.18 },
] as const
type SizeName = (typeof SIZES)[number]["name"]

type Cell = {
  q: number
  r: number
  mine: boolean
  count: number
  revealed: boolean
  flagged: boolean
}

const key = (q: number, r: number) => `${q},${r}`
// pointy-top axial neighbours
const NEIGHBOURS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
]

function buildCells(radius: number): Map<string, Cell> {
  const m = new Map<string, Cell>()
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      m.set(key(q, r), { q, r, mine: false, count: 0, revealed: false, flagged: false })
    }
  }
  return m
}

function placeMines(cells: Map<string, Cell>, safe: Cell, fraction: number) {
  const ring = new Set([key(safe.q, safe.r), ...NEIGHBOURS.map(([dq, dr]) => key(safe.q + dq, safe.r + dr))])
  const keys = [...cells.keys()].filter((k) => !ring.has(k))
  const total = Math.min(keys.length, Math.floor(cells.size * fraction))
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[keys[i], keys[j]] = [keys[j], keys[i]]
  }
  for (let i = 0; i < total; i++) cells.get(keys[i])!.mine = true
  // compute counts
  for (const c of cells.values()) {
    if (c.mine) continue
    let n = 0
    for (const [dq, dr] of NEIGHBOURS) {
      const nb = cells.get(key(c.q + dq, c.r + dr))
      if (nb?.mine) n++
    }
    c.count = n
  }
}

const SIZE = 22 // hex pixel radius
function toPixel(q: number, r: number) {
  return { x: SIZE * Math.sqrt(3) * (q + r / 2), y: SIZE * 1.5 * r }
}

/** Open `starts` (flood-filling across zeros) on a copy of the board. */
function openCells(cells: Map<string, Cell>, starts: string[]): { next: Map<string, Cell>; boom: boolean } {
  const next = new Map(cells)
  const own = (k: string) => { const c = { ...next.get(k)! }; next.set(k, c); return c }
  let boom = false
  const stack = [...starts]
  const seen = new Set<string>()
  while (stack.length) {
    const k = stack.pop()!
    if (seen.has(k)) continue
    seen.add(k)
    const c0 = next.get(k)
    if (!c0 || c0.revealed || c0.flagged) continue
    const c = own(k)
    c.revealed = true
    if (c.mine) { boom = true; continue }
    if (c.count === 0) {
      for (const [dq, dr] of NEIGHBOURS) {
        const nk = key(c.q + dq, c.r + dr)
        if (next.has(nk) && !seen.has(nk)) stack.push(nk)
      }
    }
  }
  if (boom) for (const [k, c] of next) if (c.mine && !c.revealed) next.set(k, { ...c, revealed: true })
  return { next, boom }
}

const bestKey = (n: SizeName) => `hexmines:best:${n}`

export function HexMinesPage() {
  const [size, setSize] = useState<SizeName>("medium")
  const spec = SIZES.find((z) => z.name === size)!
  const [cells, setCells] = useState<Map<string, Cell>>(() => buildCells(spec.radius))
  const [status, setStatus] = useState<"ready" | "playing" | "won" | "lost">("ready")
  const [seeded, setSeeded] = useState(false)
  // Touch has no right-click: this toggle makes a tap place/remove a flag instead.
  const [flagMode, setFlagMode] = useState(false)
  // Clock: starts on the first reveal, stops on a result.
  const startedAt = useRef(0)
  const [elapsed, setElapsed] = useState(0)
  const [best, setBest] = useState(() => readStoredInt(bestKey(size), 0))
  useEffect(() => {
    if (status !== "playing") return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250)
    return () => clearInterval(t)
  }, [status])

  const reset = useCallback((name: SizeName = size) => {
    setSize(name)
    setCells(buildCells(SIZES.find((z) => z.name === name)!.radius))
    setStatus("ready")
    setSeeded(false)
    setElapsed(0)
    setBest(readStoredInt(bestKey(name), 0))
  }, [size])

  const mineCount = useMemo(() => {
    let m = 0, f = 0
    for (const c of cells.values()) { if (c.mine) m++; if (c.flagged) f++ }
    return seeded ? Math.max(0, m - f) : Math.floor(cells.size * spec.fraction) - f
  }, [cells, seeded, spec.fraction])

  /** Reveal a cell, or chord a revealed number. All state is computed here, outside any updater. */
  const reveal = useCallback((startKey: string) => {
    let board = cells
    if (!seeded) {
      board = new Map([...cells].map(([k, c]) => [k, { ...c }]))
      placeMines(board, board.get(startKey)!, spec.fraction)
      setSeeded(true)
      setStatus("playing")
      startedAt.current = Date.now()
    }
    const c = board.get(startKey)!
    let starts = [startKey]
    if (c.revealed) {
      // Chord: a number with exactly that many flags around it opens the rest.
      if (c.count === 0) return
      const ring = NEIGHBOURS.map(([dq, dr]) => key(c.q + dq, c.r + dr)).filter((k) => board.has(k))
      const flags = ring.filter((k) => board.get(k)!.flagged).length
      if (flags !== c.count) return
      starts = ring.filter((k) => !board.get(k)!.revealed && !board.get(k)!.flagged)
      if (!starts.length) return
    } else if (c.flagged) return

    const { next, boom } = openCells(board, starts)
    if (boom) {
      setCells(next)
      setStatus("lost")
      sfx.play("death")
      return
    }
    let win = true
    for (const x of next.values()) if (!x.mine && !x.revealed) { win = false; break }
    if (win) {
      // Flag the remaining mines for the final picture.
      for (const [k, x] of next) if (x.mine && !x.flagged) next.set(k, { ...x, flagged: true })
      const secs = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))
      setElapsed(secs)
      if (!best || secs < best) { setBest(secs); writeStored(bestKey(size), secs) }
      setStatus("won")
      sfx.play("win")
    } else {
      sfx.play("click")
    }
    setCells(next)
  }, [cells, seeded, spec.fraction, best, size])

  const flag = useCallback((k: string) => {
    const c = cells.get(k)
    if (!c || c.revealed) return
    const next = new Map(cells)
    next.set(k, { ...c, flagged: !c.flagged })
    sfx.play("move")
    setCells(next)
  }, [cells])

  // close over status for interactivity guard
  const playable = status === "ready" || status === "playing"

  // viewBox bounds
  const pts = [...cells.values()].map((c) => toPixel(c.q, c.r))
  const minX = Math.min(...pts.map((p) => p.x)) - SIZE
  const maxX = Math.max(...pts.map((p) => p.x)) + SIZE
  const minY = Math.min(...pts.map((p) => p.y)) - SIZE
  const maxY = Math.max(...pts.map((p) => p.y)) + SIZE
  const vbW = maxX - minX
  const vbH = maxY - minY

  const hexPath = (cx: number, cy: number) => {
    const p: string[] = []
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90)
      p.push(`${(cx + SIZE * 0.92 * Math.cos(a)).toFixed(1)},${(cy + SIZE * 0.92 * Math.sin(a)).toFixed(1)}`)
    }
    return p.join(" ")
  }

  return (
    <GameCabinet
      title="Hex Mines"
      blurb="Minesweeper on hexes — six neighbours each. Click to reveal, right-click to flag, click a satisfied number to open its ring."
      // "ready" means "board untouched", not "waiting behind a Start overlay" —
      // the cabinet overlays (and blocks) the board for every non-"playing"
      // status, and Start only re-ran reset(), so a fresh board was unclickable.
      status={status === "ready" ? "playing" : status}
      onStart={() => reset()}
      endMessage={status === "won" ? `swept in ${elapsed}s${elapsed === best ? " — a best" : ""}` : status === "lost" ? "boom" : undefined}
      hint="click reveal · right-click flag · click a number to chord"
      controls={
        <>
          <span className={styles.mineCount}>mines <strong>{mineCount}</strong></span>
          <span className={styles.mineCount}>time <strong>{elapsed}</strong>{best ? <> · best {best}</> : null}</span>
          {SIZES.map((z) => (
            <button key={z.name} className={styles.newBtn} data-active={size === z.name || undefined} onClick={() => reset(z.name)}>{z.name}</button>
          ))}
          <button
            className={styles.newBtn}
            data-active={flagMode || undefined}
            aria-pressed={flagMode}
            onClick={() => setFlagMode((f) => !f)}
            title="Flag mode: tap to flag instead of reveal (for touch)"
          >
            {flagMode ? "flagging" : "flag"}
          </button>
          <button className={styles.newBtn} onClick={() => reset()}>New</button>
        </>
      }
    >
      <svg
        className={styles.board}
        viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        {[...cells.values()].map((c) => {
          const { x, y } = toPixel(c.q, c.r)
          const k = key(c.q, c.r)
          return (
            <g
              key={k}
              className={styles.cellGroup}
              onClick={() => { if (playable) { if (flagMode) flag(k); else reveal(k) } }}
              onContextMenu={(e) => { e.preventDefault(); if (playable) flag(k) }}
            >
              <polygon
                points={hexPath(x, y)}
                className={`${styles.hex} ${c.revealed ? styles.revealed : ""} ${c.revealed && c.mine ? styles.mine : ""}`}
              />
              {c.revealed && !c.mine && c.count > 0 && (
                <text x={x} y={y} className={styles.num} dominantBaseline="central" textAnchor="middle">{c.count}</text>
              )}
              {c.revealed && c.mine && (
                <text x={x} y={y} className={styles.bomb} dominantBaseline="central" textAnchor="middle">✦</text>
              )}
              {!c.revealed && c.flagged && (
                <text x={x} y={y} className={styles.flagMark} dominantBaseline="central" textAnchor="middle">⚑</text>
              )}
            </g>
          )
        })}
      </svg>
    </GameCabinet>
  )
}
