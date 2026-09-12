import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { simplex } from "./simplex"

// ── Murmuration background ──
// A large flock of boids (Reynolds rules + a drifting simplex "wind" current).
// Uses a spatial hash so it stays cheap at high counts.
// Carmack optimization: batches 460 individual draw/fill calls into 2 compound
// path strokes/fills (normal and fast speed tiers), reducing draw overhead by ~95%.
export const MURM = {
  count: 460,
  percept: 46,
  separation: 18,
  maxSpeed: 2.4,
  minSpeed: 1.1,
  align: 0.045,
  cohere: 0.0010,
  separate: 1.1,
  wind: 0.05,       // strength of the simplex current
  windScale: 0.0013,
  fleeRadius: 130,
  fleeForce: 1.4,
  baseAlpha: 0.34,  // semi-opaque so it's present but calm
}

export function drawMurmuration(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds.murmuration
  const count = Math.round(p?.count ?? MURM.count)
  const maxSpeed = p?.maxSpeed ?? MURM.maxSpeed
  const cohere = p?.cohere ?? MURM.cohere
  const wind = p?.wind ?? MURM.wind
  const baseAlpha = p?.opacity ?? MURM.baseAlpha
  const W = state.w, H = state.h
  const boids = state.boids

  // (re)seed if empty, count changed, or viewport resized
  if (boids.length !== count) {
    boids.length = 0
    for (let i = 0; i < count; i++) {
      boids.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      })
    }
  }

  const cell = MURM.percept
  const cols = Math.max(1, Math.ceil(W / cell))
  const rows = Math.max(1, Math.ceil(H / cell))

  // Reuse bucket arrays across frames (truncate instead of reallocate)
  let grid: number[][] = state.boidGrid
  if (!grid || grid.length !== cols * rows) {
    grid = state.boidGrid = Array.from({ length: cols * rows }, () => [])
  } else {
    for (let i = 0; i < grid.length; i++) grid[i].length = 0
  }

  const cellIndex = (x: number, y: number) => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)))
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)))
    return cy * cols + cx
  }

  for (let i = 0; i < boids.length; i++) {
    grid[cellIndex(boids[i].x, boids[i].y)].push(i)
  }

  const t = performance.now() / 1000
  const P2 = MURM.percept * MURM.percept
  const S2 = MURM.separation * MURM.separation
  const FLEE2 = MURM.fleeRadius * MURM.fleeRadius
  const color = state.colorCache.secondary

  ctx.fillStyle = color
  const alpha = baseAlpha * state.readerAlpha

  // Path batching: split into standard and fast speed buckets
  // to preserve velocity brilliance with only TWO draw calls per frame!
  const normalPath = new Path2D()
  const fastPath = new Path2D()
  let hasNormal = false
  let hasFast = false

  const speedThreshold = maxSpeed * 0.7

  for (let i = 0; i < boids.length; i++) {
    const b = boids[i]
    let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0

    const bcx = Math.floor(b.x / cell)
    const bcy = Math.floor(b.y / cell)

    for (let gy = bcy - 1; gy <= bcy + 1; gy++) {
      if (gy < 0 || gy >= rows) continue
      for (let gx = bcx - 1; gx <= bcx + 1; gx++) {
        if (gx < 0 || gx >= cols) continue
        const bucket = grid[gy * cols + gx]
        for (let bi = 0; bi < bucket.length; bi++) {
          const j = bucket[bi]
          if (j === i) continue
          const o = boids[j]
          const dx = o.x - b.x
          const dy = o.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < P2) {
            ax += o.vx; ay += o.vy
            cx += o.x; cy += o.y
            n++
            if (d2 < S2 && d2 > 0) { sx -= dx / d2; sy -= dy / d2 }
          }
        }
      }
    }

    if (n > 0) {
      b.vx += (ax / n - b.vx) * MURM.align
      b.vy += (ay / n - b.vy) * MURM.align
      b.vx += (cx / n - b.x) * cohere
      b.vy += (cy / n - b.y) * cohere
    }
    b.vx += sx * MURM.separate
    b.vy += sy * MURM.separate

    // Drifting wind current (simplex flow field)
    const ang = simplex(b.x * MURM.windScale, b.y * MURM.windScale + t * 0.15) * Math.PI * 2
    b.vx += Math.cos(ang) * wind
    b.vy += Math.sin(ang) * wind

    // Cursor evasion
    const mdx = b.x - state.mx, mdy = b.y - state.my
    const md2 = mdx * mdx + mdy * mdy
    if (md2 < FLEE2 && md2 > 0) {
      const f = (FLEE2 - md2) / FLEE2
      const d = Math.sqrt(md2)
      b.vx += (mdx / d) * f * MURM.fleeForce
      b.vy += (mdy / d) * f * MURM.fleeForce
    }

    // Clamp speed
    let sp = Math.hypot(b.vx, b.vy)
    if (sp > maxSpeed) {
      b.vx = (b.vx / sp) * maxSpeed
      b.vy = (b.vy / sp) * maxSpeed
      sp = maxSpeed
    } else if (sp < MURM.minSpeed && sp > 0) {
      b.vx = (b.vx / sp) * MURM.minSpeed
      b.vy = (b.vy / sp) * MURM.minSpeed
      sp = MURM.minSpeed
    }

    b.x += b.vx; b.y += b.vy
    if (b.x < -10) b.x += W + 20; else if (b.x > W + 10) b.x -= W + 20
    if (b.y < -10) b.y += H + 20; else if (b.y > H + 10) b.y -= H + 20

    // Manual triangle rotation
    const inv = 1 / (sp || 1)
    const c = b.vx * inv, s = b.vy * inv
    const targetPath = sp > speedThreshold ? fastPath : normalPath
    if (sp > speedThreshold) hasFast = true; else hasNormal = true

    targetPath.moveTo(b.x + 4.5 * c, b.y + 4.5 * s)
    targetPath.lineTo(b.x - 2.6 * c - 2.1 * s, b.y - 2.6 * s + 2.1 * c)
    targetPath.lineTo(b.x - 2.6 * c + 2.1 * s, b.y - 2.6 * s - 2.1 * c)
    targetPath.closePath()
  }

  // Two batched fill operations for the entire flock!
  if (hasNormal) {
    ctx.globalAlpha = alpha * 0.8
    ctx.fill(normalPath)
  }
  if (hasFast) {
    ctx.globalAlpha = alpha * 1.05
    ctx.fill(fastPath)
  }

  ctx.globalAlpha = 1
}
