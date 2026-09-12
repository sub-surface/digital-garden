import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"

// ── Schematic background ──
// Drifting anchor points with right-angle leader lines out to asemic glyph
// clusters that fade in and out; ruler ticks along the viewport edges.
export const SCHEMATIC_GLYPHS = "∮∇∂≡⊕⊗·°∆⟁"

export function drawSchematic(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds.schematic
  const W = state.w, H = state.h
  const drift = (performance.now() / 1000) * (p?.driftSpeed ?? 1)
  const now = drift
  const op = p?.opacity ?? 1
  const pen = state.colorCache.secondary
  const anchorCount = Math.round(p?.anchors ?? 9)

  if (state.anchors.length !== anchorCount) {
    state.anchors = Array.from({ length: anchorCount }, (_, i) => ({
      i,
      phase: i * 1.37,
      glyphs: Array.from(
        { length: 2 + (i % 3) },
        (_, g) => SCHEMATIC_GLYPHS[(i * 3 + g * 7) % SCHEMATIC_GLYPHS.length]
      ).join(""),
    }))
  }

  // Edge ruler ticks - batched in one path
  ctx.strokeStyle = pen
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.05 * op * state.readerAlpha
  ctx.beginPath()
  for (let x = 0; x < W; x += 24) {
    const len = x % 120 === 0 ? 8 : 4
    ctx.moveTo(x, 0); ctx.lineTo(x, len)
    ctx.moveTo(x, H); ctx.lineTo(x, H - len)
  }
  for (let y = 0; y < H; y += 24) {
    const len = y % 120 === 0 ? 8 : 4
    ctx.moveTo(0, y); ctx.lineTo(len, y)
    ctx.moveTo(W, y); ctx.lineTo(W - len, y)
  }
  ctx.stroke()

  ctx.font = "10px 'IBM Plex Mono', monospace"
  ctx.textAlign = "left"
  for (let i = 0; i < state.anchors.length; i++) {
    const a = state.anchors[i]
    const ax = W * (0.5 + 0.4 * Math.sin(now * 0.04 + a.phase * 2.3))
    const ay = H * (0.5 + 0.38 * Math.cos(now * 0.031 + a.phase * 1.9))
    const vis = Math.max(0, Math.sin(now * 0.13 + a.phase * 3.1))
    if (vis < 0.02) continue
    const alpha = 0.16 * vis * op * state.readerAlpha

    // Leader line with right-angle elbow
    const lx = ax + 46 + 34 * Math.sin(a.phase * 5)
    const ly = ay - 30 - 22 * Math.cos(a.phase * 4)
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(lx, ay)
    ctx.lineTo(lx, ly)
    ctx.stroke()

    // Anchor node + dimension bracket
    ctx.fillStyle = pen
    ctx.fillRect(ax - 1.5, ay - 1.5, 3, 3)
    ctx.beginPath()
    ctx.moveTo(lx - 4, ly)
    ctx.lineTo(lx + 4, ly)
    ctx.stroke()

    ctx.globalAlpha = alpha * 1.4
    ctx.fillText(a.glyphs, lx + 7, ly + 3)
  }
  ctx.globalAlpha = 1
}
