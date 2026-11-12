import { useEffect, useRef, useState, useCallback } from "react"
import { startFrameLoop } from "./useGameLoop"
import { ignoreGameKey } from "./gameUtils"
import styles from "./ProgressionsPage.module.scss"

/**
 * Progressions — a two-agent cellular battle over arithmetic progressions.
 *
 * Two makers (Red, Blue) alternately claim lattice cells, each trying to build
 * the longest monochromatic arithmetic progression (a, a+d, a+2d, …) while
 * denying the other. This is the 1-D/2-D shadow of HeXO, where a win is exactly a
 * length-6 AP on Z[ω]. The agents are Maker-Maker players in the
 * van der Waerden / Erdős–Selfridge setting:
 *
 *  - Each agent scores a move by an Erdős–Selfridge potential: Σ over all APs
 *    through the cell of 2^(−cells still needed), counting only APs not already
 *    blocked by the opponent. This is the same threat potential that drives the
 *    HeXO bot, and the same quantity Erdős & Selfridge (1973) used to prove the
 *    Maker-Breaker bound.
 *  - "Block weight" lets an agent also value killing the opponent's near-complete
 *    progressions — the pairing/defence idea behind Hamkins–Leonessi's infinite-Hex
 *    draw and Conway's strategy-stealing reasoning.
 *
 * It runs autonomously (watch the battle) but you can also seed cells by clicking.
 *
 * What the bots actually build (measured headless, 2026-11-12): with any real
 * defence weight, ~97% of moves form "zippers": the two sides alternate
 * stones that each block the other, translating one step along a direction
 * BETWEEN the lattice axes (the root-3 directions) every two moves, so neither
 * side ever gets two stones on a common line. On an unbounded board that is
 * the whole game; on this bounded one the zippers hit the walls and turn, and
 * the board fills into striped domains. Colour-wise that fill is the
 * triangular Ising antiferromagnet: neighbours want opposite colours, a
 * triangle can't have all three pairs differ, and the frustration (Wannier
 * 1950) leaves many equally good arrangements, hence stripes with defects
 * rather than one crystal. Below a defence weight of ~0.6 the order flips to
 * phase separation (each side fills its own territory). The structure is
 * striped and frustrated, not quasicrystalline: its diffraction shows streaks
 * near rational positions, not sharp peaks at irrational ones.
 */

const GRID = 90           // GRID x GRID lattice
const TARGET = 6          // AP length that "wins" a point (mirrors HeXO's 6)

// Axis direction sets per topology (offset-coordinate axial deltas).
// Square: 4 axes on Z². Hex: the 3 axes of the hex lattice (HeXO's geometry).
const DIRS_SQUARE: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0, 1], [1, 1], [1, -1],
]
const DIRS_HEX: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0, 1], [1, -1],
]

/** The cells "next to" a stone, for candidate moves: 8 on the square lattice,
 * 6 on the hex one (axial ±(1,0), ±(0,1), ±(1,−1); (1,1) is not a hex neighbour). */
const NEAR_SQUARE: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
]
const NEAR_HEX: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
]

type Topo = "square" | "hex"

const ZERO_STATS = { stones: 0, unlike: 0, mono: 0, forks: 0, anisotropy: 0 }
type Pair = readonly [number, number]
const TRIS_HEX: ReadonlyArray<readonly [Pair, Pair]> = [[[1, 0], [0, 1]], [[1, 0], [1, -1]]]
const TRIS_SQUARE: ReadonlyArray<readonly [Pair, Pair]> = [[[1, 0], [1, 1]], [[0, 1], [1, 1]]]

/** A zipper: the last few periods of moves repeat, each shifted by one vector. */
function detectZipper(m: [number, number, number][]): string {
  for (let P = 2; P <= 8; P += 2) {
    const span = P * 4
    if (m.length < span + P) continue
    const end = m.length - 1
    const tx = m[end][0] - m[end - P][0], ty = m[end][1] - m[end - P][1]
    if (!tx && !ty) continue
    let ok = true
    for (let i = end - span; i <= end - P && ok; i++) ok = m[i + P][0] - m[i][0] === tx && m[i + P][1] - m[i][1] === ty && m[i + P][2] === m[i][2]
    if (ok) return `zipper running: (${tx}, ${ty}) every ${P} moves`
  }
  return ""
}
type Owner = 0 | 1 | 2   // 0 empty, 1 red, 2 blue

// 2^(own−TARGET) lookup, own ∈ 0..TARGET — avoids Math.pow in the hot loop.
const POW2: number[] = Array.from({ length: TARGET + 1 }, (_, own) => Math.pow(2, own - TARGET))

export function ProgressionsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Uint8Array>(new Uint8Array(GRID * GRID))
  const [running, setRunning] = useState(true)
  const runningRef = useRef(running); runningRef.current = running
  const [speed, setSpeed] = useState(8)
  const speedRef = useRef(speed); speedRef.current = speed
  const [blockWeight, setBlockWeight] = useState(1.0)
  const blockRef = useRef(blockWeight); blockRef.current = blockWeight
  // Overwrite mode: agents may play on occupied cells, turning a Maker-Maker
  // positional game into a non-monotone CA on a bounded substrate — cycles,
  // standing waves, no terminal position (the "CRT"/ALife regime).
  const [overwrite, setOverwrite] = useState(false)
  const overwriteRef = useRef(overwrite); overwriteRef.current = overwrite
  // Display state is REF-authoritative: the sim mutates refs only (no setState per
  // step), and the rAF loop pushes refs → React state once per frame when dirty.
  // This fully decouples simulation rate from React's render rate.
  const [scores, setScores] = useState({ red: 0, blue: 0 })
  const scoresRef = useRef({ red: 0, blue: 0 })
  const [turn, setTurn] = useState<Owner>(1)
  const turnRef = useRef<Owner>(1)
  const [best, setBest] = useState<{ red: number; blue: number }>({ red: 0, blue: 0 })
  const bestRef = useRef({ red: 0, blue: 0 })
  const dirtyRef = useRef(false)   // set when any display ref changes
  const renderDirtyRef = useRef(true)   // set when the board needs a repaint (step/seed/reset while paused)
  const [topo, setTopo] = useState<Topo>("hex")
  const topoRef = useRef<Topo>(topo); topoRef.current = topo
  const dirsRef = useRef<ReadonlyArray<readonly [number, number]>>(DIRS_HEX)
  dirsRef.current = topo === "hex" ? DIRS_HEX : DIRS_SQUARE
  // live order stats, updated every 16 steps (ref-authoritative)
  const [stats, setStats] = useState(ZERO_STATS)
  const statsRef = useRef(ZERO_STATS)
  /** Recent moves, for spotting a zipper: [x, y, who]. */
  const movesRef = useRef<[number, number, number][]>([])
  const [zipper, setZipper] = useState("")
  const zipperRef = useRef("")
  const [randomTies, setRandomTies] = useState(false)
  const randomTiesRef = useRef(randomTies); randomTiesRef.current = randomTies
  const stepCountRef = useRef(0)
  // Cached hot-line cells (the longest runs to highlight). The board changes by
  // one cell per step, so we recompute this ONLY in stepOnce — never per render
  // frame. Render just draws the cache. This is the whole performance fix.
  const hotRef = useRef<Set<number>>(new Set())
  // Active-play bounding box, so candidate generation scans a small window around
  // the stones instead of the whole 90×90 grid every step.
  const bboxRef = useRef({ minX: GRID, minY: GRID, maxX: -1, maxY: -1 })
  /** Set when the camera should re-centre (a lattice switch changes the board's shape). */
  const recentreRef = useRef(false)

  const idx = (x: number, y: number) => y * GRID + x
  const inB = (x: number, y: number) => x >= 0 && x < GRID && y >= 0 && y < GRID

  const reset = useCallback(() => {
    gridRef.current.fill(0)
    hotRef.current = new Set()
    bboxRef.current = { minX: GRID, minY: GRID, maxX: -1, maxY: -1 }
    scoresRef.current = { red: 0, blue: 0 }
    bestRef.current = { red: 0, blue: 0 }
    statsRef.current = ZERO_STATS
    movesRef.current = []
    zipperRef.current = ""
    setZipper("")
    turnRef.current = 1
    renderDirtyRef.current = true
    setScores(scoresRef.current)
    setBest(bestRef.current)
    setStats(statsRef.current)
    setTurn(1)
  }, [])

  const switchTopo = useCallback((t: Topo) => {
    setTopo(t)
    topoRef.current = t
    dirsRef.current = t === "hex" ? DIRS_HEX : DIRS_SQUARE
    recentreRef.current = true
    reset()
  }, [reset])

  // Erdős–Selfridge potential of placing `who` at (x,y): sum over all length-TARGET
  // windows through the cell of 2^(own_in_window − TARGET), counting only windows
  // with no opponent stone (a blocked window contributes nothing).
  const potential = useCallback((g: Uint8Array, x: number, y: number, who: Owner): number => {
    const opp = who === 1 ? 2 : 1
    let score = 0
    for (const [dx, dy] of dirsRef.current) {
      for (let off = -(TARGET - 1); off <= 0; off++) {
        let own = 1, blocked = false
        for (let i = 0; i < TARGET; i++) {
          const cx = x + dx * (off + i)
          const cy = y + dy * (off + i)
          if (cx === x && cy === y) continue
          if (!inB(cx, cy)) { blocked = true; break }
          const o = g[idx(cx, cy)]
          if (o === opp) { blocked = true; break }
          if (o === who) own++
        }
        if (!blocked) score += POW2[own]
      }
    }
    return score
  }, [])

  // longest monochromatic AP run on the board for `who`, returns {len, cells}
  const longestRun = useCallback((g: Uint8Array, who: Owner): { len: number; cells: number[] } => {
    let bestLen = 0, bestCells: number[] = []
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (g[idx(x, y)] !== who) continue
        for (const [dx, dy] of dirsRef.current) {
          // only count runs starting at a run-start (no same-owner cell behind)
          const px = x - dx, py = y - dy
          if (inB(px, py) && g[idx(px, py)] === who) continue
          const cells: number[] = []
          let cx = x, cy = y
          while (inB(cx, cy) && g[idx(cx, cy)] === who) { cells.push(idx(cx, cy)); cx += dx; cy += dy }
          if (cells.length > bestLen) { bestLen = cells.length; bestCells = cells }
        }
      }
    }
    return { len: bestLen, cells: bestCells }
  }, [])

  // Order statistics on the live stones (every 16 steps, O(n)):
  //   unlike     - share of touching stone pairs that are opposite colours
  //   mono       - share of fully occupied little triangles that are all one
  //                colour: 25% for random colours, 0% for a perfect
  //                antiferromagnet, near 100% when the sides separate
  //   forks      - stones sitting in >=2 open lines holding >=3 own stones
  //   anisotropy - how unevenly stones line up across the lattice axes
  const computeStats = useCallback((g: Uint8Array) => {
    const pts: Array<[number, number]> = []
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (g[idx(x, y)]) pts.push([x, y])
    const n = pts.length
    if (n < 4) return { ...ZERO_STATS, stones: n }
    const at = (x: number, y: number) => (inB(x, y) ? g[idx(x, y)] : 0)
    const dirs = dirsRef.current
    let pairs = 0, unlikePairs = 0
    for (const [x, y] of pts) for (const [dx, dy] of dirs) {
      const o = at(x + dx, y + dy)
      if (o) { pairs++; if (o !== g[idx(x, y)]) unlikePairs++ }
    }
    // little triangles: on the hex lattice the two per cell; on the square
    // (king-move) lattice, the two halves of each unit square
    const tri = topoRef.current === "hex" ? TRIS_HEX : TRIS_SQUARE
    let tris = 0, monoTris = 0
    for (const [x, y] of pts) for (const [[ax, ay], [bx, by]] of tri) {
      const a = at(x + ax, y + ay), b = at(x + bx, y + by)
      if (!a || !b) continue
      tris++
      if (a === b && a === g[idx(x, y)]) monoTris++
    }
    const axisCounts = dirs.map(([dx, dy]) => {
      let c = 0
      for (const [x, y] of pts) if (at(x + dx, y + dy)) c++
      return c
    })
    const aMean = axisCounts.reduce((a, b) => a + b, 0) / axisCounts.length || 1
    const aVar = axisCounts.reduce((a, b) => a + (b - aMean) ** 2, 0) / axisCounts.length
    const anisotropy = aMean > 0 ? Math.min(1, Math.sqrt(aVar) / aMean) : 0
    let forks = 0
    for (const [x, y] of pts) {
      const who = g[idx(x, y)] as Owner
      const opp = who === 1 ? 2 : 1
      let open = 0
      for (const [dx, dy] of dirs) {
        for (let off = -(TARGET - 1); off <= 0; off++) {
          let own = 0, blocked = false
          for (let i = 0; i < TARGET; i++) {
            const cx = x + dx * (off + i), cy = y + dy * (off + i)
            if (!inB(cx, cy)) { blocked = true; break }
            const o = g[idx(cx, cy)]
            if (o === opp) { blocked = true; break }
            if (o === who) own++
          }
          if (!blocked && own >= 3) { open++; break }
        }
      }
      if (open >= 2) forks++
    }
    return { stones: n, unlike: pairs ? unlikePairs / pairs : 0, mono: tris ? monoTris / tris : 0, forks, anisotropy }
  }, [])

  const stepOnce = useCallback(() => {
    const g = gridRef.current
    const who = turnRef.current
    const opp = who === 1 ? 2 : 1
    // candidate cells = empties adjacent to any stone, or centre on an empty board.
    // Only scan the active bounding box (+1 margin), not the whole grid.
    const cand: Array<[number, number]> = []
    const bb = bboxRef.current
    const ow = overwriteRef.current
    if (bb.maxX < 0) {
      cand.push([GRID >> 1, GRID >> 1])
    } else {
      const x0 = Math.max(0, bb.minX - 1), x1 = Math.min(GRID - 1, bb.maxX + 1)
      const y0 = Math.max(0, bb.minY - 1), y1 = Math.min(GRID - 1, bb.maxY + 1)
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const occ = g[idx(x, y)]
        // empty cells always; in overwrite mode also opponent cells (never our own)
        if (occ === who) continue
        if (occ !== 0 && !ow) continue
        let near = false
        for (const [dx, dy] of topoRef.current === "hex" ? NEAR_HEX : NEAR_SQUARE) {
          if (inB(x + dx, y + dy) && g[idx(x + dx, y + dy)]) { near = true; break }
        }
        if (near) cand.push([x, y])
      }
    }
    if (!cand.length) return
    let bx = cand[0][0], by = cand[0][1], bs = -Infinity, ties = 0
    const shuffle = randomTiesRef.current
    for (const [x, y] of cand) {
      const off = potential(g, x, y, who)
      const def = potential(g, x, y, opp) * blockRef.current
      const s = off + def
      if (s > bs + 1e-12) { bs = s; bx = x; by = y; ties = 1 }
      // equal scores: keep the first in scan order, or pick uniformly at random
      else if (shuffle && s > bs - 1e-12 && Math.random() * ++ties < 1) { bx = x; by = y }
    }
    g[idx(bx, by)] = who
    {
      const bb = bboxRef.current
      if (bx < bb.minX) bb.minX = bx; if (bx > bb.maxX) bb.maxX = bx
      if (by < bb.minY) bb.minY = by; if (by > bb.maxY) bb.maxY = by
    }

    // Win detection is LOCAL: only a line through the just-placed cell can have
    // changed. O(dirs × TARGET) instead of an O(n²) board scan. The placed cell's
    // own longest run also becomes the highlight for that side.
    // A point is scored per axis on which this stone *forms* a line of TARGET or
    // more: both halves it joins were shorter than TARGET, so a run that merely
    // grows from 6 to 7 doesn't re-score, but joining 3 + 3 does. (It used to
    // score only when the single longest line was exactly TARGET, so a stone
    // that completed a 6 beside a longer line on another axis, or joined two
    // halves into a 7, scored nothing.)
    let myRun: number[] = [idx(bx, by)]
    let formed = 0
    for (const [dx, dy] of dirsRef.current) {
      const line: number[] = [idx(bx, by)]
      let cx = bx + dx, cy = by + dy, ahead = 0, behind = 0
      while (inB(cx, cy) && g[idx(cx, cy)] === who) { line.push(idx(cx, cy)); cx += dx; cy += dy; ahead++ }
      cx = bx - dx; cy = by - dy
      while (inB(cx, cy) && g[idx(cx, cy)] === who) { line.unshift(idx(cx, cy)); cx -= dx; cy -= dy; behind++ }
      if (line.length >= TARGET && ahead < TARGET && behind < TARGET) formed++
      if (line.length > myRun.length) myRun = line
    }
    // merge this side's fresh run into the cached highlight (keep the other side's)
    const hot = new Set(hotRef.current)
    for (const c of myRun) hot.add(c)
    hotRef.current = hot
    if (myRun.length > (who === 1 ? bestRef.current.red : bestRef.current.blue)) {
      bestRef.current = who === 1
        ? { ...bestRef.current, red: myRun.length }
        : { ...bestRef.current, blue: myRun.length }
      dirtyRef.current = true
    }
    if (formed) {
      scoresRef.current = who === 1
        ? { ...scoresRef.current, red: scoresRef.current.red + formed }
        : { ...scoresRef.current, blue: scoresRef.current.blue + formed }
      dirtyRef.current = true
    }
    turnRef.current = who === 1 ? 2 : 1
    const mv = movesRef.current
    mv.push([bx, by, who])
    if (mv.length > 64) mv.shift()
    zipperRef.current = detectZipper(mv)
    dirtyRef.current = true
    renderDirtyRef.current = true
    // Periodically (every ~16 moves) run the full O(n²) passes — spectral stats
    // plus an authoritative longest-run/highlight refresh that corrects any drift
    // from the cheap local tracking. Amortised, this keeps per-step cost low.
    stepCountRef.current++
    if ((stepCountRef.current & 15) === 0) {
      statsRef.current = computeStats(g)
      const rRun = longestRun(g, 1), bRun = longestRun(g, 2)
      hotRef.current = new Set<number>([...rRun.cells, ...bRun.cells])
      bestRef.current = { red: rRun.len, blue: bRun.len }
      dirtyRef.current = true
    }
  }, [potential, longestRun, computeStats])

  // Space play/pause, N (or .) step, R reset, G switch lattice, O overwrite.
  const stepRef = useRef(stepOnce); stepRef.current = stepOnce
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return
      const k = e.key.toLowerCase()
      if (k === " ") { e.preventDefault(); setRunning((r) => !r) }
      else if ((k === "n" || k === ".") && !runningRef.current) stepRef.current()
      else if (k === "r") reset()
      else if (k === "g") switchTopo(topoRef.current === "hex" ? "square" : "hex")
      else if (k === "o") setOverwrite((o) => !o)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [reset, switchTopo])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // view transform: cell size (zoom) + pan offset (px). Start centred on the grid.
    let cell = 12
    const view = { x: 0, y: 0, init: false }
    let viewDirty = true   // redraw when the camera (pan/zoom/resize) changes
    const SQ3_2 = Math.sqrt(3) / 2

    // Hexagon vertex offsets are constant for a given `cell`; recompute only when
    // the zoom changes, not per cell per frame (was 6 cos/sin × 8100 cells/frame).
    let hexR = -1
    const hexPts: Array<[number, number]> = Array.from({ length: 6 }, () => [0, 0])
    const rebuildHex = (gap: number) => {
      const r = cell * 0.56 - gap
      if (r === hexR) return
      hexR = r
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 90)
        hexPts[i] = [r * Math.cos(a), r * Math.sin(a)]
      }
    }

    const centre = () => {
      // centre on the grid's middle cell for both topologies
      const mid = GRID / 2
      const isHex = topoRef.current === "hex"
      const cx = isHex ? (mid + mid / 2) * cell : mid * cell
      const cy = isHex ? mid * SQ3_2 * cell : mid * cell
      view.x = canvas.clientWidth / 2 - cx
      view.y = canvas.clientHeight / 2 - cy
      view.init = true
      viewDirty = true
    }
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(canvas.clientWidth * dpr)
      canvas.height = Math.floor(canvas.clientHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!view.init) centre()
      viewDirty = true
    }
    resize()

    const render = () => {
      const g = gridRef.current
      const W = canvas.clientWidth, H = canvas.clientHeight
      ctx.clearRect(0, 0, W, H)
      const hot = hotRef.current   // cached; recomputed only on board change
      const gap = cell > 6 ? 1 : 0
      const isHex = topoRef.current === "hex"
      if (isHex) rebuildHex(gap)

      // Compute the visible cell-index window from the inverse view transform and
      // iterate ONLY those rows/cols, instead of all GRID×GRID cells every frame.
      // Square: x = (px−view.x)/cell. Hex axial: y = (py−view.y)/(√3/2·cell),
      // x = (px−view.x)/cell − y/2. We bound x and y generously (±2) to cover the
      // half-cell skew and partial edge cells, then clamp to the grid.
      let x0: number, x1: number, y0: number, y1: number
      if (isHex) {
        y0 = Math.floor((-view.y) / (SQ3_2 * cell)) - 2
        y1 = Math.ceil((H - view.y) / (SQ3_2 * cell)) + 2
        // x range depends on y (skew); widen by the full y-span half-shift
        const xLeft = Math.floor((-view.x) / cell - Math.max(y1, 0) / 2) - 2
        const xRight = Math.ceil((W - view.x) / cell - Math.min(y0, GRID) / 2) + 2
        x0 = xLeft; x1 = xRight
      } else {
        x0 = Math.floor((-view.x) / cell) - 1
        x1 = Math.ceil((W - view.x) / cell) + 1
        y0 = Math.floor((-view.y) / cell) - 1
        y1 = Math.ceil((H - view.y) / cell) + 1
      }
      x0 = Math.max(0, x0); x1 = Math.min(GRID - 1, x1)
      y0 = Math.max(0, y0); y1 = Math.min(GRID - 1, y1)

      // One flat background pass for the visible grid area (cheaper than a faint
      // fill per empty cell). Stones are drawn over it. Read live so the tint
      // flips with the theme (white lightens a dark board, black darkens a
      // light one) instead of vanishing in light mode.
      const overlayTint = getComputedStyle(document.documentElement).getPropertyValue("--color-overlay-tint").trim() || "#fff"
      const emptyFill = `color-mix(in srgb, ${overlayTint} 3%, transparent)`
      ctx.fillStyle = emptyFill
      const RED = "#a23a36", RED_HOT = "#e8584e", BLU = "#3a5fa2", BLU_HOT = "#4e8fe8"
      const half = cell / 2

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = isHex ? (x + y / 2) * cell + view.x : x * cell + view.x
          const py = isHex ? y * SQ3_2 * cell + view.y : y * cell + view.y
          const o = g[idx(x, y)]
          const isHot = o !== 0 && hot.has(idx(x, y))
          if (isHex) {
            const cx = px + half, cy = py + half
            ctx.beginPath()
            ctx.moveTo(cx + hexPts[0][0], cy + hexPts[0][1])
            for (let i = 1; i < 6; i++) ctx.lineTo(cx + hexPts[i][0], cy + hexPts[i][1])
            ctx.closePath()
            ctx.fillStyle = o === 0 ? emptyFill : o === 1 ? (isHot ? RED_HOT : RED) : (isHot ? BLU_HOT : BLU)
            ctx.fill()
          } else {
            ctx.fillStyle = o === 0 ? emptyFill : o === 1 ? (isHot ? RED_HOT : RED) : (isHot ? BLU_HOT : BLU)
            ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2)
          }
        }
      }
    }

    let acc = 0
    const MAX_STEPS_PER_FRAME = 12   // cap so a slow frame can't spiral
    const stopLoop = startFrameLoop((dt) => {
      if (recentreRef.current) { recentreRef.current = false; centre() }
      acc += dt
      const stepMs = 1000 / Math.max(1, speedRef.current)
      let stepped = false
      if (runningRef.current) {
        let n = 0
        while (acc >= stepMs && n < MAX_STEPS_PER_FRAME) { stepOnce(); acc -= stepMs; n++; stepped = true }
        if (acc > stepMs * MAX_STEPS_PER_FRAME) acc = 0  // drop backlog
      } else {
        acc = 0   // don't accumulate a backlog while paused
      }
      // Only repaint when the board advanced, the camera moved, or an out-of-loop
      // mutation (Step / seed / reset / topo) flagged a repaint — a paused,
      // un-touched board costs nothing per frame now.
      if (stepped || viewDirty || renderDirtyRef.current) {
        render()
        viewDirty = false
        renderDirtyRef.current = false
      }
      // push display refs → React state once per frame, only when changed
      if (dirtyRef.current) {
        dirtyRef.current = false
        setTurn(turnRef.current)
        setScores(scoresRef.current)
        setBest(bestRef.current)
        setStats(statsRef.current)
        setZipper(zipperRef.current)
      }
    })

    // --- interaction: drag to pan, scroll to zoom, click (no drag) to seed ---
    let dragging = false, moved = false
    let start = { x: 0, y: 0, vx: 0, vy: 0 }
    // Two pointers (a phone pinch) zoom about their midpoint and pan with it.
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch: { d: number; mx: number; my: number; cell: number; vx: number; vy: number } | null = null
    const pinchFrame = () => {
      const [a, b] = [...pointers.values()]
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
    }

    const cellAt = (clientX: number, clientY: number): [number, number] => {
      const r = canvas.getBoundingClientRect()
      const lx = clientX - r.left - view.x, ly = clientY - r.top - view.y
      if (topoRef.current === "hex") {
        // Hex centres sit at ((x + y/2)·cell + cell/2, y·(√3/2)·cell + cell/2).
        // Take the nearest centre among the few around the rough guess; a
        // square-box floor() put clicks near a hex's edge on its neighbour.
        const fy = (ly - cell / 2) / (SQ3_2 * cell)
        let bestX = 0, bestY = 0, bestD = Infinity
        for (let y = Math.floor(fy); y <= Math.ceil(fy); y++) {
          const fx = (lx - cell / 2) / cell - y / 2
          for (let x = Math.floor(fx); x <= Math.ceil(fx); x++) {
            const d = ((x + y / 2) * cell + cell / 2 - lx) ** 2 + (y * SQ3_2 * cell + cell / 2 - ly) ** 2
            if (d < bestD) { bestD = d; bestX = x; bestY = y }
          }
        }
        return [bestX, bestY]
      }
      return [Math.floor(lx / cell), Math.floor(ly / cell)]
    }
    // Pointer events (not mouse events): the canvas is touch-action:none, so on a
    // phone a drag would otherwise do nothing at all — no pan, no seeding.
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        pinch = { ...pinchFrame(), cell, vx: view.x, vy: view.y }
        moved = true   // a pinch never seeds a cell
        return
      }
      dragging = true; moved = false
      start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    }
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && pointers.size >= 2) {
        const f = pinchFrame()
        const r = canvas.getBoundingClientRect()
        const next = Math.max(3, Math.min(40, pinch.cell * f.d / Math.max(1, pinch.d)))
        const ratio = next / pinch.cell
        const ox = pinch.mx - r.left, oy = pinch.my - r.top
        cell = next
        view.x = ox - (ox - pinch.vx) * ratio + (f.mx - pinch.mx)
        view.y = oy - (oy - pinch.vy) * ratio + (f.my - pinch.my)
        viewDirty = true
        return
      }
      if (!dragging) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      view.x = start.vx + dx; view.y = start.vy + dy
      viewDirty = true
    }
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pinch) { if (pointers.size < 2) { pinch = null; dragging = false } return }
      if (dragging && !moved && e.type === "pointerup") {
        const [x, y] = cellAt(e.clientX, e.clientY)
        if (inB(x, y) && gridRef.current[idx(x, y)] === 0) {
          gridRef.current[idx(x, y)] = turnRef.current
          const bb = bboxRef.current
          if (x < bb.minX) bb.minX = x; if (x > bb.maxX) bb.maxX = x
          if (y < bb.minY) bb.minY = y; if (y > bb.maxY) bb.maxY = y
          turnRef.current = turnRef.current === 1 ? 2 : 1
          setTurn(turnRef.current)
          viewDirty = true   // repaint to show the seeded stone even while paused
        }
      }
      dragging = false
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      // world coords under cursor before zoom
      const wx = (mx - view.x) / cell, wy = (my - view.y) / cell
      const next = Math.max(3, Math.min(40, cell * Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.0025)))
      cell = next
      // keep the same world point under the cursor after zoom
      view.x = mx - wx * cell; view.y = my - wy * cell
      viewDirty = true
    }

    canvas.addEventListener("pointerdown", down)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    canvas.addEventListener("wheel", wheel, { passive: false })
    // ResizeObserver, not window resize: the stage can change size on its own
    // (OS-shell window resize, layout reflow).
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => {
      stopLoop()
      ro.disconnect()
      canvas.removeEventListener("pointerdown", down)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      canvas.removeEventListener("wheel", wheel)
    }
  }, [stepOnce, longestRun])

  return (
    <div className={styles.fsRoot}>
      <div className={styles.stage}>
        <header className={styles.header}>
          <h1>Progressions</h1>
          <p>
            Two makers race to build the longest arithmetic progression — the 2-D shadow of HeXO,
            where a win is a length-{TARGET} progression. Erdős–Selfridge potential drives each move.
          </p>
        </header>

        <div className={styles.scoreboard}>
          <div className={`${styles.scoreCard} ${styles.red}`}>
            <span className={styles.scoreName}>Red</span>
            <span className={styles.scoreVal}>{scores.red}</span>
            <span className={styles.scoreBest}>longest {best.red}</span>
          </div>
          <div className={styles.turnTag}>{turn === 1 ? "Red to move" : "Blue to move"}</div>
          <div className={`${styles.scoreCard} ${styles.blue}`}>
            <span className={styles.scoreName}>Blue</span>
            <span className={styles.scoreVal}>{scores.blue}</span>
            <span className={styles.scoreBest}>longest {best.blue}</span>
          </div>
        </div>

        <div className={styles.battlefield}>
          <div className={styles.boardWrap}>
            <canvas ref={canvasRef} className={styles.canvas} />
          </div>

          <aside className={styles.monitor}>
            <h2 className={styles.monitorTitle}>Order monitor</h2>
            <Metric label="Stones" value={String(stats.stones)} />
            <Bar label="Unlike neighbours" value={stats.unlike} hint="share of touching stones that are opposite colours" />
            <Bar label="One-colour triangles" value={stats.mono} hint="25% for random colours; 0% for a perfect antiferromagnet; near 100% when the sides separate" />
            <Bar label="Anisotropy" value={stats.anisotropy} hint="axis imbalance — symmetry breaking" />
            <Metric label="Fork sites (τ>2)" value={String(stats.forks)} />
            <Metric label="Longest — Red" value={String(best.red)} />
            <Metric label="Longest — Blue" value={String(best.blue)} />
            <p className={styles.monitorNote} data-live={zipper ? true : undefined}>
              {zipper || "no zipper running"}
            </p>
            <p className={styles.monitorNote}>
              Each side blocks the other with its very next stone, so the pair run off in
              lock-step <em>zippers</em> between the lattice&rsquo;s axes, and neither ever gets
              two on a line. The walls turn them, and the board fills with stripes. The colours
              behave like a triangular antiferromagnet: neighbours want to differ, but no
              triangle can have all three pairs differ, so no single crystal wins. Stripes and
              defects, then, not a quasicrystal. Below a defence weight of about 0.6 the sides
              separate into territories instead, and one-colour triangles jump toward 100%.
            </p>
          </aside>
        </div>

        <div className={styles.controls}>
          <button className={styles.primary} onClick={() => setRunning((r) => !r)}>{running ? "❚❚ Pause" : "▶ Play"}</button>
          <button onClick={() => { if (!running) stepOnce() }} disabled={running}>Step</button>
          <button onClick={reset}>Reset</button>
          <button
            className={topo === "hex" ? styles.toggleOn : ""}
            onClick={() => switchTopo(topo === "hex" ? "square" : "hex")}
            title="Switch lattice topology"
          >
            {topo === "hex" ? "⬡ Hex grid" : "▦ Square grid"}
          </button>
          <button
            className={overwrite ? styles.toggleOn : ""}
            onClick={() => setOverwrite((o) => !o)}
            title="Allow agents to overwrite the opponent's stones"
          >
            {overwrite ? "⟳ Overwrite: on" : "⟳ Overwrite: off"}
          </button>
          <button
            className={randomTies ? styles.toggleOn : ""}
            onClick={() => setRandomTies((v) => !v)}
            title="Break equal scores at random instead of by scan order (the zippers survive either way)"
          >
            {randomTies ? "Ties: random" : "Ties: first"}
          </button>
        </div>
        <div className={styles.sliders}>
          <label>Speed — {speed}/s<input type="range" min={1} max={120} value={speed} onChange={(e) => setSpeed(+e.target.value)} /></label>
          <label>Defence weight — {blockWeight.toFixed(1)}<input type="range" min={0} max={20} value={Math.round(blockWeight * 10)} onChange={(e) => setBlockWeight(+e.target.value / 10)} /></label>
        </div>
        <p className={styles.note}>
          {topo === "hex" ? "Hex lattice (3 axes — HeXO's geometry)." : "Square lattice (4 axes)."}{" "}
          {overwrite
            ? "Overwrite ON: agents may claim opponent cells — a non-monotone CA on a bounded board (cycles, standing waves, the “CRT” regime)."
            : "Stones are permanent — a point is scored for each axis on which a stone forms a line of six or more."}{" "}
          Defence weight 0 = pure greedy builders; higher = each side also blocks the other's
          near-complete progressions (the pairing idea behind the infinite-Hex draw).
          <span className="on-desktop">Drag to pan, scroll to zoom, click a cell to seed it. Space play/pause · N step · R reset · G lattice · O overwrite.</span>
          <span className="on-touch">Drag to pan, pinch to zoom, tap a cell to seed it.</span>
        </p>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricVal}>{value}</span>
    </div>
  )
}

function Bar({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className={styles.barRow} title={hint}>
      <div className={styles.barHead}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricVal}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${Math.round(value * 100)}%` }} /></div>
    </div>
  )
}
