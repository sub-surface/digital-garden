import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"

// Cube edges as vertex-index pairs (vertices differing in exactly one bit), and a
// shared projected-vertex scratch buffer, so no per-cube/per-frame arrays are built.
const CUBE_EDGES: number[] = []
for (let i = 0; i < 8; i++) {
  for (let b = 1; b <= 4; b <<= 1) {
    const j = i | b
    if (j > i) CUBE_EDGES.push(i, j)
  }
}
const CUBE_VX = new Float64Array(8)
const CUBE_VY = new Float64Array(8)

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

    // Projected vertices into the shared scratch buffers
    for (let i = 0; i < 8; i++) {
      const X = i & 1 ? 1 : -1, Y = i & 2 ? 1 : -1, Z = i & 4 ? 1 : -1
      const rx = X * cos - Z * sin
      const rz = X * sin + Z * cos
      CUBE_VX[i] = cx + rx * c.s
      CUBE_VY[i] = cy + Y * c.s * 0.8 + rz * c.s * tilt
    }

    ctx.globalAlpha = 0.07 * c.depth * op * state.readerAlpha
    ctx.beginPath()
    for (let e = 0; e < CUBE_EDGES.length; e += 2) {
      const i = CUBE_EDGES[e], j = CUBE_EDGES[e + 1]
      ctx.moveTo(CUBE_VX[i], CUBE_VY[i])
      ctx.lineTo(CUBE_VX[j], CUBE_VY[j])
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
