import type { BgState, FieldConfig, DotNode } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { simplex, PM } from "./simplex"

// ── Field background (vectors and dots) ──
// Vectors: dynamic direction vectors undulating in a 2D simplex noise current.
// Dots: living constellation lattice where each node drifts off its grid point
// on noise current and nearby nodes form aperiodic celestial links.
// Optimized: reuses dotNodes array on BgState to eliminate per-frame allocations,
// and batches every cell/link into per-(colour, alpha-level) Path2Ds so a frame is
// a few dozen fill/stroke calls instead of several thousand. Alpha is quantised
// to 1/ALPHA_LEVELS of its range (a step below 8-bit alpha resolution).
const ALPHA_LEVELS = 24
const LINK_LEVELS = 20
const TAU = Math.PI * 2

// Scratch bucket tables, reused across frames (entries are reset, not reallocated)
const ellipsePaths: Array<Path2D | undefined> = []
const arrowPaths: Array<Path2D | undefined> = []
const dotPaths: Array<Path2D | undefined> = []
const linkPaths: Array<Path2D | undefined> = []

function resetBuckets(buckets: Array<Path2D | undefined>, n: number) {
  buckets.length = n
  for (let i = 0; i < n; i++) buckets[i] = undefined
}

function bucket(buckets: Array<Path2D | undefined>, i: number): Path2D {
  return buckets[i] ?? (buckets[i] = new Path2D())
}

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
  // Read once: window.scrollY inside the cell loop can force layout every iteration
  const scrollY = window.scrollY || 0
  const sy0 = scrollY % step
  const pad = step * 2
  const range = Math.PI * (p.range || 1.2)
  const radius = p.radius || 110
  const radius2 = radius * radius
  const vortex = p.vortex || 0.9
  const readerAlpha = state.readerAlpha
  const pal = state.colorCache.palette
  const palLen = pal.length
  const mx = state.mx, my = state.my

  const isVectors = mode === "vectors"
  const vRx = config.backgrounds.vectors.rx
  const vRy = config.backgrounds.vectors.ry
  const minRx = vRx * 0.3
  const dMin = config.backgrounds.dots.minSize
  const dSpan = config.backgrounds.dots.maxSize - dMin
  const levels = ALPHA_LEVELS + 1

  if (isVectors) {
    resetBuckets(ellipsePaths, levels)
    resetBuckets(arrowPaths, levels)
  } else {
    resetBuckets(dotPaths, palLen * levels)
  }

  let dotCount = 0
  const dotNodes: DotNode[] = state.dotNodes
  const hw = Math.PI / 5
  const cosHw = Math.cos(hw), sinHw = Math.sin(hw)

  for (let x = step / 2 - pad; x < state.w + pad; x += step) {
    for (let vy = step / 2 - sy0 - pad; vy < state.h + pad; vy += step) {
      const docY = vy + scrollY
      const nx = x * sc, ny = docY * sc

      let a = 0
      a += simplex(nx, ny + t) * 0.55
      a += simplex(nx * 2.2, ny * 2.2 + t * 2.5) * 0.3
      a += simplex(nx * 5, ny * 5 + t * 6) * 0.15
      a *= range

      const dx = x - mx, dy = vy - my
      const d2 = dx * dx + dy * dy
      if (d2 < radius2 && d2 > 0) {
        const f = 1 - Math.sqrt(d2) / radius
        const v = Math.atan2(dy, dx) + Math.PI / 2
        a += (v - a) * f * f * vortex
      }

      const intensity = simplex(nx + 100, ny + 100 + t * 1.2) * 0.5 + 0.5
      const baseAlpha = 0.05 + intensity * 0.15
      const finalAlpha = baseAlpha * readerAlpha
      if (finalAlpha < 0.01) continue

      // Quantised alpha bucket (clamped: simplex can overshoot [-1, 1] slightly)
      const lvl = Math.min(ALPHA_LEVELS, Math.max(0, Math.round(intensity * ALPHA_LEVELS)))

      if (isVectors) {
        const curRx = minRx + intensity * (vRx - minRx)
        const ca = Math.cos(a), sa = Math.sin(a)
        // moveTo first: ellipse() would otherwise join to the previous subpath with a stray edge
        const ep = bucket(ellipsePaths, lvl)
        ep.moveTo(x + curRx * ca, vy + curRx * sa)
        ep.ellipse(x, vy, curRx, vRy, a, 0, TAU)

        const tipX = x + curRx * ca, tipY = vy + curRx * sa
        const ha = 3 + intensity * 2
        // cos/sin(a -/+ hw) via angle-sum identities instead of 4 more trig calls
        const cm = ca * cosHw + sa * sinHw, sm = sa * cosHw - ca * sinHw
        const cp = ca * cosHw - sa * sinHw, sp = sa * cosHw + ca * sinHw
        const ap = bucket(arrowPaths, lvl)
        ap.moveTo(tipX, tipY)
        ap.lineTo(tipX - ha * cm, tipY - ha * sm)
        ap.lineTo(tipX - ha * cp, tipY - ha * sp)
        ap.closePath()
      } else {
        const ci = PM[(Math.floor(x * 7) + PM[Math.floor(docY * 3) & 255]) & 255] % palLen
        const dotR = dMin + intensity * dSpan
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

        const dp = bucket(dotPaths, ci * levels + lvl)
        dp.moveTo(dxp + dotR, dyp)
        dp.arc(dxp, dyp, dotR, 0, TAU)
      }
    }
  }

  if (isVectors) {
    ctx.fillStyle = state.colorCache.secondary
    for (let l = 0; l < levels; l++) {
      const ep = ellipsePaths[l], ap = arrowPaths[l]
      if (!ep && !ap) continue
      ctx.globalAlpha = (0.05 + (l / ALPHA_LEVELS) * 0.15) * readerAlpha
      if (ep) ctx.fill(ep)
      if (ap) ctx.fill(ap)
    }
    ctx.globalAlpha = 1
    return
  }

  for (let ci = 0; ci < palLen; ci++) {
    ctx.fillStyle = pal[ci]
    for (let l = 0; l < levels; l++) {
      const dp = dotPaths[ci * levels + l]
      if (!dp) continue
      ctx.globalAlpha = (0.05 + (l / ALPHA_LEVELS) * 0.15) * readerAlpha
      ctx.fill(dp)
    }
  }

  // Constellation links: connect each dot to neighbours within ~1.6 steps
  if (dotCount > 1) {
    const maxD = step * 1.6
    const maxD2 = maxD * maxD
    // closeness * min(alpha) tops out at 0.2 * readerAlpha
    const linkMax = 0.2 * readerAlpha
    const linkLevels = LINK_LEVELS + 1
    resetBuckets(linkPaths, palLen * linkLevels)
    for (let i = 0; i < dotCount; i++) {
      const a0 = dotNodes[i]
      const jEnd = Math.min(i + 24, dotCount)
      for (let j = i + 1; j < jEnd; j++) {
        const b0 = dotNodes[j]
        const ddx = a0.x - b0.x, ddy = a0.y - b0.y
        const d2 = ddx * ddx + ddy * ddy
        if (d2 > maxD2) continue
        const closeness = 1 - Math.sqrt(d2) / maxD
        const lvl = Math.round(
          (closeness * Math.min(a0.alpha, b0.alpha) / linkMax) * LINK_LEVELS
        )
        if (lvl <= 0) continue
        const lp = bucket(linkPaths, a0.ci * linkLevels + Math.min(LINK_LEVELS, lvl))
        lp.moveTo(a0.x, a0.y)
        lp.lineTo(b0.x, b0.y)
      }
    }
    ctx.lineWidth = 1
    for (let ci = 0; ci < palLen; ci++) {
      ctx.strokeStyle = pal[ci]
      for (let l = 1; l < linkLevels; l++) {
        const lp = linkPaths[ci * linkLevels + l]
        if (!lp) continue
        ctx.globalAlpha = (l / LINK_LEVELS) * linkMax * 0.35
        ctx.stroke(lp)
      }
    }
  }
  ctx.globalAlpha = 1
}
