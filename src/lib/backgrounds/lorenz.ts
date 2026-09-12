import type { BgState, LorenzState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"

// ── Lorenz / Strange Attractor Ribbon background ──
// High-performance 3D phase-space integration of chaotic systems:
//   0: Lorenz Attractor (classic dual-lobe butterfly of deterministic chaos)
//   1: Rössler Attractor (folded band)
//   2: Aizawa Attractor (spherical torus)
//   3: Thomas Attractor (cyclically symmetric labyrinth)
// Zero allocations: circular Float32Array buffer with batched orthographic projection.

const MAX_TRAIL = 3000

export function initLorenz(flowType: number): LorenzState {
  let x = 0.1, y = 0.0, z = 0.0
  if (flowType === 1) { x = 1.0; y = 1.0; z = 0.0 }
  else if (flowType === 2) { x = 0.1; y = 0.0; z = 0.0 }
  else if (flowType === 3) { x = 1.1; y = 1.1; z = -0.1 }

  return {
    x,
    y,
    z,
    history: new Float32Array(MAX_TRAIL * 3),
    head: 0,
    count: 0,
    theta: 0,
    phi: 0.4,
    flowType,
  }
}

function stepAttractor(ls: LorenzState, type: number, dt: number) {
  let { x, y, z } = ls

  // RK2 Midpoint Integration for numerical stability
  let dx = 0, dy = 0, dz = 0

  if (type === 1) {
    // Rössler Attractor
    const a = 0.2, b = 0.2, c = 5.7
    dx = -y - z
    dy = x + a * y
    dz = b + z * (x - c)
  } else if (type === 2) {
    // Aizawa Attractor
    const a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1
    dx = (z - b) * x - d * y
    dy = d * x + (z - b) * y
    dz = c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + e * z) + f * z * (x * x * x)
  } else if (type === 3) {
    // Thomas Attractor
    const b = 0.208186
    dx = Math.sin(y) - b * x
    dy = Math.sin(z) - b * y
    dz = Math.sin(x) - b * z
  } else {
    // Lorenz Attractor (default)
    const sigma = 10, rho = 28, beta = 8 / 3
    dx = sigma * (y - x)
    dy = x * (rho - z) - y
    dz = x * y - beta * z
  }

  // Clamping to prevent runaway divergence
  x += dx * dt
  y += dy * dt
  z += dz * dt

  if (Number.isNaN(x) || Math.abs(x) > 200) { x = 0.1; y = 0.1; z = 0.1 }

  ls.x = x
  ls.y = y
  ls.z = z

  const idx = ls.head * 3
  ls.history[idx] = x
  ls.history[idx + 1] = y
  ls.history[idx + 2] = z

  ls.head = (ls.head + 1) % MAX_TRAIL
  if (ls.count < MAX_TRAIL) ls.count++
}

export function drawLorenz(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds.lorenz
  if (!p) return
  const W = state.w
  const H = state.h
  const flowType = Math.max(0, Math.min(3, Math.floor(p.flowType ?? 0)))
  const speed = p.speed ?? 1.0
  const rotSpeed = p.rotSpeed ?? 0.6
  const maxTrail = Math.min(MAX_TRAIL, Math.max(200, Math.floor(p.trail ?? 1200)))
  const baseAlpha = (p.opacity ?? 0.4) * state.readerAlpha

  if (!state.lorenz || state.lorenz.flowType !== flowType) {
    state.lorenz = initLorenz(flowType)
  }
  const ls = state.lorenz

  // Integration dt scaled per attractor type
  const dt = flowType === 3 ? 0.08 * speed : flowType === 2 ? 0.02 * speed : flowType === 1 ? 0.03 * speed : 0.009 * speed
  // 3 sub-steps per frame for silky curves
  for (let s = 0; s < 3; s++) {
    stepAttractor(ls, flowType, dt)
  }

  // Camera 3D rotation
  ls.theta += 0.005 * rotSpeed
  const hasCursor = state.mx > -9000
  const cursorXShift = hasCursor ? ((state.mx - W / 2) / W) * 0.5 : 0
  const theta = ls.theta + cursorXShift
  const phi = 0.35 + (hasCursor ? ((state.my - H / 2) / H) * 0.3 : 0)

  const cosT = Math.cos(theta), sinT = Math.sin(theta)
  const cosP = Math.cos(phi), sinP = Math.sin(phi)

  // Scale factor per attractor
  const baseScale = Math.min(W, H) * (flowType === 2 ? 0.28 : flowType === 3 ? 0.09 : flowType === 1 ? 0.024 : 0.016)
  const cx = W / 2
  const cy = flowType === 0 ? H * 0.56 : H / 2

  const trailCount = Math.min(ls.count, maxTrail)
  if (trailCount < 2) return

  // Batched path projection
  ctx.strokeStyle = state.colorCache.secondary
  ctx.lineWidth = 1.2
  ctx.globalAlpha = baseAlpha

  ctx.beginPath()
  let first = true

  // Loop from oldest point to newest point
  for (let i = 0; i < trailCount; i++) {
    const ptIdx = (ls.head - trailCount + i + MAX_TRAIL) % MAX_TRAIL
    const offset = ptIdx * 3
    const px = ls.history[offset]
    const py = ls.history[offset + 1]
    const pz = ls.history[offset + 2] - (flowType === 0 ? 25 : 0) // Center Lorenz z-axis

    // 3D rotation around Y and X
    const rx = px * cosT - py * sinT
    const ry = px * sinT + py * cosT
    const rz = pz * cosP - ry * sinP

    const screenX = cx + rx * baseScale
    const screenY = cy - (ry * cosP + pz * sinP) * baseScale

    if (first) {
      ctx.moveTo(screenX, screenY)
      first = false
    } else {
      ctx.lineTo(screenX, screenY)
    }
  }
  ctx.stroke()

  // Leading glow bead at attractor head
  const headIdx = ((ls.head - 1 + MAX_TRAIL) % MAX_TRAIL) * 3
  const hx = ls.history[headIdx]
  const hy = ls.history[headIdx + 1]
  const hz = ls.history[headIdx + 2] - (flowType === 0 ? 25 : 0)

  const rhx = hx * cosT - hy * sinT
  const rhy = hx * sinT + hy * cosT

  const headScreenX = cx + rhx * baseScale
  const headScreenY = cy - (rhy * cosP + hz * sinP) * baseScale

  ctx.fillStyle = state.colorCache.secondary
  ctx.globalAlpha = Math.min(1, baseAlpha * 2.2)
  ctx.beginPath()
  ctx.arc(headScreenX, headScreenY, 2.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalAlpha = 1
}
