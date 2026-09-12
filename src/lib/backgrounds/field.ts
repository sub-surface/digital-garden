import type { BgState, FieldConfig, DotNode } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { simplex, PM } from "./simplex"

// ── Field background (vectors and dots) ──
// Vectors: dynamic direction vectors undulating in a 2D simplex noise current.
// Dots: living constellation lattice where each node drifts off its grid point
// on noise current and nearby nodes form aperiodic celestial links.
// Optimized: reuses dotNodes array on BgState to eliminate per-frame allocations.
export function drawField(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  mode: "vectors" | "dots",
  config: SiteConfig
) {
  const p: FieldConfig = mode === "vectors"
    ? config.backgrounds.vectors
    : config.backgrounds.dots

  if (!p) return

  const { step, speed, scale: sc } = p
  const now = performance.now() / 1000
  const t = now * speed
  const sy0 = (window.scrollY || 0) % step
  const pad = step * 2

  let dotCount = 0
  const dotNodes: DotNode[] = state.dotNodes

  for (let x = step / 2 - pad; x < state.w + pad; x += step) {
    for (let vy = step / 2 - sy0 - pad; vy < state.h + pad; vy += step) {
      const docY = vy + (window.scrollY || 0)
      const nx = x * sc, ny = docY * sc

      let a = 0
      a += simplex(nx, ny + t) * 0.55
      a += simplex(nx * 2.2, ny * 2.2 + t * 2.5) * 0.3
      a += simplex(nx * 5, ny * 5 + t * 6) * 0.15
      a *= Math.PI * (p.range || 1.2)

      const dx = x - state.mx, dy = vy - state.my, d = Math.hypot(dx, dy)
      const radius = p.radius || 110
      if (d < radius && d > 0) {
        const f = 1 - d / radius
        const v = Math.atan2(dy, dx) + Math.PI / 2
        a += (v - a) * f * f * (p.vortex || 0.9)
      }

      const intensity = simplex(nx + 100, ny + 100 + t * 1.2) * 0.5 + 0.5
      const baseAlpha = 0.05 + intensity * 0.15
      const finalAlpha = baseAlpha * state.readerAlpha
      if (finalAlpha < 0.01) continue

      ctx.globalAlpha = finalAlpha

      if (mode === "vectors") {
        const rx = config.backgrounds.vectors.rx, ry = config.backgrounds.vectors.ry
        const minRx = rx * 0.3
        const curRx = minRx + intensity * (rx - minRx)
        ctx.fillStyle = state.colorCache.secondary
        ctx.beginPath()
        ctx.ellipse(x, vy, curRx, ry, a, 0, Math.PI * 2)
        ctx.fill()

        const tipX = x + curRx * Math.cos(a), tipY = vy + curRx * Math.sin(a)
        const ha = 3 + intensity * 2, hw = Math.PI / 5
        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX - ha * Math.cos(a - hw), tipY - ha * Math.sin(a - hw))
        ctx.lineTo(tipX - ha * Math.cos(a + hw), tipY - ha * Math.sin(a + hw))
        ctx.closePath()
        ctx.fill()
      } else if (mode === "dots") {
        const ci = PM[(Math.floor(x * 7) + PM[Math.floor(docY * 3) & 255]) & 255] % state.colorCache.palette.length
        const dotR = config.backgrounds.dots.minSize + intensity * (config.backgrounds.dots.maxSize - config.backgrounds.dots.minSize)
        const drift = step * 0.4 * (simplex(nx * 1.5, ny * 1.5 - t) * 0.5 + 0.5)
        const dxp = x + Math.cos(a) * drift
        const dyp = vy + Math.sin(a) * drift

        // Zero-allocation reuse of dot node structs
        let node = dotNodes[dotCount]
        if (!node) {
          node = { x: dxp, y: dyp, r: dotR, ci, alpha: finalAlpha }
          dotNodes[dotCount] = node
        } else {
          node.x = dxp
          node.y = dyp
          node.r = dotR
          node.ci = ci
          node.alpha = finalAlpha
        }
        dotCount++

        ctx.fillStyle = state.colorCache.palette[ci]
        ctx.beginPath()
        ctx.arc(dxp, dyp, dotR, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // Constellation links: connect each dot to neighbours within ~1.6 steps
  if (mode === "dots" && dotCount > 1) {
    const maxD = step * 1.6
    const maxD2 = maxD * maxD
    ctx.lineWidth = 1
    for (let i = 0; i < dotCount; i++) {
      const a0 = dotNodes[i]
      for (let j = i + 1; j < Math.min(i + 24, dotCount); j++) {
        const b0 = dotNodes[j]
        const ddx = a0.x - b0.x, ddy = a0.y - b0.y
        const d2 = ddx * ddx + ddy * ddy
        if (d2 > maxD2) continue
        const closeness = 1 - Math.sqrt(d2) / maxD
        ctx.globalAlpha = closeness * 0.35 * Math.min(a0.alpha, b0.alpha)
        ctx.strokeStyle = state.colorCache.palette[a0.ci]
        ctx.beginPath()
        ctx.moveTo(a0.x, a0.y)
        ctx.lineTo(b0.x, b0.y)
        ctx.stroke()
      }
    }
  }
}
