import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { perState, rng } from "./scratch"

export const GLYPH_POOL =
  "░▒▓█─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬■□●○◘▄▀▌▐«»¶§±≡≈∞ΩαβπΣφψχρλμνξ♠♣♥♦☺☻♪♫►◄▲▼◇◆◈✦✧⋆∂∆∅∈∝⟨⟩⊕⊗⊙↑↗→↘↓↙←↖⁰¹²³⁴⁵⁶⁷⁸⁹αβγδεζηθ"

// ── Isometric background ──
// A drafting table of wireframe solids turning slowly over a faint isometric
// lattice: cubes, octahedra, tetrahedra, prisms, pyramids, icosahedra,
// cylinders, a stair block, and a tesseract (a 4D cube, turning in a plane
// that isn't there and projected down twice). Cursor parallax: deeper solids
// shift less. Each solid is a vertex list and an edge list, so a new shape
// is one entry in SHAPES.

interface Shape {
  /** x, y, z per vertex (unit scale). */
  v: number[]
  /** Vertex-index pairs. */
  e: number[]
  /** 4D: x, y, z, w per vertex, rotated in XW/ZW before projection. */
  four?: boolean
}

function edgesByLength(v: number[], dims: number, len: number): number[] {
  const n = v.length / dims, out: number[] = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    let d = 0
    for (let k = 0; k < dims; k++) d += (v[i * dims + k] - v[j * dims + k]) ** 2
    if (Math.abs(Math.sqrt(d) - len) < 1e-3) out.push(i, j)
  }
  return out
}

const PHI = (1 + Math.sqrt(5)) / 2

const cube: Shape = (() => {
  const v: number[] = []
  for (let i = 0; i < 8; i++) v.push(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1)
  return { v, e: edgesByLength(v, 3, 2) }
})()

const octahedron: Shape = (() => {
  const v = [1.3, 0, 0, -1.3, 0, 0, 0, 1.3, 0, 0, -1.3, 0, 0, 0, 1.3, 0, 0, -1.3]
  return { v, e: edgesByLength(v, 3, 1.3 * Math.SQRT2) }
})()

const tetrahedron: Shape = (() => {
  const v = [1, 1, 1, 1, -1, -1, -1, 1, -1, -1, -1, 1].map((c) => c * 1.15)
  return { v, e: edgesByLength(v, 3, 1.15 * 2 * Math.SQRT2) }
})()

const icosahedron: Shape = (() => {
  const v: number[] = []
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) v.push(0, a, b, a, b, 0, b, 0, a)
  const k = 1.25 / Math.hypot(1, PHI)
  const vs = v.map((c) => c * k)
  return { v: vs, e: edgesByLength(vs, 3, 2 * k) }
})()

const prism: Shape = (() => {
  const v: number[] = []
  for (const y of [-1, 1]) for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    v.push(Math.cos(a) * 1.2, y, Math.sin(a) * 1.2)
  }
  return { v, e: [0, 1, 1, 2, 2, 0, 3, 4, 4, 5, 5, 3, 0, 3, 1, 4, 2, 5] }
})()

const pyramid: Shape = {
  v: [-1, 1, -1, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1.3, 0],
  e: [0, 1, 1, 2, 2, 3, 3, 0, 0, 4, 1, 4, 2, 4, 3, 4],
}

const cylinder: Shape = (() => {
  const n = 14, v: number[] = [], e: number[] = []
  for (const y of [-1, 1]) for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    v.push(Math.cos(a), y, Math.sin(a))
  }
  for (let i = 0; i < n; i++) {
    e.push(i, (i + 1) % n, n + i, n + ((i + 1) % n))
    if (i % 7 === 0) e.push(i, n + i)
  }
  return { v, e }
})()

// An L-shaped stair block: three steps, outlined.
const stairs: Shape = (() => {
  const prof = [[-1, 1], [1, 1], [1, -1], [1 / 3, -1], [1 / 3, -1 / 3], [-1 / 3, -1 / 3], [-1 / 3, 1 / 3], [-1, 1 / 3]]
  const v: number[] = [], e: number[] = []
  for (const z of [-0.7, 0.7]) for (const [x, y] of prof) v.push(x, y, z)
  const n = prof.length
  for (let i = 0; i < n; i++) e.push(i, (i + 1) % n, n + i, n + ((i + 1) % n), i, n + i)
  return { v, e }
})()

const tesseract: Shape = (() => {
  const v: number[] = []
  for (let i = 0; i < 16; i++) v.push(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1)
  return { v, e: edgesByLength(v, 4, 2), four: true }
})()

const SHAPES: Shape[] = [cube, octahedron, tetrahedron, icosahedron, prism, pyramid, cylinder, stairs, cube, tesseract]

interface Solid {
  shape: Shape
  x: number; y: number; s: number
  depth: number; spin: number; phase: number
  bob: number
  glyph: string | null
}

const VX = new Float32Array(32)
const VY = new Float32Array(32)

const scene = perState((state: BgState) => ({ solids: [] as Solid[], count: -1, w: state.w, h: state.h }))

export function drawIsometric(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.isometric
  if (!p) return
  const W = state.w, H = state.h
  const now = performance.now() / 1000
  const spinScale = p.spin ?? 1
  const parallax = p.parallax ?? 1
  const op = (p.opacity ?? 1) * state.readerAlpha
  const pen = state.colorCache.secondary
  const ink = state.colorCache.text
  const sc = scene(state)
  const count = Math.round(p.count ?? 14)

  if (sc.count !== count) {
    sc.count = count
    const r = rng(271828)
    sc.solids = Array.from({ length: count }, (_, i) => ({
      shape: SHAPES[i % SHAPES.length],
      // R2 sequence (the plastic number): even 2D coverage without a grid.
      // (The old golden-ratio pair summed to 1, so solids fell on diagonals.)
      x: (0.06 + 0.88 * ((0.5 + i * 0.7548776662) % 1)) * W,
      y: (0.06 + 0.88 * ((0.5 + i * 0.5698402910) % 1)) * H,
      s: 14 + r() * 26,
      depth: 0.3 + r() * 0.7,
      spin: 0.05 + r() * 0.12,
      phase: r() * 6.28,
      bob: r() * 6.28,
      glyph: i % 4 === 0 ? GLYPH_POOL[(i * 11) % GLYPH_POOL.length] : null,
    }))
  }

  const px = state.mx > -9000 ? state.mx - W / 2 : 0
  const py = state.my > -9000 ? state.my - H / 2 : 0

  // The lattice: isometric grid points, barely there, drifting with the cursor at the deepest depth.
  const g = 46
  const lx = (-px * 0.006 * parallax) % g, ly = (-py * 0.006 * parallax) % (g * 0.577)
  ctx.fillStyle = ink
  ctx.globalAlpha = 0.07 * op
  ctx.beginPath()
  for (let row = -1, y = ly - g; y < H + g; row++, y += g * 0.577) {
    const off = row & 1 ? g / 2 : 0
    for (let x = lx - g + off; x < W + g; x += g) ctx.rect(x, y, 1, 1)
  }
  ctx.fill()

  ctx.strokeStyle = pen
  ctx.lineWidth = 1
  ctx.font = "10px 'IBM Plex Mono', monospace"
  ctx.textAlign = "center"
  const tilt = 0.42

  for (const c of sc.solids) {
    const ang = now * c.spin * spinScale + c.phase
    const cx = c.x - px * 0.02 * parallax * c.depth
    const cy = c.y - py * 0.02 * parallax * c.depth + Math.sin(now * 0.3 + c.bob) * 3
    const cos = Math.cos(ang), sin = Math.sin(ang)
    const { v, e, four } = c.shape
    const dims = four ? 4 : 3
    const n = v.length / dims
    const a4 = now * 0.25 * spinScale + c.phase
    const c4 = Math.cos(a4), s4 = Math.sin(a4)

    for (let i = 0; i < n; i++) {
      let X = v[i * dims], Y = v[i * dims + 1], Z = v[i * dims + 2]
      if (four) {
        // Turn in the XW plane, then project 4D → 3D by perspective along W.
        const W4 = v[i * dims + 3]
        const xw = X * c4 - W4 * s4, ww = X * s4 + W4 * c4
        const k = 1.6 / (2.6 - ww)
        X = xw * k; Y *= k; Z *= k
      }
      const rx = X * cos - Z * sin
      const rz = X * sin + Z * cos
      VX[i] = cx + rx * c.s
      VY[i] = cy + Y * c.s * 0.8 + rz * c.s * tilt
    }

    ctx.globalAlpha = 0.075 * c.depth * op
    ctx.beginPath()
    for (let k = 0; k < e.length; k += 2) {
      ctx.moveTo(VX[e[k]], VY[e[k]])
      ctx.lineTo(VX[e[k + 1]], VY[e[k + 1]])
    }
    ctx.stroke()

    if (c.glyph) {
      ctx.globalAlpha = 0.12 * c.depth * op
      ctx.fillStyle = pen
      ctx.fillText(c.glyph, cx, cy + 3)
    }
  }
  ctx.globalAlpha = 1
}
