import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { perState } from "./scratch"

// ── Attractor background (was "Lorenz") ──
// Strange attractors that never settle: the ribbon traces one system, and
// after a while the next one begins while the old ribbon unravels from its
// tail. Six systems cycle (Lorenz, Aizawa, Thomas, Halvorsen, Dadras,
// Rössler), so the scene never repeats.
//
// Three ribbons start a hair apart (1e-4): for a few seconds they are one
// line, then sensitive dependence pulls them into three. That's chaos, shown
// rather than told. The camera turns and tips slowly and the framing follows
// the ribbon's own bounds, so each system fills the screen at its own scale.

type V3 = [number, number, number]

interface System {
  name: string
  dt: number
  start: V3
  f: (x: number, y: number, z: number, out: V3) => void
}

export const SYSTEMS: System[] = [
  { name: "Lorenz", dt: 0.005, start: [0.1, 0, 0], f: (x, y, z, o) => { o[0] = 10 * (y - x); o[1] = x * (28 - z) - y; o[2] = x * y - (8 / 3) * z } },
  { name: "Aizawa", dt: 0.01, start: [0.1, 0, 0], f: (x, y, z, o) => {
    o[0] = (z - 0.7) * x - 3.5 * y; o[1] = 3.5 * x + (z - 0.7) * y
    o[2] = 0.6 + 0.95 * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x
  } },
  { name: "Thomas", dt: 0.06, start: [1.1, 1.1, -0.1], f: (x, y, z, o) => { const b = 0.208186; o[0] = Math.sin(y) - b * x; o[1] = Math.sin(z) - b * y; o[2] = Math.sin(x) - b * z } },
  { name: "Halvorsen", dt: 0.004, start: [-1.48, -1.51, 2.04], f: (x, y, z, o) => { const a = 1.89; o[0] = -a * x - 4 * y - 4 * z - y * y; o[1] = -a * y - 4 * z - 4 * x - z * z; o[2] = -a * z - 4 * x - 4 * y - x * x } },
  { name: "Dadras", dt: 0.005, start: [1.1, 2.1, -2], f: (x, y, z, o) => { o[0] = y - 3 * x + 2.7 * y * z; o[1] = 1.7 * y - x * z + z; o[2] = 2 * x * y - 9 * z } },
  { name: "Rössler", dt: 0.02, start: [1, 1, 0], f: (x, y, z, o) => { o[0] = -y - z; o[1] = x + 0.2 * y; o[2] = 0.2 + z * (x - 5.7) } },
]

const RIBBONS = 3
const CAP = 3200

interface Ribbon {
  p: V3
  buf: Float32Array // ring of x, y, z
  head: number
  count: number
}

interface Run {
  sys: number
  ribbons: Ribbon[]
  /** Unravelling from its tail while the next system grows. */
  dying: boolean
  // Its own framing (systems differ in size by 10x), eased toward its bounds
  cx: number; cy: number; cz: number; span: number
}

interface Scene {
  runs: Run[]
  started: number
  next: number
  theta: number
  phi: number
  last: number
}

const k1: V3 = [0, 0, 0], k2: V3 = [0, 0, 0], k3: V3 = [0, 0, 0], k4: V3 = [0, 0, 0]

function rk4(sys: System, p: V3, h: number) {
  const [x, y, z] = p
  sys.f(x, y, z, k1)
  sys.f(x + (h / 2) * k1[0], y + (h / 2) * k1[1], z + (h / 2) * k1[2], k2)
  sys.f(x + (h / 2) * k2[0], y + (h / 2) * k2[1], z + (h / 2) * k2[2], k3)
  sys.f(x + h * k3[0], y + h * k3[1], z + h * k3[2], k4)
  p[0] = x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
  p[1] = y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
  p[2] = z + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
}

function newRun(sys: number, prefill = 0): Run {
  const s = SYSTEMS[sys]
  const ribbons = Array.from({ length: RIBBONS }, (_, i): Ribbon => ({
    p: [s.start[0] + i * 1e-4, s.start[1], s.start[2]],
    buf: new Float32Array(CAP * 3),
    head: 0,
    count: 0,
  }))
  // Skip the transient (Aizawa's is long) so the ribbon starts on the
  // attractor itself; the first run of a visit arrives already drawn.
  for (const r of ribbons) {
    for (let k = 0; k < 3000; k++) rk4(s, r.p, s.dt)
    for (let k = 0; k < prefill; k++) {
      rk4(s, r.p, s.dt)
      r.buf[r.head * 3] = r.p[0]; r.buf[r.head * 3 + 1] = r.p[1]; r.buf[r.head * 3 + 2] = r.p[2]
      r.head = (r.head + 1) % CAP
      r.count++
    }
  }
  return { sys, ribbons, dying: false, cx: 0, cy: 0, cz: 0, span: 0 }
}

const scene = perState<Scene>(() => {
  const now = performance.now() / 1000
  const first = Math.floor(Math.random() * SYSTEMS.length)
  return { runs: [newRun(first, 1400)], started: now, next: now, theta: Math.random() * 6, phi: 0.5, last: now }
})

export function drawAttractor(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.attractor
  if (!p) return
  const s = scene(state)
  const now = performance.now() / 1000
  const dt = Math.min(0.1, now - s.last)
  s.last = now
  const trail = Math.min(CAP, Math.round(p.trail ?? 1600))
  const op = (p.opacity ?? 0.4) * state.readerAlpha
  const pal = state.colorCache.palette

  // Next system: the live run starts dying, a fresh one begins.
  const live = s.runs[s.runs.length - 1]
  if (now - s.started > (p.morph ?? 45)) {
    live.dying = true
    s.runs.push(newRun((live.sys + 1 + Math.floor(Math.random() * (SYSTEMS.length - 1))) % SYSTEMS.length))
    s.started = now
  }

  // Integrate: a few steps per frame, scaled by speed and frame time.
  const steps = Math.max(1, Math.round((p.speed ?? 1) * 4 * (dt * 60)))
  for (const run of s.runs) {
    const sys = SYSTEMS[run.sys]
    for (const r of run.ribbons) {
      if (run.dying) {
        r.count = Math.max(0, r.count - steps * 3)
        continue
      }
      for (let k = 0; k < steps; k++) {
        rk4(sys, r.p, sys.dt)
        if (!Number.isFinite(r.p[0]) || Math.abs(r.p[0]) > 1e4) r.p = [...sys.start] as V3
        const i = r.head * 3
        r.buf[i] = r.p[0]; r.buf[i + 1] = r.p[1]; r.buf[i + 2] = r.p[2]
        r.head = (r.head + 1) % CAP
        r.count = Math.min(trail, r.count + 1)
      }
    }
  }
  s.runs = s.runs.filter((run) => !run.dying || run.ribbons.some((r) => r.count > 0))

  // Camera: a slow turn, a gentle tip back and forth.
  s.theta += dt * 0.12 * (p.rotSpeed ?? 0.6)
  s.phi = 0.45 + Math.sin(now * 0.05) * 0.35
  const ct = Math.cos(s.theta), st = Math.sin(s.theta), cp = Math.cos(s.phi), sp = Math.sin(s.phi)

  // Each run frames itself on its own bounds (eased, so it settles in).
  for (const run of s.runs) {
    if (run.dying) continue
    const lead = run.ribbons[0]
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let n = 0; n < lead.count; n += 7) {
      const i = ((lead.head - 1 - n + CAP) % CAP) * 3
      const x = lead.buf[i], y = lead.buf[i + 1], z = lead.buf[i + 2]
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
    if (lead.count > 10) {
      const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
      const e = run.span ? 1 - Math.pow(0.97, dt * 60) : 1
      run.cx += ((minX + maxX) / 2 - run.cx) * e
      run.cy += ((minY + maxY) / 2 - run.cy) * e
      run.cz += ((minZ + maxZ) / 2 - run.cz) * e
      run.span += (span - run.span) * e
    }
  }
  const ox = state.w / 2, oy = state.h / 2

  ctx.lineWidth = 0.9
  ctx.lineJoin = "round"
  const SEG = 10
  for (const run of s.runs) {
    const scale = (Math.min(state.w, state.h) * 0.62) / (run.span || 1)
    run.ribbons.forEach((r, ri) => {
      if (r.count < 2) return
      ctx.strokeStyle = pal[ri % pal.length] || state.colorCache.secondary
      // Old → new in SEG bands, each brighter than the last.
      const per = Math.ceil(r.count / SEG)
      for (let b = 0; b < SEG; b++) {
        const from = b * per, to = Math.min(r.count - 1, from + per)
        if (from >= to) break
        ctx.globalAlpha = op * (0.06 + 0.5 * ((b + 1) / SEG) ** 2) * (run.dying ? 0.6 : 1)
        ctx.beginPath()
        for (let n = from; n <= to; n++) {
          const i = ((r.head - r.count + n + CAP * 2) % CAP) * 3
          const x = r.buf[i] - run.cx, y = r.buf[i + 1] - run.cy, z = r.buf[i + 2] - run.cz
          // Turn about the vertical (z) axis, then tip about x.
          const x1 = x * ct - y * st, y1 = x * st + y * ct
          const sx = ox + x1 * scale
          const sy = oy - (z * cp - y1 * sp) * scale
          if (n === from) ctx.moveTo(sx, sy)
          else ctx.lineTo(sx, sy)
        }
        ctx.stroke()
      }
    })
  }
  ctx.globalAlpha = 1
}
