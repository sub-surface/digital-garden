import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"

export const GLYPH_POOL =
  "░▒▓█─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬■□●○◘▄▀▌▐«»¶§±≡≈∞ΩαβπΣφψχρλμνξ♠♣♥♦☺☻♪♫►◄▲▼◇◆◈✦✧⋆∂∆∅∈∝⟨⟩⊕⊗⊙↑↗→↘↓↙←↖⁰¹²³⁴⁵⁶⁷⁸⁹αβγδεζηθ"

// ── Isometric background ──
// Faint wireframe cubes rotating slowly about Y, orthographically projected;
// some carry a glyph column. Cursor parallax: deeper cubes shift less.
export function drawIsometric(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds.isometric
  const W = state.w, H = state.h
  const now = performance.now() / 1000
  const spinScale = p?.spin ?? 1
  const parallax = p?.parallax ?? 1
  const op = p?.opacity ?? 1
  const pen = state.colorCache.secondary
  const cubeCount = Math.round(p?.count ?? 10)

  if (state.cubes.length !== cubeCount) {
    state.cubes = Array.from({ length: cubeCount }, (_, i) => ({
      x: ((i * 0.618) % 1) * W,
      y: ((i * 0.382 + 0.19) % 1) * H,
      s: 18 + ((i * 37) % 40),
      depth: 0.3 + ((i * 53) % 100) / 140,
      spin: 0.05 + ((i * 29) % 100) / 900,
      phase: i * 1.1,
      glyph: i % 3 === 0 ? GLYPH_POOL[(i * 11) % GLYPH_POOL.length] : null,
    }))
  }

  const px = state.mx > -9000 ? state.mx - W / 2 : 0
  const py = state.my > -9000 ? state.my - H / 2 : 0
  ctx.strokeStyle = pen
  ctx.lineWidth = 1
  ctx.font = "10px 'IBM Plex Mono', monospace"
  ctx.textAlign = "center"

  for (let cIdx = 0; cIdx < state.cubes.length; cIdx++) {
    const c = state.cubes[cIdx]
    const ang = now * c.spin * spinScale + c.phase
    const cx = c.x - px * 0.02 * parallax * c.depth
    const cy = c.y - py * 0.02 * parallax * c.depth
    const cos = Math.cos(ang), sin = Math.sin(ang)
    const tilt = 0.42

    // Precomputed vertices
    const v: [number, number][] = []
    for (let i = 0; i < 8; i++) {
      const X = i & 1 ? 1 : -1, Y = i & 2 ? 1 : -1, Z = i & 4 ? 1 : -1
      const rx = X * cos - Z * sin
      const rz = X * sin + Z * cos
      v.push([cx + rx * c.s, cy + Y * c.s * 0.8 + rz * c.s * tilt])
    }

    ctx.globalAlpha = 0.07 * c.depth * op * state.readerAlpha
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      for (let b = 1; b <= 4; b <<= 1) {
        const j = i | b
        if (j !== i && j > i) {
          ctx.moveTo(v[i][0], v[i][1])
          ctx.lineTo(v[j][0], v[j][1])
        }
      }
    }
    ctx.stroke()

    if (c.glyph) {
      ctx.globalAlpha = 0.12 * c.depth * op * state.readerAlpha
      ctx.fillStyle = pen
      ctx.fillText(c.glyph, cx, cy + 3)
    }
  }
  ctx.globalAlpha = 1
}
