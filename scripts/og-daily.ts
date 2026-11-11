/**
 * OG cards for daily notes (the logbook): a date-seeded drawing, 1200×630.
 *
 * Every card is three layers, all a function of the date:
 *   wash    — a soft seasonal ground (rust in autumn, blue-grey in winter…)
 *   motif   — an ink drawing, a cousin of one of the site's backgrounds
 *   almanac — the quiet facts of that day: moon, daylight, place in the year
 *
 * The date picks the motif. A tag can narrow the choice to a family
 * (`games` → isometric or board): the first tag in the note's frontmatter that
 * names a family wins, and the date picks the member. See TAG_MOTIFS, the key.
 *
 * Preview without touching public/og:
 *   tsx scripts/og-daily.ts --out scratch/og-daily            (one card per motif)
 */
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import jpeg from "jpeg-js"
import { OG_FONT_FAMILY, loadOgFonts, type OgFontData } from "./og-system"
import { simplex } from "../src/lib/backgrounds/simplex"
import { almanac, almanacLines, dailyHeadline, type Almanac } from "../src/lib/daily"

const W = 1200
const H = 630
const BG = "#0a0a0a"
const INK = "#ece7dc"
const DIM = "#b9b4a8"
const FAINT = "#7d7a72"

const SEASON = {
  spring: { wash: ["#5f8f6a", "#c98fa0"], line: "#a9d0b0" },
  summer: { wash: ["#c9a24a", "#4f8f8a"], line: "#ecd28a" },
  autumn: { wash: ["#b5622e", "#6b4a7a"], line: "#e3a070" },
  winter: { wash: ["#3f6f9f", "#7f8fa8"], line: "#9fc0e6" },
} as const

/**
 * THE KEY: tag → motif family. First matching tag in frontmatter order wins;
 * the date picks within the family. No matching tag: the date picks from all.
 */
export const TAG_MOTIFS: Record<string, string[]> = {
  enclosure: ["enclosure"],
  games: ["isometric", "board"],
  math: ["attractor", "lattice", "spiral"],
  maths: ["attractor", "lattice", "spiral"],
  mathematics: ["attractor", "lattice", "spiral"],
  logic: ["lattice", "board"],
  ai: ["murmuration", "network"],
  ml: ["network", "murmuration"],
  music: ["ridgeline"],
  philosophy: ["prose"],
  writing: ["prose"],
  reading: ["prose"],
  thoughts: ["prose", "field"],
  meta: ["terminal"],
  webdev: ["terminal"],
  code: ["terminal"],
  astro: ["orrery"],
  astronomy: ["orrery"],
  photography: ["rays"],
  light: ["rays"],
  doom: ["lightning"],
  weather: ["lightning", "field"],
  map: ["cartography"],
  travel: ["cartography"],
  walking: ["cartography"],
}

// ── seeded helpers ──
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}
function rng(seed: number) {
  let s = seed || 0x6d2b79f5
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000 }
}
const f = (n: number) => n.toFixed(1)
type P = [number, number]
type Ctx = { r: () => number; ox: number; oy: number; line: string }
/** Noise offset by the day's seed, so every date gets its own field. */
const nz = (c: Ctx, x: number, y: number, s: number) => simplex(x * s + c.ox, y * s + c.oy)

/** A hand-drawn polyline: slight wobble, drawn twice a hair apart. */
function sketch(pts: P[], o: { w?: number; o?: number; col?: string; close?: boolean } = {}): string {
  if (pts.length < 2) return ""
  const { w = 1, o: op = 0.5, col = INK, close = false } = o
  const pass = (amp: number, k: number) => "M" + pts.map(([x, y], i) =>
    `${f(x + simplex(x * 0.03 + k, y * 0.03) * amp)} ${f(y + simplex(y * 0.03, x * 0.03 + k + i * 0.001) * amp)}`).join("L") + (close ? "Z" : "")
  return `<path d="${pass(1.2, 3)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${pass(1.8, 9)}" fill="none" stroke="${col}" stroke-width="${w * 0.6}" stroke-opacity="${op * 0.5}" stroke-linecap="round"/>`
}
const ring = (cx: number, cy: number, rx: number, ry = rx, n = 40, rot = 0): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)] as P
  })

// ── motifs (cousins of the site's background modes) ──
export const MOTIFS: Record<string, (c: Ctx) => string> = {
  field(c) {
    let out = ""
    for (let i = 0; i < 420; i++) {
      let x = c.r() * W, y = c.r() * H
      const pts: P[] = []
      const len = 30 + c.r() * 70
      for (let s = 0; s < len; s++) {
        pts.push([x, y])
        const a = nz(c, x, y, 0.0016) * Math.PI * 2.2
        x += Math.cos(a) * 5; y += Math.sin(a) * 5
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) break
      }
      out += sketch(pts, { w: 0.9, o: 0.16 + c.r() * 0.3, col: c.r() < 0.12 ? c.line : INK })
    }
    return out
  },

  murmuration(c) {
    const N = 820
    const b = Array.from({ length: N }, () => ({ x: 560 + c.r() * 460, y: 100 + c.r() * 320, vx: c.r() * 4 - 2, vy: c.r() * 4 - 2, tail: [] as P[] }))
    const hx = 740 + c.r() * 160, hy = 250 + c.r() * 70
    for (let t = 0; t < 150; t++) {
      // a coarse grid keeps the neighbour search cheap
      const grid = new Map<number, typeof b>()
      for (const p of b) {
        const k = Math.floor(p.x / 60) * 1000 + Math.floor(p.y / 60)
        const cell = grid.get(k); if (cell) cell.push(p); else grid.set(k, [p])
      }
      for (const p of b) {
        let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0
        const gx = Math.floor(p.x / 60), gy = Math.floor(p.y / 60)
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of grid.get((gx + i) * 1000 + gy + j) ?? []) {
          if (q === p) continue
          const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy
          if (d2 > 3600) continue
          n++; cx += q.x; cy += q.y; ax += q.vx; ay += q.vy
          if (d2 < 150) { sx -= dx; sy -= dy }
        }
        if (n) { p.vx += (cx / n - p.x) * 0.006 + (ax / n - p.vx) * 0.08 + sx * 0.03; p.vy += (cy / n - p.y) * 0.006 + (ay / n - p.vy) * 0.08 + sy * 0.03 }
        const a = nz(c, p.x, p.y + t * 2, 0.0022) * Math.PI * 2
        p.vx += Math.cos(a) * 0.3 + (hx - p.x) * 0.0024; p.vy += Math.sin(a) * 0.3 + (hy - p.y) * 0.004
        const sp = Math.hypot(p.vx, p.vy) || 1, lim = Math.min(4.4, Math.max(2.6, sp))
        p.vx = p.vx / sp * lim; p.vy = p.vy / sp * lim
        p.x += p.vx; p.y += p.vy
        if (t >= 144) p.tail.push([p.x, p.y])
      }
    }
    // each bird a short dash, a few with a longer wake
    let dI = "", dA = ""
    b.forEach((p, i) => {
      const [x0, y0] = p.tail[i % 7 === 0 ? 0 : 3], [x1, y1] = p.tail[p.tail.length - 1]
      const seg = `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`
      if (i % 9 === 0) dA += seg; else dI += seg
    })
    return `<path d="${dI}" stroke="${INK}" stroke-width="1.3" stroke-opacity="0.62" stroke-linecap="round" fill="none"/>` +
      `<path d="${dA}" stroke="${c.line}" stroke-width="1.5" stroke-opacity="0.8" stroke-linecap="round" fill="none"/>`
  },

  cartography(c) {
    const G = 12, cols = Math.ceil(W / G) + 1, rows = Math.ceil(H / G) + 1
    const h = (i: number, j: number) => nz(c, i * G, j * G, 0.0021) + 0.35 * nz(c, i * G + 900, j * G, 0.006)
    let out = ""
    for (let l = 0; l < 13; l++) {
      const lv = -0.9 + l * 0.15
      let d = ""
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const v = [h(i, j), h(i + 1, j), h(i + 1, j + 1), h(i, j + 1)]
        const Q: P[] = []
        const edge = (a: number, b: number, x0: number, y0: number, x1: number, y1: number) => {
          if ((v[a] < lv) !== (v[b] < lv)) { const t = (lv - v[a]) / (v[b] - v[a]); Q.push([(x0 + (x1 - x0) * t) * G, (y0 + (y1 - y0) * t) * G]) }
        }
        edge(0, 1, i, j, i + 1, j); edge(1, 2, i + 1, j, i + 1, j + 1); edge(2, 3, i + 1, j + 1, i, j + 1); edge(3, 0, i, j + 1, i, j)
        if (Q.length >= 2) d += `M${f(Q[0][0] + simplex(Q[0][0] * .02, l) * 1.2)} ${f(Q[0][1])}L${f(Q[1][0] + simplex(Q[1][0] * .02, l) * 1.2)} ${f(Q[1][1])}`
      }
      const major = l % 4 === 0
      out += `<path d="${d}" fill="none" stroke="${major ? c.line : INK}" stroke-width="${major ? 1.4 : 0.8}" stroke-opacity="${major ? 0.55 : 0.26}" stroke-linecap="round"/>`
    }
    for (let k = 0; k < 9; k++) { // spot heights
      const x = 80 + c.r() * (W - 160), y = 60 + c.r() * (H - 120)
      out += `<path d="M${f(x - 5)} ${f(y)}h10M${f(x)} ${f(y - 5)}v10" stroke="${INK}" stroke-opacity="0.5" stroke-width="1"/>`
    }
    return out
  },

  lightning(c) {
    let out = ""
    for (let i = 0; i < 70; i++) { // cloud base: loose hatching along the top
      const x = 380 + c.r() * 820, y = c.r() * c.r() * 120
      out += sketch([[x, y], [x + 30 + c.r() * 50, y + (c.r() - 0.5) * 10]], { w: 0.8, o: 0.12 + c.r() * 0.14 })
    }
    const bolt = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      const pts: P[] = [[x, y]]
      const steps = Math.floor(len / 12)
      for (let s = 0; s < steps; s++) {
        a += (c.r() - 0.5) * 1.0
        a = a * 0.84 + (Math.PI / 2) * 0.16
        x += Math.cos(a) * 12; y += Math.sin(a) * 12
        pts.push([x, y])
        if (depth < 4 && c.r() < 0.16) bolt(x, y, a + (c.r() < 0.5 ? -1 : 1) * (0.4 + c.r() * 0.7), len * (0.28 + c.r() * 0.3), w * 0.58, depth + 1)
        if (y > H + 10) break
      }
      const d = "M" + pts.map(([px, py]) => `${f(px)} ${f(py)}`).join("L")
      if (depth === 0) out += `<path d="${d}" fill="none" stroke="${c.line}" stroke-width="12" stroke-opacity="0.07" stroke-linecap="round" stroke-linejoin="round"/>`
      out += sketch(pts, { w, o: depth === 0 ? 0.95 : 0.62 - depth * 0.09, col: depth === 0 ? c.line : INK })
    }
    const n = 2 + Math.floor(c.r() * 2)
    for (let i = 0; i < n; i++) bolt(520 + c.r() * 560, 10, Math.PI / 2 + (c.r() - 0.5) * 0.5, 560 + c.r() * 200, 2.8, 0)
    for (let i = 0; i < 60; i++) { // rain
      const x = c.r() * W, y = 80 + c.r() * H
      out += sketch([[x, y], [x - 12, y + 40]], { w: 0.7, o: 0.13 })
    }
    return out
  },

  attractor(c) {
    // The date's own parameters first. Some dates land on a fixed point or a
    // short cycle; those fall back to a short list of good ones, fitted to the frame.
    const run = (a: number, b: number, cc: number, d: number) => {
      let x = 0.1, y = 0.1
      const pts: P[] = [], cells = new Set<number>(), fine = new Set<number>()
      for (let i = 0; i < 90000; i++) {
        const nx = Math.sin(a * y) + cc * Math.cos(a * x), ny = Math.sin(b * x) + d * Math.cos(b * y)
        x = nx; y = ny
        pts.push([x, y]); cells.add(Math.round(x * 12) * 1000 + Math.round(y * 12)); fine.add(Math.round(x * 60) * 4000 + Math.round(y * 60))
      }
      // alive: neither a fixed point or short cycle, nor an even dust with no form
      return { pts, alive: cells.size > 700 && fine.size < 42000 }
    }
    const draw = (pts: P[], at: (p: P) => P) => {
      let dI = "", dA = ""
      pts.forEach((p, i) => {
        const [x, y] = at(p)
        const seg = `M${f(x)} ${f(y)}h0.9`
        if (i % 7 === 0) dA += seg; else dI += seg
      })
      return `<path d="${dI}" stroke="${INK}" stroke-width="0.9" stroke-opacity="0.22" fill="none"/><path d="${dA}" stroke="${c.line}" stroke-width="1" stroke-opacity="0.4" fill="none"/>`
    }
    const own = run(-1.4 - c.r() * 0.6, 1.5 + c.r() * 0.5, 1 + c.r() * 0.8, 0.6 + c.r() * 0.5)
    if (own.alive) return draw(own.pts, ([x, y]) => [760 + x * 150, 300 + y * 118])
    const SETS = [[-1.4, 1.6, 1.0, 0.7], [1.7, 1.7, 0.6, 1.2], [-1.7, 1.3, -0.1, -1.21], [-1.8, -2.0, -0.5, -0.9], [1.5, -1.8, 1.6, 0.9], [-1.3, -1.3, -1.8, -1.9]]
    const first = Math.floor(c.r() * SETS.length)
    let pts: P[] = own.pts
    for (let k = 0; k < SETS.length; k++) {
      const [a, b, cc, d] = SETS[(first + k) % SETS.length]
      const tried = run(a, b, cc, d)
      pts = tried.pts.slice(200)
      if (tried.alive) break
    }
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    const sc = Math.min(640 / (x1 - x0), 460 / (y1 - y0)), mx = (x0 + x1) / 2, my = (y0 + y1) / 2
    return draw(pts, ([x, y]) => [810 + (x - mx) * sc, 295 + (y - my) * sc])
  },

  isometric(c) {
    let out = ""
    const T = 30
    const iso = (i: number, j: number, z: number): P => [760 + (i - j) * T, 150 + (i + j) * T * 0.5 - z]
    for (let s = 0; s < 34; s++) for (let i = 0; i < 17; i++) {
      const j = s - i
      if (j < 0 || j >= 17) continue
      const z = Math.max(0, Math.round((nz(c, i * 40, j * 40, 0.009) + 0.25) * 5)) * 16
      if (!z) { out += sketch([iso(i, j, 0), iso(i + 1, j, 0), iso(i + 1, j + 1, 0)], { w: 0.6, o: 0.13 }); continue }
      const A = iso(i, j, z), B = iso(i + 1, j, z), C = iso(i + 1, j + 1, z), D = iso(i, j + 1, z), C0 = iso(i + 1, j + 1, 0), B0 = iso(i + 1, j, 0), D0 = iso(i, j + 1, 0)
      out += `<path d="M${f(A[0])} ${f(A[1])}L${f(B[0])} ${f(B[1])}L${f(B0[0])} ${f(B0[1])}L${f(C0[0])} ${f(C0[1])}L${f(D0[0])} ${f(D0[1])}L${f(D[0])} ${f(D[1])}Z" fill="${BG}" fill-opacity="0.92"/>`
      out += sketch([A, B, C, D, A], { w: 1, o: 0.6, col: z > 48 ? c.line : INK })
      out += sketch([B, B0, C0, D0, D], { w: 0.9, o: 0.45 }) + sketch([C, C0], { w: 0.9, o: 0.45 })
      for (let k = 1; k < z / 5; k++) { // hatch the shaded face
        const t = k / (z / 5)
        out += sketch([[D[0], D[1] + t * z], [C[0], C[1] + t * z]], { w: 0.6, o: 0.22 })
      }
    }
    return out
  },

  /** A go-like board mid-game. */
  board(c) {
    const n = 15, cell = 30, x0 = 610, y0 = 90
    let out = "", grid = ""
    for (let i = 0; i < n; i++) grid += `M${x0} ${y0 + i * cell}h${(n - 1) * cell}M${x0 + i * cell} ${y0}v${(n - 1) * cell}`
    out += `<path d="${grid}" stroke="${INK}" stroke-opacity="0.34" stroke-width="0.8" transform="rotate(-4 820 300)"/>`
    let stones = ""
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = nz(c, i * 40, j * 40, 0.013) + (c.r() - 0.5) * 0.35
      const x = x0 + i * cell, y = y0 + j * cell
      if ((i === 3 || i === 7 || i === 11) && (j === 3 || j === 7 || j === 11)) stones += `<circle cx="${x}" cy="${y}" r="2.2" fill="${INK}" fill-opacity="0.45"/>`
      if (Math.abs(v) < 0.46) continue
      const black = v > 0
      stones += `<circle cx="${f(x + (c.r() - 0.5) * 2)}" cy="${f(y + (c.r() - 0.5) * 2)}" r="11.5" fill="${black ? BG : INK}" fill-opacity="${black ? 0.95 : 0.82}" stroke="${black ? INK : BG}" stroke-opacity="0.7" stroke-width="1"/>`
      if (black) for (let k = -2; k <= 2; k++) stones += `<path d="M${f(x - 8 + Math.abs(k))} ${f(y + k * 3.4)}h${f(16 - Math.abs(k) * 2)}" stroke="${INK}" stroke-opacity="0.3" stroke-width="0.7"/>`
    }
    // the last move, marked
    const lx = x0 + Math.floor(c.r() * n) * cell, ly = y0 + Math.floor(c.r() * n) * cell
    stones += `<circle cx="${lx}" cy="${ly}" r="11.5" fill="${c.line}" fill-opacity="0.9"/><circle cx="${lx}" cy="${ly}" r="17" fill="none" stroke="${c.line}" stroke-opacity="0.6" stroke-width="1" stroke-dasharray="2 4"/>`
    return out + `<g transform="rotate(-4 820 300)">${stones}</g>`
  },

  /** Enclosure: two sides fencing territory on a 19×19 lattice, a dark seam between them. */
  enclosure(c) {
    const n = 19, g = 22, x0 = 744, y0 = 112
    const at = (i: number, j: number): P => [x0 + i * g, y0 + j * g]
    let out = "", dots = ""
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const [x, y] = at(i, j); dots += `M${x} ${y}h0.01` }
    out += `<path d="${dots}" stroke="${INK}" stroke-opacity="0.3" stroke-width="2.2" stroke-linecap="round"/>`
    // the seam wanders down the board; each side fences up to it
    const seam: number[] = []
    for (let j = 0; j < n; j++) seam.push(Math.max(4, Math.min(14, Math.round(9 + nz(c, 0, j * 34, 0.012) * 6 + Math.sin(j * 0.7 + c.ox) * 1.5))))
    const side = (left: boolean, col: string) => {
      const edge = (j: number) => (left ? seam[j] - 1 : seam[j] + 1)
      const wall = left ? 0 : n - 1
      const poly: P[] = []
      const rim: [number, number][] = []
      // along the top, down the seam, along the foot, back up the wall
      for (let i = wall; left ? i <= edge(0) : i >= edge(0); i += (left ? 1 : -1) * (2 + Math.floor(c.r() * 3))) rim.push([i, 0])
      rim.push([edge(0), 0])
      for (let j = 1 + Math.floor(c.r() * 2); j < n - 1; j += 1 + Math.floor(c.r() * 3)) rim.push([edge(j), j])
      rim.push([edge(n - 1), n - 1])
      for (let i = edge(n - 1); left ? i > 0 : i < n - 1; i += (left ? -1 : 1) * (2 + Math.floor(c.r() * 3))) rim.push([i, n - 1])
      rim.push([wall, n - 1])
      for (let j = n - 3; j > 0; j -= 2 + Math.floor(c.r() * 4)) rim.push([wall, j])
      for (const [i, j] of rim) poly.push(at(i, j))
      let o = `<path d="M${poly.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z" fill="${col}" fill-opacity="0.2"/>` + sketch(poly, { w: 1.4, o: 0.9, col, close: true })
      // posts inside the territory, tied back to the fence
      const posts: [number, number][] = []
      for (let k = 0; k < 6; k++) {
        const j = 1 + Math.floor(c.r() * (n - 2))
        const lo = left ? 1 : edge(j) + 1, hi = left ? edge(j) - 1 : n - 2
        if (hi <= lo) continue
        posts.push([lo + Math.floor(c.r() * (hi - lo + 1)), j])
      }
      const inside = (a: [number, number], b: [number, number]) => {
        for (let t = 0.1; t < 1; t += 0.1) {
          const i = a[0] + (b[0] - a[0]) * t, j = Math.round(a[1] + (b[1] - a[1]) * t)
          if (left ? i > edge(j) : i < edge(j)) return false
        }
        return true
      }
      for (const post of posts) {
        const near = [...rim, ...posts].filter((q) => q !== post && inside(post, q))
          .sort((a, b) => Math.hypot(a[0] - post[0], a[1] - post[1]) - Math.hypot(b[0] - post[0], b[1] - post[1])).slice(0, 2 + Math.floor(c.r() * 2))
        for (const q of near) o += sketch([at(post[0], post[1]), at(q[0], q[1])], { w: 1.1, o: 0.6, col })
      }
      for (const [i, j] of [...rim, ...posts]) { const [x, y] = at(i, j); o += `<circle cx="${x}" cy="${y}" r="4" fill="${col}" fill-opacity="0.95"/><circle cx="${x}" cy="${y}" r="4" fill="none" stroke="${BG}" stroke-opacity="0.6" stroke-width="0.8"/>` }
      return o
    }
    out += side(true, INK) + side(false, c.line)
    // the move being weighed: a ringed point on the seam
    const mj = 3 + Math.floor(c.r() * 12), [mx, my] = at(seam[mj], mj)
    out += `<circle cx="${mx}" cy="${my}" r="4" fill="${BG}" stroke="${c.line}" stroke-width="1.4"/><circle cx="${mx}" cy="${my}" r="10" fill="none" stroke="${c.line}" stroke-opacity="0.6" stroke-width="1" stroke-dasharray="2 3"/>`
    return out
  },

  /** Layers of units and the weights between them. */
  network(c) {
    const layers = 6 + Math.floor(c.r() * 2)
    const cols: P[][] = []
    for (let l = 0; l < layers; l++) {
      const n = 4 + Math.floor(c.r() * 6), x = 520 + l * (600 / (layers - 1))
      cols.push(Array.from({ length: n }, (_, i) => [x + (c.r() - 0.5) * 16, 300 + (i - (n - 1) / 2) * (430 / Math.max(n, 6)) + (c.r() - 0.5) * 10] as P))
    }
    let out = ""
    let at = Math.floor(c.r() * cols[0].length)
    for (let l = 0; l < layers - 1; l++) {
      const next = Math.floor(c.r() * cols[l + 1].length)
      cols[l].forEach((a, i) => cols[l + 1].forEach((b, j) => {
        const hot = i === at && j === next
        const wgt = c.r()
        if (!hot && wgt < 0.25) return
        out += sketch([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (c.r() - 0.5) * 8], b], hot ? { w: 1.8, o: 0.9, col: c.line } : { w: 0.7, o: 0.06 + wgt * wgt * 0.3 })
      }))
      at = next
    }
    cols.forEach((col) => col.forEach(([x, y]) => {
      out += `<circle cx="${f(x)}" cy="${f(y)}" r="6.5" fill="${BG}"/>` + sketch(ring(x, y, 6.5, 6.5, 14), { w: 1, o: 0.75 })
    }))
    return out
  },

  /** Kissing circles on a triangular lattice, a few shells picked out. */
  lattice(c) {
    const R = 21, cx = 800 + (c.r() - 0.5) * 120, cy = 290 + (c.r() - 0.5) * 60
    let out = ""
    const shell = 2 + Math.floor(c.r() * 3)
    for (let j = -9; j <= 9; j++) for (let i = -14; i <= 14; i++) {
      const x = cx + (i + (j & 1) * 0.5) * R * 2, y = cy + j * R * Math.sqrt(3)
      const d = Math.hypot(x - cx, y - cy) / (R * 2)
      if (d > 7.6 + nz(c, x, y, 0.004) * 1.5) continue
      const hot = Math.abs(d - shell) < 0.36 || d < 0.1
      out += sketch(ring(x, y, R, R, 22), { w: hot ? 1.3 : 0.8, o: hot ? 0.85 : Math.max(0.12, 0.55 - d * 0.05), col: hot ? c.line : INK })
      if (hot && d > 0.1) out += sketch([[cx, cy], [x, y]], { w: 0.6, o: 0.25, col: c.line })
    }
    return out
  },

  /** Phyllotaxis: seeds at the golden angle, one family of spirals drawn in. */
  spiral(c) {
    const cx = 770, cy = 310, GA = Math.PI * (3 - Math.sqrt(5)), N = 620, turn = c.r() * 6.28
    const pos = (k: number): P => { const rr = 10.5 * Math.sqrt(k), a = k * GA + turn; return [cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr] }
    let out = ""
    const fam = [13, 21, 34][Math.floor(c.r() * 3)]
    for (let s = 0; s < fam; s++) {
      const pts: P[] = []
      for (let k = s + 1; k < N; k += fam) pts.push(pos(k))
      out += sketch(pts, { w: 0.8, o: s % 5 === 0 ? 0.6 : 0.22, col: s % 5 === 0 ? c.line : INK })
    }
    for (let k = 1; k < N; k++) {
      const [x, y] = pos(k), rr = 1.2 + Math.sqrt(k) * 0.16
      out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="${k % fam === 0 ? c.line : INK}" fill-opacity="${k % fam === 0 ? 0.9 : 0.5}"/>`
    }
    return out
  },

  /** Stacked waveforms: a record seen side-on. */
  ridgeline(c) {
    let out = ""
    const rows = 30, x0 = 470, x1 = 1150
    for (let r = 0; r < rows; r++) {
      const y = 170 + r * 13.5
      const mid = 800 + nz(c, r * 30, 0, 0.012) * 130, wid = 90 + (nz(c, 0, r * 30, 0.02) + 1) * 70
      const pts: P[] = []
      for (let x = x0; x <= x1; x += 5) {
        const env = Math.exp(-(((x - mid) / wid) ** 2))
        const amp = Math.abs(nz(c, x * 3, r * 90, 0.006)) * 62 + Math.abs(nz(c, x * 9, r * 50, 0.012)) * 18
        pts.push([x, y - env * amp - Math.abs(simplex(x * 0.05, r)) * 1.5])
      }
      const d = "M" + pts.map(([x, yy]) => `${f(x)} ${f(yy)}`).join("L")
      out += `<path d="${d}L${x1} ${y + 14}L${x0} ${y + 14}Z" fill="${BG}" fill-opacity="0.9"/>`
      out += sketch(pts, { w: 1, o: r % 9 === 4 ? 0.9 : 0.5, col: r % 9 === 4 ? c.line : INK })
    }
    return out
  },

  /** Asemic handwriting: a page from the notebook, a word or two struck out. */
  prose(c) {
    let out = ""
    const x0 = 600, x1 = 1130
    let y = 110
    const word = (x: number, yy: number, len: number, size: number, col: string, op: number) => {
      const pts: P[] = []
      let phase = c.r() * 6
      for (let t = 0; t <= len; t += 2.2) {
        phase += 0.75 + c.r() * 0.5
        const tall = c.r() < 0.12 ? -size * 1.5 : c.r() < 0.08 ? size * 1.3 : 0
        pts.push([x + t + Math.sin(phase) * 1.6 + size * 0.25, yy + Math.cos(phase) * size * 0.5 + tall * Math.abs(Math.sin(phase))])
      }
      return sketch(pts, { w: 1, o: op, col })
    }
    for (let para = 0; para < 5 && y < 560; para++) {
      const lines = 2 + Math.floor(c.r() * 4)
      for (let l = 0; l < lines && y < 560; l++, y += 26) {
        let x = x0 + (l === 0 ? 34 : 0) + nz(c, y, 0, 0.01) * 6
        const end = l === lines - 1 ? x0 + 120 + c.r() * 380 : x1
        while (x < end - 20) {
          const len = Math.min(end - x, 14 + c.r() * 62)
          const hot = c.r() < 0.045
          out += word(x, y + (x - x0) * 0.006 * (para % 2 ? 1 : -1), len, 7, hot ? c.line : INK, hot ? 0.9 : 0.5)
          if (c.r() < 0.035) out += sketch([[x - 2, y - 1], [x + len + 2, y + 1]], { w: 1.1, o: 0.7 })
          x += len + 9 + c.r() * 5
        }
      }
      y += 16
    }
    // a note in the margin, and a rule
    out += sketch([[x0 - 26, 96], [x0 - 26, 560]], { w: 0.7, o: 0.25, col: c.line })
    for (let l = 0; l < 3; l++) out += word(x0 - 140, 200 + c.r() * 200 + l * 15, 50 + c.r() * 40, 4, c.line, 0.6)
    return out
  },

  /** A screen of glyphs: prompts, output, a window, a cursor. */
  terminal(c) {
    const cw = 13, ch = 24, x0 = 500, cols = 50, rows = 19, top = 104
    let dI = "", dA = "", out = ""
    const glyph = (col: number, row: number, hot: boolean) => {
      const x = x0 + col * cw, y = top + row * ch
      let d = ""
      const n = 2 + Math.floor(c.r() * 3)
      for (let k = 0; k < n; k++) {
        const ax = x + 2 + Math.floor(c.r() * 3) * 4, ay = y + 3 + Math.floor(c.r() * 4) * 4
        d += c.r() < 0.5 ? `M${ax} ${ay}h${4 + Math.floor(c.r() * 2) * 4}` : `M${ax} ${ay}v${4 + Math.floor(c.r() * 2) * 4}`
      }
      if (hot) dA += d; else dI += d
    }
    for (let r = 0; r < rows; r++) {
      const kind = c.r()
      if (kind < 0.14) continue // blank line
      const prompt = kind < 0.42
      const indent = prompt ? 0 : 2 + Math.floor(c.r() * 3) * 2
      const len = prompt ? 6 + Math.floor(c.r() * 20) : 10 + Math.floor(c.r() * (cols - 14 - indent))
      if (prompt) dA += `M${x0} ${top + r * ch + 5}l7 6l-7 6`
      for (let k = 0; k < len; k++) if (c.r() > 0.16) glyph(indent + 2 + k, r, prompt && k < 4)
      if (prompt && c.r() < 0.3) out += `<rect x="${x0 + (indent + 3 + len) * cw}" y="${top + r * ch + 2}" width="9" height="17" fill="${c.line}" fill-opacity="0.85"/>`
    }
    // a window floating over the scrollback
    const wx = x0 + 22 * cw, wy = top + (2 + Math.floor(c.r() * 5)) * ch, ww = 24 * cw, wh = 8 * ch
    out += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" fill="${BG}" fill-opacity="0.9"/>` +
      sketch([[wx, wy], [wx + ww, wy], [wx + ww, wy + wh], [wx, wy + wh], [wx, wy]], { w: 1.1, o: 0.8, col: c.line }) +
      sketch([[wx, wy + ch], [wx + ww, wy + ch]], { w: 0.8, o: 0.5, col: c.line })
    const before = dI.length
    for (let r = 2; r < 7; r++) for (let k = 1; k < 4 + Math.floor(c.r() * 18); k++) glyph(23 + k, (wy - top) / ch + r - 0.2, false)
    return `<path d="${dI.slice(0, before)}" stroke="${INK}" stroke-width="1.3" stroke-opacity="0.5" fill="none" stroke-linecap="round"/>` + out +
      `<path d="${dI.slice(before)}" stroke="${INK}" stroke-width="1.3" stroke-opacity="0.6" fill="none" stroke-linecap="round"/>` +
      `<path d="${dA}" stroke="${c.line}" stroke-width="1.5" stroke-opacity="0.85" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  },

  /** Orbits seen at a tilt, with moons and one comet. */
  orrery(c) {
    const cx = 810, cy = 290, tilt = -0.22 + c.r() * 0.2, sq = 0.36 + c.r() * 0.14
    let out = ""
    const n = 6 + Math.floor(c.r() * 3)
    for (let i = 0; i < n; i++) {
      const rx = 60 + i * 56 + c.r() * 14
      out += sketch(ring(cx, cy, rx, rx * sq, 70, tilt), { w: 0.9, o: 0.5 - i * 0.035 })
      const a = c.r() * 6.283
      const px = Math.cos(a) * rx, py = Math.sin(a) * rx * sq
      const x = cx + px * Math.cos(tilt) - py * Math.sin(tilt), y = cy + px * Math.sin(tilt) + py * Math.cos(tilt)
      const pr = 3 + c.r() * 7
      const hot = i === 2
      out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(pr)}" fill="${hot ? c.line : BG}" fill-opacity="0.95"/>` + sketch(ring(x, y, pr, pr, 14), { w: 1, o: 0.9, col: hot ? c.line : INK })
      if (pr > 6) { // a moon, or a ring
        if (c.r() < 0.5) out += sketch(ring(x, y, pr * 2, pr * 0.6, 24, tilt), { w: 0.7, o: 0.6 })
        else out += `<circle cx="${f(x + pr * 2.1)}" cy="${f(y - pr * 0.8)}" r="1.8" fill="${INK}" fill-opacity="0.8"/>`
      }
    }
    for (let k = 0; k < 16; k++) { // the sun, as short rays
      const a = (k / 16) * 6.283
      out += sketch([[cx + Math.cos(a) * 13, cy + Math.sin(a) * 13], [cx + Math.cos(a) * (19 + (k % 2) * 6), cy + Math.sin(a) * (19 + (k % 2) * 6)]], { w: 1, o: 0.8, col: c.line })
    }
    out += sketch(ring(cx, cy, 9, 9, 16), { w: 1.2, o: 0.95, col: c.line })
    const comet: P[] = []
    const k0 = c.r() * 6.283
    for (let t = 0; t < 30; t++) { const a = k0 + t * 0.03; comet.push([cx + Math.cos(a) * (430 - t * 7), cy + Math.sin(a) * (430 - t * 7) * 0.6]) }
    out += sketch(comet, { w: 0.9, o: 0.5, col: c.line })
    for (let s = 0; s < 90; s++) out += `<circle cx="${f(c.r() * W)}" cy="${f(c.r() * H)}" r="${f(0.5 + c.r() * 0.8)}" fill="${INK}" fill-opacity="${f(0.15 + c.r() * 0.4)}"/>`
    return out
  },

  /** An optics diagram: rays from a point, through a lens, to a focus and beyond. */
  rays(c) {
    const sx = 520, sy = 300 + (c.r() - 0.5) * 120, lx = 800 + (c.r() - 0.5) * 60, fx = lx + 190 + c.r() * 60, fy = 300 + (300 - sy) * ((fx - lx) / (lx - sx))
    let out = ""
    const n = 23
    for (let i = 0; i < n; i++) {
      const y = 300 + (i - (n - 1) / 2) * 15
      const far: P = [fx + (fx - lx) * 1.9, fy + (fy - y) * 1.9]
      const hot = i === Math.floor(n / 2) || i === 3
      out += sketch([[sx, sy], [lx, y], [fx, fy], far], { w: hot ? 1.3 : 0.8, o: hot ? 0.85 : 0.3, col: hot ? c.line : INK })
    }
    const lens: P[] = []
    for (let t = -1; t <= 1.001; t += 0.05) lens.push([lx + 26 * (1 - t * t), 300 + t * 185])
    for (let t = 1; t >= -1.001; t -= 0.05) lens.push([lx - 26 * (1 - t * t), 300 + t * 185])
    out += `<path d="M${lens.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z" fill="${BG}" fill-opacity="0.55"/>` + sketch(lens, { w: 1.3, o: 0.9, close: true })
    out += sketch([[420, 300], [1180, 300]], { w: 0.6, o: 0.3 }) // the axis
    out += sketch(ring(sx, sy, 5, 5, 12), { w: 1.2, o: 0.95, col: c.line }) + sketch(ring(fx, fy, 4, 4, 12), { w: 1, o: 0.8 })
    for (let k = 0; k < 14; k++) { // a screen catching the spread
      const x = 1150, y = 80 + k * 34
      out += sketch([[x, y], [x + 14, y + 20]], { w: 0.7, o: 0.3 })
    }
    out += sketch([[1150, 60], [1150, 560]], { w: 1, o: 0.6 })
    return out
  },
}
export const MOTIF_NAMES = Object.keys(MOTIFS)

/** The date picks; the first tag that names a family narrows the choice. */
export function motifFor(iso: string, tags: string[] = []): string {
  const seed = hash(iso)
  for (const tag of tags) {
    const family = TAG_MOTIFS[String(tag).toLowerCase()]
    if (family) return family[seed % family.length]
  }
  return MOTIF_NAMES[seed % MOTIF_NAMES.length]
}

// ── the almanac: quiet facts about the day, in a few guises ──
function moon(x: number, y: number, R: number, fraction: number, col: string, o = 0.75): string {
  const k = Math.cos(fraction * 2 * Math.PI) // +1 new … -1 full
  const waxing = fraction < 0.5
  let hatch = ""
  for (let yy = -R + 1.5; yy < R; yy += Math.max(1.6, R / 6)) {
    const half = Math.sqrt(R * R - yy * yy), term = half * k
    const [a, b] = waxing ? [-half, term] : [-term, half]
    if (b - a > 0.8) hatch += `M${f(x + a)} ${f(y + yy)}L${f(x + b)} ${f(y + yy)}`
  }
  return `<path d="${hatch}" stroke="${col}" stroke-opacity="${o * 0.6}" stroke-width="0.8"/><circle cx="${x}" cy="${y}" r="${R}" fill="none" stroke="${col}" stroke-opacity="${o}" stroke-width="1"/>`
}

const CORNERS: ((a: Almanac, line: string) => string)[] = [
  // the moon, and the sun's arc: as wide as the day is long, as high as the noon sun
  (a, line) => {
    const ax = W - 200, ay = 118, aw = 300 * (a.lit / 1440), ah = Math.max(6, a.peak * 0.9)
    return `<path d="M${ax - 90} ${ay}h180" stroke="${INK}" stroke-opacity="0.4" stroke-width="1"/>` +
      `<path d="M${f(ax - aw / 2)} ${ay}Q${ax} ${f(ay - ah * 2)} ${f(ax + aw / 2)} ${ay}" fill="none" stroke="${line}" stroke-opacity="0.8" stroke-width="1.2" stroke-dasharray="2 4"/>` +
      `<circle cx="${ax}" cy="${f(ay - ah)}" r="4" fill="none" stroke="${line}" stroke-width="1.2"/>` + moon(W - 96, 82, 17, a.moon.fraction, INK)
  },
  // a 24-hour dial: midnight at the foot, the lit hours drawn heavier, the moon inside
  (a, line) => {
    const cx = W - 112, cy = 96, R = 36
    let ticks = ""
    for (let h = 0; h < 24; h++) { const t = (h / 24) * 6.283 + Math.PI / 2, r0 = h % 6 === 0 ? R - 7 : R - 3; ticks += `M${f(cx + Math.cos(t) * r0)} ${f(cy + Math.sin(t) * r0)}L${f(cx + Math.cos(t) * R)} ${f(cy + Math.sin(t) * R)}` }
    const ang = (d: Date | null) => (((d ? d.getUTCHours() * 60 + d.getUTCMinutes() : 0) / 1440) * 6.283 + Math.PI / 2)
    const a0 = ang(a.sunrise), a1 = ang(a.sunset), big = a.lit > 720 ? 1 : 0
    const arc = `M${f(cx + Math.cos(a0) * (R + 5))} ${f(cy + Math.sin(a0) * (R + 5))}A${R + 5} ${R + 5} 0 ${big} 1 ${f(cx + Math.cos(a1) * (R + 5))} ${f(cy + Math.sin(a1) * (R + 5))}`
    return `<path d="${ticks}" stroke="${INK}" stroke-opacity="0.5" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${INK}" stroke-opacity="0.3" stroke-width="1"/>` +
      `<path d="${arc}" fill="none" stroke="${line}" stroke-opacity="0.9" stroke-width="2" stroke-linecap="round"/>` + moon(cx, cy, 11, a.moon.fraction, INK)
  },
  // nine nights of the moon, tonight's in the middle
  (a, line) => {
    let out = ""
    for (let k = -4; k <= 4; k++) {
      const x = W - 182 + k * 25
      const fr = (((a.moon.fraction + k / 29.530588853) % 1) + 1) % 1
      out += moon(x, 86, k === 0 ? 10 : 7.5, fr, k === 0 ? line : INK, k === 0 ? 1 : 0.55)
    }
    return out + `<path d="M${W - 182} 104v8" stroke="${line}" stroke-width="1.5"/>`
  },
  // the wheel of the year: months as ticks, the four turns longer, today on the rim
  (a, line) => {
    const cx = W - 112, cy = 96, R = 36
    const at = (doy: number) => ((doy - 1) / 365) * 6.283 - Math.PI / 2
    let ticks = ""
    for (let m = 0; m < 12; m++) { const t = (m / 12) * 6.283 - Math.PI / 2; ticks += `M${f(cx + Math.cos(t) * (R - 4))} ${f(cy + Math.sin(t) * (R - 4))}L${f(cx + Math.cos(t) * R)} ${f(cy + Math.sin(t) * R)}` }
    let turns = ""
    for (const d of [79, 172, 266, 355]) { const t = at(d); turns += `M${f(cx + Math.cos(t) * (R - 11))} ${f(cy + Math.sin(t) * (R - 11))}L${f(cx + Math.cos(t) * (R + 4))} ${f(cy + Math.sin(t) * (R + 4))}` }
    const t = at(a.doy)
    return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="1"/><path d="${ticks}" stroke="${INK}" stroke-opacity="0.55" stroke-width="1"/>` +
      `<path d="${turns}" stroke="${INK}" stroke-opacity="0.7" stroke-width="1"/>` +
      `<path d="M${cx} ${cy}L${f(cx + Math.cos(t) * R)} ${f(cy + Math.sin(t) * R)}" stroke="${line}" stroke-opacity="0.6" stroke-width="1"/><circle cx="${f(cx + Math.cos(t) * R)}" cy="${f(cy + Math.sin(t) * R)}" r="3.5" fill="${line}"/>` + moon(cx, cy, 8, a.moon.fraction, INK)
  },
]

const FEET: ((a: Almanac, line: string) => string)[] = [
  // a ruler of the year: a tick a day, longer at each month, today marked
  (a, line) => {
    const x0 = 72, x1 = W - 72, y = H - 30
    let ticks = "", d = 0
    for (const len of [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]) for (let k = 0; k < len; k++, d++) ticks += `M${f(x0 + (x1 - x0) * d / 364)} ${y}v${k === 0 ? -9 : -4}`
    const tx = x0 + (x1 - x0) * (a.doy - 1) / 364
    return `<path d="${ticks}" stroke="${INK}" stroke-opacity="0.28" stroke-width="1"/><path d="M${f(tx)} ${y + 2}v-20" stroke="${line}" stroke-width="2"/><circle cx="${f(tx)}" cy="${y - 24}" r="3" fill="${line}"/>`
  },
  // the year's daylight as one long breath, today a bead on the curve
  (a, line) => {
    const x0 = 72, x1 = W - 72, base = H - 26
    const hours = (doy: number) => {
      const decl = 0.4093 * Math.sin((2 * Math.PI * (doy - 81)) / 365)
      return (24 / Math.PI) * Math.acos(Math.max(-1, Math.min(1, -Math.tan(51.48 * Math.PI / 180) * Math.tan(decl))))
    }
    const yAt = (doy: number) => base - (hours(doy) - 7) * 3.2
    let d = ""
    for (let k = 1; k <= 365; k += 3) d += `${k === 1 ? "M" : "L"}${f(x0 + (x1 - x0) * (k - 1) / 364)} ${f(yAt(k))}`
    const tx = x0 + (x1 - x0) * (a.doy - 1) / 364
    return `<path d="M${x0} ${base}H${x1}" stroke="${INK}" stroke-opacity="0.18" stroke-width="1"/><path d="${d}" fill="none" stroke="${INK}" stroke-opacity="0.4" stroke-width="1"/>` +
      `<path d="M${f(tx)} ${base}V${f(yAt(a.doy))}" stroke="${line}" stroke-opacity="0.7" stroke-width="1"/><circle cx="${f(tx)}" cy="${f(yAt(a.doy))}" r="3.5" fill="${line}"/>`
  },
]

export interface DailyArt { svg: string; caption: string; motif: string; line: string }

export interface DailyArtOptions {
  tags?: string[]
  /** Frontmatter `og-motif`: name the drawing outright. */
  motif?: string
  /** Frontmatter `og-almanac: classic`: the moon with the sun's arc, the year ruler, the plain fact line. */
  almanac?: string
  /** Where the card's text block starts (y). The drawing is quietened under it. Omit for the text-free plate. */
  textTop?: number
}

/** Soft textures that sit happily under type; every other drawing is cleared around the text. */
const BLEEDS = new Set(["field", "cartography", "attractor"])

export function dailyArt(iso: string, opts: DailyArtOptions = {}): DailyArt {
  const seed = hash(iso)
  const r = rng(seed)
  const a = almanac(iso)
  const pal = SEASON[a.season]
  const motif = opts.motif && MOTIFS[opts.motif] ? opts.motif : motifFor(iso, opts.tags)
  const c: Ctx = { r, ox: r() * 500, oy: r() * 500, line: pal.line }
  const wash = [0, 1, 2].map((i) => {
    const x = 300 + r() * 800, y = 80 + r() * 420, rx = 240 + r() * 260, ry = 150 + r() * 160
    return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${pal.wash[i % 2]}" fill-opacity="${i === 0 ? 0.3 : 0.2}" transform="rotate(${f(r() * 60 - 30)} ${f(x)} ${f(y)})"/>`
  }).join("")
  const drawing = MOTIFS[motif](c)
  // Variants come from their own stream so a motif's appetite for random numbers never shifts them.
  const v = rng(seed ^ 0x9e3779b9)
  const classic = opts.almanac === "classic"
  const pick = (n: number) => (classic ? 0 : Math.floor(v() * n))
  const corner = CORNERS[pick(CORNERS.length)](a, pal.line)
  const foot = FEET[pick(FEET.length)](a, pal.line)
  const caption = almanacLines(a)[pick(3)]
  const card = opts.textTop !== undefined
  // Figure and ground: under the title, the masthead and the almanac the drawing drops to a murmur.
  const clear = card && !BLEEDS.has(motif)
  const top = opts.textTop ?? 0
  // On the plate there is no title to make room for, so the drawing moves to the middle.
  const shift = card || motif === "field" || motif === "cartography" ? 0 : motif === "attractor" ? -160 : -220
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<filter id="wash" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="${seed % 997}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="140"/><feGaussianBlur stdDeviation="38"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed % 89}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/></filter>
<filter id="feather" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="34"/></filter>
<linearGradient id="scrim" x1="0" y1="1" x2="0.75" y2="0.1"><stop offset="0" stop-color="${BG}" stop-opacity="0.96"/><stop offset="0.45" stop-color="${BG}" stop-opacity="0.72"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></linearGradient>
<mask id="clear" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><g filter="url(#feather)" fill="#000">
<rect x="-80" y="${top - 26}" width="${72 + 760 + 110}" height="${H - top + 90}" fill-opacity="0.68"/>
<rect x="-40" y="-10" width="560" height="86" fill-opacity="0.65"/>
<circle cx="${W - 150}" cy="92" r="92" fill-opacity="0.6"/>
<rect x="0" y="${H - 58}" width="${W}" height="80" fill-opacity="0.5"/>
</g></mask>
</defs>
<rect width="${W}" height="${H}" fill="${BG}"/>
<g filter="url(#wash)">${wash}</g>
<g${clear ? ' mask="url(#clear)"' : ""}${shift ? ` transform="translate(${shift} 0)"` : ""}>${drawing}</g>
${card ? `<rect width="${W}" height="${H}" fill="url(#scrim)"/>` : ""}
<rect width="${W}" height="${H}" filter="url(#grain)"/>
${corner}
${foot}
</svg>`
  return { svg, caption, motif, line: pal.line }
}

// ── the card ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any
const el = (type: string, style: Record<string, unknown>, children?: Node): Node => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } })

export interface DailyCardInput {
  /** `YYYY-MM-DD`. */
  iso: string
  title: string
  description: string
  tags?: string[]
  /** Frontmatter `og-motif` / `og-almanac`. */
  motif?: string
  almanac?: string
}

export async function renderDailyCard(card: DailyCardInput, fonts: OgFontData): Promise<{ buffer: Buffer; ext: "jpg" }> {
  const day = new Date(`${card.iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  const title = dailyHeadline(card.title)
  const size = title.length > 44 ? 52 : title.length > 28 ? 62 : 74
  const desc = card.description.length > 150 ? `${card.description.slice(0, 148).replace(/\s+\S*$/, "")}…` : card.description
  // Roughly where the text block begins, so the drawing can be quietened beneath it.
  const lines = (text: string, px: number) => Math.max(1, Math.ceil((text.length * px * 0.46) / 760))
  const textTop = H - 64 - (26 + 10 + lines(title, size) * size * 1.04 + (desc ? 18 + lines(desc, 27) * 37 : 0) + 22 + 20)
  const art = dailyArt(card.iso, { tags: card.tags, motif: card.motif, almanac: card.almanac, textTop })
  const ground = new Resvg(art.svg).render().asPng()
  const tree = el("div", { display: "flex", position: "relative", width: W, height: H, backgroundColor: BG, fontFamily: OG_FONT_FAMILY }, [
    { type: "img", props: { src: `data:image/png;base64,${ground.toString("base64")}`, width: W, height: H, style: { position: "absolute", left: 0, top: 0 } } },
    el("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", width: W, height: H, padding: "52px 72px 64px 72px" }, [
      el("div", { display: "flex", alignItems: "center", gap: 14 }, [
        el("div", { width: 9, height: 9, backgroundColor: art.line }),
        el("div", { fontSize: 18, letterSpacing: 5, textTransform: "uppercase", color: art.line }, "Sub-Surface Territories  ·  Logbook"),
      ]),
      el("div", { display: "flex", flexDirection: "column", width: 760 }, [
        el("div", { fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: DIM }, day),
        el("div", { marginTop: 10, fontSize: size, fontWeight: 600, color: INK, lineHeight: 1.04, letterSpacing: -0.5 }, title),
        ...(desc ? [el("div", { marginTop: 18, fontSize: 27, lineHeight: 1.36, color: DIM }, desc)] : []),
        el("div", { marginTop: 22, fontSize: 17, letterSpacing: 2.5, textTransform: "uppercase", color: FAINT }, art.caption),
      ]),
    ]),
  ])
  const svg = await satori(tree, {
    width: W, height: H,
    fonts: [
      { name: OG_FONT_FAMILY, data: fonts.regular, weight: 400, style: "normal" },
      { name: OG_FONT_FAMILY, data: fonts.semibold, weight: 600, style: "normal" },
    ],
  })
  const r = new Resvg(svg).render()
  return { buffer: jpeg.encode({ data: Buffer.from(r.pixels), width: r.width, height: r.height }, 88).data, ext: "jpg" }
}

/** The drawing alone (no title, no scrim): the plate shown on the note itself and in the logbook. */
export function renderDailyPlate(card: Pick<DailyCardInput, "iso" | "tags" | "motif" | "almanac">): Buffer {
  const art = dailyArt(card.iso, { tags: card.tags, motif: card.motif, almanac: card.almanac })
  const r = new Resvg(art.svg).render()
  return jpeg.encode({ data: Buffer.from(r.pixels), width: r.width, height: r.height }, 86).data
}

// ── preview: one card per motif ──
async function preview(outArg: string) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", outArg)
  fs.mkdirSync(out, { recursive: true })
  const fonts = await loadOgFonts()
  let i = 0
  for (const motif of MOTIF_NAMES) {
    // spread the previews across the year so every season and almanac guise shows up
    const iso = new Date(Date.UTC(2026, 0, 9) + i++ * 26 * 864e5).toISOString().slice(0, 10)
    const { buffer } = await renderDailyCard({ iso, title: motif, description: `A preview of the ${motif} motif, as drawn for ${iso}.`, motif }, fonts)
    fs.writeFileSync(path.join(out, `${motif}.jpg`), buffer)
    fs.writeFileSync(path.join(out, `${motif}-plate.jpg`), renderDailyPlate({ iso, motif }))
    console.log(`  ${motif}  ${iso}  ${(buffer.length / 1024).toFixed(0)} KB`)
  }
}
if (process.argv[1] && /^og-daily\.[cm]?[jt]s$/.test(path.basename(process.argv[1]))) {
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? process.argv[process.argv.indexOf("--out") + 1]
  if (!outArg || outArg.startsWith("--")) { console.error("usage: tsx scripts/og-daily.ts --out <dir>"); process.exit(1) }
  preview(outArg).catch((err) => { console.error(err); process.exit(1) })
}
