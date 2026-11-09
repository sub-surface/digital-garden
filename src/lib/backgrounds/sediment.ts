import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { perState, FONT } from "./scratch"
import { gardenSlugs, noteText, isMissing, FALLBACK } from "./corpus"
import { measure } from "@/lib/textlayout"

// ── Sediment background ──
// The garden laid down in strata. Words fall, note by note in the order the
// notes were written, and settle on whatever is below them, so the oldest
// writing ends up deepest. Each stratum is marked at the left edge with its
// note and date. When the pile grows high the ground subsides and the oldest
// layers sink out of sight: sub-surface, literally.
//
// Settled words never move again, so they're baked once into an offscreen
// layer; a frame is one drawImage plus the few words still falling.

interface Falling {
  word: string
  x: number; y: number
  w: number
  vy: number
  rot: number
  layer: number
}

interface Scene {
  /** Column heights in world space: the top of the pile at each 4px column. */
  ground: Float32Array
  falling: Falling[]
  baked: HTMLCanvasElement | OffscreenCanvas
  bctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  /**
   * How far the world has sunk (px). Screen y = world y + sink; in the bake,
   * y = world y + H (so the pile can grow a screen above its start).
   */
  sink: number
  sinkTarget: number
  queue: string[]
  layer: number
  noteIdx: number
  spawnDebt: number
  last: number
  font: string
}

const COL = 4

function offscreen(w: number, h: number) {
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h })
  return c
}

const scene = perState<Scene>((state) => {
  const W = Math.ceil(state.w), H = Math.ceil(state.h)
  const baked = offscreen(W, H * 2)
  const bctx = baked.getContext("2d") as CanvasRenderingContext2D
  const ground = new Float32Array(Math.ceil(W / COL) + 1).fill(H)
  return { ground, falling: [], baked, bctx, sink: 0, sinkTarget: 0, queue: [], layer: 0, noteIdx: 0, spawnDebt: 0, last: performance.now() / 1000, font: "" }
})

function nextWords(s: Scene, state: BgState): boolean {
  const notes = gardenSlugs()
  if (!notes.length) {
    s.queue = FALLBACK.paragraphs.join(" ").split(/\s+/)
    return true
  }
  // Skip notes with no prose; wait (next frame) for one still loading.
  let t = null
  for (let k = 0; k < 12 && !t; k++) {
    const n = notes[s.noteIdx % notes.length]
    t = noteText(n.slug)
    if (t) break
    if (!isMissing(n.slug)) return false
    s.noteIdx++
  }
  if (!t) return false
  s.noteIdx++
  s.layer++
  s.queue = t.paragraphs.slice(0, 2).join(" ").split(/\s+/).filter((w) => w.length > 2).slice(0, 70)
  // The stratum's mark at the left edge, at the current top of the pile
  const top = Math.min(...Array.from(s.ground.subarray(0, 40)))
  s.bctx.font = `8px ${FONT.mono}`
  s.bctx.fillStyle = state.colorCache.secondary
  s.bctx.globalAlpha = 0.5
  s.bctx.fillText(`${(t.date || "").slice(0, 4) || "····"} · ${t.title}`.slice(0, 48), 8, top - 4 + state.h)
  return true
}

export function drawSediment(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.sediment
  if (!p) return
  const s = scene(state)
  const now = performance.now() / 1000
  const dt = Math.min(0.05, now - s.last)
  s.last = now
  const W = state.w, H = state.h
  const size = p.size ?? 12
  const font = `${size}px ${FONT.sans}`
  const op = (p.opacity ?? 0.5) * state.readerAlpha
  const ink = state.colorCache.text
  const lh = size * 1.15

  // Spawn at the configured rate
  s.spawnDebt += dt * (p.rate ?? 1.5)
  while (s.spawnDebt >= 1) {
    s.spawnDebt -= 1
    if (!s.queue.length && !nextWords(s, state)) break
    const word = s.queue.shift()
    if (!word) break
    const w = measure(word, font)
    s.falling.push({ word, w, x: Math.random() * Math.max(1, W - w), y: -size - Math.random() * 40, vy: 30 + Math.random() * 30, rot: (Math.random() - 0.5) * 0.12, layer: s.layer })
  }

  // Fall and settle
  ctx.font = font
  ctx.fillStyle = ink
  let keep = 0
  for (const f of s.falling) {
    f.vy = Math.min(220, f.vy + 160 * dt)
    // The cursor blows falling words aside
    const dx = f.x + f.w / 2 - state.mx, dy = f.y - state.my
    if (dx * dx + dy * dy < 8000) f.x += Math.sign(dx) * 90 * dt
    f.x = Math.max(0, Math.min(W - f.w, f.x))
    f.y += f.vy * dt
    // Where the pile is highest under this word (in world space)
    const c0 = Math.floor(f.x / COL), c1 = Math.min(s.ground.length - 1, Math.ceil((f.x + f.w) / COL))
    let floor = Infinity
    for (let c = c0; c <= c1; c++) floor = Math.min(floor, s.ground[c])
    if (f.y - s.sink >= floor - 1) {
      const y = floor - 1
      for (let c = c0; c <= c1; c++) s.ground[c] = y - lh
      // Older strata are baked fainter: depth reads as age
      s.bctx.font = font
      s.bctx.fillStyle = ink
      s.bctx.globalAlpha = 0.6 - 0.35 * Math.min(1, (s.layer - f.layer) / 6)
      s.bctx.save()
      s.bctx.translate(f.x, y + H)
      s.bctx.rotate(f.rot)
      s.bctx.fillText(f.word, 0, 0)
      s.bctx.restore()
      continue
    }
    s.falling[keep++] = f
    ctx.globalAlpha = 0.22 * op
    ctx.save()
    ctx.translate(f.x, f.y)
    ctx.rotate(f.rot)
    ctx.fillText(f.word, 0, 0)
    ctx.restore()
  }
  s.falling.length = keep

  // Subsidence: once the pile reaches halfway up, everything sinks by a few lines.
  let top = Infinity
  for (let c = 0; c < s.ground.length; c++) top = Math.min(top, s.ground[c])
  if (top + s.sink < H * 0.5 && s.sinkTarget === s.sink) s.sinkTarget = s.sink + lh * 4
  if (s.sink < s.sinkTarget) s.sink = Math.min(s.sinkTarget, s.sink + dt * 12)

  // Once it has sunk most of a screen, re-anchor: move the world origin down
  // by the sink so far (bake content shifts with it; what falls off the
  // bottom of the bake is below the screen anyway).
  if (s.sink > H * 0.9) {
    const shift = Math.floor(s.sink)
    const copy = offscreen(s.baked.width, s.baked.height)
    const cctx = copy.getContext("2d") as CanvasRenderingContext2D
    cctx.drawImage(s.baked as CanvasImageSource, 0, shift)
    s.baked = copy
    s.bctx = cctx
    for (let c = 0; c < s.ground.length; c++) s.ground[c] += shift
    s.sink -= shift
    s.sinkTarget -= shift
  }

  // The strata: the bake, drawn sunk by `sink`.
  ctx.globalAlpha = 0.5 * op
  ctx.drawImage(s.baked as CanvasImageSource, 0, -H + s.sink)
  ctx.globalAlpha = 1
}
