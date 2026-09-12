import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"

// ── Living Knowledge Graph background ──
// An ambient, living constellation network of notes and ideas.
// Features:
//  - Rhythmic signal pulses traversing active links (synaptic thought propagation).
//  - Star-twinkle breathing on nodes for atmospheric depth.
//  - Interactive cursor repulsion and proximity illumination.
//  - Carmack-batched rendering: all links in 1 stroke, all nodes in 1 fill,
//    and all synaptic pulses in 1 fill — zero per-frame heap allocations!
export function drawGraph(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds.graph
  const color = state.colorCache.secondary
  const nodes = state.nodes
  const links = state.links || []
  const nodeMap = state.nodeMap
  const W = state.w
  const H = state.h

  if (nodes.length === 0) return

  const now = performance.now() / 1000
  const drift = p.drift ?? 1
  const readerAlpha = state.readerAlpha

  // 1. Organic physics update (drift + subtle cursor deflection)
  const mx = state.mx
  const my = state.my
  const hasCursor = mx > -9000

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    n.x += n.vx * drift
    n.y += n.vy * drift

    // Gentle bounce off screen borders with soft padding
    if (n.x < -20) { n.x = -20; n.vx = Math.abs(n.vx) }
    else if (n.x > W + 20) { n.x = W + 20; n.vx = -Math.abs(n.vx) }

    if (n.y < -20) { n.y = -20; n.vy = Math.abs(n.vy) }
    else if (n.y > H + 20) { n.y = H + 20; n.vy = -Math.abs(n.vy) }

    // Subtle cursor deflection
    if (hasCursor) {
      const dx = n.x - mx
      const dy = n.y - my
      const d2 = dx * dx + dy * dy
      if (d2 < 14400 && d2 > 0) { // 120px radius
        const d = Math.sqrt(d2)
        const force = (1 - d / 120) * 0.4
        n.x += (dx / d) * force
        n.y += (dy / d) * force
      }
    }
  }

  // 2. Batched Link Rendering
  ctx.globalAlpha = p.linkOpacity * readerAlpha
  ctx.strokeStyle = color
  ctx.lineWidth = p.linkWidth || 1

  ctx.beginPath()
  for (let i = 0; i < links.length; i++) {
    const l = links[i]
    const s = nodeMap.get(l.source)
    const t = nodeMap.get(l.target)
    if (s && t) {
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
    }
  }
  ctx.stroke()

  // 3. Synaptic Signal Pulses along links (energy packets)
  // Evaluated without allocating objects: only render pulses on every Nth link
  ctx.globalAlpha = Math.min(1, p.linkOpacity * 2.2 * readerAlpha)
  ctx.fillStyle = color

  ctx.beginPath()
  const linkStep = Math.max(1, Math.floor(links.length / 40)) // limit active pulses to ~40 at once
  for (let i = 0; i < links.length; i += linkStep) {
    const l = links[i]
    const s = nodeMap.get(l.source)
    const t = nodeMap.get(l.target)
    if (s && t) {
      // Progress along edge from 0 to 1
      const progress = ((now * 0.25 + (i * 0.17)) % 1.0)
      const px = s.x + (t.x - s.x) * progress
      const py = s.y + (t.y - s.y) * progress
      ctx.moveTo(px + 1.8, py)
      ctx.arc(px, py, 1.8, 0, Math.PI * 2)
    }
  }
  ctx.fill()

  // 4. Batched Base Nodes (with twinkle)
  ctx.beginPath()
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    // Breathing radius
    const twinkle = 0.85 + 0.15 * Math.sin(now * 1.5 + (i * 0.8))
    const r = (p.nodeSize || 2.5) * twinkle
    ctx.moveTo(n.x + r, n.y)
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
  }
  ctx.globalAlpha = p.nodeOpacity * readerAlpha
  ctx.fill()

  // 5. Cursor Hover Glow (only for proximate nodes)
  if (hasCursor) {
    ctx.globalAlpha = p.nodeHoverOpacity * readerAlpha
    ctx.beginPath()
    let hasHover = false
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const dx = n.x - mx
      const dy = n.y - my
      if (dx * dx + dy * dy < 10000) { // 100px hover
        const hr = p.nodeHoverSize || 4.5
        ctx.moveTo(n.x + hr, n.y)
        ctx.arc(n.x, n.y, hr, 0, Math.PI * 2)
        hasHover = true
      }
    }
    if (hasHover) ctx.fill()
  }

  ctx.globalAlpha = 1
}
