import type { BgState, ChamberConfig, Track } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { simplex } from "./simplex"

// ── Bubble-chamber background ──
// Drifting emitters fire particle "tracks" that curve through the simplex flow
// field (plus a constant curl for spiral arcs), leaving stippled trails that
// linger then fade — the particle-track / annotation-stream motif of plotter-era
// scientific plates.
// Carmack optimization: in-place compaction eliminates per-frame array allocations.
export const CHAMBER_GLYPHS = "⊕⊗⊙∮∇∂≡·°"

export function spawnTrack(state: BgState, p: ChamberConfig, now: number) {
  if (!state.emitters || state.emitters.length === 0) return
  const e = state.emitters[(Math.random() * state.emitters.length) | 0]
  const charge = Math.random() < 0.5 ? 1 : -1
  let x = e.x, y = e.y
  let ang = Math.random() * Math.PI * 2
  const pts: { x: number; y: number }[] = [{ x, y }]
  for (let i = 0; i < p.steps; i++) {
    const fa = simplex(x * p.fieldScale, y * p.fieldScale + now * p.drift) * Math.PI * 2
    ang += Math.sin(fa - ang) * 0.35 + charge * p.curl
    x += Math.cos(ang) * p.stepLen
    y += Math.sin(ang) * p.stepLen
    pts.push({ x, y })
  }
  const spot = p.spot ?? 0.15
  const ci = Math.random() < spot ? 1 + ((Math.random() * 3) | 0) : 0
  const head = pts[pts.length - 1]
  state.tracks.push({
    pts,
    life: 1 + Math.random() * 0.6,
    ci,
    glyph: Math.random() < p.glyphChance ? CHAMBER_GLYPHS[(Math.random() * CHAMBER_GLYPHS.length) | 0] : null,
    gx: head.x + 4,
    gy: head.y,
  })
}

export function drawChamber(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds.chamber
  if (!p) return
  const W = state.w, H = state.h
  const now = performance.now() / 1000

  if (!state.emitters || state.emitters.length !== p.emitters) {
    state.emitters = Array.from({ length: p.emitters }, () => ({ x: W / 2, y: H / 2 }))
    state.tracks = []
    for (let i = 0; i < state.emitters.length; i++) {
      const e = state.emitters[i]
      e.x = W * (0.5 + 0.34 * Math.sin(now * 0.05 + i * 2.1))
      e.y = H * (0.5 + 0.30 * Math.cos(now * 0.041 + i * 1.7))
    }
    for (let i = 0; i < p.maxTracks * 0.6; i++) spawnTrack(state, p, now - Math.random() * 4)
  }

  for (let i = 0; i < state.emitters.length; i++) {
    const e = state.emitters[i]
    e.x = W * (0.5 + 0.34 * Math.sin(now * 0.05 + i * 2.1))
    e.y = H * (0.5 + 0.30 * Math.cos(now * 0.041 + i * 1.7))
  }

  if (state.tracks.length < p.maxTracks && Math.random() < p.spawnRate) {
    spawnTrack(state, p, now)
  }

  const pal = state.colorCache.palette
  ctx.textAlign = "left"
  ctx.font = "10px 'IBM Plex Mono', monospace"

  let writeIdx = 0
  const tracks = state.tracks
  for (let tIdx = 0; tIdx < tracks.length; tIdx++) {
    const tr: Track = tracks[tIdx]
    tr.life -= p.fade
    if (tr.life <= 0) continue

    const a = Math.min(1, tr.life) * p.opacity * state.readerAlpha
    if (a >= 0.008) {
      ctx.fillStyle = pal[tr.ci] || state.colorCache.secondary
      ctx.globalAlpha = a
      for (let i = 0; i < tr.pts.length; i += p.gap) {
        const pt = tr.pts[i]
        const s = p.dot * (0.5 + 0.5 * (i / tr.pts.length))
        ctx.fillRect(pt.x, pt.y, s, s)
      }
      ctx.globalAlpha = Math.min(1, a * 1.6)
      ctx.fillRect(tr.pts[0].x - 1, tr.pts[0].y - 1, 2.4, 2.4)
      if (tr.glyph) {
        ctx.globalAlpha = a
        ctx.fillText(tr.glyph, tr.gx, tr.gy)
      }
    }
    tracks[writeIdx++] = tr
  }
  tracks.length = writeIdx

  // Drafting-terminal reticle + live coordinate readout at cursor
  if (p.reticle && state.mx > -9000) {
    const r = 9
    ctx.globalAlpha = 0.5 * state.readerAlpha
    ctx.strokeStyle = state.colorCache.secondary
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(state.mx - r, state.my); ctx.lineTo(state.mx - 3, state.my)
    ctx.moveTo(state.mx + 3, state.my); ctx.lineTo(state.mx + r, state.my)
    ctx.moveTo(state.mx, state.my - r); ctx.lineTo(state.mx, state.my - 3)
    ctx.moveTo(state.mx, state.my + 3); ctx.lineTo(state.mx, state.my + r)
    ctx.stroke()
    ctx.globalAlpha = 0.35 * state.readerAlpha
    ctx.fillStyle = state.colorCache.secondary
    ctx.font = "9px 'IBM Plex Mono', monospace"
    const pad = (n: number) => n.toFixed(0).padStart(4, "0")
    ctx.fillText(`${pad(state.mx)}·${pad(state.my)}`, state.mx + 12, state.my - 8)
  }
  ctx.globalAlpha = 1
}
