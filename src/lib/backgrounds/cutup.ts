import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { perState, FONT } from "./scratch"
import { currentText, randomText, sentences } from "./corpus"
import { measure } from "@/lib/textlayout"

// ── Cut-up background ──
// After Gysin and Burroughs: take sentences from around the garden, cut them
// at a word, and swap the tails. Every few seconds two lines are cut and
// their ends slide across to splice onto each other; now and then a line is
// retired and a fresh sentence takes its place. The garden starts saying
// things it never quite said.
//
// Words are positioned by measured width (lib/textlayout), so a splice is
// just new targets for the moved words; they glide there.

interface Word { text: string; w: number; x: number; y: number; tx: number; ty: number; a: number; ta: number }
interface Line { words: Word[]; source: string }

interface Scene {
  lines: Line[]
  next: number
  last: number
  cut: { x: number; y: number; at: number } | null
  font: string
}

const scene = perState<Scene>(() => ({ lines: [], next: 0, last: performance.now() / 1000, cut: null, font: "" }))

/** A sentence not already on the page (a short note has only a few). */
function pickSentence(s: Scene, state: BgState): string {
  const shown = new Set(s.lines.map((l) => l.source))
  let pick = ""
  for (let tries = 0; tries < 10; tries++) {
    const t = Math.random() < 0.35 ? currentText(state.slug) : randomText() ?? currentText(state.slug)
    const all = sentences(t.paragraphs.join(" "))
    pick = all.length ? all[Math.floor(Math.random() * all.length)] : t.paragraphs[0].slice(0, 120)
    if (!shown.has(pick)) break
  }
  return pick
}

function place(s: Scene, state: BgState, size: number) {
  const lh = size * 2
  const y0 = (state.h - s.lines.length * lh) / 2 + size
  s.lines.forEach((ln, i) => {
    const sp = measure(" ", s.font)
    let total = 0
    for (const w of ln.words) total += w.w + sp
    // Narrow screens: a line that won't fit loses words off its end.
    while (total > state.w * 0.9 && ln.words.length > 3) total -= ln.words.pop()!.w + sp
    let x = (state.w - total + sp) / 2
    for (const w of ln.words) {
      w.tx = x
      w.ty = y0 + i * lh
      x += w.w + sp
    }
  })
}

function makeLine(s: Scene, state: BgState): Line {
  const source = pickSentence(s, state)
  return {
    source,
    words: source.split(/\s+/).filter(Boolean).slice(0, 18).map((text) => ({
      text, w: measure(text, s.font), x: state.w / 2, y: state.h / 2, tx: 0, ty: 0, a: 0, ta: 1,
    })),
  }
}

export function drawCutup(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.cutup
  if (!p) return
  const s = scene(state)
  const now = performance.now() / 1000
  const dt = Math.min(0.05, now - s.last)
  s.last = now
  const size = p.size ?? 16
  const want = Math.max(2, Math.round(p.lines ?? 9))
  const op = (p.opacity ?? 0.5) * state.readerAlpha
  const font = `${size}px ${FONT.mono}`
  if (font !== s.font) { s.font = font; s.lines = [] }

  if (s.lines.length !== want) {
    while (s.lines.length < want) {
      const ln = makeLine(s, state)
      s.lines.push(ln)
    }
    s.lines.length = want
    place(s, state, size)
    for (const ln of s.lines) for (const w of ln.words) { w.x = w.tx; w.y = w.ty }
  }

  if (now >= s.next) {
    s.next = now + (p.interval ?? 3.5)
    if (Math.random() < 0.18) {
      // Retire a line: its words fade, a new sentence fades in.
      const i = Math.floor(Math.random() * s.lines.length)
      const fresh = makeLine(s, state)
      for (const w of fresh.words) w.a = 0
      s.lines[i] = fresh
      place(s, state, size)
      for (const w of fresh.words) { w.x = w.tx; w.y = w.ty }
    } else {
      // Cut two lines and swap their tails. Long lines are cut first.
      const order = s.lines.map((_, i) => i).sort((a, b) => s.lines[b].words.length - s.lines[a].words.length + (Math.random() - 0.5) * 8)
      const [i, j] = order
      const A = s.lines[i].words, B = s.lines[j].words
      const ca = 1 + Math.floor(Math.random() * Math.max(1, A.length - 2))
      const cb = 1 + Math.floor(Math.random() * Math.max(1, B.length - 2))
      const cutWord = A[ca]
      if (cutWord) s.cut = { x: cutWord.x - 4, y: cutWord.y, at: now }
      const tailA = A.splice(ca), tailB = B.splice(cb)
      A.push(...tailB)
      B.push(...tailA)
      // Keep lines from running off the page
      for (const L of [A, B]) if (L.length > 20) L.length = 20
      place(s, state, size)
    }
  }

  ctx.font = font
  ctx.fillStyle = state.colorCache.text
  ctx.textBaseline = "alphabetic"
  const e = 1 - Math.pow(0.04, dt)
  for (const ln of s.lines) {
    for (const w of ln.words) {
      w.x += (w.tx - w.x) * e
      w.y += (w.ty - w.y) * e
      w.a += (w.ta - w.a) * e * 0.6
      ctx.globalAlpha = 0.17 * w.a * op
      ctx.fillText(w.text, w.x, w.y)
    }
  }

  // The cut: a hairline where the blade went through, fading
  if (s.cut && now - s.cut.at < 1.2) {
    const k = 1 - (now - s.cut.at) / 1.2
    ctx.strokeStyle = state.colorCache.secondary
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.5 * k * op
    ctx.beginPath()
    ctx.moveTo(s.cut.x, s.cut.y - size * 1.1)
    ctx.lineTo(s.cut.x, s.cut.y + size * 0.4)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}
