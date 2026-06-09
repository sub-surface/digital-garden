import { useState, useMemo, useRef, useCallback } from "react"
import { initialState, placeStone, key, stonesLeft, type HexoState } from "@/lib/hexo"
import styles from "./HexoPage.module.scss"

const HEX_SIZE = 22 // px radius
const MARGIN_RING = 3 // empty hexes drawn beyond placed stones

// axial → pixel (pointy-top)
function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2)
  const y = HEX_SIZE * (3 / 2) * r
  return { x, y }
}

// polygon points for a pointy-top hex centred at (cx,cy)
function hexPoints(cx: number, cy: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    pts.push(`${(cx + HEX_SIZE * Math.cos(angle)).toFixed(2)},${(cy + HEX_SIZE * Math.sin(angle)).toFixed(2)}`)
  }
  return pts.join(" ")
}

export function HexoPage() {
  const [state, setState] = useState<HexoState>(initialState())
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  // Visible cell set: all placed cells ∪ neighbours ∪ margin ring, min 9×9 patch at origin.
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
    return [...set].map((k) => {
      const [q, r] = k.split(",").map(Number)
      return { q, r, k }
    })
  }, [state.stones])

  const onCellClick = useCallback((q: number, r: number) => {
    if (dragRef.current?.moved) return // ignore click that ended a drag
    setState((s) => placeStone(s, q, r))
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const nx = e.clientX - dragRef.current.x
    const ny = e.clientY - dragRef.current.y
    if (Math.abs(nx - pan.x) > 2 || Math.abs(ny - pan.y) > 2) dragRef.current.moved = true
    setPan({ x: nx, y: ny })
  }
  const onPointerUp = () => { setTimeout(() => { dragRef.current = null }, 0) }

  const winningSet = useMemo(
    () => new Set(state.winningLine ?? []),
    [state.winningLine],
  )

  const status = state.winner
    ? `Player ${state.winner} wins!`
    : `Player ${state.turn} — place ${state.stonesPerTurn} stone${state.stonesPerTurn > 1 ? "s" : ""} (${stonesLeft(state)} left)`

  return (
    <div className={styles.hexoContainer}>
      <header className={styles.header}>
        <h1>heXO</h1>
        <p>Connect six on an endless field of hexes.</p>
      </header>

      <div className={styles.layout}>
        <div className={styles.boardWrapper} data-win={state.winner ? "true" : undefined}>
          <svg
            className={styles.board}
            viewBox="0 0 600 480"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <g transform={`translate(${300 + pan.x}, ${240 + pan.y}) scale(${zoom})`}>
              {cells.map(({ q, r, k }) => {
                const { x, y } = hexToPixel(q, r)
                const owner = state.stones.get(k)
                const isWin = winningSet.has(k)
                return (
                  <g key={k}>
                    <polygon
                      points={hexPoints(x, y)}
                      className={styles.cell}
                      onClick={() => onCellClick(q, r)}
                    />
                    {owner && (
                      <circle
                        cx={x}
                        cy={y}
                        r={HEX_SIZE * 0.62}
                        className={`${styles.stone} ${owner === 1 ? styles.stoneP1 : styles.stoneP2} ${isWin ? styles.stoneWin : ""}`}
                      />
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>

        <div className={styles.controls}>
          <div className={styles.statusBox}>
            <div className={styles.statusText}>{status}</div>
            <button className={styles.resetBtn} onClick={() => { setState(initialState()); setPan({ x: 0, y: 0 }); setZoom(1) }}>
              New Game
            </button>
          </div>
          <div className={styles.zoomRow}>
            <button className={styles.zoomBtn} onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} title="Zoom out">−</button>
            <button className={styles.zoomBtn} onClick={() => setZoom((z) => Math.min(2, z + 0.15))} title="Zoom in">+</button>
            <button className={styles.zoomBtn} onClick={() => setPan({ x: 0, y: 0 })} title="Recenter">⌖</button>
          </div>
          <div className={styles.legend}>
            <span><span className={`${styles.swatch} ${styles.stoneP1}`} /> Player 1</span>
            <span><span className={`${styles.swatch} ${styles.stoneP2}`} /> Player 2</span>
          </div>
          <p className={styles.rules}>
            Player 1 places one stone to open. After that, each player places two stones per
            turn. First to six in a row — along any of the three directions — wins. Drag to
            pan.
          </p>
        </div>
      </div>
    </div>
  )
}
