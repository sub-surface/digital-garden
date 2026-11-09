import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { simplex } from "./simplex"
import { perState, FONT } from "./scratch"
import { currentText } from "./corpus"
import { prepare, layoutLines, measure } from "@/lib/textlayout"

// ── Prose background ──
// A passage from the note you're reading, set as a faint block of type. It
// holds, then the letters lift off and drift on a slow current, then gather
// into the next passage. The cursor parts them like breath on a page.
//
// Every glyph has a home: the layout is done once per passage off the DOM
// (lib/textlayout), each letter's x from the measured width of the word up
// to it. Glyphs are reused between passages (letter i of one becomes letter
// i of the next), so the text visibly re-forms rather than cutting.

interface Glyph {
  ch: string
  x: number; y: number
  vx: number; vy: number
  hx: number; hy: number
  /** 0..1: fades in when a passage has more letters than the last. */
  a: number
  live: boolean
}

interface Scene {
  glyphs: Glyph[]
  phase: "gather" | "hold" | "scatter"
  since: number
  para: number
  slug: string
  last: number
}

const GATHER = 3.2
const SCATTER = 7
const MAX_CHARS = 520

const scene = perState<Scene>(() => ({ glyphs: [], phase: "scatter", since: -1e9, para: -1, slug: "\u0000", last: performance.now() / 1000 }))

function trimToSentence(t: string): string {
  if (t.length <= MAX_CHARS) return t
  const cut = t.slice(0, MAX_CHARS)
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "))
  return end > 160 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…"
}

function setPassage(s: Scene, state: BgState, size: number) {
  const text = currentText(state.slug)
  if (text.slug !== s.slug) { s.slug = text.slug; s.para = -1 }
  s.para = (s.para + 1) % text.paragraphs.length
  const passage = trimToSentence(text.paragraphs[s.para])
  const font = `${size}px ${FONT.serif}`
  const width = Math.min(state.w * 0.66, size * 34)
  const lh = size * 1.55
  const prep = prepare(passage, font)
  const lines = layoutLines(prep, width)
  const x0 = (state.w - width) / 2
  const y0 = (state.h - lines.length * lh) / 2 + size
  const homes: { ch: string; x: number; y: number }[] = []
  lines.forEach((ln, li) => {
    let x = x0
    for (let k = ln.start; k < ln.end; k++) {
      if (k > ln.start && prep.spaceBefore[k]) x += prep.space
      const word = prep.words[k]
      for (let c = 0; c < word.length; c++) homes.push({ ch: word[c], x: x + measure(word.slice(0, c), font), y: y0 + li * lh })
      x += prep.widths[k]
    }
  })
  homes.forEach((h, i) => {
    let g = s.glyphs[i]
    if (!g) {
      g = { ch: h.ch, x: Math.random() * state.w, y: state.h + 20, vx: 0, vy: 0, hx: h.x, hy: h.y, a: 0, live: true }
      s.glyphs[i] = g
    }
    g.ch = h.ch; g.hx = h.x; g.hy = h.y; g.live = true
  })
  for (let i = homes.length; i < s.glyphs.length; i++) s.glyphs[i].live = false
}

export function drawProse(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.prose
  if (!p) return
  const s = scene(state)
  const now = performance.now() / 1000
  const dt = Math.min(0.05, now - s.last)
  s.last = now
  const size = p.size ?? 15
  const hold = p.hold ?? 14
  const drift = p.drift ?? 1
  const op = (p.opacity ?? 0.5) * state.readerAlpha

  const age = now - s.since
  if (s.phase === "scatter" && age > SCATTER) { setPassage(s, state, size); s.phase = "gather"; s.since = now }
  else if (s.phase === "gather" && age > GATHER) { s.phase = "hold"; s.since = now }
  else if (s.phase === "hold" && age > hold) { s.phase = "scatter"; s.since = now }
  // A new note: let this passage go and bring that one in.
  if (s.phase !== "scatter" && currentText(state.slug).slug !== s.slug) { s.phase = "scatter"; s.since = now - SCATTER * 0.75 }

  const k = 1 - Math.pow(0.02, dt) // spring pull toward home
  const flow = 38 * drift
  const mx = state.mx, my = state.my
  ctx.font = `${size}px ${FONT.serif}`
  ctx.fillStyle = state.colorCache.text
  ctx.textBaseline = "alphabetic"

  // Batch by alpha step: a few hundred fillText calls, few state changes.
  for (const g of s.glyphs) {
    if (s.phase === "scatter" || !g.live) {
      // Ride a slow curl of noise, rising a little, like ash
      const a = simplex(g.x * 0.004, g.y * 0.004 + now * 0.07) * Math.PI * 2
      g.vx += (Math.cos(a) * flow - g.vx) * dt * 1.4
      g.vy += (Math.sin(a) * flow - 14 * drift - g.vy) * dt * 1.4
      g.x += g.vx * dt
      g.y += g.vy * dt
      g.a = Math.max(g.live ? 0.35 : 0, g.a - dt * (g.live ? 0.25 : 0.6))
    } else {
      const pull = s.phase === "gather" ? k * Math.min(1, (now - s.since) / 1.2) : k
      g.x += (g.hx - g.x) * pull
      g.y += (g.hy - g.y) * pull
      g.vx = g.vy = 0
      g.a = Math.min(1, g.a + dt * 0.8)
    }
    // The cursor parts the letters
    const dx = g.x - mx, dy = g.y - my
    const d2 = dx * dx + dy * dy
    if (d2 < 6400 && d2 > 1) {
      const f = (1 - Math.sqrt(d2) / 80) * 3
      g.x += (dx / Math.sqrt(d2)) * f
      g.y += (dy / Math.sqrt(d2)) * f
    }
    if (g.a <= 0.01) continue
    ctx.globalAlpha = 0.16 * g.a * op
    ctx.fillText(g.ch, g.x, g.y)
  }
  // Retire fully faded extras
  while (s.glyphs.length && !s.glyphs[s.glyphs.length - 1].live && s.glyphs[s.glyphs.length - 1].a <= 0.01) s.glyphs.pop()
  ctx.globalAlpha = 1
}
