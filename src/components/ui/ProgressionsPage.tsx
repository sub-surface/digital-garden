import { useEffect, useRef, useState, useCallback } from "react"
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

type Topo = "square" | "hex"
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
  // live spectral / order stats, updated each step (ref-authoritative)
  const [stats, setStats] = useState({ stones: 0, order: 0, forks: 0, anisotropy: 0 })
  const statsRef = useRef({ stones: 0, order: 0, forks: 0, anisotropy: 0 })
  const stepCountRef = useRef(0)
  // Cached hot-line cells (the longest runs to highlight). The board changes by
  // one cell per step, so we recompute this ONLY in stepOnce — never per render
  // frame. Render just draws the cache. This is the whole performance fix.
  const hotRef = useRef<Set<number>>(new Set())
  // Active-play bounding box, so candidate generation scans a small window around
  // the stones instead of the whole 90×90 grid every step.
  const bboxRef = useRef({ minX: GRID, minY: GRID, maxX: -1, maxY: -1 })

  const idx = (x: number, y: number) => y * GRID + x
  const inB = (x: number, y: number) => x >= 0 && x < GRID && y >= 0 && y < GRID

  const reset = useCallback(() => {
    gridRef.current.fill(0)
    hotRef.current = new Set()
    bboxRef.current = { minX: GRID, minY: GRID, maxX: -1, maxY: -1 }
    scoresRef.current = { red: 0, blue: 0 }
    bestRef.current = { red: 0, blue: 0 }
    statsRef.current = { stones: 0, order: 0, forks: 0, anisotropy: 0 }
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

  // Cheap spectral / order statistics on the live stone set — the toy analog of
  // the diffraction analysis in HeXO Theory. We don't run a full 2-D FFT every
  // frame; instead we measure:
  //   order      — peakedness of the radial pair-correlation g(r): how much the
  //                stone-to-stone distance histogram concentrates at preferred
  //                spacings (a quasicrystal/Bragg signature) vs spreads out (noise).
  //   forks      — cells sitting in ≥2 near-complete (≥3-own, open) lines: τ>2 sites.
  //   anisotropy — how unevenly stones align across the lattice axes.
  const computeStats = useCallback((g: Uint8Array) => {
    const pts: Array<[number, number]> = []
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (g[idx(x, y)]) pts.push([x, y])
    const n = pts.length
    if (n < 4) return { stones: n, order: 0, forks: 0, anisotropy: 0 }

    // radial pair-correlation histogram (sample pairs to stay O(n·k))
    const BINS = 24, MAXD = 14
    const hist = new Float64Array(BINS)
    const sampleCap = Math.min(n, 120)
    let pairs = 0
    for (let i = 0; i < sampleCap; i++) {
      const [ax, ay] = pts[i]
      for (let j = i + 1; j < sampleCap; j++) {
        const [bx, by] = pts[j]
        const d = Math.hypot(ax - bx, ay - by)
        if (d > 0 && d <= MAXD) { hist[Math.min(BINS - 1, Math.floor(d / MAXD * BINS))]++; pairs++ }
      }
    }
    // "order" = normalised peakedness (max bin / mean bin), mapped to 0..1
    let mx = 0, sum = 0
    for (let b = 0; b < BINS; b++) { if (hist[b] > mx) mx = hist[b]; sum += hist[b] }
    const mean = sum / BINS
    const order = mean > 0 ? Math.min(1, (mx / mean - 1) / 6) : 0

    // axis anisotropy: variance of per-axis adjacent-pair counts
    const dirs = dirsRef.current
    const axisCounts = dirs.map(([dx, dy]) => {
      let c = 0
      for (const [x, y] of pts) if (inB(x + dx, y + dy) && g[idx(x + dx, y + dy)]) c++
      return c
    })
    const aMean = axisCounts.reduce((a, b) => a + b, 0) / axisCounts.length || 1
    const aVar = axisCounts.reduce((a, b) => a + (b - aMean) ** 2, 0) / axisCounts.length
    const anisotropy = aMean > 0 ? Math.min(1, Math.sqrt(aVar) / aMean) : 0

    // fork sites: occupied cells in >=2 open lines with >=3 own stones
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
    return { stones: n, order, forks, anisotropy }
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
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          if (inB(x + dx, y + dy) && g[idx(x + dx, y + dy)]) { near = true; break }
        }
        if (near) cand.push([x, y])
      }
    }
    if (!cand.length) return
    let bx = cand[0][0], by = cand[0][1], bs = -Infinity
    for (const [x, y] of cand) {
      const off = potential(g, x, y, who)
      const def = potential(g, x, y, opp) * blockRef.current
      const s = off + def
      if (s > bs) { bs = s; bx = x; by = y }
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
    let myRun: number[] = [idx(bx, by)]
    for (const [dx, dy] of dirsRef.current) {
      const line: number[] = [idx(bx, by)]
      let cx = bx + dx, cy = by + dy
      while (inB(cx, cy) && g[idx(cx, cy)] === who) { line.push(idx(cx, cy)); cx += dx; cy += dy }
      cx = bx - dx; cy = by - dy
      while (inB(cx, cy) && g[idx(cx, cy)] === who) { line.unshift(idx(cx, cy)); cx -= dx; cy -= dy }
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
    // Stones are PERMANENT — never cleared or overwritten. Score a point the
    // moment a run first reaches exactly TARGET (the completing stone). A run that
    // later grows to 7+ won't re-score because we test `=== TARGET`, not `>=`.
    if (myRun.length === TARGET) {
      scoresRef.current = who === 1
        ? { ...scoresRef.current, red: scoresRef.current.red + 1 }
        : { ...scoresRef.current, blue: scoresRef.current.blue + 1 }
      dirtyRef.current = true
    }
    turnRef.current = who === 1 ? 2 : 1
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

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(canvas.clientWidth * dpr)
      canvas.height = Math.floor(canvas.clientHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!view.init) {
        // centre on the grid's middle cell for both topologies
        const mid = GRID / 2
        const isHex = topoRef.current === "hex"
        const cx = isHex ? (mid + mid / 2) * cell : mid * cell
        const cy = isHex ? mid * SQ3_2 * cell : mid * cell
        view.x = canvas.clientWidth / 2 - cx
        view.y = canvas.clientHeight / 2 - cy
        view.init = true
      }
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
      // fill per empty cell). Stones are drawn over it.
      ctx.fillStyle = "rgba(255,255,255,0.03)"
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
            ctx.fillStyle = o === 0 ? "rgba(255,255,255,0.03)" : o === 1 ? (isHot ? RED_HOT : RED) : (isHot ? BLU_HOT : BLU)
            ctx.fill()
          } else {
            ctx.fillStyle = o === 0 ? "rgba(255,255,255,0.03)" : o === 1 ? (isHot ? RED_HOT : RED) : (isHot ? BLU_HOT : BLU)
            ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2)
          }
        }
      }
    }

    let raf = 0, acc = 0, last = 0
    const MAX_STEPS_PER_FRAME = 12   // cap so a slow frame can't spiral
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (!last) last = t
      acc += t - last
      last = t
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
      }
    }
    raf = requestAnimationFrame(loop)

    // --- interaction: drag to pan, scroll to zoom, click (no drag) to seed ---
    let dragging = false, moved = false
    let start = { x: 0, y: 0, vx: 0, vy: 0 }

    const cellAt = (clientX: number, clientY: number): [number, number] => {
      const r = canvas.getBoundingClientRect()
      const lx = clientX - r.left - view.x, ly = clientY - r.top - view.y
      if (topoRef.current === "hex") {
        // invert axial→pixel: py = y*(√3/2)*cell, px = (x + y/2)*cell
        const y = Math.floor((ly / (Math.sqrt(3) / 2 * cell)))
        const x = Math.floor(lx / cell - y / 2)
        return [x, y]
      }
      return [Math.floor(lx / cell), Math.floor(ly / cell)]
    }
    const down = (e: MouseEvent) => {
      dragging = true; moved = false
      start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    }
    const move = (e: MouseEvent) => {
      if (!dragging) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      view.x = start.vx + dx; view.y = start.vy + dy
      viewDirty = true
    }
    const up = (e: MouseEvent) => {
      if (dragging && !moved) {
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
      const next = Math.max(3, Math.min(40, cell * (e.deltaY < 0 ? 1.12 : 0.89)))
      cell = next
      // keep the same world point under the cursor after zoom
      view.x = mx - wx * cell; view.y = my - wy * cell
      viewDirty = true
    }

    canvas.addEventListener("mousedown", down)
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    canvas.addEventListener("wheel", wheel, { passive: false })
    window.addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener("mousedown", down)
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
      canvas.removeEventListener("wheel", wheel)
      window.removeEventListener("resize", resize)
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
            <h2 className={styles.monitorTitle}>Spectral monitor</h2>
            <Metric label="Stones" value={String(stats.stones)} />
            <Bar label="Order (Bragg)" value={stats.order} hint="peakedness of g(r) — quasicrystal signature" />
            <Bar label="Anisotropy" value={stats.anisotropy} hint="axis imbalance — symmetry breaking" />
            <Metric label="Fork sites (τ>2)" value={String(stats.forks)} />
            <Metric label="Longest — Red" value={String(best.red)} />
            <Metric label="Longest — Blue" value={String(best.blue)} />
            <p className={styles.monitorNote}>
              The toy analog of HeXO's diffraction analysis: high order = stones settling
              into preferred spacings; fork sites are τ&gt;2 pressure points.
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
        </div>
        <div className={styles.sliders}>
          <label>Speed — {speed}/s<input type="range" min={1} max={120} value={speed} onChange={(e) => setSpeed(+e.target.value)} /></label>
          <label>Defence weight — {blockWeight.toFixed(1)}<input type="range" min={0} max={20} value={Math.round(blockWeight * 10)} onChange={(e) => setBlockWeight(+e.target.value / 10)} /></label>
        </div>
        <p className={styles.note}>
          {topo === "hex" ? "Hex lattice (3 axes — HeXO's geometry)." : "Square lattice (4 axes)."}{" "}
          {overwrite
            ? "Overwrite ON: agents may claim opponent cells — a non-monotone CA on a bounded board (cycles, standing waves, the “CRT” regime)."
            : "Stones are permanent — a point is scored each time a side completes a length-6 progression."}{" "}
          Defence weight 0 = pure greedy builders; higher = each side also blocks the other's
          near-complete progressions (the pairing idea behind the infinite-Hex draw).
          Drag to pan, scroll to zoom, click a cell to seed it.
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
