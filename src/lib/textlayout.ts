/**
 * Text layout without the DOM.
 *
 * Measure each word once with canvas, then break lines with arithmetic: no
 * reflow, no hidden elements, no reading layout back. This is the idea behind
 * chenglou/pretext, cut down to what the garden needs: English, our own
 * self-hosted fonts at known sizes, `white-space: normal`. (Pretext's extra
 * weight is other scripts, bidi, emoji and per-browser quirks.)
 *
 *   const p = prepare("The universe, which others call the Library…", "italic 18px 'IBM Plex Sans'")
 *   lineCount(p, 320)          // how many lines at 320px
 *   layoutLines(p, 320)        // the lines themselves
 *   shrinkWrap(p, 320)         // the narrowest width that still needs no more lines
 *   layoutLines(p, (i) => …)   // a different width per line (text around a shape)
 *
 * Line-break opportunities: whitespace, and after a hyphen or dash inside a
 * word. Kerning across a space is ignored (it is ~0 for these fonts); callers
 * that must agree with the browser to the pixel add a little slack.
 *
 * Fonts: measure only after the web font has loaded (`document.fonts.ready`),
 * then call `clearMeasureCache()` if anything was measured before.
 */

export type MeasureFn = (text: string, font: string) => number

export interface Prepared {
  font: string
  /** The pieces between break opportunities. */
  words: string[]
  widths: Float64Array
  /** 1 when a space precedes the word (0 after a hyphen break, or the first word). */
  spaceBefore: Uint8Array
  space: number
}

export interface Line {
  /** Word indices [start, end). */
  start: number
  end: number
  /** Natural width, without trailing space. */
  width: number
  text: string
}

let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

function canvasMeasure(text: string, font: string): number {
  if (!ctx) {
    ctx = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(1, 1).getContext("2d")
      : document.createElement("canvas").getContext("2d")
  }
  if (!ctx) return text.length * 8
  if (ctx.font !== font) ctx.font = font
  return ctx.measureText(text).width
}

let measureImpl: MeasureFn = canvasMeasure

/** Swap the measurer (tests run without a canvas). */
export function setMeasure(fn: MeasureFn | null): void {
  measureImpl = fn ?? canvasMeasure
  cache.clear()
}

/** Width of a string in a font, cached. */
export function measure(text: string, font: string): number {
  const key = font + "\u0000" + text
  let w = cache.get(key)
  if (w === undefined) {
    w = measureImpl(text, font)
    if (cache.size > 20_000) cache.clear()
    cache.set(key, w)
  }
  return w
}

/** Forget measured widths: call after a web font finishes loading. */
export function clearMeasureCache(): void {
  cache.clear()
}

// A hyphen or dash followed by a letter is a break opportunity ("well-|known").
const HYPHEN_BREAK = /(?<=[\p{L}\p{N}][-‐–—])(?=\p{L})/u

export function prepare(text: string, font: string): Prepared {
  const words: string[] = []
  const space: number[] = []
  for (const chunk of text.split(/\s+/)) {
    if (!chunk) continue
    const parts = chunk.split(HYPHEN_BREAK)
    for (let i = 0; i < parts.length; i++) {
      words.push(parts[i])
      space.push(i === 0 && words.length > 1 ? 1 : 0)
    }
  }
  const widths = new Float64Array(words.length)
  for (let i = 0; i < words.length; i++) widths[i] = measure(words[i], font)
  return { font, words, widths, spaceBefore: Uint8Array.from(space), space: measure(" ", font) }
}

type Width = number | ((line: number) => number)

/**
 * Greedy line breaking (what browsers do for `text-wrap: wrap`). Calls
 * `onLine(start, end, width)` per line and returns the line count. A word
 * wider than the line gets a line of its own and overflows.
 */
export function walkLines(p: Prepared, maxWidth: Width, onLine?: (start: number, end: number, width: number) => void): number {
  const n = p.words.length
  let lines = 0
  let i = 0
  while (i < n) {
    const limit = typeof maxWidth === "number" ? maxWidth : maxWidth(lines)
    let w = p.widths[i]
    let j = i + 1
    while (j < n) {
      const next = w + (p.spaceBefore[j] ? p.space : 0) + p.widths[j]
      if (next > limit) break
      w = next
      j++
    }
    onLine?.(i, j, w)
    lines++
    i = j
  }
  return lines
}

export function lineCount(p: Prepared, maxWidth: Width): number {
  return walkLines(p, maxWidth)
}

export function layoutLines(p: Prepared, maxWidth: Width): Line[] {
  const out: Line[] = []
  walkLines(p, maxWidth, (start, end, width) => {
    out.push({ start, end, width, text: lineText(p, start, end) })
  })
  return out
}

export function lineText(p: Prepared, start: number, end: number): string {
  let s = ""
  for (let k = start; k < end; k++) s += (k > start && p.spaceBefore[k] ? " " : "") + p.words[k]
  return s
}

/** The widest line at `maxWidth`. */
export function maxLineWidth(p: Prepared, maxWidth: number): number {
  let m = 0
  walkLines(p, maxWidth, (_s, _e, w) => { if (w > m) m = w })
  return m
}

/**
 * The narrowest width at which the text still takes no more lines than it
 * does at `maxWidth`: lines come out even instead of one long and one short
 * (a box that hugs its text, which `text-wrap: balance` alone can't do).
 * Binary search on the line count, then snap to the widest line.
 */
export function shrinkWrap(p: Prepared, maxWidth: number): number {
  if (!p.words.length) return 0
  const target = lineCount(p, maxWidth)
  let lo = 0
  for (let k = 0; k < p.widths.length; k++) if (p.widths[k] > lo) lo = p.widths[k]
  let hi = maxWidth
  if (lo >= hi) return maxLineWidth(p, maxWidth)
  for (let iter = 0; iter < 24 && hi - lo > 0.5; iter++) {
    const mid = (lo + hi) / 2
    if (lineCount(p, mid) <= target) hi = mid
    else lo = mid
  }
  return maxLineWidth(p, hi)
}

/**
 * Word x-offsets for a justified line (the last line of a paragraph is set
 * ragged, as in print). Returns the left edge of each word in the line.
 */
export function justify(p: Prepared, line: Pick<Line, "start" | "end" | "width">, width: number, last = false): number[] {
  const xs: number[] = []
  let gaps = 0
  for (let k = line.start + 1; k < line.end; k++) if (p.spaceBefore[k]) gaps++
  const extra = !last && gaps > 0 ? (width - line.width) / gaps : 0
  let x = 0
  for (let k = line.start; k < line.end; k++) {
    if (k > line.start && p.spaceBefore[k]) x += p.space + extra
    xs.push(x)
    x += p.widths[k]
  }
  return xs
}

/** A CSS `font` shorthand for an element (read once, not per frame). */
export function fontOf(el: Element): string {
  const s = getComputedStyle(el)
  return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
}
