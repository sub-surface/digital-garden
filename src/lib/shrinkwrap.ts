import { prepare, shrinkWrap, fontOf, clearMeasureCache, type Prepared } from "./textlayout"

/**
 * Even lines for short set-apart text (epigraphs, pull quotes).
 *
 * A quote that wraps to two lines at its box width often leaves one word on
 * the second. This works out, without touching layout, the narrowest width
 * that keeps the same number of lines (textlayout.shrinkWrap), and caps the
 * text's own blocks at it, so the lines come out even. The box keeps its
 * width (and its rules); only the text inside hugs.
 *
 * The box's width arrives from a ResizeObserver (no layout reads), the text
 * and font are read once. Returns a cleanup.
 */
const SLACK = 1.02 // canvas and the browser can differ by a hair (kerning, rounding)

let fontsReady: Promise<unknown> | null = null
function whenFonts(): Promise<unknown> {
  if (!fontsReady) {
    fontsReady = (document.fonts?.ready ?? Promise.resolve()).then(() => clearMeasureCache())
  }
  return fontsReady
}

export function hugText(box: HTMLElement, text: HTMLElement = box): () => void {
  if (typeof ResizeObserver === "undefined") return () => {}
  // Cap the text blocks, never the observed box: a capped box would stop
  // reporting the room it really has when the viewport grows.
  let targets = Array.from(text.querySelectorAll<HTMLElement>("p")).filter((p) => p.textContent?.trim())
  if (!targets.length) {
    if (text === box) {
      const span = document.createElement("span")
      span.className = "hug"
      span.style.display = "block"
      span.append(...Array.from(box.childNodes))
      box.append(span)
      text = span
    }
    targets = [text]
  }
  let prepared: Prepared[] | null = null
  let width = 0
  let cancelled = false

  const apply = () => {
    if (cancelled || !width) return
    prepared ??= targets.map((el) => prepare(el.textContent ?? "", fontOf(el)))
    prepared.forEach((p, i) => {
      const tight = shrinkWrap(p, width)
      if (tight > 0 && tight * SLACK + 1 < width) targets[i].style.maxWidth = `${Math.ceil(tight * SLACK) + 1}px`
      else targets[i].style.removeProperty("max-width")
    })
  }

  const ro = new ResizeObserver((entries) => {
    width = entries[0]?.contentRect.width ?? 0
    void whenFonts().then(apply)
  })
  ro.observe(box)
  return () => {
    cancelled = true
    ro.disconnect()
    targets.forEach((el) => el.style.removeProperty("max-width"))
  }
}

/** Hug every pull quote under `root` (they arrive as raw HTML). */
export function hugPullquotes(root: HTMLElement): () => void {
  const undo = Array.from(root.querySelectorAll<HTMLElement>(".pullquote")).map((q) => hugText(q))
  return () => undo.forEach((f) => f())
}
