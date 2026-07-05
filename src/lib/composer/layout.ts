/**
 * Layout solver — turns slot *requests* into geometry (resolved node boxes in
 * plate-space 0..1). Per the armature's strategy. Locked node boxes are honoured
 * as fixed and never moved. All boxes are kept inside the plate's safe margin.
 *
 * M1 implements `radial` fully; other strategies fall back to jittered
 * region placement (enough to place a plate without crashing — the remaining
 * strategies are fleshed out in M5).
 */

import type { Box, LayoutStrategy, Node, Slot, Rng } from "./types"
import { rr } from "./rng"

export interface PlacementReq {
  node: Node
  slot: Slot
}

const MARGIN = 0.05
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Push freshly-placed boxes out of locked (fixed) boxes — a few cheap iterations. */
function separate(reqs: PlacementReq[], obstacles: Box[]) {
  if (!obstacles.length) return
  for (const { node } of reqs) {
    for (let iter = 0; iter < 4; iter++) {
      let moved = false
      for (const ob of obstacles) {
        if (!overlaps(node.box, ob)) continue
        const ncx = node.box.x + node.box.w / 2
        const ncy = node.box.y + node.box.h / 2
        const ocx = ob.x + ob.w / 2
        const ocy = ob.y + ob.h / 2
        const dx = ncx - ocx
        const dy = ncy - ocy
        const d = Math.hypot(dx, dy) || 1e-6
        const step = 0.04
        node.box.x += (dx / d) * step
        node.box.y += (dy / d) * step
        moved = true
      }
      if (moved) clampBoxInline(node)
      else break
    }
  }
}

function clampBoxInline(node: Node) {
  const w = Math.min(node.box.w, 1 - 2 * MARGIN)
  const h = Math.min(node.box.h, 1 - 2 * MARGIN)
  node.box.w = w
  node.box.h = h
  node.box.x = Math.max(MARGIN, Math.min(1 - MARGIN - w, node.box.x))
  node.box.y = Math.max(MARGIN, Math.min(1 - MARGIN - h, node.box.y))
}

function clampBox(node: Node) {
  const w = Math.min(node.box.w, 1 - 2 * MARGIN)
  const h = Math.min(node.box.h, 1 - 2 * MARGIN)
  node.box = {
    w,
    h,
    x: Math.max(MARGIN, Math.min(1 - MARGIN - w, node.box.x)),
    y: Math.max(MARGIN, Math.min(1 - MARGIN - h, node.box.y)),
  }
}

function centered(node: Node, cx: number, cy: number, side: number) {
  node.box = { x: cx - side / 2, y: cy - side / 2, w: side, h: side }
  clampBox(node)
}

/** Fill (a jittered inset of) the slot's region — used for field/margin/caption. */
function fillRegion(node: Node, slot: Slot, rng: Rng) {
  const inset = 0.06
  const r = slot.region
  const dx = r.w * inset * (rng() - 0.5)
  const dy = r.h * inset * (rng() - 0.5)
  node.box = {
    x: r.x + r.w * inset * 0.5 + dx,
    y: r.y + r.h * inset * 0.5 + dy,
    w: r.w * (1 - inset),
    h: r.h * (1 - inset),
  }
  clampBox(node)
}

export function solveLayout(strategy: LayoutStrategy, reqs: PlacementReq[], rng: Rng, lockedBoxes: Box[] = []) {
  const free = reqs.filter((r) => !r.node.locked)
  const focal = free.filter((r) => r.slot.role === "focal")
  const satellites = free.filter((r) => r.slot.role === "satellite")
  const rest = free.filter((r) => r.slot.role !== "focal" && r.slot.role !== "satellite")

  // Focal(s). Hero pushes the focal off-centre onto a rule-of-thirds node.
  const heroLeft = rng() < 0.5
  for (const r of focal) {
    const side = rr(rng, r.slot.scale[0], r.slot.scale[1])
    if (strategy === "hero") centered(r.node, heroLeft ? 0.37 : 0.63, 0.45, side)
    else centered(r.node, 0.5, 0.5, side)
  }

  // Satellites — placement by strategy.
  const n = satellites.length
  const a0 = rng() * Math.PI * 2
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
  satellites.forEach((r, i) => {
    const side = rr(rng, r.slot.scale[0], r.slot.scale[1])
    let cx: number
    let cy: number
    if (strategy === "radial") {
      const a = a0 + i * GOLDEN_ANGLE
      const radius = 0.34 * (0.85 + rng() * 0.3)
      cx = 0.5 + Math.cos(a) * radius
      cy = 0.5 + Math.sin(a) * radius
    } else if (strategy === "grid") {
      const rows = Math.max(1, Math.ceil(n / cols))
      const col = i % cols
      const row = Math.floor(i / cols)
      cx = MARGIN + 2 * MARGIN + ((col + 0.5) / cols) * (1 - 6 * MARGIN)
      cy = MARGIN + 2 * MARGIN + ((row + 0.5) / rows) * (1 - 6 * MARGIN)
      cx += (rng() - 0.5) * 0.03
      cy += (rng() - 0.5) * 0.03
    } else if (strategy === "axis") {
      const t = (i + 0.5) / n
      const px = 0.24 + t * 0.54
      const py = 0.26 + t * 0.5
      const perp = (rng() - 0.5) * 0.16
      cx = px + perp
      cy = py - perp
    } else if (strategy === "hero") {
      // Pack satellites into the margin opposite the focal.
      const region: Box = heroLeft ? { x: 0.66, y: 0.12, w: 0.28, h: 0.76 } : { x: 0.06, y: 0.12, w: 0.28, h: 0.76 }
      cx = region.x + region.w / 2 + (rng() - 0.5) * region.w * 0.4
      cy = region.y + ((i + 0.5) / n) * region.h
    } else {
      // free — scatter across the safe area (relaxed apart below).
      cx = 0.15 + rng() * 0.7
      cy = 0.15 + rng() * 0.7
    }
    centered(r.node, cx, cy, side)
  })

  // Free layout: a couple of cheap relaxation passes to spread satellites out.
  if (strategy === "free") separate(satellites, [])
  relaxApart(satellites)

  // Fields / margins / captions — fill their region.
  for (const r of rest) fillRegion(r.node, r.slot, rng)

  // Keep unlocked boxes clear of locked (fixed) obstacles.
  separate(free, lockedBoxes)
}

/** Push overlapping same-role boxes apart (a few Lloyd-ish iterations). */
function relaxApart(reqs: PlacementReq[]) {
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < reqs.length; i++) {
      for (let j = i + 1; j < reqs.length; j++) {
        const a = reqs[i].node.box
        const b = reqs[j].node.box
        if (!overlaps(a, b)) continue
        const acx = a.x + a.w / 2
        const acy = a.y + a.h / 2
        const bcx = b.x + b.w / 2
        const bcy = b.y + b.h / 2
        const dx = acx - bcx
        const dy = acy - bcy
        const d = Math.hypot(dx, dy) || 1e-6
        const push = 0.015
        a.x += (dx / d) * push
        a.y += (dy / d) * push
        b.x -= (dx / d) * push
        b.y -= (dy / d) * push
        clampBoxInline(reqs[i].node)
        clampBoxInline(reqs[j].node)
      }
    }
  }
}
