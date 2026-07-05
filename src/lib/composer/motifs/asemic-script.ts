/**
 * asemic-script — rows of invented glyphs that read as a real writing system.
 * A coherent ~28-letter stroke alphabet is synthesised once *per plate seed*
 * (via ctx.plateSeed) and reused across every asemic block, so the script looks
 * like language rather than noise — the detail that most sells "ancient
 * document". Words repeat with spaces; the last line runs ragged.
 */

import type { MotifDef, MotifGen, Prim, Anchor, Rng } from "../types"
import { mulberry32, hashStr } from "../rng"

type Glyph = [number, number][][] // strokes, each a polyline in a 0..1 em box

function buildAlphabet(rng: Rng): Glyph[] {
  const glyphs: Glyph[] = []
  const clamp = (v: number) => Math.max(0.05, Math.min(0.95, v))
  for (let g = 0; g < 28; g++) {
    const strokes: Glyph = []
    const nStrokes = 1 + Math.floor(rng() * 3)
    for (let s = 0; s < nStrokes; s++) {
      const segs = 1 + Math.floor(rng() * 3)
      let x = 0.1 + rng() * 0.8
      let y = 0.1 + rng() * 0.8
      const stroke: [number, number][] = [[x, y]]
      for (let seg = 0; seg < segs; seg++) {
        x = clamp(x + (rng() - 0.5) * 0.7)
        y = clamp(y + (rng() - 0.5) * 0.95)
        stroke.push([x, y])
      }
      strokes.push(stroke)
    }
    glyphs.push(strokes)
  }
  return glyphs
}

const gen: MotifGen = (rng, box, params, ctx) => {
  const prims: Prim[] = []
  const short = Math.min(box.w, box.h)
  const lineH = short * (0.07 / ((params.density as number) ?? 1))
  const glyphW = lineH * 0.62
  const gap = glyphW * 0.4
  const pen = ctx.penRole

  const alphabet = buildAlphabet(mulberry32(hashStr(`${ctx.plateSeed}:asemic-alphabet`)))

  const rows = Math.max(1, Math.floor(box.h / lineH))
  for (let ry = 0; ry < rows; ry++) {
    const baseY = box.y + ry * lineH + lineH * 0.15
    const lineLen = ry === rows - 1 ? box.w * (0.3 + rng() * 0.6) : box.w * (0.9 + rng() * 0.1)
    const cols = Math.max(1, Math.floor(lineLen / (glyphW + gap)))
    for (let c = 0; c < cols; c++) {
      if (rng() < 0.08) continue // word spaces
      const gx = box.x + c * (glyphW + gap)
      const glyph = alphabet[Math.floor(rng() * alphabet.length)]
      for (const stroke of glyph) {
        const pts: [number, number][] = stroke.map(([lx, ly]) => [gx + lx * glyphW, baseY + ly * lineH * 0.7])
        prims.push({ t: "polyline", pts, pen, w: 0.7, alpha: 0.8 })
      }
    }
  }

  const anchors: Anchor[] = [{ id: "label", x: box.x, y: box.y, kind: "label" }]
  return { primitives: prims, anchors }
}

export const asemicScript: MotifDef = {
  key: "asemic-script",
  name: "Asemic script",
  classes: ["field", "margin", "caption"],
  params: [{ key: "density", label: "density", min: 0.6, max: 1.8, step: 0.05, default: 1 }],
  gen,
}
