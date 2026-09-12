import type { BgState } from "@/types/backgrounds"

// ── Chess and Hexo page-scoped background boards ──

export function drawChess(ctx: CanvasRenderingContext2D, state: BgState) {
  const cell = Math.max(state.w, state.h) / 8
  const cols = Math.ceil(state.w / cell) + 1
  const rows = Math.ceil(state.h / cell) + 1

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell
      const y = r * cell
      const d = Math.hypot(x + cell / 2 - state.mx, y + cell / 2 - state.my)
      const prox = d < 200 ? (1 - d / 200) * 0.04 : 0
      ctx.globalAlpha = (((r + c) % 2 ? 0.035 : 0.015) + prox) * state.readerAlpha
      ctx.fillStyle = state.colorCache.secondary
      ctx.fillRect(x, y, cell, cell)
    }
  }
}

export function drawHexo(ctx: CanvasRenderingContext2D, state: BgState) {
  // Faint pointy-top hexagonal grid, mirroring drawChess's proximity glow.
  const size = Math.max(state.w, state.h) / 22
  const hw = Math.sqrt(3) * size
  const vh = 1.5 * size
  const cols = Math.ceil(state.w / hw) + 2
  const rows = Math.ceil(state.h / vh) + 2

  ctx.strokeStyle = state.colorCache.secondary
  ctx.lineWidth = 1

  const hexPath = (cx: number, cy: number) => {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30)
      const x = cx + size * Math.cos(a)
      const y = cy + size * Math.sin(a)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  const glow: { cx: number; cy: number; prox: number }[] = []
  ctx.globalAlpha = 0.025 * state.readerAlpha
  ctx.beginPath()
  for (let r = -1; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      const cx = c * hw + (r % 2 ? hw / 2 : 0)
      const cy = r * vh
      hexPath(cx, cy)
      const d = Math.hypot(cx - state.mx, cy - state.my)
      if (d < 220) glow.push({ cx, cy, prox: (1 - d / 220) * 0.06 })
    }
  }
  ctx.stroke()

  for (let i = 0; i < glow.length; i++) {
    const g = glow[i]
    ctx.globalAlpha = g.prox * state.readerAlpha
    ctx.beginPath()
    hexPath(g.cx, g.cy)
    ctx.stroke()
  }
}
