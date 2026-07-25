import { useEffect, useRef, useState, useMemo } from "react"
import styles from "./PersianCarpetPage.module.scss"

/**
 * Persian Carpet — a procedural carpet loom.
 *
 * Each seed weaves a different rug from the same structural rules: a central
 * medallion with star points, corner pendants, a seeded field of boteh and
 * rosette motifs, bordered by a running vine with guard stripes.  Concentric
 * architecture, mirrored across both axes, coloured by a dyer's palette with
 * abrash drift and pile texture.
 *
 * One deliberate flaw breaks the symmetry — a tradition found across carpet-
 * making cultures worldwide (Persian "flaw of humility", Navajo "spirit line",
 * Amish "humility block"), because only the divine can achieve true perfection.
 *
 * Previously a p5.js iframe; rewritten as native React + Canvas to match the
 * site's design language and eliminate the 1 MB library + iframe overhead.
 */

// ── Palette data ──────────────────────────────────────────────────
// Roles: ground, medallionFill, medallionGround, borderGround,
//        vine, motifA, motifB, accent, ivory, outline

interface Palette {
  name: string
  ground: string; medallionFill: string; medallionGround: string
  borderGround: string; vine: string; motifA: string; motifB: string
  accent: string; ivory: string; outline: string
}

const PALETTES: Palette[] = [
  {
    name: "Kashan",
    ground: "#8c2b22", medallionGround: "#173a5e", medallionFill: "#e8d9a8",
    borderGround: "#173a5e", vine: "#cf9b3f", motifA: "#d9b14a",
    motifB: "#3f7d6e", accent: "#c8632c", ivory: "#efe4c4", outline: "#1a120c",
  },
  {
    name: "Tabriz",
    ground: "#1d3a55", medallionGround: "#9b2b25", medallionFill: "#ecdcaf",
    borderGround: "#9b2b25", vine: "#d6b24a", motifA: "#c8772f",
    motifB: "#5c8a6b", accent: "#e3c662", ivory: "#f0e7cc", outline: "#10161c",
  },
  {
    name: "Heriz",
    ground: "#b14a2a", medallionGround: "#234a3a", medallionFill: "#ecdfb6",
    borderGround: "#2a3b54", vine: "#d8b352", motifA: "#1f4d5e",
    motifB: "#7a3220", accent: "#e8c463", ivory: "#f2e8cd", outline: "#1a120b",
  },
  {
    name: "Ivory",
    ground: "#e7dcc0", medallionGround: "#8f2c25", medallionFill: "#214a63",
    borderGround: "#7a2823", vine: "#326050", motifA: "#b8862f",
    motifB: "#3a6f7d", accent: "#c0552a", ivory: "#f4ecd6", outline: "#241813",
  },
  {
    name: "Kerman",
    ground: "#2b4a4d", medallionGround: "#c4673a", medallionFill: "#efe2bd",
    borderGround: "#7d2f3a", vine: "#e0b85a", motifA: "#d28a44",
    motifB: "#9d4a8c", accent: "#e7c96a", ivory: "#f3ead2", outline: "#141d1e",
  },
  {
    name: "Indigo",
    ground: "#16263f", medallionGround: "#a8412c", medallionFill: "#dcc88a",
    borderGround: "#2c4a2e", vine: "#c9a648", motifA: "#3f7fa3",
    motifB: "#b85c33", accent: "#d9b65a", ivory: "#e9dcb4", outline: "#0b1320",
  },
]

// ── Parameters ────────────────────────────────────────────────────

interface Params {
  seed: number
  knots: number      // half-width knot count (full grid = knots × 2)
  points: number     // medallion star points
  medallion: number  // medallion radius as fraction of carpet
  field: number      // field motif density
  border: number     // border width as fraction
  abrash: number     // dye drift intensity (0–1)
  aspect: number     // width:height ratio
  texture: number    // pile texture (0–1)
  patina: number     // age / wear (0–0.8)
  weft: boolean      // weft striation lines
  stitch: boolean    // hand-tied stitch jitter
  paletteIndex: number
}

const DEFAULTS: Params = {
  seed: 12345, knots: 80, points: 10, medallion: 0.36, field: 5,
  border: 0.11, abrash: 0.45, aspect: 1.0, texture: 0.5, patina: 0.25,
  weft: true, stitch: true, paletteIndex: 0,
}

// ── Engine helpers ────────────────────────────────────────────────

const MAXSIZE = 1200

function makeRNG(s: number) {
  let a = (s >>> 0) || 1
  return () => {
    a ^= a << 13; a >>>= 0
    a ^= a >> 17
    a ^= a << 5; a >>>= 0
    return a / 4294967296
  }
}

/** Seeded 2-D Perlin noise (replaces p5's noise()). Returns 0..1. */
function makeNoise(seed: number) {
  const P = new Uint8Array(512)
  const r = makeRNG(seed)
  for (let i = 0; i < 256; i++) P[i] = i
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0
    const t = P[i]; P[i] = P[j]; P[j] = t
  }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i]
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (a: number, b: number, t: number) => a + t * (b - a)
  const grad = (h: number, x: number, y: number) => {
    const v = h & 3
    return ((v & 1) ? -x : x) + ((v & 2) ? -y : y)
  }
  return (x: number, y: number) => {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255
    const xf = x - Math.floor(x), yf = y - Math.floor(y)
    const u = fade(xf), v = fade(yf)
    return lerp(
      lerp(grad(P[P[xi] + yi], xf, yf), grad(P[P[xi + 1] + yi], xf - 1, yf), u),
      lerp(grad(P[P[xi] + yi + 1], xf, yf - 1), grad(P[P[xi + 1] + yi + 1], xf - 1, yf - 1), u),
      v,
    ) * 0.5 + 0.5
  }
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function aspectLabel(a: number): string {
  if (Math.abs(a - 1) < 0.03) return "1:1 square"
  if (a < 1) return `1:${(1 / a).toFixed(1)} runner`
  return `${a.toFixed(1)}:1 wide`
}

// ── Weave (composition engine) ────────────────────────────────────
// Builds the knot grid: one quadrant composed, mirrored across both axes.
// Concentric architecture: medallion → corner pendants → field motifs
// → main border (running vine) → guard stripes.

interface WeaveResult {
  grid: string[][]
  GW: number; GH: number; CW: number; CH: number
  cellW: number; cellH: number
  grain: Float32Array
  flawCell: { x: number; y: number } | null
  rgbPal: Record<string, [number, number, number]>
  noise: (x: number, y: number) => number
  flawDesc: string
}

function weave(p: Params): WeaveResult {
  const rng = makeRNG((p.seed * 2654435761) % 4294967296 + 1)
  const noise = makeNoise(p.seed)
  const pal = PALETTES[p.paletteIndex]

  const GW = p.knots * 2
  let GH = Math.max(8, Math.round(GW / p.aspect))
  if (GH % 2 !== GW % 2) GH += 1

  let CW: number, CH: number
  if (p.aspect >= 1) { CW = MAXSIZE; CH = Math.round(MAXSIZE / p.aspect) }
  else { CH = MAXSIZE; CW = Math.round(MAXSIZE * p.aspect) }
  const cellW = CW / GW, cellH = CH / GH

  const grid: string[][] = Array.from({ length: GH }, () => new Array(GW).fill("ground"))

  // ── knot helpers ──
  const tie = (gx: number, gy: number, key: string) => {
    if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) grid[gy][gx] = key
  }
  const tieM = (gx: number, gy: number, key: string) => {
    for (const x of [gx, GW - 1 - gx])
      for (const y of [gy, GH - 1 - gy])
        tie(x, y, key)
  }
  const ccx = (GW - 1) / 2, ccy = (GH - 1) / 2

  // ── stamps (small motif primitives) ──

  const stampBoteh = (gx: number, gy: number, dir: number) => {
    for (let dy = -2; dy <= 2; dy++) {
      const w = 2 - Math.floor(Math.abs(dy) * 0.7)
      for (let dx = -w; dx <= w; dx++) tieM(gx + dx, gy + dy, "motifA")
    }
    tieM(gx, gy - 3, "motifA")
    tieM(gx - dir, gy - 4, "motifA")
    tieM(gx - dir * 2, gy - 4, "outline")
    tieM(gx, gy, "accent")
    tieM(gx + 2, gy, "outline")
    tieM(gx - 2, gy, "outline")
  }

  const stampRosette = (gx: number, gy: number, fill: string) => {
    tieM(gx, gy, "accent")
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6
      tieM(Math.round(gx + Math.cos(a) * 2), Math.round(gy + Math.sin(a) * 2), fill)
    }
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * i) / 6
      tieM(Math.round(gx + Math.cos(a) * 3), Math.round(gy + Math.sin(a) * 3), "vine")
    }
  }

  const stampVineKnot = (gx: number, gy: number) => {
    tieM(gx, gy, "vine")
    tieM(gx + 1, gy, "motifB"); tieM(gx - 1, gy, "motifB")
    tieM(gx, gy + 1, "motifB"); tieM(gx, gy - 1, "motifB")
  }

  const stampBorderFlower = (gx: number, gy: number, fill: string) => {
    tie(gx, gy, "accent")
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
      tie(Math.round(gx + Math.cos(a) * 1.6), Math.round(gy + Math.sin(a) * 1.6), fill)
    }
  }

  const stampBorderLeaf = (gx: number, gy: number) => {
    tie(gx, gy, "motifB")
    tie(gx, gy - 1, "motifB"); tie(gx + 1, gy, "motifB"); tie(gx - 1, gy, "motifB")
  }

  // ── field motifs ──
  {
    const halfW = GW / 2, halfH = GH / 2
    const step = Math.max(4, Math.floor(GW / (p.field * 2 + 2)))
    let row = 0
    for (let gy = Math.floor(step * 0.6); gy < halfH; gy += step, row++) {
      const off = (row % 2) * Math.floor(step / 2)
      for (let gx = Math.floor(step * 0.6) + off; gx < halfW; gx += step) {
        const r = Math.hypot(gx - ccx, gy - ccy)
        const medR = p.medallion * Math.min(GW, GH) * 0.5
        if (r < medR * 0.92) continue
        const pick = rng()
        if (pick < 0.46) stampBoteh(gx, gy, 1)
        else if (pick < 0.78) stampRosette(gx, gy, "motifB")
        else stampVineKnot(gx, gy)
      }
    }
  }

  // ── medallion ──
  {
    const R = p.medallion * Math.min(GW, GH) * 0.5
    const pts = p.points
    const twist = rng() * Math.PI

    const radiusAt = (ang: number) => {
      const lobe = Math.cos(pts * (ang - twist))
      const serr = 0.10 * Math.cos(pts * 3 * (ang - twist))
      return R * (0.80 + 0.20 * lobe + serr)
    }

    for (let gy = 0; gy <= Math.ceil(ccy); gy++) {
      for (let gx = 0; gx <= Math.ceil(ccx); gx++) {
        const dx = gx - ccx, dy = gy - ccy
        const r = Math.hypot(dx, dy)
        const ang = Math.atan2(dy, dx)
        const edge = radiusAt(ang)
        if (r <= edge) {
          const t = r / edge
          let key: string
          if (t < 0.16) key = "accent"
          else if (t < 0.30) key = "medallionFill"
          else if (t < 0.40) key = "outline"
          else if (t < 0.70) key = "medallionGround"
          else if (t < 0.80) key = "medallionFill"
          else key = "outline"
          tieM(gx, gy, key)
        }
      }
    }

    // Spokes
    for (let s = 0; s < pts; s++) {
      const a = twist + (Math.PI * 2 * s) / pts
      for (let rr = 1; rr < R * 0.62; rr++) {
        const gx = Math.round(ccx + Math.cos(a) * rr)
        const gy = Math.round(ccy + Math.sin(a) * rr)
        tieM(gx, gy, (rr % 6 < 3) ? "vine" : "medallionFill")
      }
    }
    stampRosette(Math.round(ccx), Math.round(ccy), "medallionFill")

    // Vertical pendant
    const pendL = R * 0.75
    for (let rr = R * 0.78; rr < R * 0.78 + pendL; rr++) {
      const taper = 1 - (rr - R * 0.78) / pendL
      const w = Math.max(1, Math.round(3 * taper))
      for (let dx = -w; dx <= w; dx++) {
        const key = dx === 0 ? "accent" : Math.abs(dx) === w ? "outline" : "medallionFill"
        tieM(Math.round(ccx + dx), Math.round(ccy - rr), key)
      }
    }
  }

  // ── corner pendants ──
  {
    const GUARD_W = 8
    const borderKnots = Math.round(p.border * GW) + GUARD_W
    const margin = borderKnots + 1
    const ox = margin, oy = margin
    const R = p.medallion * Math.min(GW, GH) * 0.5 * 0.72
    const pts = p.points
    const twist = rng() * Math.PI
    const radiusAt = (ang: number) => R * (0.78 + 0.22 * Math.cos(pts * (ang - twist)))

    const reach = Math.round(R * 1.15)
    for (let gy = oy; gy < oy + reach; gy++) {
      for (let gx = ox; gx < ox + reach; gx++) {
        const dx = gx - ox, dy = gy - oy
        const r = Math.hypot(dx, dy)
        const ang = Math.atan2(dy, dx)
        if (ang < 0 || ang > Math.PI / 2 + 0.05) continue
        const edge = radiusAt(ang)
        if (r <= edge) {
          const t = r / edge
          let key: string
          if (t < 0.30) key = "medallionGround"
          else if (t < 0.42) key = "medallionFill"
          else if (t < 0.74) key = "medallionGround"
          else if (t < 0.85) key = "vine"
          else key = "outline"
          tieM(gx, gy, key)
        }
      }
    }
    stampRosette(ox + Math.round(R * 0.34), oy + Math.round(R * 0.34), "medallionFill")
  }

  let ring = 0
  // ── borders (guard stripes + running vine) ──
  {
    const GUARDS = [{ w: 2, key: "outline" }, { w: 4, key: "guardA" }, { w: 2, key: "outline" }]

    const paintRing = (inset: number, w: number, key: string) => {
      for (let d = 0; d < w; d++) {
        const i = inset + d
        for (let gx = i; gx < GW - i; gx++) { tie(gx, i, key); tie(gx, GH - 1 - i, key) }
        for (let gy = i; gy < GH - i; gy++) { tie(i, gy, key); tie(GW - 1 - i, gy, key) }
      }
    }

    const paintGuard = (inset: number, w: number, key: string) => {
      paintRing(inset, w, key === "guardA" ? "borderGround" : key)
      if (key !== "guardA") return
      const period = 3
      const lay = (gx: number, gy: number, idx: number) => {
        if (idx % period === 0) tie(gx, gy, "ivory")
        else if (idx % period === 1) tie(gx, gy, "vine")
      }
      const mid = inset + Math.floor(w / 2)
      let idx = 0
      for (let gx = inset; gx < GW - inset; gx++, idx++) { lay(gx, mid, idx); lay(gx, GH - 1 - mid, idx) }
      idx = 0
      for (let gy = inset; gy < GH - inset; gy++, idx++) { lay(mid, gy, idx); lay(GW - 1 - mid, gy, idx) }
    }

    const paintRunningVine = (inset: number, w: number) => {
      const mid = inset + w / 2
      const amp = w * 0.30
      const period = Math.max(8, Math.round(w * 1.6))

      let phase = 0
      for (let gx = inset + 2; gx < GW - inset - 2; gx++, phase++) {
        const wave = Math.sin((phase / period) * Math.PI * 2) * amp
        const ty = Math.round(mid + wave)
        tie(gx, ty, "vine"); tie(gx, ty + 1, "vine")
        if (phase % period === Math.floor(period / 2)) stampBorderFlower(gx, ty, "motifA")
        else if (phase % period === 0) stampBorderLeaf(gx, ty)

        const by = Math.round(GH - 1 - mid - wave)
        tie(gx, by, "vine"); tie(gx, by - 1, "vine")
        if (phase % period === Math.floor(period / 2)) stampBorderFlower(gx, by, "motifA")
        else if (phase % period === 0) stampBorderLeaf(gx, by)
      }
      phase = 0
      for (let gy = inset + 2; gy < GH - inset - 2; gy++, phase++) {
        const wave = Math.sin((phase / period) * Math.PI * 2) * amp
        const lx = Math.round(mid + wave)
        tie(lx, gy, "vine"); tie(lx + 1, gy, "vine")
        const rx = Math.round(GW - 1 - mid - wave)
        tie(rx, gy, "vine"); tie(rx - 1, gy, "vine")
        if (phase % period === Math.floor(period / 2)) { stampBorderFlower(lx, gy, "motifA"); stampBorderFlower(rx, gy, "motifA") }
        else if (phase % period === 0) { stampBorderLeaf(lx, gy); stampBorderLeaf(rx, gy) }
      }
    }

    const mainW = Math.round(p.border * GW)
    ring = 0
    paintRing(ring, 1, "outline"); ring += 1
    for (const g of GUARDS) { paintGuard(ring, g.w, g.key); ring += g.w }
    paintRing(ring, mainW, "borderGround")
    paintRunningVine(ring, mainW)
    ring += mainW
    for (let i = GUARDS.length - 1; i >= 0; i--) { paintGuard(ring, GUARDS[i].w, GUARDS[i].key); ring += GUARDS[i].w }
    paintRing(ring, 1, "outline")
  }

  // ── deliberate flaw (always woven — authentic traditional variants) ──
  let flawCell: { x: number; y: number } | null = null
  let flawDesc = "A deliberate flaw woven in humility"

  // We use rng() to decide the flavor of deliberate flaw
  const flawChoice = rng()
  if (flawChoice < 0.33) {
    // 1. Navajo Spirit Line (Ch'ihónít'i)
    // A thin line of contrasting color (ivory or vine) running from the inner field boundary
    // straight across all borders to the outer edge.
    const sy = Math.max(1, Math.min(GH - 2, Math.round(GH * 0.12) + Math.floor(rng() * 5) - 2))
    const startX = ring + 2
    for (let sx = startX; sx >= 0; sx--) {
      tie(sx, sy, "ivory")
    }
    flawCell = { x: Math.round(startX / 2), y: sy }
    flawDesc = "spirit line (ch'ihónít'i) running through the border"
  } else if (flawChoice < 0.66) {
    // 2. Tribal Zoomorphic / Pictorial Motif (a little goat or bird)
    // Stamped asymmetrically (only once) in the field.
    const inner = ring + 2
    const animalType = rng() < 0.5 ? "goat" : "bird"
    let placed = false

    for (let tries = 0; tries < 500; tries++) {
      const gx = inner + Math.floor(rng() * (GW - inner * 2 - 4))
      const gy = inner + Math.floor(rng() * (GH - inner * 2 - 4))
      const r = Math.hypot(gx - ccx, gy - ccy)
      if (r < p.medallion * Math.min(GW, GH) * 0.5 * 1.1) continue

      // Verify the area is clear of motifs
      let clean = true
      const size = animalType === "goat" ? 3 : 2
      for (let dy = -size; dy <= size; dy++) {
        for (let dx = -size; dx <= size; dx++) {
          if (grid[gy + dy]?.[gx + dx] !== "ground") {
            clean = false
            break
          }
        }
        if (!clean) break
      }
      if (!clean) continue

      if (animalType === "goat") {
        // Horns
        tie(gx, gy - 2, "outline")
        tie(gx - 1, gy - 2, "outline")
        // Head and body
        tie(gx - 1, gy - 1, "ivory")
        tie(gx, gy - 1, "ivory")
        tie(gx + 1, gy - 1, "ivory")
        tie(gx + 2, gy - 1, "ivory")
        tie(gx, gy, "ivory")
        tie(gx + 1, gy, "ivory")
        // Legs
        tie(gx, gy + 1, "outline")
        tie(gx + 2, gy + 1, "outline")
        flawDesc = "asymmetric tribal goat in the field"
      } else {
        // Bird
        tie(gx - 1, gy - 1, "accent") // head
        tie(gx - 1, gy, "accent")     // body
        tie(gx, gy, "accent")         // body
        tie(gx + 1, gy, "accent")     // tail
        tie(gx, gy + 1, "outline")    // leg
        flawDesc = "asymmetric tribal bird in the field"
      }
      flawCell = { x: gx, y: gy }
      placed = true
      break
    }

    if (!placed) {
      // Fallback
      const gx = inner + 2
      const gy = inner + 2
      tie(gx, gy, "ivory")
      flawCell = { x: gx, y: gy }
      flawDesc = "humility knot in the corner"
    }
  } else {
    // 3. Rogue Color Block / Mismatched Motif
    // Overwrite a single field motif's color (motifA / boteh / rosette) with a different color.
    let found = false
    const inner = ring + 2
    for (let gy = inner + 1; gy < GH / 2 - 1; gy++) {
      for (let gx = inner + 1; gx < GW / 2 - 1; gx++) {
        if (grid[gy][gx] === "motifA") {
          // Recolor this boteh in one quadrant
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (grid[gy + dy]?.[gx + dx] === "motifA" || grid[gy + dy]?.[gx + dx] === "accent") {
                tie(gx + dx, gy + dy, "ivory")
              }
            }
          }
          flawCell = { x: gx, y: gy }
          flawDesc = "mismatched ivory boteh motif"
          found = true
          break
        }
      }
      if (found) break
    }

    if (!found) {
      // Fallback
      const gx = inner + 2
      const gy = inner + 2
      tie(gx, gy, "ivory")
      flawCell = { x: gx, y: gy }
      flawDesc = "humility knot in the corner"
    }
  }

  // ── grain (per-knot texture noise) ──
  const grain = new Float32Array(GW * GH * 2)
  for (let i = 0; i < GW * GH; i++) {
    grain[i * 2] = rng() + rng() + rng() - 1.5     // tone: approx normal, ±1.5
    grain[i * 2 + 1] = rng() * rng()                // wear: skewed low
  }

  // ── pre-parse palette to RGB ──
  const rgbPal: Record<string, [number, number, number]> = {}
  for (const [key, val] of Object.entries(pal)) {
    if (typeof val === "string" && val.startsWith("#")) rgbPal[key] = hexRgb(val)
  }

  return { grid, GW, GH, CW, CH, cellW, cellH, grain, flawCell, rgbPal, noise, flawDesc }
}

// ── Rendering ─────────────────────────────────────────────────────
// Draws the knot grid to canvas, then applies post-effects: pile sheen,
// fringe threads, and an outer frame.

function renderCarpet(ctx: CanvasRenderingContext2D, w: WeaveResult, p: Params) {
  const { grid, GW, GH, CW, CH, cellW, cellH, grain, rgbPal, noise } = w
  const pal = PALETTES[p.paletteIndex]

  // Background
  ctx.fillStyle = pal.ground
  ctx.fillRect(0, 0, CW, CH)

  // ── knots ──
  const jit = p.stitch ? Math.min(cellW, cellH) * 0.16 : 0
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const key = grid[gy][gx]
      const base = key === "flaw" ? rgbPal.accent : (rgbPal[key] || rgbPal.ground)
      let [r, g, b] = base

      // Abrash (dye-lot drift across rows — a hallmark of hand-dyed wool)
      if ((key === "ground" || key === "borderGround" || key === "medallionGround") && p.abrash > 0) {
        const drift = (noise(gy * 0.06, key.length * 3.1) - 0.5) * 2
        const amt = drift * 14 * p.abrash
        r += amt; g += amt * 0.9; b += amt * 0.8
      }

      const gi = (gy * GW + gx) * 2

      // Pile texture
      if (p.texture > 0) {
        const t = grain[gi] * 10 * p.texture
        r += t; g += t; b += t
      }

      // Patina (age, wear — wool fades toward warm ivory)
      if (p.patina > 0) {
        const wear = grain[gi + 1] * p.patina * 0.5
        r += (236 - r) * wear; g += (228 - g) * wear; b += (200 - b) * wear
      }

      // Weft striation (alternating-row darkening from the loom's structure)
      if (p.weft && (gy & 1)) { r -= 6; g -= 6; b -= 5 }

      ctx.fillStyle = `rgb(${clamp(r, 0, 255) | 0},${clamp(g, 0, 255) | 0},${clamp(b, 0, 255) | 0})`
      const jx = jit ? grain[gi] * jit : 0
      const jy = jit ? grain[gi + 1] * jit * 1.4 : 0
      ctx.fillRect(gx * cellW + jx, gy * cellH + jy, cellW + 0.8, cellH + 0.8)
    }
  }

  // ── pile sheen (diagonal light across the nap) ──
  ctx.save()
  ctx.globalCompositeOperation = "screen"
  for (let i = 0; i < CW; i += 4) {
    const a = 2 + (Math.sin(i * 0.004 + 0.6) + 1) * 7
    ctx.fillStyle = `rgba(255,255,240,${a / 255})`
    ctx.fillRect(i, 0, 2, CH)
  }
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = "multiply"
  const rad = Math.max(CW, CH)
  const vignette = ctx.createRadialGradient(CW / 2, CH / 2, rad * 0.2, CW / 2, CH / 2, rad * 0.62)
  vignette.addColorStop(0, "rgba(255,255,255,0)")
  vignette.addColorStop(1, "rgba(20,16,12,0.22)")
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, CW, CH)
  ctx.restore()

  // ── fringe threads at top and bottom ──
  ctx.strokeStyle = pal.ivory
  ctx.lineWidth = Math.max(1, cellW * 0.30)
  const fringeLen = cellH * 1.6
  for (let gx = 1; gx < GW; gx += 2) {
    const x = gx * cellW + cellW * 0.5
    const j1 = (noise(gx * 0.3, 0) - 0.5) * cellW
    ctx.beginPath(); ctx.moveTo(x, 0)
    ctx.lineTo(x + j1, -fringeLen * (0.6 + 0.4 * noise(gx * 0.7, 0))); ctx.stroke()
    const j2 = (noise(gx * 0.3 + 99, 0) - 0.5) * cellW
    ctx.beginPath(); ctx.moveTo(x, CH)
    ctx.lineTo(x + j2, CH + fringeLen * (0.6 + 0.4 * noise(gx * 0.7 + 5, 0))); ctx.stroke()
  }

  // ── outer frame ──
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = Math.max(CW, CH) * 0.006
  ctx.strokeRect(0, 0, CW, CH)
}

// ── Component ─────────────────────────────────────────────────────

export function PersianCarpetPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [params, setParams] = useState<Params>(DEFAULTS)
  const paramsRef = useRef(params); paramsRef.current = params

  // Memoize weave result so we can access it both for drawing and in the UI
  const weaveResult = useMemo(() => {
    return weave(params)
  }, [params])

  // Derive canvas display constraints from aspect (for CSS)
  const dims = useMemo(() => {
    const A = params.aspect
    let CW: number, CH: number
    if (A >= 1) { CW = MAXSIZE; CH = Math.round(MAXSIZE / A) }
    else { CH = MAXSIZE; CW = Math.round(MAXSIZE * A) }
    return { CW, CH }
  }, [params.aspect])

  // ── render on any param change or weave result change ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    if (canvas.width !== weaveResult.CW || canvas.height !== weaveResult.CH) {
      canvas.width = weaveResult.CW
      canvas.height = weaveResult.CH
    }
    renderCarpet(ctx, weaveResult, params)
  }, [weaveResult, params])

  // ── keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const k = e.key
      if (k === " ") { e.preventDefault(); randomCarpet() }
      else if (k === "ArrowLeft") setParams(prev => ({ ...prev, seed: Math.max(1, prev.seed - 1) }))
      else if (k === "ArrowRight") setParams(prev => ({ ...prev, seed: prev.seed + 1 }))
      else if (k.toLowerCase() === "d") downloadCarpet()
      else if (k.toLowerCase() === "f") flipAspect()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // ── actions ──

  const randomCarpet = () => {
    const seed = Math.floor(Math.random() * 999999) + 1
    const r = makeRNG(seed * 40503 + 7)
    const choice = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]
    const range = (lo: number, hi: number, step: number) => {
      return Math.round(Math.round((lo + r() * (hi - lo)) / step) * step * 1e6) / 1e6
    }
    setParams({
      seed,
      paletteIndex: Math.floor(r() * PALETTES.length),
      knots: range(56, 112, 4),
      points: range(6, 16, 1),
      medallion: range(0.24, 0.48, 0.02),
      field: range(3, 7, 1),
      border: range(0.08, 0.15, 0.01),
      abrash: range(0.1, 0.9, 0.05),
      aspect: choice([0.55, 0.7, 0.8, 1.0, 1.0, 1.25, 1.45]),
      texture: range(0.2, 0.9, 0.05),
      patina: range(0, 0.6, 0.05),
      weft: r() < 0.7,
      stitch: r() < 0.8,
    })
  }

  const flipAspect = () => {
    setParams(prev => {
      const f = Math.round(20 / prev.aspect) / 20
      return { ...prev, aspect: clamp(f, 0.5, 1.6) }
    })
  }

  const downloadCarpet = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const p = paramsRef.current
    const link = document.createElement("a")
    link.download = `persian-carpet-${PALETTES[p.paletteIndex].name.toLowerCase()}-seed${p.seed}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  const resetParams = () => setParams(DEFAULTS)

  const update = (key: keyof Params, v: number | boolean) =>
    setParams(prev => ({ ...prev, [key]: v }))

  // ── render ──
  return (
    <div className={styles.carpetContainer}>
      <header className={styles.header}>
        <h1 className={styles.panelTitle}>Persian Carpet</h1>
        <p className={styles.panelSub}>
          I had an idea in the shower — what if I could ask Claude to weave me
          cute carpet designs? Each seed pulls a different rug from the same
          loom, mirrored across its axes, with one deliberate flaw woven in.
        </p>
      </header>

      <div className={styles.gameLayout}>
        <div className={styles.canvasArea}>
          <div className={styles.canvasWrap}>
            <canvas ref={canvasRef} className={styles.canvas} />
          </div>
        </div>

        <div className={styles.panel}>
          {/* ── Seed ── */}
          <div className={styles.group}>
            <label className={styles.label}>Seed</label>
            <input
              type="number"
              className={styles.seedInput}
              value={params.seed}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (v && v > 0) update("seed", v)
              }}
            />
            <div className={styles.row}>
              <button onClick={() => update("seed", Math.max(1, params.seed - 1))}>← Prev</button>
              <button onClick={() => update("seed", params.seed + 1)}>Next →</button>
            </div>
            <div className={styles.row}>
              <button className={styles.primary} onClick={randomCarpet}>↻ Random Carpet</button>
            </div>
          </div>

          {/* ── Dye lot ── */}
          <div className={styles.group}>
            <label className={styles.label}>Dye lot</label>
            <div className={styles.chips}>
              {PALETTES.map((pal, i) => (
                <button
                  key={pal.name}
                  className={`${styles.chip} ${params.paletteIndex === i ? styles.chipActive : ""}`}
                  onClick={() => update("paletteIndex", i)}
                  title={pal.name}
                >
                  {pal.name}
                  <div className={styles.swatchDots}>
                    {[pal.ground, pal.medallionGround, pal.vine, pal.accent, pal.ivory].map((c, j) => (
                      <span key={j} className={styles.swatchDot} style={{ background: c }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Loom ── */}
          <div className={styles.group}>
            <label className={styles.label}>
              Aspect ratio <span className={styles.valueHint}>{aspectLabel(params.aspect)}</span>
            </label>
            <input type="range" min={0.5} max={1.6} step={0.05} value={params.aspect}
              onChange={(e) => update("aspect", parseFloat(e.target.value))} />
            <div className={styles.row} style={{ marginTop: "0.35rem" }}>
              <button onClick={flipAspect}>⟳ Flip orientation</button>
            </div>
          </div>
          <div className={styles.group}>
            <label className={styles.label}>
              Knot density <span className={styles.valueHint}>{params.knots * 2} × {Math.max(8, Math.round(params.knots * 2 / params.aspect))}</span>
            </label>
            <input type="range" min={48} max={120} step={4} value={params.knots}
              onChange={(e) => update("knots", parseInt(e.target.value))} />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>
              Medallion points <span className={styles.valueHint}>{params.points}</span>
            </label>
            <input type="range" min={6} max={16} step={1} value={params.points}
              onChange={(e) => update("points", parseInt(e.target.value))} />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>
              Medallion size <span className={styles.valueHint}>{params.medallion}</span>
            </label>
            <input type="range" min={0.20} max={0.52} step={0.02} value={params.medallion}
              onChange={(e) => update("medallion", parseFloat(e.target.value))} />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>
              Field motifs <span className={styles.valueHint}>{params.field}</span>
            </label>
            <input type="range" min={2} max={8} step={1} value={params.field}
              onChange={(e) => update("field", parseInt(e.target.value))} />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>
              Border width <span className={styles.valueHint}>{params.border}</span>
            </label>
            <input type="range" min={0.06} max={0.16} step={0.01} value={params.border}
              onChange={(e) => update("border", parseFloat(e.target.value))} />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>
              Abrash <span className={styles.valueHint}>{params.abrash}</span>
            </label>
            <input type="range" min={0} max={1} step={0.05} value={params.abrash}
              onChange={(e) => update("abrash", parseFloat(e.target.value))} />
          </div>

          {/* ── Wool & pile ── */}
          <div className={styles.group}>
            <label className={styles.label}>
              Pile texture <span className={styles.valueHint}>{params.texture}</span>
            </label>
            <input type="range" min={0} max={1} step={0.05} value={params.texture}
              onChange={(e) => update("texture", parseFloat(e.target.value))} />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>
              Age &amp; patina <span className={styles.valueHint}>{params.patina}</span>
            </label>
            <input type="range" min={0} max={0.8} step={0.05} value={params.patina}
              onChange={(e) => update("patina", parseFloat(e.target.value))} />
          </div>

          <label className={styles.checkRow}>
            <input type="checkbox" checked={params.weft}
              onChange={(e) => update("weft", e.target.checked)} />
            Weft striation
          </label>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={params.stitch}
              onChange={(e) => update("stitch", e.target.checked)} />
            Hand-tied stitch
          </label>

          {/* ── Actions ── */}
          <div className={styles.group}>
            <div className={styles.row}>
              <button onClick={resetParams}>Reset</button>
              <button onClick={downloadCarpet}>⬇ PNG</button>
            </div>
          </div>

          <p className={styles.meta}>
            Space random · ←→ seed · D download · F flip<br />
            Deliberate flaw: <strong>{weaveResult.flawDesc}</strong><br />
            Only the divine can achieve true perfection.
          </p>
        </div>
      </div>
    </div>
  )
}
