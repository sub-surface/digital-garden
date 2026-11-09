import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { perState } from "./scratch"

// ── Lightning background ──
// Strikes that shoot across the sky and fork. Each one plays the real
// sequence, compressed: a stepped leader feels its way out in jerks (dim),
// the return stroke lights the whole channel at once, a restrike or two
// flickers it, and it fades to an afterimage. Now and then a strike finds the
// cursor.
//
// A channel is built once, by midpoint displacement (each segment split and
// its midpoint pushed sideways, by less at each level: the fractal jag of a
// real channel), with branches peeling off and splitting again. Every point
// carries its distance along the leader, so the reveal is one comparison.

interface Channel {
  xs: Float32Array
  ys: Float32Array
  /** 0..1: how far along the leader this point is reached. */
  ts: Float32Array
  /** 0 main channel, 1 branch, 2 twig. */
  rank: number
}

interface Bolt {
  born: number
  channels: Channel[]
  restrikes: number[]
  life: number
}

interface Scene {
  bolts: Bolt[]
  next: number
  flash: number
}

const LEADER = 0.2 // seconds for the leader to cross
const scene = perState<Scene>(() => ({ bolts: [], next: performance.now() / 1000 + 0.6, flash: 0 }))

function displace(x0: number, y0: number, x1: number, y1: number, depth: number, rough: number, out: number[]) {
  // Iterative midpoint displacement into a flat [x, y, x, y, …] list.
  let pts = [x0, y0, x1, y1]
  let amp = Math.hypot(x1 - x0, y1 - y0) * rough
  for (let d = 0; d < depth; d++) {
    const next: number[] = [pts[0], pts[1]]
    for (let i = 0; i < pts.length - 2; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3]
      const dx = bx - ax, dy = by - ay
      const len = Math.hypot(dx, dy) || 1
      const off = (Math.random() - 0.5) * amp
      next.push((ax + bx) / 2 - (dy / len) * off, (ay + by) / 2 + (dx / len) * off, bx, by)
    }
    pts = next
    // Decaying slowly keeps the fine zigzag (a real channel is jagged at
    // every scale; a fast decay leaves a smooth wave)
    amp *= 0.64
  }
  for (const v of pts) out.push(v)
}

function channel(flat: number[], t0: number, t1: number, rank: number): Channel {
  const n = flat.length / 2
  const xs = new Float32Array(n), ys = new Float32Array(n), ts = new Float32Array(n)
  let total = 0
  const acc = new Float32Array(n)
  for (let i = 1; i < n; i++) {
    total += Math.hypot(flat[i * 2] - flat[i * 2 - 2], flat[i * 2 + 1] - flat[i * 2 - 1])
    acc[i] = total
  }
  for (let i = 0; i < n; i++) {
    xs[i] = flat[i * 2]
    ys[i] = flat[i * 2 + 1]
    ts[i] = t0 + (t1 - t0) * (total ? acc[i] / total : 0)
  }
  return { xs, ys, ts, rank }
}

function grow(out: Channel[], x0: number, y0: number, x1: number, y1: number, t0: number, t1: number, rank: number, branching: number) {
  const flat: number[] = []
  displace(x0, y0, x1, y1, rank === 0 ? 8 : 6, rank === 0 ? 0.17 : 0.24, flat)
  const ch = channel(flat, t0, t1, rank)
  out.push(ch)
  if (rank >= 2) return
  const n = ch.xs.length
  const forks = Math.round((rank === 0 ? 7 : 3) * branching * (0.5 + Math.random()))
  for (let f = 0; f < forks; f++) {
    const i = Math.floor((0.1 + Math.random() * 0.75) * (n - 2))
    const dx = ch.xs[i + 1] - ch.xs[i], dy = ch.ys[i + 1] - ch.ys[i]
    const ang = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.6)
    const remaining = Math.hypot(x1 - ch.xs[i], y1 - ch.ys[i])
    const len = remaining * (0.18 + Math.random() * 0.32)
    const tStart = ch.ts[i]
    grow(out, ch.xs[i], ch.ys[i], ch.xs[i] + Math.cos(ang) * len, ch.ys[i] + Math.sin(ang) * len,
      tStart, tStart + (t1 - t0) * 0.45, rank + 1, branching)
  }
}

function strike(state: BgState, branching: number, now: number): Bolt {
  const W = state.w, H = state.h
  const r = Math.random()
  let x0: number, y0: number, x1: number, y1: number
  if (r < 0.5) {
    // From the top, down and across
    x0 = Math.random() * W; y0 = -10
    x1 = x0 + (Math.random() - 0.5) * W * 0.8; y1 = H * (0.55 + Math.random() * 0.5)
  } else {
    // Side to side, across the sky
    const left = Math.random() < 0.5
    x0 = left ? -10 : W + 10; y0 = Math.random() * H * 0.6
    x1 = left ? W * (0.55 + Math.random() * 0.5) : W * (0.45 - Math.random() * 0.5); y1 = y0 + (Math.random() - 0.3) * H * 0.5
  }
  if (state.mx > -9000 && Math.random() < 0.25) { x1 = state.mx; y1 = state.my }
  const channels: Channel[] = []
  grow(channels, x0, y0, x1, y1, 0, 1, 0, branching)
  const restrikes = Math.random() < 0.7 ? [0.32 + Math.random() * 0.15] : []
  if (Math.random() < 0.35) restrikes.push(0.55 + Math.random() * 0.2)
  return { born: now, channels, restrikes, life: 2.6 }
}

/** Brightness of the return stroke over time (s since the leader landed). */
function brightness(t: number, restrikes: number[]): number {
  let b = Math.exp(-t / 0.09)
  for (const r of restrikes) {
    const d = t - (r - LEADER)
    if (d > 0) b = Math.max(b, 0.75 * Math.exp(-d / 0.07))
  }
  // A long faint afterimage under the flash
  return Math.max(b, 0.12 * Math.exp(-t / 1.1))
}

export function drawLightning(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.lightning
  if (!p) return
  const s = scene(state)
  const now = performance.now() / 1000
  const op = (p.opacity ?? 0.6) * state.readerAlpha
  const glow = p.glow ?? 1
  const ink = state.colorCache.text
  const accent = state.colorCache.secondary

  if (now >= s.next && s.bolts.length < 3) {
    s.bolts.push(strike(state, p.branching ?? 0.5, now))
    // Poisson arrivals at the configured rate, with the odd quick double.
    const mean = 60 / Math.max(0.5, p.frequency ?? 9)
    s.next = now + (Math.random() < 0.15 ? 0.25 + Math.random() * 0.4 : -Math.log(1 - Math.random()) * mean)
  }

  // The faint whole-sky flash of a close strike
  if (s.flash > 0.002) {
    ctx.fillStyle = accent
    ctx.globalAlpha = s.flash * op
    ctx.fillRect(0, 0, state.w, state.h)
    s.flash *= 0.8
  }

  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  let w = 0
  for (const b of s.bolts) {
    const age = now - b.born
    if (age > b.life) continue
    s.bolts[w++] = b
    const leading = age < LEADER
    // Stepped: the leader advances in jerks, not smoothly
    const reach = leading ? Math.floor((age / LEADER) * 14) / 14 : 1
    const bright = leading ? 0.22 : brightness(age - LEADER, b.restrikes)
    if (!leading && age - LEADER < 0.02) s.flash = Math.max(s.flash, 0.035)

    for (const ch of b.channels) {
      if (ch.ts[0] > reach) continue
      const path = new Path2D()
      path.moveTo(ch.xs[0], ch.ys[0])
      for (let i = 1; i < ch.xs.length && ch.ts[i] <= reach; i++) path.lineTo(ch.xs[i], ch.ys[i])
      const rankFade = ch.rank === 0 ? 1 : ch.rank === 1 ? 0.55 : 0.3
      if (glow > 0) {
        ctx.strokeStyle = accent
        ctx.globalAlpha = 0.16 * bright * rankFade * op
        ctx.lineWidth = (ch.rank === 0 ? 5 : 3) * glow
        ctx.stroke(path)
      }
      ctx.strokeStyle = ink
      ctx.globalAlpha = Math.min(1, bright * rankFade * 0.9) * op
      ctx.lineWidth = ch.rank === 0 ? 1.3 : ch.rank === 1 ? 0.8 : 0.5
      ctx.stroke(path)
    }
  }
  s.bolts.length = w
  ctx.globalAlpha = 1
}
