import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { perState, FONT, rng } from "./scratch"
import { currentText } from "./corpus"
import { loadSearchIndexPayload } from "@/hooks/useContentSearch"

// ── Concordance background ──
// Every word in the garden as a star, brighter the more it's used (from the
// search index the prompt already builds). Words from the note you're
// reading burn in the accent colour. Hover a star and its word appears,
// joined to the words it keeps company with, the ones sharing the most notes
// with it: a constellation the writing drew without meaning to.

interface Star {
  word: string
  x: number; y: number
  mag: number // 0..1, log frequency
  notes: Set<number>
  phase: number
}

interface Scene {
  stars: Star[] | null
  loading: boolean
  want: number
  hover: { star: Star; links: Star[] } | null
  local: Set<string>
  slug: string
}

const STOP = new Set(("about above after again against all also although always among another any are around because been before being below between both but can could did does doing done down during each either even ever every few from further had has have having here hers herself him himself his how however into its itself just least less like made make many may might more most much must near neither never none nor not now off once one only onto other others otherwise our ours ourselves out over own perhaps rather same seem seems several shall she should since some such than that the their theirs them themselves then there therefore these they this those though through thus till too toward towards under until upon very was were what whatever when where whether which while who whom whose why will with within without would yet you your yours yourself also into well back still something nothing thing things https http www com")
  .split(" "))

const scene = perState<Scene>(() => ({ stars: null, loading: false, want: 0, hover: null, local: new Set(), slug: "\u0000" }))

function build(s: Scene, state: BgState, count: number) {
  s.loading = true
  void loadSearchIndexPayload().then((data) => {
    s.loading = false
    if (!data) return
    const ranked = Object.entries(data.index)
      .filter(([w]) => w.length > 3 && /^[a-z][a-z'-]*$/.test(w) && !STOP.has(w))
      .map(([word, post]) => {
        let total = 0
        const notes = new Set<number>()
        for (let i = 0; i < post.length; i += 2) { notes.add(post[i]); total += post[i + 1] }
        return { word, total, notes }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, count)
    const max = Math.log(1 + (ranked[0]?.total ?? 1))
    s.stars = ranked.map(({ word, total, notes }) => {
      // Positions hashed from the word, so the sky is the same every visit
      let h = 2166136261
      for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619)
      const r = rng(h)
      return { word, notes, x: r() * state.w, y: r() * state.h, mag: Math.log(1 + total) / max, phase: r() * 6.28 }
    })
    s.want = count
  })
}

export function drawConcordance(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.concordance
  if (!p) return
  const s = scene(state)
  const count = Math.round(p.stars ?? 700)
  if (!s.loading && (!s.stars || s.want !== count)) build(s, state, count)
  if (!s.stars) return
  const now = performance.now() / 1000
  const op = (p.opacity ?? 0.6) * state.readerAlpha
  const tw = p.twinkle ?? 1
  const ink = state.colorCache.text
  const accent = state.colorCache.secondary

  // The words of the note being read
  const text = currentText(state.slug)
  if (text.slug !== s.slug) {
    s.slug = text.slug
    s.local = new Set(text.paragraphs.join(" ").toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [])
  }

  // Hover: the nearest star within reach, and its company
  let near: Star | null = null, best = 22 * 22
  for (const st of s.stars) {
    const d = (st.x - state.mx) ** 2 + (st.y - state.my) ** 2
    if (d < best) { best = d; near = st }
  }
  if (near && s.hover?.star !== near) {
    const links = s.stars
      .filter((o) => o !== near)
      .map((o) => { let n = 0; for (const id of o.notes) if (near!.notes.has(id)) n++; return { o, n } })
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
      .filter((l) => l.n > 0)
      .map((l) => l.o)
    s.hover = { star: near, links }
  } else if (!near) s.hover = null

  // Stars, batched by kind
  const plain = new Path2D(), lit = new Path2D()
  for (const st of s.stars) {
    const r = 0.5 + st.mag * 1.6
    const path = s.local.has(st.word) ? lit : plain
    path.moveTo(st.x + r, st.y)
    path.arc(st.x, st.y, r, 0, Math.PI * 2)
  }
  ctx.fillStyle = ink
  ctx.globalAlpha = 0.35 * op * (1 - 0.15 * tw * (0.5 + 0.5 * Math.sin(now * 0.7)))
  ctx.fill(plain)
  ctx.fillStyle = accent
  ctx.globalAlpha = 0.6 * op
  ctx.fill(lit)

  // A few bright ones twinkle individually
  if (tw > 0) {
    ctx.fillStyle = ink
    for (let i = 0; i < Math.min(40, s.stars.length); i++) {
      const st = s.stars[i]
      const k = 0.5 + 0.5 * Math.sin(now * (0.8 + (i % 5) * 0.23) * tw + st.phase)
      ctx.globalAlpha = 0.35 * k * op
      ctx.beginPath()
      ctx.arc(st.x, st.y, 1.2 + st.mag * 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // The constellation
  if (s.hover) {
    const { star, links } = s.hover
    ctx.strokeStyle = accent
    ctx.lineWidth = 0.8
    ctx.globalAlpha = 0.35 * op
    ctx.beginPath()
    for (const l of links) { ctx.moveTo(star.x, star.y); ctx.lineTo(l.x, l.y) }
    ctx.stroke()
    ctx.font = `10px ${FONT.mono}`
    ctx.fillStyle = ink
    ctx.textBaseline = "middle"
    ctx.globalAlpha = 0.7 * op
    ctx.fillText(star.word, star.x + 8, star.y)
    ctx.globalAlpha = 0.4 * op
    for (const l of links) ctx.fillText(l.word, l.x + 6, l.y)
    ctx.textBaseline = "alphabetic"
  }
  ctx.globalAlpha = 1
}
