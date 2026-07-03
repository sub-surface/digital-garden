import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { GameCabinet, type CabinetStatus } from "./GameCabinet"
import styles from "./SigilPage.module.scss"

/**
 * SIGIL — a non-crossing path-routing puzzle (Numberlink family) drawn as an
 * inscribed occult diagram. Pairs of instrument-terminals sit on a plate; the
 * player draws leader lines connecting each pair; lines may not cross. On
 * solve, the figure is re-plotted in one bright pen pass and the plate emits a
 * seal glyph + seed code.
 *
 * Everything is client-side and deterministic per seed: the generator lays a
 * full snake-partition solution first, then hands the player the endpoints —
 * so every plate is solvable by construction (and fillable in fill mode).
 */

// Board generation + PRNG live in src/lib/sigil.ts (pure, headlessly tested).
import { generateBoard, hashStr, type Cell, type Pair } from "@/lib/sigil"

// Deterministic per-cell jitter so hand-drawn lines don't shimmer frame to frame
function jitter(x: number, y: number, salt: number): number {
  const h = hashStr(`${x},${y},${salt}`)
  return ((h % 1000) / 1000 - 0.5) * 2
}

const todaySeed = () => new Date().toISOString().slice(0, 10)

// ─── Component ───────────────────────────────────────────────────────────────
export function SigilPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [level, setLevel] = useState(1)
  const [seed, setSeed] = useState(() => `plate-${Math.floor(Math.random() * 1e6)}`)
  const [requireFill, setRequireFill] = useState(false)
  const [moves, setMoves] = useState(0)
  const [status, setStatus] = useState<CabinetStatus>("playing")
  const [, forceRender] = useState(0)
  const bump = () => forceRender(v => v + 1)

  const n = Math.min(8, 4 + level) // 5 → 8
  const board = useMemo(() => generateBoard(n, seed), [n, seed])

  // Mutable interaction state (never triggers React re-render mid-drag)
  const dragRef = useRef<{ pairId: number; moved: boolean } | null>(null)
  const undoRef = useRef<Map<number, Cell[]>[]>([])
  const plotRef = useRef<{ t0: number } | null>(null)
  const colorsRef = useRef<{ pens: string[]; ink: string; muted: string; faint: string }>({ pens: [], ink: "", muted: "", faint: "" })

  const idx = useCallback((x: number, y: number) => y * board.n + x, [board])

  // Reset per new board
  useEffect(() => {
    undoRef.current = []
    plotRef.current = null
    setMoves(0)
    setStatus("playing")
  }, [board])

  const refreshColors = useCallback(() => {
    const css = (p: string) => getComputedStyle(document.documentElement).getPropertyValue(p).trim()
    const base = [
      css("--color-primary") || "#b4424c",
      css("--color-secondary") || "#424cb4",
      css("--color-tertiary") || "#42b464",
      css("--color-accent") || "#b4424c",
      css("--color-text") || "#e0e0e0",
    ]
    // extend deterministically by rotating hue via canvas-free trick: reuse base
    colorsRef.current = {
      pens: Array.from({ length: 12 }, (_, i) => base[i % base.length]),
      ink: css("--color-text") || "#e0e0e0",
      muted: css("--color-text-muted") || "#8e8e93",
      faint: css("--color-border") || "#2a2a30",
    }
  }, [])

  const isWon = useCallback((): boolean => {
    for (const pair of board.pairs) {
      const path = board.paths.get(pair.id)
      if (!path || path.length < 2) return false
      const first = path[0], last = path[path.length - 1]
      const connectsAB =
        (first.x === pair.a.x && first.y === pair.a.y && last.x === pair.b.x && last.y === pair.b.y) ||
        (first.x === pair.b.x && first.y === pair.b.y && last.x === pair.a.x && last.y === pair.a.y)
      if (!connectsAB) return false
    }
    if (requireFill) {
      for (let i = 0; i < board.owner.length; i++) if (board.owner[i] === -1) return false
    }
    return true
  }, [board, requireFill])

  const pushUndo = useCallback(() => {
    const snap = new Map<number, Cell[]>()
    for (const [k, v] of board.paths) snap.set(k, v.map(c => ({ ...c })))
    undoRef.current.push(snap)
    if (undoRef.current.length > 100) undoRef.current.shift()
  }, [board])

  const rebuildOwner = useCallback(() => {
    board.owner.fill(-1)
    for (const [pid, path] of board.paths) for (const c of path) board.owner[idx(c.x, c.y)] = pid
  }, [board, idx])

  // ─── Rendering ─────────────────────────────────────────────────────────────
  const drawBoard = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const size = canvas.clientWidth
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr
      canvas.height = size * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    if (!colorsRef.current.ink) refreshColors()
    const { pens, ink, muted, faint } = colorsRef.current
    const N = board.n
    const margin = size * 0.09
    const inner = size - margin * 2
    const cell = inner / N
    const cx = (c: number) => margin + (c + 0.5) * cell
    const cy = (c: number) => margin + (c + 0.5) * cell

    // 1. Plate chrome: ruler-tick frame + corner registration blocks
    ctx.strokeStyle = faint
    ctx.globalAlpha = 0.9
    ctx.lineWidth = 1
    ctx.strokeRect(margin * 0.45, margin * 0.45, size - margin * 0.9, size - margin * 0.9)
    ctx.beginPath()
    const ticks = N * 4
    for (let i = 0; i <= ticks; i++) {
      const t = margin * 0.45 + (i / ticks) * (size - margin * 0.9)
      const len = i % 4 === 0 ? 6 : 3
      ctx.moveTo(t, margin * 0.45); ctx.lineTo(t, margin * 0.45 + len)
      ctx.moveTo(t, size - margin * 0.45); ctx.lineTo(t, size - margin * 0.45 - len)
      ctx.moveTo(margin * 0.45, t); ctx.lineTo(margin * 0.45 + len, t)
      ctx.moveTo(size - margin * 0.45, t); ctx.lineTo(size - margin * 0.45 - len, t)
    }
    ctx.stroke()
    // corner registration blocks (segmented barcode)
    ctx.fillStyle = muted
    const segSeed = hashStr(board.seed)
    for (let i = 0; i < 7; i++) {
      if ((segSeed >> i) & 1) ctx.fillRect(margin * 0.55 + i * 4, margin * 0.62, 2.5, 6)
      if ((segSeed >> (i + 7)) & 1) ctx.fillRect(size - margin * 0.55 - i * 4, size - margin * 0.68, 2.5, 6)
    }

    // 2. Grid lattice
    ctx.strokeStyle = faint
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    for (let i = 0; i <= N; i++) {
      const t = margin + i * cell
      ctx.moveTo(margin, t); ctx.lineTo(size - margin, t)
      ctx.moveTo(t, margin); ctx.lineTo(t, size - margin)
    }
    ctx.stroke()
    // lattice dots at intersections
    ctx.fillStyle = muted
    ctx.globalAlpha = 0.5
    for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
      ctx.fillRect(margin + x * cell - 1, margin + y * cell - 1, 2, 2)
    }
    ctx.globalAlpha = 1

    // Plot flourish progress (0 → 1 over ~700ms)
    const plot = plotRef.current
    const plotT = plot ? Math.min(1, (performance.now() - plot.t0) / 700) : -1

    // 3. Paths (leader lines through cell centres, deterministic jitter)
    for (const [pid, path] of board.paths) {
      if (path.length < 1) continue
      const pen = pens[board.pairs[pid].pen % pens.length]
      const jAmp = cell * 0.03
      const drawPathLine = (upTo: number, width: number, alpha: number) => {
        ctx.strokeStyle = pen
        ctx.globalAlpha = alpha
        ctx.lineWidth = width
        ctx.lineJoin = "round"
        ctx.lineCap = "round"
        ctx.beginPath()
        for (let i = 0; i <= upTo && i < path.length; i++) {
          const c = path[i]
          const jx = jitter(c.x, c.y, pid) * jAmp
          const jy = jitter(c.x, c.y, pid + 31) * jAmp
          const px = cx(c.x) + jx, py = cy(c.y) + jy
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
      drawPathLine(path.length - 1, Math.max(2, cell * 0.14), 0.55)
      // stipple overlay: 1px dotted re-trace for the plotter texture
      ctx.setLineDash([1, 5])
      drawPathLine(path.length - 1, 1, 0.9)
      ctx.setLineDash([])
      // PLOT pass: bright re-stroke sweeping head-to-tail on win
      if (plotT >= 0) {
        const upTo = Math.floor(plotT * (path.length - 1))
        drawPathLine(upTo, Math.max(2.5, cell * 0.16), 1)
      }
    }

    // 4. Terminals: filled node + instrument glyph in the pair's pen
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (const pair of board.pairs) {
      const pen = pens[pair.pen % pens.length]
      for (const t of [pair.a, pair.b]) {
        const connected = (() => {
          const p = board.paths.get(pair.id)
          if (!p || p.length < 2) return false
          const f = p[0], l = p[p.length - 1]
          return (f.x === t.x && f.y === t.y) || (l.x === t.x && l.y === t.y)
        })()
        const r = cell * 0.3
        ctx.globalAlpha = 1
        ctx.strokeStyle = pen
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx(t.x), cy(t.y), r, 0, Math.PI * 2)
        ctx.stroke()
        if (connected) {
          ctx.globalAlpha = 0.25
          ctx.fillStyle = pen
          ctx.fill()
        }
        ctx.globalAlpha = 1
        ctx.fillStyle = pen
        ctx.font = `${Math.max(10, cell * 0.34)}px 'IBM Plex Mono', monospace`
        ctx.fillText(pair.glyph, cx(t.x), cy(t.y) + 0.5)
      }
    }

    // 5. Seal glyph + code in the margin after the plot pass completes
    if (plotT >= 1) {
      ctx.globalAlpha = 1
      ctx.fillStyle = ink
      ctx.font = `10px 'IBM Plex Mono', monospace`
      ctx.textAlign = "right"
      ctx.fillText(`SIGIL-${board.seed}`, size - margin * 0.55, size - margin * 0.28)
      // seal: a small radial glyph generated from the seed
      const sx = margin * 0.85, sy = size - margin * 0.75
      const h = hashStr(board.seed + "seal")
      ctx.strokeStyle = pens[0]
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(sx, sy, 9, 0, Math.PI * 2)
      for (let i = 0; i < 8; i++) {
        if ((h >> i) & 1) {
          const a = (i / 8) * Math.PI * 2
          ctx.moveTo(sx, sy)
          ctx.lineTo(sx + Math.cos(a) * 9, sy + Math.sin(a) * 9)
        }
      }
      ctx.stroke()
    }

    if (plotT >= 0 && plotT < 1) requestAnimationFrame(drawBoard)
  }, [board, refreshColors])

  // Redraw on board change / element resize / theme change. ResizeObserver
  // (not window resize) so zen-mode toggles — which change the container, not
  // the window — rescale the plate too.
  useEffect(() => {
    drawBoard()
    const ro = new ResizeObserver(() => drawBoard())
    if (canvasRef.current) ro.observe(canvasRef.current)
    const mo = new MutationObserver(() => { colorsRef.current.ink = ""; drawBoard() })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [drawBoard])

  // ─── Interaction ───────────────────────────────────────────────────────────
  const cellAt = useCallback((e: { clientX: number; clientY: number }): Cell | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const size = rect.width
    const margin = size * 0.09
    const cell = (size - margin * 2) / board.n
    const x = Math.floor((e.clientX - rect.left - margin) / cell)
    const y = Math.floor((e.clientY - rect.top - margin) / cell)
    if (x < 0 || x >= board.n || y < 0 || y >= board.n) return null
    return { x, y }
  }, [board])

  const terminalPairAt = useCallback((c: Cell): Pair | null =>
    board.pairs.find(p => (p.a.x === c.x && p.a.y === c.y) || (p.b.x === c.x && p.b.y === c.y)) ?? null,
  [board])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (status === "won") return
    const c = cellAt(e)
    if (!c) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const owned = board.owner[idx(c.x, c.y)]
    const terminal = terminalPairAt(c)

    // Resume from a live end of a partial path
    if (owned !== -1) {
      const path = board.paths.get(owned)
      if (path && path.length > 0) {
        const end = path[path.length - 1]
        if (end.x === c.x && end.y === c.y && !terminalPairAt(end)) {
          pushUndo()
          dragRef.current = { pairId: owned, moved: false }
          return
        }
      }
    }

    if (terminal) {
      // Start (or restart) drawing from this terminal
      pushUndo()
      board.paths.set(terminal.id, [{ ...c }])
      rebuildOwner()
      dragRef.current = { pairId: terminal.id, moved: false }
      drawBoard()
      return
    }

    if (owned !== -1) {
      // Tap on an existing path body — clear it
      pushUndo()
      board.paths.delete(owned)
      rebuildOwner()
      setMoves(m => m + 1)
      drawBoard()
      bump()
    }
  }, [board, cellAt, terminalPairAt, idx, pushUndo, rebuildOwner, drawBoard, status])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || status === "won") return
    const c = cellAt(e)
    if (!c) return
    const path = board.paths.get(drag.pairId)
    if (!path || path.length === 0) return
    const end = path[path.length - 1]
    if (end.x === c.x && end.y === c.y) return
    const dx = Math.abs(c.x - end.x), dy = Math.abs(c.y - end.y)
    if (dx + dy !== 1) return // orthogonal steps only

    // Backtrack over own path retracts
    if (path.length >= 2) {
      const prev = path[path.length - 2]
      if (prev.x === c.x && prev.y === c.y) {
        board.owner[idx(end.x, end.y)] = -1
        path.pop()
        drag.moved = true
        drawBoard()
        return
      }
    }

    // Path is finished once it spans terminal→terminal — don't extend past
    const pair = board.pairs[drag.pairId]
    const startsAtTerminal = (p: Cell) => (p.x === pair.a.x && p.y === pair.a.y) || (p.x === pair.b.x && p.y === pair.b.y)
    if (path.length >= 2 && startsAtTerminal(path[0]) && startsAtTerminal(end)) return

    const targetOwner = board.owner[idx(c.x, c.y)]
    if (targetOwner !== -1 && targetOwner !== drag.pairId) return // blocked
    const targetTerminal = terminalPairAt(c)
    if (targetTerminal && targetTerminal.id !== drag.pairId) return // someone else's terminal

    path.push({ ...c })
    board.owner[idx(c.x, c.y)] = drag.pairId
    drag.moved = true
    drawBoard()
  }, [board, cellAt, terminalPairAt, idx, drawBoard, status])

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.moved) setMoves(m => m + 1)
    else undoRef.current.pop() // no-op press — drop the snapshot
    rebuildOwner()
    if (isWon()) {
      setStatus("won")
      plotRef.current = { t0: performance.now() }
      // persist bests + daily completion
      const totalLen = [...board.paths.values()].reduce((s, p) => s + p.length, 0)
      const optimality = Math.round((board.plateLength / Math.max(1, totalLen)) * 100)
      const bestKey = `sigil.best.${board.n}`
      const prev = parseInt(localStorage.getItem(bestKey) ?? "0", 10) || 0
      if (optimality > prev) localStorage.setItem(bestKey, String(optimality))
      if (board.seed === todaySeed()) localStorage.setItem(`sigil.daily.${board.seed}`, "1")
      requestAnimationFrame(drawBoard)
    }
    bump()
  }, [board, isWon, rebuildOwner, drawBoard])

  const undo = useCallback(() => {
    const snap = undoRef.current.pop()
    if (!snap) return
    board.paths.clear()
    for (const [k, v] of snap) board.paths.set(k, v)
    rebuildOwner()
    setStatus("playing")
    plotRef.current = null
    drawBoard()
    bump()
  }, [board, rebuildOwner, drawBoard])

  const reset = useCallback(() => {
    pushUndo()
    board.paths.clear()
    rebuildOwner()
    setStatus("playing")
    plotRef.current = null
    setMoves(0)
    drawBoard()
    bump()
  }, [board, pushUndo, rebuildOwner, drawBoard])

  const newPlate = useCallback((advance: boolean) => {
    if (advance) setLevel(l => Math.min(4, l + 1))
    setSeed(`plate-${Math.floor(Math.random() * 1e6)}`)
  }, [])

  const connectedCount = board.pairs.filter(p => {
    const path = board.paths.get(p.id)
    if (!path || path.length < 2) return false
    const f = path[0], l = path[path.length - 1]
    const at = (c: Cell, t: Cell) => c.x === t.x && c.y === t.y
    return (at(f, p.a) && at(l, p.b)) || (at(f, p.b) && at(l, p.a))
  }).length

  const totalLen = [...board.paths.values()].reduce((s, p) => s + p.length, 0)
  const optimality = status === "won" ? Math.round((board.plateLength / Math.max(1, totalLen)) * 100) : 0
  const dailyDone = typeof localStorage !== "undefined" && localStorage.getItem(`sigil.daily.${todaySeed()}`) === "1"

  return (
    <GameCabinet
      title="SIGIL"
      blurb="Inscribe the plate: connect each pair of instruments with leader lines that never cross. A completed board is a drawn sigil."
      status={status}
      onStart={status === "won" ? () => newPlate(true) : undefined}
      endMessage={status === "won" ? `plate inscribed — ${optimality}% of plate length` : undefined}
      score={{ value: optimality, bestKey: `sigil.best.${board.n}`, label: "optimality %" }}
      hint="drag from a terminal · drag back to retract · tap a line to erase"
      zen
      controls={
        <div className={styles.controls}>
          <button onClick={() => newPlate(false)}>new plate</button>
          <button onClick={reset}>reset</button>
          <button onClick={undo}>undo</button>
          <button
            onClick={() => { setRequireFill(f => !f); setStatus("playing"); plotRef.current = null; bump() }}
            data-active={requireFill || undefined}
            title="fill mode: every cell must be covered (classic Numberlink)"
          >
            {requireFill ? "mode: fill" : "mode: connect"}
          </button>
          <button
            onClick={() => { setSeed(todaySeed()); setLevel(3) }}
            data-active={board.seed === todaySeed() || undefined}
            title={dailyDone ? "today's plate — inscribed" : "today's plate"}
          >
            daily{dailyDone ? " ✓" : ""}
          </button>
        </div>
      }
    >
      <div ref={wrapRef} className={styles.plateWrap}>
        <canvas
          ref={canvasRef}
          className={styles.plate}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className={styles.telemetry}>
          <span>plate {board.n}×{board.n}</span>
          <span>pairs {connectedCount}/{board.pairs.length}</span>
          <span>moves {moves}</span>
          <span>plate length {board.plateLength}</span>
          <span>seed {board.seed}</span>
        </div>
      </div>
    </GameCabinet>
  )
}
