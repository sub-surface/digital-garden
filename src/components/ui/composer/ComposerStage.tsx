import { forwardRef, useEffect, useMemo, useRef, useState } from "react"
import type { Box, Plate } from "@/lib/composer/types"
import { renderSVG } from "@/lib/composer/render/svg"
import { getEra } from "@/lib/composer/eras"
import { rasterizePlate } from "@/lib/composer/render/raster"
import { resolveAnchor } from "@/lib/composer/connectors"
import type { Sel } from "./selection"
import { sameSel } from "./selection"
import styles from "./ComposerStage.module.scss"

interface StageProps {
  plate: Plate
  selection: Sel[]
  onSelect: (sel: Sel | null, additive: boolean) => void
  onDragStart: () => void
  onMoveNode: (id: string, box: Box) => void
  onDragEnd: () => void
}

function inBox(b: Box, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy || 1e-9
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * The stage: the era output (vector SVG or dithered canvas) with a transparent,
 * pointer-interactive SVG overlay for selection, anchor ports and dragging.
 * Hit-testing and drag are done in plate-space via the overlay's own coordinate
 * matrix, so they work identically across eras and letterboxing.
 */
export const ComposerStage = forwardRef<HTMLDivElement, StageProps>(function ComposerStage(
  { plate, selection, onSelect, onDragStart, onMoveNode, onDragEnd },
  ref,
) {
  const era = getEra(plate.era)
  const [rw, rh] = plate.ratio
  const scale = 1000 / Math.max(rw, rh)
  const W = rw * scale
  const H = rh * scale
  const genKey = `${plate.seed}:${plate.salt}:${plate.archetype}`

  const svg = useMemo(() => (era.vector ? renderSVG(plate) : ""), [plate, era.vector])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<SVGSVGElement>(null)
  const [rasterFailed, setRasterFailed] = useState(false)
  const [hover, setHover] = useState<Sel | null>(null)
  const drag = useRef<{ id: string; startX: number; startY: number; box: Box; moved: boolean } | null>(null)

  useEffect(() => {
    if (era.vector) return
    let cancelled = false
    setRasterFailed(false)
    rasterizePlate(plate, era)
      .then((low) => {
        if (cancelled || !canvasRef.current) return
        const c = canvasRef.current
        c.width = low.width
        c.height = low.height
        c.getContext("2d")!.drawImage(low, 0, 0)
      })
      .catch(() => !cancelled && setRasterFailed(true))
    return () => {
      cancelled = true
    }
  }, [plate, era])

  const toPlate = (e: React.PointerEvent): [number, number] => {
    const s = overlayRef.current
    if (!s) return [0, 0]
    const pt = s.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const m = s.getScreenCTM()
    if (!m) return [0, 0]
    const p = pt.matrixTransform(m.inverse())
    return [p.x / W, p.y / H]
  }

  const hitTest = (px: number, py: number): Sel | null => {
    for (const n of [...plate.nodes].sort((a, b) => b.z - a.z)) {
      if (inBox(n.box, px, py)) return { kind: "node", id: n.id }
    }
    for (const c of plate.connectors) {
      const a = resolveAnchor(plate, c.from)
      const b = resolveAnchor(plate, c.to)
      if (a && b && distToSeg(px, py, a.x, a.y, b.x, b.y) < 0.015) return { kind: "connector", id: c.id }
    }
    for (const ap of plate.apparatus) {
      if (ap.box && inBox(ap.box, px, py)) return { kind: "apparatus", id: ap.id }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const [px, py] = toPlate(e)
    const hit = hitTest(px, py)
    if (hit) {
      const already = selection.some((s) => sameSel(s, hit))
      if (!already) onSelect(hit, e.shiftKey)
      if (hit.kind === "node") {
        const node = plate.nodes.find((n) => n.id === hit.id)!
        drag.current = { id: hit.id, startX: px, startY: py, box: { ...node.box }, moved: false }
        ;(e.target as Element).setPointerCapture(e.pointerId)
      }
    } else {
      onSelect(null, false)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const [px, py] = toPlate(e)
    const d = drag.current
    if (!d) {
      setHover(hitTest(px, py))
      return
    }
    if (!d.moved && Math.hypot(px - d.startX, py - d.startY) < 0.005) return
    if (!d.moved) {
      d.moved = true
      onDragStart()
    }
    const nx = Math.max(0.02, Math.min(0.98 - d.box.w, d.box.x + (px - d.startX)))
    const ny = Math.max(0.02, Math.min(0.98 - d.box.h, d.box.y + (py - d.startY)))
    onMoveNode(d.id, { ...d.box, x: nx, y: ny })
  }

  const onPointerUp = () => {
    if (drag.current?.moved) onDragEnd()
    drag.current = null
  }

  // Overlay selection outlines + anchor ports.
  const overlays = selection
    .map((s) => (s.kind === "node" ? plate.nodes.find((n) => n.id === s.id) : null))
    .filter((n): n is NonNullable<typeof n> => !!n)

  return (
    <div className={styles.stage} ref={ref}>
      <div className={styles.plateHolder}>
        {/* keyed on the generation identity so the plot-in flourish replays on
            regeneration but NOT on edits / re-skins (which mutate in place). */}
        {era.vector ? (
          <div key={genKey} className={`${styles.plate} ${styles.plotIn}`} dangerouslySetInnerHTML={{ __html: svg }} />
        ) : rasterFailed ? (
          <div className={styles.rasterError}>era “{era.name}” could not rasterize</div>
        ) : (
          <canvas key={genKey} ref={canvasRef} className={`${styles.rasterPlate} ${styles.plotIn}`} />
        )}

        <svg
          ref={overlayRef}
          className={styles.overlay}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
        >
          {hover && hover.kind === "node" && !selection.some((s) => sameSel(s, hover)) && (
            <HoverRect box={plate.nodes.find((n) => n.id === hover.id)?.box} W={W} H={H} />
          )}
          {overlays.map((n) => (
            <g key={n.id}>
              <rect
                x={n.box.x * W}
                y={n.box.y * H}
                width={n.box.w * W}
                height={n.box.h * H}
                className={styles.selRect}
              />
              {n.anchors.map((a) => (
                <circle key={a.id} cx={a.x * W} cy={a.y * H} r={4} className={styles.port} />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
})

function HoverRect({ box, W, H }: { box?: Box; W: number; H: number }) {
  if (!box) return null
  return <rect x={box.x * W} y={box.y * H} width={box.w * W} height={box.h * H} className={styles.hoverRect} />
}
