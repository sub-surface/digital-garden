import { useState, useMemo, useRef, useCallback, useEffect } from "react"
import { initialState, placeStone, key, stonesLeft, type HexoState } from "@/lib/hexo"
import styles from "./HexoPage.module.scss"

const HEX_SIZE = 22 // px radius
const MARGIN_RING = 3 // empty hexes drawn beyond placed stones
const DRAG_THRESHOLD = 5 // px the pointer must travel before a left-drag becomes a pan

// axial → pixel (pointy-top)
function hexToPixel(q: number, r: number): { x: number; y: number } {
  return { x: HEX_SIZE * Math.sqrt(3) * (q + r / 2), y: HEX_SIZE * (3 / 2) * r }
}

// pixel → axial (pointy-top), rounded to nearest hex
function pixelToHex(x: number, y: number): { q: number; r: number } {
  const r = (y * 2) / 3 / HEX_SIZE
  const q = x / (HEX_SIZE * Math.sqrt(3)) - r / 2
  // cube rounding
  let rx = q, rz = r, ry = -rx - rz
  let xr = Math.round(rx), yr = Math.round(ry), zr = Math.round(rz)
  const dx = Math.abs(xr - rx), dy = Math.abs(yr - ry), dz = Math.abs(zr - rz)
  if (dx > dy && dx > dz) xr = -yr - zr
  else if (dy > dz) yr = -xr - zr
  else zr = -xr - yr
  return { q: xr, r: zr }
}

function hexPoints(cx: number, cy: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    pts.push(`${(cx + HEX_SIZE * Math.cos(angle)).toFixed(2)},${(cy + HEX_SIZE * Math.sin(angle)).toFixed(2)}`)
  }
  return pts.join(" ")
}

interface Annotations {
  highlights: Set<string>          // cell keys with a highlight ring
  arrows: Array<[string, string]>  // [fromKey, toKey]
}

interface BoardProps {
  state: HexoState
  onPlace: (q: number, r: number) => void
  annotations: Annotations
  setAnnotations: React.Dispatch<React.SetStateAction<Annotations>>
  wide?: boolean
}

/** The interactive SVG board — shared between the normal and zen views. */
function HexoBoard({ state, onPlace, annotations, setAnnotations, wide }: BoardProps) {
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [hover, setHover] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Gesture state. button 0 = left (pan / place), button 2 = right (annotate).
  const gesture = useRef<{
    button: number
    originX: number; originY: number   // screen-space pointer origin
    startPan: { x: number; y: number }
    moved: boolean
    fromCell: string | null            // for right-drag arrows
  } | null>(null)

  const vbW = wide ? 1200 : 600
  const vbH = wide ? 560 : 480
  const cx0 = vbW / 2
  const cy0 = vbH / 2

  // Convert a screen pointer event to board (pre-transform) coordinates.
  const eventToBoard = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    // map client → viewBox px
    const vx = ((clientX - rect.left) / rect.width) * vbW
    const vy = ((clientY - rect.top) / rect.height) * vbH
    // undo the <g> translate+scale
    return { x: (vx - cx0 - pan.x) / zoom, y: (vy - cy0 - pan.y) / zoom }
  }, [pan, zoom, vbW, vbH, cx0, cy0])

  const cellAt = useCallback((clientX: number, clientY: number) => {
    const b = eventToBoard(clientX, clientY)
    const { q, r } = pixelToHex(b.x, b.y)
    return key(q, r)
  }, [eventToBoard])

  // Visible cell set: all placed cells ∪ margin ring, min patch at origin.
  const cells = useMemo(() => {
    const set = new Set<string>()
    let minQ = -4, maxQ = 4, minR = -4, maxR = 4
    for (const k of state.stones.keys()) {
      const [q, r] = k.split(",").map(Number)
      minQ = Math.min(minQ, q - MARGIN_RING); maxQ = Math.max(maxQ, q + MARGIN_RING)
      minR = Math.min(minR, r - MARGIN_RING); maxR = Math.max(maxR, r + MARGIN_RING)
    }
    for (let r = minR; r <= maxR; r++)
      for (let q = minQ; q <= maxQ; q++)
        set.add(key(q, r))
    return [...set].map((k) => { const [q, r] = k.split(",").map(Number); return { q, r, k } })
  }, [state.stones])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    gesture.current = {
      button: e.button,
      originX: e.clientX, originY: e.clientY,
      startPan: { ...pan },
      moved: false,
      fromCell: e.button === 2 ? cellAt(e.clientX, e.clientY) : null,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    // hover ghost (only when not mid-gesture)
    if (!g) { setHover(cellAt(e.clientX, e.clientY)); return }

    const dist = Math.hypot(e.clientX - g.originX, e.clientY - g.originY)
    if (dist > DRAG_THRESHOLD) g.moved = true

    if (g.button === 0 && g.moved) {
      // left-drag → pan
      setPan({ x: g.startPan.x + (e.clientX - g.originX), y: g.startPan.y + (e.clientY - g.originY) })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    gesture.current = null
    if (!g) return

    if (g.button === 0) {
      if (!g.moved) {
        // a genuine click → place a stone, and clear annotations (Lichess-style)
        const k = cellAt(e.clientX, e.clientY)
        const [q, r] = k.split(",").map(Number)
        setAnnotations({ highlights: new Set(), arrows: [] })
        onPlace(q, r)
      }
    } else if (g.button === 2) {
      const toCell = cellAt(e.clientX, e.clientY)
      setAnnotations((a) => {
        const highlights = new Set(a.highlights)
        const arrows = [...a.arrows]
        if (!g.moved || g.fromCell === toCell) {
          // right-click → toggle highlight
          if (highlights.has(toCell)) highlights.delete(toCell)
          else highlights.add(toCell)
        } else if (g.fromCell) {
          // right-drag → toggle arrow
          const idx = arrows.findIndex(([f, t]) => f === g.fromCell && t === toCell)
          if (idx >= 0) arrows.splice(idx, 1)
          else arrows.push([g.fromCell, toCell])
        }
        return { highlights, arrows }
      })
    }
  }

  // Wheel-to-zoom toward the cursor. Attached via ref effect so we can passive:false.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      setZoom((z) => {
        const nz = Math.max(0.5, Math.min(2.5, z * factor))
        // keep the point under the cursor stable
        const rect = svg.getBoundingClientRect()
        const vx = ((e.clientX - rect.left) / rect.width) * vbW - cx0
        const vy = ((e.clientY - rect.top) / rect.height) * vbH - cy0
        setPan((p) => ({
          x: vx - (vx - p.x) * (nz / z),
          y: vy - (vy - p.y) * (nz / z),
        }))
        return nz
      })
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [vbW, vbH, cx0, cy0])

  const winningSet = useMemo(() => new Set(state.winningLine ?? []), [state.winningLine])
  const lastSet = useMemo(() => new Set(state.lastPlaced), [state.lastPlaced])

  const renderMark = (owner: 1 | 2, x: number, y: number, ghost = false) =>
    owner === 1 ? (
      <g className={`${styles.mark} ${ghost ? styles.ghostMark : ""}`} transform={`translate(${x},${y})`}>
        <line x1={-HEX_SIZE * 0.28} y1={-HEX_SIZE * 0.28} x2={HEX_SIZE * 0.28} y2={HEX_SIZE * 0.28} />
        <line x1={-HEX_SIZE * 0.28} y1={HEX_SIZE * 0.28} x2={HEX_SIZE * 0.28} y2={-HEX_SIZE * 0.28} />
      </g>
    ) : (
      <circle cx={x} cy={y} r={HEX_SIZE * 0.3} className={`${styles.markO} ${ghost ? styles.ghostMark : ""}`} />
    )

  return (
    <svg
      ref={svgRef}
      className={styles.board}
      viewBox={`0 0 ${vbW} ${vbH}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => { if (!gesture.current) setHover(null) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <marker id="hexo-arrow" markerWidth="4" markerHeight="4" refX="2.5" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" className={styles.arrowHead} />
        </marker>
      </defs>
      <g transform={`translate(${cx0 + pan.x}, ${cy0 + pan.y}) scale(${zoom})`}>
        {cells.map(({ q, r, k }) => {
          const { x, y } = hexToPixel(q, r)
          const owner = state.stones.get(k)
          const isWin = winningSet.has(k)
          const isLast = lastSet.has(k)
          const isHighlight = annotations.highlights.has(k)
          return (
            <g key={k}>
              <polygon points={hexPoints(x, y)} className={styles.cell} />
              {isHighlight && <polygon points={hexPoints(x, y)} className={styles.highlight} />}
              {isLast && !isWin && <polygon points={hexPoints(x, y)} className={styles.lastMove} />}
              {owner ? (
                <>
                  <circle cx={x} cy={y} r={HEX_SIZE * 0.62}
                    className={`${styles.stone} ${owner === 1 ? styles.stoneP1 : styles.stoneP2} ${isWin ? styles.stoneWin : ""}`} />
                  {renderMark(owner, x, y)}
                </>
              ) : (
                // hover ghost of the current player's mark
                hover === k && !state.winner && (
                  <g className={styles.ghost}>{renderMark(state.turn, x, y, true)}</g>
                )
              )}
            </g>
          )
        })}
        {annotations.arrows.map(([f, t], i) => {
          const [fq, fr] = f.split(",").map(Number)
          const [tq, tr] = t.split(",").map(Number)
          const a = hexToPixel(fq, fr), b = hexToPixel(tq, tr)
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.arrow} markerEnd="url(#hexo-arrow)" />
        })}
      </g>
    </svg>
  )
}

export function HexoPage() {
  const [state, setState] = useState<HexoState>(initialState())
  const [annotations, setAnnotations] = useState<Annotations>({ highlights: new Set(), arrows: [] })
  const [zen, setZen] = useState(false)

  const onPlace = useCallback((q: number, r: number) => {
    setState((s) => placeStone(s, q, r))
  }, [])

  const newGame = useCallback(() => {
    setState(initialState())
    setAnnotations({ highlights: new Set(), arrows: [] })
  }, [])

  // Esc exits zen mode
  useEffect(() => {
    if (!zen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [zen])

  const status = state.winner
    ? `Player ${state.winner} wins!`
    : `Player ${state.turn} — place ${state.stonesPerTurn} stone${state.stonesPerTurn > 1 ? "s" : ""} (${stonesLeft(state)} left)`

  const boardEl = (
    <HexoBoard state={state} onPlace={onPlace} annotations={annotations} setAnnotations={setAnnotations} wide={zen} />
  )

  if (zen) {
    return (
      <div className={styles.zenOverlay}>
        <button className={styles.zenClose} onClick={() => setZen(false)} title="Exit zen mode (Esc)" aria-label="Exit zen mode">✕</button>
        <div className={styles.zenBoard} data-win={state.winner ? "true" : undefined}>
          {boardEl}
        </div>
        <div className={styles.zenBar}>
          <span className={styles.zenStatus}>{status}</span>
          <button className={styles.zenBtn} onClick={newGame}>New Game</button>
          <span className={styles.zenHint}>scroll = zoom · drag = pan · right-click = mark</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.hexoContainer}>
      <header className={styles.header}>
        <h1>heXO</h1>
        <p>Connect six on an endless field of hexes.</p>
      </header>

      <div className={styles.layout}>
        <div className={styles.boardWrapper} data-win={state.winner ? "true" : undefined}>
          {boardEl}
        </div>

        <div className={styles.controls}>
          <div className={styles.statusBox}>
            <div className={styles.statusText}>{status}</div>
            <button className={styles.resetBtn} onClick={newGame}>New Game</button>
          </div>
          <div className={styles.zoomRow}>
            <button className={styles.zoomBtn} onClick={() => setZen(true)} title="Zen mode">⤢ Zen</button>
          </div>
          <div className={styles.legend}>
            <span><span className={`${styles.swatch} ${styles.stoneP1}`} /> Player 1 (X)</span>
            <span><span className={`${styles.swatch} ${styles.stoneP2}`} /> Player 2 (O)</span>
          </div>
          <p className={styles.rules}>
            Player 1 places one stone to open; after that, each player places two stones per
            turn. First to six in a row — along any of the three directions — wins. Drag to
            pan, scroll to zoom. Right-click a cell to highlight it, right-drag to draw an
            arrow.
          </p>
        </div>
      </div>
    </div>
  )
}
