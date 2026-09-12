import type { BgState, DendriteTree, DendriteSegment } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { simplex } from "./simplex"

// ── Dendrite background ──
// Reaction-diffusion Lichtenberg trees and synaptic arborization.
// Arbors sprout from screen margins, bifurcating through a simplex noise gradient
// field into capillary filaments with terminal synaptic boutons.
export function spawnTree(state: BgState, color: string): DendriteTree {
  const W = state.w
  const H = state.h
  // Spawn root on one of the four viewport edges pointing inward
  const edge = Math.floor(Math.random() * 4)
  let x = 0, y = 0, angle = 0
  if (edge === 0) { // top
    x = Math.random() * W; y = -5; angle = Math.PI / 2 + (Math.random() - 0.5) * 0.6
  } else if (edge === 1) { // right
    x = W + 5; y = Math.random() * H; angle = Math.PI + (Math.random() - 0.5) * 0.6
  } else if (edge === 2) { // bottom
    x = Math.random() * W; y = H + 5; angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6
  } else { // left
    x = -5; y = Math.random() * H; angle = (Math.random() - 0.5) * 0.6
  }

  return {
    x,
    y,
    angle,
    segments: [],
    tips: [{ x, y, angle, depth: 0, life: 120 }],
    age: 0,
    maxAge: 400 + Math.random() * 200,
    color,
  }
}

export function drawDendrite(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds.dendrite
  if (!p) return
  const W = state.w
  const H = state.h
  const targetCount = Math.max(1, Math.round(p.branches ?? 4))
  const speed = p.speed ?? 1.2
  const branchChance = p.branchChance ?? 0.08
  const curl = p.curl ?? 0.5
  const baseAlpha = (p.opacity ?? 0.35) * state.readerAlpha
  const pal = state.colorCache.palette

  if (!state.dendrites) state.dendrites = []

  // Ensure active tree count matches config
  while (state.dendrites.length < targetCount) {
    const col = pal[state.dendrites.length % pal.length] || state.colorCache.secondary
    state.dendrites.push(spawnTree(state, col))
  }
  if (state.dendrites.length > targetCount) {
    state.dendrites.length = targetCount
  }

  // Pre-batching paths: trunk (depth <= 2) and capillaries (depth > 2)
  const trunkPath = new Path2D()
  const capillaryPath = new Path2D()
  const boutons: Array<{ x: number; y: number; r: number }> = []

  for (let tIdx = 0; tIdx < state.dendrites.length; tIdx++) {
    const tree = state.dendrites[tIdx]
    tree.age++

    // 1. Advance active tips
    if (tree.tips.length > 0) {
      const nextTips: typeof tree.tips = []
      const stepLen = 2.4 * speed

      for (let i = 0; i < tree.tips.length; i++) {
        const tip = tree.tips[i]
        tip.life--
        if (tip.life <= 0) {
          // Terminal bouton
          if (tip.depth >= 2) boutons.push({ x: tip.x, y: tip.y, r: 1.8 })
          continue
        }

        // Noise deflection
        const noiseAngle = simplex(tip.x * 0.002, tip.y * 0.002) * Math.PI * 2
        tip.angle += Math.sin(noiseAngle - tip.angle) * 0.25 * curl

        const nx = tip.x + Math.cos(tip.angle) * stepLen
        const ny = tip.y + Math.sin(tip.angle) * stepLen

        const seg: DendriteSegment = {
          x1: tip.x,
          y1: tip.y,
          x2: nx,
          y2: ny,
          depth: tip.depth,
          alpha: Math.max(0.2, 1 - tip.depth * 0.15),
        }
        tree.segments.push(seg)
        tip.x = nx
        tip.y = ny

        // Check screen bounds
        if (nx < -20 || nx > W + 20 || ny < -20 || ny > H + 20) {
          continue
        }

        // Bifurcation check
        if (tip.depth < 5 && Math.random() < branchChance && tree.tips.length + nextTips.length < 32) {
          const splitAngle = 0.38 + Math.random() * 0.2
          tip.angle -= splitAngle * 0.5
          nextTips.push({
            x: nx,
            y: ny,
            angle: tip.angle + splitAngle,
            depth: tip.depth + 1,
            life: Math.floor(tip.life * 0.85),
          })
        }

        nextTips.push(tip)
      }
      tree.tips = nextTips
    }

    // 2. Calculate tree fading
    let treeAlpha = 1
    if (tree.age > tree.maxAge - 60) {
      treeAlpha = Math.max(0, (tree.maxAge - tree.age) / 60)
    }

    // 3. Accumulate paths
    const segs = tree.segments
    for (let sIdx = 0; sIdx < segs.length; sIdx++) {
      const s = segs[sIdx]
      const target = s.depth <= 2 ? trunkPath : capillaryPath
      target.moveTo(s.x1, s.y1)
      target.lineTo(s.x2, s.y2)
    }

    // Recycle tree once fully aged
    if (tree.age >= tree.maxAge) {
      const col = pal[tIdx % pal.length] || state.colorCache.secondary
      state.dendrites[tIdx] = spawnTree(state, col)
    }
  }

  // 4. Render batched arbor
  ctx.strokeStyle = state.colorCache.secondary

  ctx.lineWidth = 1.8
  ctx.globalAlpha = baseAlpha * 0.9
  ctx.stroke(trunkPath)

  ctx.lineWidth = 0.9
  ctx.globalAlpha = baseAlpha * 0.6
  ctx.stroke(capillaryPath)

  // 5. Render synaptic bouton points
  if (boutons.length > 0) {
    ctx.fillStyle = state.colorCache.secondary
    ctx.globalAlpha = baseAlpha * 1.2
    ctx.beginPath()
    for (let b = 0; b < boutons.length; b++) {
      const btn = boutons[b]
      ctx.moveTo(btn.x + btn.r, btn.y)
      ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2)
    }
    ctx.fill()
  }

  ctx.globalAlpha = 1
}
