import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { simplex } from "./simplex"

// ── Plate-scan background ──
// A single Atkinson-dithered generative still (simplex-octave field → 1-bit
// stipple) rendered ONCE to an offscreen canvas, then slowly panned with a
// scanline sweep. Near-zero per-frame cost: one drawImage + one gradient bar.
export function buildPlate(state: BgState, cell: number): HTMLCanvasElement {
  const W = state.w, H = state.h
  const cellPx = Math.max(2, Math.round(cell))
  const gw = Math.ceil(W / cellPx), gh = Math.ceil(H / cellPx)

  const gray = new Float32Array(gw * gh)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const v =
        simplex(x * 0.02, y * 0.02) * 0.6 +
        simplex(x * 0.07, y * 0.07) * 0.3 +
        simplex(x * 0.21, y * 0.21) * 0.1
      gray[y * gw + x] = Math.min(1, Math.max(0, v * 0.5 + 0.5))
    }
  }

  // Atkinson dither: threshold at 0.5, diffuse 6/8 of error forward
  const off = document.createElement("canvas")
  off.width = W
  off.height = H
  const octx = off.getContext("2d")!
  octx.fillStyle = state.colorCache.secondary

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x
      const old = gray[i]
      const bit = old > 0.5 ? 1 : 0
      const err = (old - bit) / 8
      if (bit) octx.fillRect(x * cellPx, y * cellPx, 1.6, 1.6)
      if (x + 1 < gw) gray[i + 1] += err
      if (x + 2 < gw) gray[i + 2] += err
      if (y + 1 < gh) {
        if (x > 0) gray[i + gw - 1] += err
        gray[i + gw] += err
        if (x + 1 < gw) gray[i + gw + 1] += err
      }
      if (y + 2 < gh) gray[i + 2 * gw] += err
    }
  }
  return off
}

export function drawPlateScan(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds["plate-scan"]
  const W = state.w, H = state.h
  const now = performance.now() / 1000
  const panSpeed = p?.panSpeed ?? 1
  const scanSpeed = p?.scanSpeed ?? 1
  const op = p?.opacity ?? 1
  const cell = p?.cell ?? 4

  const key = `${W}x${H}:${state.colorCache.secondary}:${Math.round(cell)}`
  if (state.plateKey !== key) {
    state.plate = buildPlate(state, cell)
    state.plateKey = key
  }

  // Pan wrapped 2x2 tile
  const panX = (now * 3 * panSpeed) % W
  const panY = (now * 1.7 * panSpeed) % H
  ctx.globalAlpha = 0.12 * op * state.readerAlpha
  if (state.plate) {
    ctx.drawImage(state.plate, -panX, -panY)
    ctx.drawImage(state.plate, W - panX, -panY)
    ctx.drawImage(state.plate, -panX, H - panY)
    ctx.drawImage(state.plate, W - panX, H - panY)
  }

  // Scanline sweep
  const sy = ((now * 26 * scanSpeed) % (H * 1.4)) - H * 0.2
  const grad = ctx.createLinearGradient(0, sy - 40, 0, sy + 40)
  grad.addColorStop(0, "transparent")
  grad.addColorStop(0.5, state.colorCache.secondary)
  grad.addColorStop(1, "transparent")
  ctx.globalAlpha = 0.05 * op * state.readerAlpha
  ctx.fillStyle = grad
  ctx.fillRect(0, sy - 40, W, 80)
  ctx.globalAlpha = 1
}
