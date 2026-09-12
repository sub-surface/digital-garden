import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"

// ── Orrery background ──
// Nested astrolabe rings centred on the viewport: thin circles, tick radials,
// and a "body" node per ring, each precessing at its own slow rate.
export function drawOrrery(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds.orrery
  const W = state.w, H = state.h
  const now = performance.now() / 1000
  const spinScale = p?.spin ?? 1
  const op = p?.opacity ?? 1
  const pen = state.colorCache.secondary
  const pal = state.colorCache.palette
  const cx = W / 2, cy = H / 2
  const maxR = Math.min(W, H) * 0.44
  const RINGS = Math.round(p?.rings ?? 6)

  ctx.lineWidth = 1
  for (let i = 0; i < RINGS; i++) {
    const r = maxR * ((i + 1) / RINGS)
    const rot = now * 0.03 * spinScale * (i % 2 ? 1 : -1) * (1 + i * 0.35) + i * 0.8
    const squash = 1 - 0.06 * Math.sin(now * 0.05 + i * 1.3)

    // Astrolabe ring
    ctx.strokeStyle = pen
    ctx.globalAlpha = 0.05 * op * state.readerAlpha
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * squash, 0, 0, Math.PI * 2)
    ctx.stroke()

    // Tick radials
    const ticks = 12 + i * 6
    ctx.beginPath()
    for (let t = 0; t < ticks; t++) {
      const a = (t / ticks) * Math.PI * 2 + rot * 0.4
      const inner = t % 3 === 0 ? 0.965 : 0.985
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash)
      ctx.lineTo(cx + Math.cos(a) * r * inner, cy + Math.sin(a) * r * squash * inner)
    }
    ctx.stroke()

    // Orbiting body + short trailing arc
    const ba = rot
    ctx.globalAlpha = 0.22 * op * state.readerAlpha
    ctx.fillStyle = pal[i % pal.length] || pen
    ctx.beginPath()
    ctx.arc(cx + Math.cos(ba) * r, cy + Math.sin(ba) * r * squash, 2.2, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 0.09 * op * state.readerAlpha
    ctx.strokeStyle = pal[i % pal.length] || pen
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * squash, 0, ba - 0.5, ba)
    ctx.stroke()
  }

  // Centre node
  ctx.globalAlpha = 0.3 * op * state.readerAlpha
  ctx.fillStyle = pen
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}
