/**
 * Pointer-driven move + resize for OS windows.
 *
 * Win95 dragged an outline and committed geometry on release. That is both the
 * authentic behaviour and the cheap one: an open window contains a live MDX
 * document, and reflowing it every pointermove is the one thing guaranteed to
 * make this feel bad. Hold Shift for live drag.
 */

import { useCallback, useRef, useState } from "react"
import type { WindowGeometry } from "./osStore"

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

const MIN_W = 260
const MIN_H = 160
/** Keep this many px of title bar on-screen so a window can always be grabbed back. */
const TITLE_KEEP = 32

export interface DragBounds {
  width: number
  height: number
  /** Taskbar height — windows may not be dropped underneath it. */
  bottomInset: number
}

interface DragSession {
  kind: "move" | "resize"
  edge?: ResizeEdge
  startX: number
  startY: number
  origin: WindowGeometry
  live: boolean
}

export function clampGeometry(geo: WindowGeometry, bounds: DragBounds): WindowGeometry {
  const w = Math.max(MIN_W, Math.min(geo.w, bounds.width))
  const h = Math.max(MIN_H, Math.min(geo.h, bounds.height - bounds.bottomInset))
  // The title bar must never leave the viewport in any direction.
  const x = Math.max(TITLE_KEEP - w, Math.min(geo.x, bounds.width - TITLE_KEEP))
  const y = Math.max(0, Math.min(geo.y, bounds.height - bounds.bottomInset - TITLE_KEEP))
  return { x, y, w, h }
}

function applyResize(
  origin: WindowGeometry,
  edge: ResizeEdge,
  dx: number,
  dy: number,
): WindowGeometry {
  let { x, y, w, h } = origin

  if (edge.includes("e")) w = origin.w + dx
  if (edge.includes("s")) h = origin.h + dy
  if (edge.includes("w")) {
    // Dragging the west edge moves the origin and shrinks the width together;
    // clamping w alone would let the left edge slide past the right one.
    const next = Math.max(MIN_W, origin.w - dx)
    x = origin.x + (origin.w - next)
    w = next
  }
  if (edge.includes("n")) {
    const next = Math.max(MIN_H, origin.h - dy)
    y = origin.y + (origin.h - next)
    h = next
  }

  return { x, y, w: Math.max(MIN_W, w), h: Math.max(MIN_H, h) }
}

interface UseDragOptions {
  geometry: WindowGeometry
  bounds: DragBounds
  onCommit: (geo: WindowGeometry) => void
  /** Suppressed while maximized. */
  disabled?: boolean
}

export function useDrag({ geometry, bounds, onCommit, disabled }: UseDragOptions) {
  const session = useRef<DragSession | null>(null)
  const [ghost, setGhost] = useState<WindowGeometry | null>(null)
  const ghostRef = useRef<WindowGeometry | null>(null)

  const begin = useCallback(
    (e: React.PointerEvent, kind: "move" | "resize", edge?: ResizeEdge) => {
      if (disabled) return
      // Primary button only — right-click opens menus, middle does nothing.
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      session.current = {
        kind,
        edge,
        startX: e.clientX,
        startY: e.clientY,
        origin: { ...geometry },
        live: e.shiftKey,
      }
      ghostRef.current = { ...geometry }
      setGhost({ ...geometry })
    },
    [geometry, disabled],
  )

  const move = useCallback(
    (e: React.PointerEvent) => {
      const s = session.current
      if (!s) return

      const dx = e.clientX - s.startX
      const dy = e.clientY - s.startY

      const next =
        s.kind === "move"
          ? { ...s.origin, x: s.origin.x + dx, y: s.origin.y + dy }
          : applyResize(s.origin, s.edge!, dx, dy)

      const clamped = clampGeometry(next, bounds)
      ghostRef.current = clamped
      setGhost(clamped)

      // Live mode commits every frame; outline mode waits for release.
      if (s.live) onCommit(clamped)
    },
    [bounds, onCommit],
  )

  const end = useCallback(
    (e: React.PointerEvent) => {
      const s = session.current
      if (!s) return
      const target = e.currentTarget as HTMLElement
      if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId)

      // Commit from the ref, not React state — the last pointermove may not have
      // flushed a render yet, and dropping a window on a stale ghost loses the
      // final few pixels of the drag.
      const final = ghostRef.current
      session.current = null
      ghostRef.current = null
      setGhost(null)
      if (final && !s.live) onCommit(final)
    },
    [onCommit],
  )

  return {
    /** Non-null only while a drag is in flight. */
    ghost,
    isDragging: ghost !== null,
    handlers: { onPointerMove: move, onPointerUp: end, onPointerCancel: end },
    beginMove: (e: React.PointerEvent) => begin(e, "move"),
    beginResize: (edge: ResizeEdge) => (e: React.PointerEvent) => begin(e, "resize", edge),
  }
}
