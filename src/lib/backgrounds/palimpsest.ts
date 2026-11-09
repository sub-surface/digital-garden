import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { perState, FONT } from "./scratch"
import { currentText, randomText, type NoteText } from "./corpus"
import { prepare, layoutLines, justify } from "@/lib/textlayout"

// ── Palimpsest background ──
// Vellum was scraped and written over; the old text never quite leaves. Here
// passages from around the garden (the current note among them) are inked
// line by line at a slight angle, held, then scraped back to a ghost that
// lingers under the next writing. Each layer sits at its own angle and
// offset, so the ghosts cross.
//
// A layer is typeset once (justified, off-DOM) into its own offscreen canvas;
// the reveal is a clip that grows line by line, so a frame is a few drawImages.

interface Layer {
  img: HTMLCanvasElement | OffscreenCanvas
  lines: number
  lh: number
  width: number
  x: number; y: number; rot: number
  born: number
  /** Seconds to write it out. */
  write: number
}

interface Scene {
  layers: Layer[]
  next: number
  last: string
}

const scene = perState<Scene>(() => ({ layers: [], next: 0, last: "" }))

function canvas(w: number, h: number) {
  return typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h })
}

function typeset(text: NoteText, state: BgState, size: number, ink: string, older: boolean): Layer {
  const para = text.paragraphs[Math.floor(Math.random() * text.paragraphs.length)]
  const passage = para.length > 900 ? para.slice(0, 900).replace(/\s+\S*$/, "") : para
  const font = `${older ? "italic " : ""}${size}px ${older ? FONT.serif : FONT.sans}`
  const width = Math.round(Math.min(state.w * 0.7, size * 38))
  const lh = Math.round(size * 1.5)
  const prep = prepare(passage, font)
  const lines = layoutLines(prep, width)
  const img = canvas(width + 4, lines.length * lh + size)
  const c = img.getContext("2d") as CanvasRenderingContext2D
  c.font = font
  c.fillStyle = ink
  c.textBaseline = "alphabetic"
  lines.forEach((ln, i) => {
    const xs = justify(prep, ln, width, i === lines.length - 1)
    for (let k = ln.start; k < ln.end; k++) c.fillText(prep.words[k], xs[k - ln.start], size + i * lh)
  })
  const h = lines.length * lh
  return {
    img, lines: lines.length, lh, width,
    x: state.w * (0.15 + Math.random() * 0.2) + (Math.random() - 0.5) * 60,
    y: Math.max(20, (state.h - h) * (0.2 + Math.random() * 0.6)),
    rot: (Math.random() - 0.5) * 0.12,
    born: performance.now() / 1000,
    write: lines.length * 1.6,
  }
}

export function drawPalimpsest(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.palimpsest
  if (!p) return
  const s = scene(state)
  const now = performance.now() / 1000
  const speed = p.speed ?? 1
  const size = p.size ?? 17
  const maxLayers = Math.max(1, Math.round(p.layers ?? 3))
  const op = (p.opacity ?? 0.5) * state.readerAlpha

  if (now >= s.next) {
    // Half the time the note you're reading, otherwise somewhere else in the garden.
    const here = currentText(state.slug)
    const text = Math.random() < 0.5 || !s.layers.length ? here : randomText(s.last) ?? here
    s.last = text.slug
    s.layers.push(typeset(text, state, size, state.colorCache.text, s.layers.length > 0 && Math.random() < 0.6))
    while (s.layers.length > maxLayers + 1) s.layers.shift()
    const newest = s.layers[s.layers.length - 1]
    s.next = now + (newest.write + 12) / speed
  }

  const n = s.layers.length
  s.layers.forEach((L, i) => {
    const age = (now - L.born) * speed
    const top = i === n - 1
    // Newest: written in at full ink. Older: scraped back to a ghost, the
    // oldest fading out entirely.
    const depth = n - 1 - i
    const target = top ? 1 : depth >= maxLayers ? 0 : 0.32 / depth
    const scraped = top ? 1 : Math.max(target, 1 - (age - L.write - 12) / 6)
    const alpha = Math.min(1, scraped) * op * 0.2
    if (alpha < 0.002) return
    ctx.save()
    ctx.translate(L.x, L.y)
    ctx.rotate(L.rot)
    ctx.globalAlpha = alpha
    if (top && age < L.write) {
      // The reveal: whole lines written, the current one partway across
      const done = (age / L.write) * L.lines
      const full = Math.floor(done)
      ctx.beginPath()
      ctx.rect(0, 0, L.width + 4, full * L.lh + 4)
      ctx.rect(0, full * L.lh + 4, (done - full) * (L.width + 4), L.lh + size)
      ctx.clip()
    }
    ctx.drawImage(L.img as CanvasImageSource, 0, 0)
    ctx.restore()
  })
  ctx.globalAlpha = 1
}
