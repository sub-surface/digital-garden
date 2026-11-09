import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { perState, FONT } from "./scratch"
import { currentText } from "./corpus"
import { prepare, layoutLines, measure } from "@/lib/textlayout"

// ── Teletype background ──
// The margins, typed out far back. The note's sidenotes (or, without any,
// its paragraphs) come off a slow teleprinter on a strip of paper: a header,
// the text a character at a time, the carriage returning, the paper feeding
// up. Now and then it strikes a wrong key, pauses, backs up and corrects it.
//
// Lines are broken ahead of time off-DOM (lib/textlayout), so the carriage
// knows where every line ends before it types it.

interface Scene {
  lines: string[]
  /** Index of the line being typed, and characters typed into it. */
  li: number
  ci: number
  /** The text as actually printed (including a pending typo). */
  printed: string[]
  typo: { at: number; wrong: string; phase: "shown" | "erased" } | null
  scroll: number
  debt: number
  queue: string[]
  item: number
  slug: string
  last: number
  pause: number
}

const KEYS = "qwertyuiopasdfghjklzxcvbnm"
const scene = perState<Scene>(() => ({ lines: [], li: 0, ci: 0, printed: [], typo: null, scroll: 0, debt: 0, queue: [], item: 0, slug: "\u0000", last: performance.now() / 1000, pause: 0 }))

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"]

function feed(s: Scene, state: BgState, width: number, font: string) {
  const text = currentText(state.slug)
  if (text.slug !== s.slug) { s.slug = text.slug; s.item = 0 }
  const items = text.sidenotes.length ? text.sidenotes : text.paragraphs
  const i = s.item++ % items.length
  const kind = text.sidenotes.length ? `SIDENOTE ${ROMAN[i] ?? i + 1}` : `¶ ${i + 1}`
  const header = `${kind} · ${text.title.toUpperCase()}`.slice(0, 60)
  const body = layoutLines(prepare(items[i].slice(0, 700), font), width).map((l) => l.text)
  s.queue.push("", header, "", ...body, "", "— — —")
}

export function drawTeletype(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.teletype
  if (!p) return
  const s = scene(state)
  const now = performance.now() / 1000
  const dt = Math.min(0.1, now - s.last)
  s.last = now
  const size = p.size ?? 13
  const font = `${size}px ${FONT.mono}`
  const lh = Math.round(size * 1.5)
  const width = Math.min(state.w * 0.42, size * 0.6 * 64)
  const x0 = state.w <= 700 ? (state.w - width) / 2 : state.w - width - state.w * 0.06
  const op = (p.opacity ?? 0.45) * state.readerAlpha
  const ink = state.colorCache.text

  // Typing
  if (s.pause > 0) s.pause -= dt
  else s.debt += dt * (p.speed ?? 14)
  while (s.debt >= 1) {
    s.debt -= 1
    if (s.li >= s.lines.length) {
      if (!s.queue.length) feed(s, state, width, font)
      s.lines.push(s.queue.shift() ?? "")
      s.printed.push("")
    }
    const line = s.lines[s.li]
    if (s.typo) {
      // Mis-struck: show it, pause, back it out, then carry on
      if (s.typo.phase === "shown") { s.typo.phase = "erased"; s.printed[s.li] = s.printed[s.li].slice(0, -1); s.pause = 0.25; break }
      s.typo = null
    }
    if (s.ci < line.length) {
      const ch = line[s.ci]
      if (/[a-z]/.test(ch) && Math.random() < 0.012) {
        s.typo = { at: s.ci, wrong: KEYS[Math.floor(Math.random() * KEYS.length)], phase: "shown" }
        s.printed[s.li] += s.typo.wrong
        s.pause = 0.45
        break
      }
      s.printed[s.li] += ch
      s.ci++
    } else {
      // Carriage return, line feed
      s.li++
      s.ci = 0
      s.pause = 0.12
      break
    }
  }

  // Paper feed: keep the typing line two-thirds of the way down
  const rows = Math.floor((state.h * 0.66) / lh)
  const target = Math.max(0, s.li - rows) * lh
  s.scroll += (target - s.scroll) * Math.min(1, dt * 4)
  // Forget what has scrolled well off the top
  const drop = Math.floor(s.scroll / lh) - 4
  if (drop > 0) {
    s.lines.splice(0, drop); s.printed.splice(0, drop)
    s.li -= drop; s.scroll -= drop * lh
  }

  ctx.font = font
  ctx.fillStyle = ink
  ctx.textBaseline = "alphabetic"
  const top = state.h * 0.1
  for (let i = 0; i < s.printed.length; i++) {
    const y = top + i * lh - s.scroll
    if (y < -lh || y > state.h + lh) continue
    // Older lines fade as the paper rises
    const fade = Math.max(0, Math.min(1, y / (state.h * 0.35)))
    ctx.globalAlpha = 0.17 * op * (0.25 + 0.75 * fade)
    ctx.fillText(s.printed[i], x0, y)
  }
  // The print head
  const yHead = top + s.li * lh - s.scroll
  const xHead = x0 + measure(s.printed[s.li] ?? "", font)
  ctx.globalAlpha = (0.5 + 0.5 * Math.sin(now * 6)) * 0.3 * op
  ctx.fillRect(xHead + 1, yHead - size * 0.8, size * 0.55, size)
  ctx.globalAlpha = 1
}
