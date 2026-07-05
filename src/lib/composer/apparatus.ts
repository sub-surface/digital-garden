/**
 * Apparatus — the chrome that makes a plate read as a *document*: frame, corner
 * registration, ruler, scale-bar, legend, seal, compass, caption, colophon. Most
 * are lifted from SIGIL's plate chrome. Text content is generated in `generate`
 * (via the lexicon) and carried on `apparatus.data`, so realization stays
 * deterministic and data-driven.
 */

import type { Apparatus, Box, Plate, Prim } from "./types"
import { hashStr } from "./rng"

const TAU = Math.PI * 2

function rectPts(x: number, y: number, w: number, h: number): [number, number][] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
}

/** Default region per apparatus kind (plate-space) when the IR doesn't pin a box. */
export function apparatusRegion(kind: Apparatus["kind"]): Box | undefined {
  switch (kind) {
    case "legend":
      return { x: 0.72, y: 0.72, w: 0.22, h: 0.2 }
    case "compass":
      return { x: 0.82, y: 0.1, w: 0.1, h: 0.1 }
    case "scale-bar":
      return { x: 0.1, y: 0.9, w: 0.28, h: 0.04 }
    case "ruler":
      return { x: 0.1, y: 0.94, w: 0.8, h: 0.03 }
    case "caption":
      return { x: 0.1, y: 0.9, w: 0.55, h: 0.05 }
    case "colophon":
      return { x: 0.5, y: 0.925, w: 0.45, h: 0.04 }
    default:
      return undefined
  }
}

function frame(a: Apparatus): Prim[] {
  const pen = a.penRole
  const prims: Prim[] = []
  const rect = (m: number, w: number, alpha: number): Prim => ({ t: "polygon", pts: rectPts(m, m, 1 - 2 * m, 1 - 2 * m), pen, w, alpha })
  prims.push(rect(0.025, 0.9, 0.9))
  prims.push(rect(0.05, 0.6, 0.7))
  const m = 0.05
  const ticks = 48
  for (let i = 0; i <= ticks; i++) {
    const t = m + (i / ticks) * (1 - 2 * m)
    const len = i % 4 === 0 ? 0.012 : 0.006
    prims.push({ t: "line", x1: t, y1: m, x2: t, y2: m + len, pen, w: 0.5, alpha: 0.6 })
    prims.push({ t: "line", x1: t, y1: 1 - m, x2: t, y2: 1 - m - len, pen, w: 0.5, alpha: 0.6 })
    prims.push({ t: "line", x1: m, y1: t, x2: m + len, y2: t, pen, w: 0.5, alpha: 0.6 })
    prims.push({ t: "line", x1: 1 - m, y1: t, x2: 1 - m - len, y2: t, pen, w: 0.5, alpha: 0.6 })
  }
  return prims
}

function cornerReg(a: Apparatus, plate: Plate): Prim[] {
  const pen = a.penRole
  const seg = hashStr(plate.seed + ":reg")
  const prims: Prim[] = []
  const gap = 0.011
  for (let i = 0; i < 7; i++) {
    if ((seg >> i) & 1) prims.push({ t: "polygon", pts: rectPts(0.065 + i * gap, 0.072, 0.0045, 0.014), pen, fill: true, alpha: 0.8 })
    if ((seg >> (i + 7)) & 1) prims.push({ t: "polygon", pts: rectPts(1 - 0.072 - i * gap, 1 - 0.086, 0.0045, 0.014), pen, fill: true, alpha: 0.8 })
  }
  return prims
}

function seal(a: Apparatus, plate: Plate): Prim[] {
  const pen = a.penRole
  const h = hashStr(plate.seed + ":seal")
  const cx = 0.09
  const cy = 0.91
  const r = 0.022
  const prims: Prim[] = [{ t: "circle", cx, cy, r, pen, w: 0.7, alpha: 0.9 }]
  for (let i = 0; i < 10; i++) {
    if ((h >> i) & 1) {
      const ang = (i / 10) * TAU
      prims.push({ t: "line", x1: cx, y1: cy, x2: cx + Math.cos(ang) * r, y2: cy + Math.sin(ang) * r, pen, w: 0.6, alpha: 0.8 })
    }
  }
  return prims
}

function ruler(a: Apparatus): Prim[] {
  const b = a.box ?? apparatusRegion("ruler")!
  const pen = a.penRole
  const y = b.y
  const prims: Prim[] = [{ t: "line", x1: b.x, y1: y, x2: b.x + b.w, y2: y, pen, w: 0.7, alpha: 0.8 }]
  const div = 20
  for (let i = 0; i <= div; i++) {
    const x = b.x + (i / div) * b.w
    const major = i % 5 === 0
    prims.push({ t: "line", x1: x, y1: y, x2: x, y2: y - (major ? 0.012 : 0.006), pen, w: 0.5, alpha: 0.7 })
    if (major) prims.push({ t: "text", x, y: y + 0.016, s: String(i), size: 0.011, pen, align: "middle", alpha: 0.7 })
  }
  return prims
}

function scaleBar(a: Apparatus): Prim[] {
  const b = a.box ?? apparatusRegion("scale-bar")!
  const pen = a.penRole
  const segs = 4
  const sw = b.w / segs
  const prims: Prim[] = []
  for (let i = 0; i < segs; i++) {
    prims.push({ t: "polygon", pts: rectPts(b.x + i * sw, b.y, sw, b.h * 0.4), pen, fill: i % 2 === 0, w: 0.6, alpha: 0.85 })
  }
  const unit = (a.data?.unit as string) ?? ""
  prims.push({ t: "text", x: b.x, y: b.y - 0.006, s: "0", size: 0.012, pen, align: "middle", alpha: 0.8 })
  prims.push({ t: "text", x: b.x + b.w, y: b.y - 0.006, s: unit, size: 0.012, pen, align: "end", alpha: 0.8 })
  return prims
}

function legend(a: Apparatus): Prim[] {
  const b = a.box ?? apparatusRegion("legend")!
  const pen = a.penRole
  const entries = (a.data?.entries as { key: string; term: string }[]) ?? []
  const prims: Prim[] = [{ t: "polygon", pts: rectPts(b.x, b.y, b.w, b.h), pen, w: 0.6, alpha: 0.6 }]
  const rows = Math.max(1, entries.length)
  const rh = Math.min(b.h / rows, 0.05)
  const size = Math.min(rh * 0.5, 0.016)
  entries.forEach((e, i) => {
    const cy = b.y + (i + 0.6) * rh + 0.008
    prims.push({ t: "text", x: b.x + 0.012, y: cy, s: e.key, size, pen: "highlight", align: "start", alpha: 0.95 })
    prims.push({ t: "text", x: b.x + 0.05, y: cy, s: e.term, size, pen, align: "start", alpha: 0.85 })
  })
  return prims
}

function compass(a: Apparatus): Prim[] {
  const b = a.box ?? apparatusRegion("compass")!
  const pen = a.penRole
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const r = Math.min(b.w, b.h) / 2
  const prims: Prim[] = [{ t: "circle", cx, cy, r, pen, w: 0.6, alpha: 0.7 }]
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU - Math.PI / 2
    const len = i % 2 === 0 ? r : r * 0.5
    prims.push({ t: "line", x1: cx, y1: cy, x2: cx + Math.cos(ang) * len, y2: cy + Math.sin(ang) * len, pen, w: i === 0 ? 0.9 : 0.5, alpha: 0.8 })
  }
  // North star point.
  prims.push({ t: "polygon", pts: [[cx, cy - r * 1.25], [cx - r * 0.14, cy - r * 0.8], [cx + r * 0.14, cy - r * 0.8]], pen: "highlight", fill: true, alpha: 0.9 })
  prims.push({ t: "text", x: cx, y: cy - r * 1.35, s: "N", size: 0.016, pen, align: "middle", alpha: 0.9 })
  return prims
}

function caption(a: Apparatus): Prim[] {
  const b = a.box ?? apparatusRegion("caption")!
  const text = (a.data?.text as string) ?? ""
  return [{ t: "text", x: b.x, y: b.y + b.h / 2, s: text, size: 0.015, pen: a.penRole, align: "start", alpha: 0.85, letterSpacing: 0.003 }]
}

function colophon(a: Apparatus): Prim[] {
  const b = a.box ?? apparatusRegion("colophon")!
  const text = (a.data?.text as string) ?? ""
  const pen = a.penRole
  return [
    { t: "line", x1: b.x + b.w * 0.4, y1: b.y, x2: b.x + b.w, y2: b.y, pen, w: 0.5, alpha: 0.5 },
    { t: "text", x: b.x + b.w, y: b.y + 0.022, s: text, size: 0.013, pen, align: "end", alpha: 0.85, letterSpacing: 0.002 },
  ]
}

export function realizeApparatus(a: Apparatus, plate: Plate): Prim[] {
  switch (a.kind) {
    case "frame":
      return frame(a)
    case "corner-reg":
      return cornerReg(a, plate)
    case "seal":
      return seal(a, plate)
    case "ruler":
      return ruler(a)
    case "scale-bar":
      return scaleBar(a)
    case "legend":
      return legend(a)
    case "compass":
      return compass(a)
    case "caption":
      return caption(a)
    case "colophon":
      return colophon(a)
    default:
      return []
  }
}
