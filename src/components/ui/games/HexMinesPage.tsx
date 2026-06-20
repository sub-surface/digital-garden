import { useCallback, useEffect, useMemo, useState } from "react"
import { GameCabinet } from "./GameCabinet"
import { sfx } from "@/lib/sfx"
import styles from "./HexMinesPage.module.scss"

/**
 * Hexagonal Minesweeper — each cell has 6 neighbours instead of 8.
 * Left-click reveals (flood-fills on zero), right-click flags. First click is
 * always safe. Themed monochrome.
 */

const RADIUS = 5 // board radius in hexes (axial)
const MINE_FRACTION = 0.16

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

function buildCells(): Map<string, Cell> {
  const m = new Map<string, Cell>()
  for (let q = -RADIUS; q <= RADIUS; q++) {
    for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r++) {
      m.set(key(q, r), { q, r, mine: false, count: 0, revealed: false, flagged: false })
    }
  }
  return m
}

function placeMines(cells: Map<string, Cell>, safe: string) {
  const keys = [...cells.keys()].filter((k) => k !== safe)
  const total = Math.floor(cells.size * MINE_FRACTION)
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

export function HexMinesPage() {
  const [cells, setCells] = useState<Map<string, Cell>>(() => buildCells())
  const [status, setStatus] = useState<"ready" | "playing" | "won" | "lost">("ready")
  const [seeded, setSeeded] = useState(false)

  const reset = useCallback(() => {
    setCells(buildCells())
    setStatus("ready")
    setSeeded(false)
  }, [])

  const mineCount = useMemo(() => {
    let m = 0, f = 0
    for (const c of cells.values()) { if (c.mine) m++; if (c.flagged) f++ }
    return Math.max(0, m - f) || (seeded ? 0 : Math.floor(cells.size * MINE_FRACTION))
  }, [cells, seeded])

  const reveal = useCallback((startKey: string) => {
    setCells((prev) => {
      const next = new Map(prev)
      // clone cells we touch
      const clone = (k: string) => { const c = { ...next.get(k)! }; next.set(k, c); return c }

      let working = next
      // seed mines on first reveal (first click always safe)
      if (!seeded) {
        const fresh = new Map<string, Cell>()
        for (const [k, c] of prev) fresh.set(k, { ...c })
        placeMines(fresh, startKey)
        working = fresh
        setSeeded(true)
        setStatus("playing")
      }

      const start = working.get(startKey)!
      if (start.revealed || start.flagged) return working

      if (start.mine) {
        // reveal all mines, lose
        for (const c of working.values()) if (c.mine) c.revealed = true
        start.revealed = true
        setStatus("lost")
        sfx.play("death")
        return new Map(working)
      }

      // flood fill from start across zero-count cells
      const stack = [startKey]
      const seen = new Set<string>()
      while (stack.length) {
        const k = stack.pop()!
        if (seen.has(k)) continue
        seen.add(k)
        const c = working.get(k)
        if (!c || c.revealed || c.flagged || c.mine) continue
        c.revealed = true
        if (c.count === 0) {
          for (const [dq, dr] of NEIGHBOURS) {
            const nk = key(c.q + dq, c.r + dr)
            if (working.has(nk) && !seen.has(nk)) stack.push(nk)
          }
        }
      }
      sfx.play("click")

      // win check: every non-mine revealed
      let win = true
      for (const c of working.values()) if (!c.mine && !c.revealed) { win = false; break }
      if (win) { setStatus("won"); sfx.play("win") }

      return new Map(working)
    })
  }, [seeded])

  const flag = useCallback((k: string) => {
    setCells((prev) => {
      const c = prev.get(k)
      if (!c || c.revealed) return prev
      const next = new Map(prev)
      next.set(k, { ...c, flagged: !c.flagged })
      sfx.play("move")
      return next
    })
  }, [])

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
      blurb="Minesweeper on hexes — six neighbours each. Click to reveal, right-click to flag."
      status={status}
      onStart={reset}
      endMessage={status === "won" ? "swept" : status === "lost" ? "boom" : undefined}
      hint="click reveal · right-click flag"
      controls={
        <>
          <span className={styles.mineCount}>mines <strong>{mineCount}</strong></span>
          <button className={styles.newBtn} onClick={reset}>New</button>
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
              onClick={() => playable && reveal(k)}
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
