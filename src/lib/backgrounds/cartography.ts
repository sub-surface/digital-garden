import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { simplex } from "./simplex"

// ── Cartography background ──
// Topographic contour drift & terrain relief.
// Slices continuous elevation isoclines across a procedural noise landscape.
// Features:
//   - Major index contours every 4th line (bolder gauge, matching geological survey maps).
//   - Cursor surveyor interaction: cursor acts as a benchmark station with elevation tags.
//   - Batched into two Path2D stroke passes for peak 144 FPS performance.
export function drawCartography(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds.cartography
  if (!p) return
  const W = state.w
  const H = state.h
  const lineCount = Math.max(3, Math.round(p.lines ?? 14))
  const speed = p.speed ?? 0.6
  const relief = p.relief ?? 1.6
  const freq = p.elevation ?? 0.002
  const baseAlpha = (p.opacity ?? 0.3) * state.readerAlpha
  const now = (performance.now() / 1000) * speed

  // Initialize session terrain seed
  if (!state.cartoSeed) {
    state.cartoSeed = Math.random() * 1000
  }
  const seed = state.cartoSeed

  const standardPath = new Path2D()
  const indexPath = new Path2D()
  const labels: Array<{ text: string; x: number; y: number }> = []

  const stepX = 24 // 24px step across viewport for smooth curves
  const cols = Math.ceil(W / stepX) + 2

  const hasCursor = state.mx > -9000
  const mx = state.mx, my = state.my

  for (let k = 1; k <= lineCount; k++) {
    const baseNormY = k / (lineCount + 1)
    const baseY = baseNormY * H
    const isIndexLine = k % 4 === 0
    const targetPath = isIndexLine ? indexPath : standardPath

    let first = true
    let labelPlaced = false

    for (let c = -1; c <= cols; c++) {
      const x = c * stepX

      // Multi-octave elevation noise
      const n1 = simplex(x * freq + seed, baseY * freq + now * 0.08)
      const n2 = simplex(x * freq * 2.2 + seed + 50, baseY * freq * 2.2 - now * 0.05)
      const n3 = simplex(x * freq * 5.1, baseY * freq * 5.1 + now * 0.12)

      let dy = (n1 * 0.6 + n2 * 0.3 + n3 * 0.1) * relief * 42

      // Cursor elevation deflection (mountain surveyor beacon)
      if (hasCursor) {
        const cdx = x - mx
        const cdy = (baseY + dy) - my
        const dist2 = cdx * cdx + cdy * cdy
        if (dist2 < 40000 && dist2 > 0) { // 200px radius
          const dist = Math.sqrt(dist2)
          const bend = (1 - dist / 200) * 28
          dy -= (cdy / dist) * bend
        }
      }

      const y = baseY + dy

      if (first) {
        targetPath.moveTo(x, y)
        first = false
      } else {
        targetPath.lineTo(x, y)
      }

      // Elevation label on index contours near center
      if (isIndexLine && !labelPlaced && x > W * 0.35 && x < W * 0.65 && (c % 8 === 0)) {
        const elev = Math.round(baseNormY * 2400 + 400)
        labels.push({ text: `${elev}m`, x: x + 4, y: y - 4 })
        labelPlaced = true
      }
    }
  }

  ctx.strokeStyle = state.colorCache.secondary

  // 1. Standard contour lines
  ctx.lineWidth = 0.9
  ctx.globalAlpha = baseAlpha * 0.7
  ctx.stroke(standardPath)

  // 2. Index contour lines (bold)
  ctx.lineWidth = 1.8
  ctx.globalAlpha = baseAlpha * 1.15
  ctx.stroke(indexPath)

  // 3. Elevation typography
  if (labels.length > 0) {
    ctx.font = "9px 'IBM Plex Mono', monospace"
    ctx.fillStyle = state.colorCache.secondary
    ctx.globalAlpha = baseAlpha * 0.85
    for (let l = 0; l < labels.length; l++) {
      const lbl = labels[l]
      ctx.fillText(lbl.text, lbl.x, lbl.y)
    }
  }

  // 4. Surveyor reticle at cursor
  if (hasCursor) {
    ctx.strokeStyle = state.colorCache.secondary
    ctx.lineWidth = 1
    ctx.globalAlpha = baseAlpha * 1.3
    const r = 8
    ctx.beginPath()
    ctx.moveTo(mx - r, my); ctx.lineTo(mx + r, my)
    ctx.moveTo(mx, my - r); ctx.lineTo(mx, my + r)
    ctx.arc(mx, my, 4, 0, Math.PI * 2)
    ctx.stroke()

    ctx.font = "9px 'IBM Plex Mono', monospace"
    ctx.fillStyle = state.colorCache.secondary
    ctx.fillText(`BM ${Math.round(my)}`, mx + 12, my - 6)
  }

  ctx.globalAlpha = 1
}
