import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { perState, FONT } from "./scratch"
import { currentText, randomText } from "./corpus"
import { prepare, layoutLines, justify } from "@/lib/textlayout"

// ── Rivers background ──
// A typographer's in-joke. Justified type in a narrow column opens "rivers":
// the word gaps of successive lines line up into white channels running down
// the page (exactly why the garden reads ragged on phones). Here the page is
// set justified on purpose, the rivers are found, and water runs down them.
//
// Layout is off-DOM (lib/textlayout), so every gap's position is known: a gap
// links to any gap on the next line it overlaps, and chains of four or more
// lines are rivers. Droplets follow the chain downward, choosing a branch
// where the river forks.

interface Gap { x0: number; x1: number; next: number[] }

interface Drop { line: number; gap: number; t: number; x: number; speed: number }

interface Scene {
  img: HTMLCanvasElement | OffscreenCanvas | null
  /** gaps[line] in page coordinates */
  gaps: Gap[][]
  /** Gaps that begin a river, as [line, gap]. */
  sources: [number, number][]
  river: Set<string>
  drops: Drop[]
  lh: number
  rows: number
  top: number
  slug: string
  built: number
  last: number
  key: string
}

const scene = perState<Scene>(() => ({ img: null, gaps: [], sources: [], river: new Set(), drops: [], lh: 0, rows: 1, top: 0, slug: "\u0000", built: 0, last: performance.now() / 1000, key: "" }))

function canvas(w: number, h: number) {
  return typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h })
}

function build(s: Scene, state: BgState, measure: number, size: number, ink: string) {
  const text = currentText(state.slug)
  s.slug = text.slug
  s.built = performance.now() / 1000
  const font = `${size}px ${FONT.serif}`
  const lh = Math.round(size * 1.35)
  const gutter = 44
  const cols = Math.max(1, Math.floor((state.w - 60 + gutter) / (measure + gutter)))
  const left = (state.w - (cols * measure + (cols - 1) * gutter)) / 2
  const rows = Math.floor((state.h - 40) / lh)
  s.lh = lh
  s.rows = rows
  s.top = Math.round((state.h - rows * lh) / 2)

  // Enough running text to fill every column: the note first, then other
  // notes (a short note looped would line its repeats up into fake rivers).
  const need = (cols * rows * measure) / (size * 0.5)
  let body = text.paragraphs.join(" ")
  for (let tries = 0; body.length < need && tries < 8; tries++) {
    const more = randomText(text.slug)
    if (more) body += " " + more.paragraphs.join(" ")
  }
  const repeats = Math.min(40, Math.max(1, Math.ceil(need / (body.length + 1))))
  const words = prepare(Array(repeats).fill(body).join(" "), font)
  const lines = layoutLines(words, measure)

  const img = canvas(Math.ceil(state.w), Math.ceil(state.h))
  const c = img.getContext("2d") as CanvasRenderingContext2D
  c.font = font
  c.fillStyle = ink
  s.gaps = []
  for (let col = 0; col < cols; col++) {
    for (let r = 0; r < rows; r++) {
      const ln = lines[col * rows + r]
      if (!ln) break
      const xs = justify(words, ln, measure)
      const x0 = left + col * (measure + gutter), y = s.top + r * lh
      const row: Gap[] = []
      for (let k = ln.start; k < ln.end; k++) {
        const i = k - ln.start
        c.fillText(words.words[k], x0 + xs[i], y + size)
        if (i > 0 && words.spaceBefore[k]) row.push({ x0: x0 + xs[i - 1] + words.widths[k - 1], x1: x0 + xs[i], next: [] })
      }
      s.gaps[col * rows + r] = row
    }
  }
  // Link each gap to the gaps it overlaps on the next line of the same column
  s.river = new Set()
  s.sources = []
  const depth = new Map<string, number>()
  for (let li = s.gaps.length - 2; li >= 0; li--) {
    if ((li + 1) % rows === 0) continue // column break
    const row = s.gaps[li], below = s.gaps[li + 1] ?? []
    row.forEach((g, gi) => {
      below.forEach((b, bi) => { if (Math.min(g.x1, b.x1) - Math.max(g.x0, b.x0) > 0.5) g.next.push(bi) })
      const d = 1 + Math.max(0, ...g.next.map((bi) => depth.get(`${li + 1}:${bi}`) ?? 0))
      depth.set(`${li}:${gi}`, d)
    })
  }
  for (const [k, d] of depth) {
    if (d < 4) continue
    const [li, gi] = k.split(":").map(Number)
    // Mark the river's gaps (for the faint channel) and its sources
    const hasParent = (s.gaps[li - 1] ?? []).some((g) => g.next.includes(gi)) && li % rows !== 0
    if (!hasParent) s.sources.push([li, gi])
    s.river.add(k)
  }
  s.img = img
  s.drops = []
}

export function drawRivers(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.rivers
  if (!p) return
  const s = scene(state)
  const now = performance.now() / 1000
  const dt = Math.min(0.05, now - s.last)
  s.last = now
  const measure = Math.round(p.measure ?? 420)
  const size = p.size ?? 14
  const op = (p.opacity ?? 0.5) * state.readerAlpha
  const key = `${measure}|${size}|${state.colorCache.text}`
  // Rebuild for a new note, new settings, or every couple of minutes (fresh text)
  if (!s.img || s.key !== key || currentText(state.slug).slug !== s.slug || now - s.built > 150) {
    s.key = key
    build(s, state, measure, size, state.colorCache.text)
  }
  if (!s.img) return

  ctx.globalAlpha = 0.09 * op
  ctx.drawImage(s.img as CanvasImageSource, 0, 0)

  // The channels, barely tinted
  const accent = state.colorCache.secondary
  ctx.fillStyle = accent
  ctx.globalAlpha = 0.05 * op
  ctx.beginPath()
  for (const k of s.river) {
    const [li, gi] = k.split(":").map(Number)
    const g = s.gaps[li][gi]
    ctx.rect(g.x0, s.top + (li % s.rows) * s.lh, g.x1 - g.x0, s.lh)
  }
  ctx.fill()

  // Water: droplets spawned at sources, running down through linked gaps
  const rows = s.rows
  if (s.sources.length && s.drops.length < 160 && Math.random() < dt * 14 * (p.flow ?? 1)) {
    const [line, gap] = s.sources[Math.floor(Math.random() * s.sources.length)]
    const g = s.gaps[line][gap]
    s.drops.push({ line, gap, t: 0, x: (g.x0 + g.x1) / 2, speed: (1.2 + Math.random()) * (p.flow ?? 1) })
  }
  ctx.strokeStyle = accent
  ctx.lineWidth = 1.2
  ctx.lineCap = "round"
  let w = 0
  for (const d of s.drops) {
    d.t += dt * d.speed
    while (d.t >= 1) {
      const g = s.gaps[d.line]?.[d.gap]
      if (!g || !g.next.length || (d.line + 1) % rows === 0) { d.line = -1; break }
      d.t -= 1
      d.gap = g.next[Math.floor(Math.random() * g.next.length)]
      d.line++
    }
    if (d.line < 0) continue
    const g = s.gaps[d.line][d.gap]
    d.x += ((g.x0 + g.x1) / 2 - d.x) * Math.min(1, dt * 6)
    const y = s.top + (d.line % rows) * s.lh + d.t * s.lh
    ctx.globalAlpha = 0.5 * op
    ctx.beginPath()
    ctx.moveTo(d.x, y - 5)
    ctx.lineTo(d.x, y)
    ctx.stroke()
    s.drops[w++] = d
  }
  s.drops.length = w
  ctx.globalAlpha = 1
}
