/**
 * GEODESIC — the black hole at the bottom of the descent.
 *
 * One view, from above the hole's equatorial plane, honest about each thing
 * it draws:
 *
 *   • Bodies on exact Schwarzschild geodesics (`engine/geodesic.ts`), stepped
 *     in the distant observer's time: S-stars on their wide ellipses a few
 *     thousand M out, and a zoo near the hole — a precessing rosette, a
 *     zoom-whirl, a circular orbit just outside the last stable one, a plunge
 *     that slows, reddens and freezes at the horizon.
 *   • A thin gas ring from the last stable orbit outward, glowing with the
 *     Novikov–Thorne flux. Seen face-on its light is shifted only by gravity
 *     and time dilation, g = √(1 − 3M/r); the Doppler lens shows it instead as
 *     a spectrograph in the plane would, one side blue, one side red.
 *   • The sky behind it bent through the exact deflection angle α(b): rays
 *     aimed inside b = 3√3 M fall in and leave the shadow, 2.6 times the
 *     horizon; the host galaxy behind is drawn into an Einstein ring. (A
 *     thin-lens picture, with the background placed close enough behind the
 *     hole that its Einstein ring lands near 10 M, where you can see it.)
 *
 * The clock scales with the view: time per wall second goes as the orbital
 * period of whatever fills the screen, (view radius)^3/2, so S-stars and the
 * innermost orbits both turn at a pace you can watch.
 *
 * Units G = c = M = 1 throughout; `units` converts to the world.
 */

import {
  B_CRIT,
  DeflectionTable,
  HORIZON,
  ISCO,
  PHOTON_SPHERE,
  circularOrbit,
  effectivePotential,
  infall,
  infallEta,
  infallRedshift,
  makeBody,
  orbitBetween,
  stepCoordinate,
  type Body,
} from "../engine/geodesic"
import { dot, ring, sprite, type Raster } from "../render/draw"
import { HUE_BINS, buildLensPalette, signedHue } from "../render/palettes"
import type { LensName, NucleusInstruments, WorldUnits } from "../protocol"
import type { DrawContext, Layer, View } from "./layer"

/** Sgr A*, for a black hole visited with no galaxy around it. */
export const SGR_A_STAR = 4.3e6

/** World units for a hole of `massSun`: lengths GM/c², times GM/c³. */
export function nucleusUnits(massSun: number): WorldUnits {
  return { kpc: 4.785e-17 * massSun, kms: 299_792.458, myr: 1.5608e-19 * massSun }
}

/** Natural framing: the S-star cluster, a little past S2's apocentre. */
export const NUCLEUS_EXTENT = 5e4
/** Coordinate time per wall second is this × (view half-height in M)^1.5. */
const KEPLER_CLOCK = 0.35
/** Thin-lens distance from the hole to the background, M: θ_E = 2√D = 50 M, just outside the gas. */
const LENS_DISTANCE = 625
/** The host galaxy's portrait on the background plane: centre and half-size, M. */
const PORTRAIT_X = 26
const PORTRAIT_Y = 13
const PORTRAIT_HALF = 15
/** Coordinate time over which each of the gas's two texture patterns lives, M. */
const SWIRL_PERIOD = 420
/** Outer edge of the gas ring, M. */
const GAS_OUTER = 40
const TRAIL = 1200
/** Pixel size of a star cell in the scale-free star field. */
const STAR_CELL_PX = 9
const STAR_DENSITY = 0.035

const NUCLEUS_LENSES: LensName[] = ["orbits", "doppler"]

interface Tracked extends Body {
  trail: Float32Array
  head: number
  count: number
  hue: [number, number, number]
  name: string
}

/** S-stars, after the real ones around Sgr A*, laid in one plane: a (M), e, ω. */
const S_STARS: [string, number, number, number][] = [
  ["S2", 24300, 0.885, 1.2],
  ["S4716", 9700, 0.756, 4.0],
  ["S38", 27000, 0.82, 2.6],
  ["S55", 20300, 0.72, 5.3],
  ["S29", 36000, 0.97, 0.4],
  ["S62", 17000, 0.6, 3.3],
]

export interface NucleusReadout {
  orbit: { E: number; L: number; r: number; captured: boolean; name: string; r_: number[]; V: number[] } | null
  clocks: {
    r0: number
    r: number
    tau: number
    t: number
    redshift: number
    tauTotal: number
    curveT: number[]
    curveTau: number[]
  }
}

/** Display tone for a linear channel: soft shoulder, never clips flat. */
const TONE = new Uint8Array(1024)
for (let i = 0; i < 1024; i++) TONE[i] = Math.round(255 * (1 - Math.exp((-2.2 * i * 4) / 1023)))
function tone(v: number): number {
  const i = (v * 255.75) | 0
  return i <= 0 ? 0 : i >= 1023 ? 255 : TONE[i]
}

function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791)) | 0
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** Copy pixel (px, py) over its step × step block. */
function fillBlock(out: Uint32Array, w: number, h: number, px: number, py: number, step: number): void {
  const v = out[py * w + px]
  const ye = Math.min(h, py + step)
  const xe = Math.min(w, px + step)
  for (let y = py; y < ye; y++) for (let x = px; x < xe; x++) out[y * w + x] = v
}

let heatR = 0, heatG = 0, heatB = 0
/** Colour of glowing gas at "temperature" T: deep red through orange and white to blue-white. */
function heat(T: number): void {
  const t = Math.max(0, Math.min(1.6, T))
  if (t < 0.5) {
    heatR = 0.55 + 0.9 * t; heatG = 0.12 + 0.4 * t; heatB = 0.03
  } else if (t < 1) {
    heatR = 1; heatG = 0.32 + 1.14 * (t - 0.5); heatB = 0.03 + 1.5 * (t - 0.5)
  } else {
    heatR = 1 - 0.25 * (t - 1); heatG = 0.89 + 0.06 * (t - 1); heatB = 0.78 + 0.35 * (t - 1)
  }
}

/**
 * α(b) on a uniform grid in ln(b − 3√3 M), so a lookup is one index and one
 * lerp; beyond the grid the weak-field series 4/b + 15π/4b².
 */
const ALPHA_N = 4096
const ALPHA_LO = Math.log(1e-6)
const ALPHA_HI = Math.log(4000)
let alphaGrid: Float64Array | null = null
function deflectionAt(b: number): number {
  if (b >= 4000 + B_CRIT) return 4 / b + (15 * Math.PI) / (4 * b * b)
  if (!alphaGrid) {
    const table = new DeflectionTable(4100, 1024)
    alphaGrid = new Float64Array(ALPHA_N)
    for (let i = 0; i < ALPHA_N; i++) alphaGrid[i] = table.at(B_CRIT + Math.exp(ALPHA_LO + ((ALPHA_HI - ALPHA_LO) * i) / (ALPHA_N - 1)))
  }
  const u = ((Math.log(Math.max(1e-6, b - B_CRIT)) - ALPHA_LO) / (ALPHA_HI - ALPHA_LO)) * (ALPHA_N - 1)
  const i = Math.min(ALPHA_N - 2, Math.max(0, Math.floor(u)))
  const f = u - i
  return alphaGrid[i] + (alphaGrid[i + 1] - alphaGrid[i]) * f
}

const SIN_N = 4096
const SIN_LUT = new Float32Array(SIN_N + 1)
for (let i = 0; i <= SIN_N; i++) SIN_LUT[i] = Math.sin((i / SIN_N) * Math.PI * 2)
/** sin by table, to a part in a thousand: plenty for a texture. */
function fastSin(x: number): number {
  let t = (x / (Math.PI * 2)) % 1
  if (t < 0) t += 1
  return SIN_LUT[(t * SIN_N) | 0]
}

export class NucleusLayer implements Layer {
  readonly kind = "nucleus" as const
  readonly extent = NUCLEUS_EXTENT
  readonly units: WorldUnits
  readonly massSun: number
  bodies: Tracked[] = []
  selected = -1
  /** Coordinate time elapsed, M. */
  time = 0

  private readonly sky: { image: Uint32Array; w: number; h: number } | null
  private bgKey = ""
  private bgCoarse = false
  private bg = new Uint32Array(0)
  private readonly lensLut = new Uint32Array(HUE_BINS * 256)
  private gasKey = ""
  private gIdx = new Int32Array(0)
  private gLr = new Float32Array(0)
  private gAng = new Float32Array(0)
  private gOmega = new Float32Array(0)
  private gBase = new Float32Array(0)
  private gCol = new Float32Array(0)
  private gCount = 0
  /** The gas texture's own clock, M. */
  private gasClock = 0
  private lutKey = ""
  /** The analytic infall shown in the clocks card: wall-clock phase of the fall. */
  private fallPhase = 0

  constructor(massSun: number, sky: { image: Uint32Array; w: number; h: number } | null) {
    this.massSun = massSun
    this.units = nucleusUnits(massSun)
    this.sky = sky
    this.seed()
  }

  lens(lens: LensName): LensName {
    return NUCLEUS_LENSES.includes(lens) ? lens : "orbits"
  }

  private seed(): void {
    // S-stars, each started from apocentre and advanced a different fraction
    // of its period so they are spread around their orbits.
    S_STARS.forEach(([name, a, e, w], k) => {
      const rp = a * (1 - e)
      const ra = a * (1 + e)
      const o = orbitBetween(rp, ra)
      const b: Body = { r: ra, phi: w + Math.PI, ur: 0, E: o.E, L: o.L, tau: 0, t: 0, captured: false }
      const period = 2 * Math.PI * Math.pow(a, 1.5)
      stepCoordinate(b, period * ((k * 0.37) % 1), 40000)
      this.add(b, [255, 236, 200], name)
      // Lay down one whole orbit of trail, so the ellipses read at once.
      const t = this.bodies[this.bodies.length - 1]
      // One period on from here is (but for a sliver of precession) here again.
      const probe: Body = { ...b }
      for (let q = 0; q < TRAIL; q++) {
        stepCoordinate(probe, period / TRAIL, 4000)
        t.trail[q * 2] = probe.r * Math.cos(probe.phi)
        t.trail[q * 2 + 1] = probe.r * Math.sin(probe.phi)
      }
      t.head = 0
      t.count = TRAIL
    })
    const ros = orbitBetween(9, 30)
    this.add({ r: 30, phi: 0, ur: 0, E: ros.E, L: ros.L, tau: 0, t: 0, captured: false }, [255, 200, 130], "rosette")
    const whirl = orbitBetween(4.35, 24)
    this.add({ r: 24, phi: 2.2, ur: 0, E: whirl.E, L: whirl.L, tau: 0, t: 0, captured: false }, [140, 220, 255], "zoom-whirl")
    const c6 = circularOrbit(ISCO + 0.4)
    this.add({ r: ISCO + 0.4, phi: 4.1, ur: 0, E: c6.E, L: c6.L, tau: 0, t: 0, captured: false }, [200, 255, 170], "near the ISCO")
    this.add(makeBody(28, 3.4, -0.05, 3.7), [255, 140, 180], "plunge")
    this.selected = this.bodies.findIndex((b) => b.name === "rosette")
  }

  add(body: Body, hue: [number, number, number], name: string): void {
    if (this.bodies.length >= 16) {
      // Keep the S-stars; make room among the bodies placed by hand.
      const k = this.bodies.findIndex((b) => !b.name.startsWith("S"))
      this.bodies.splice(k < 0 ? 0 : k, 1)
    }
    this.bodies.push({ ...body, trail: new Float32Array(TRAIL * 2), head: 0, count: 0, hue, name })
    this.selected = this.bodies.length - 1
  }

  /**
   * Launch from (x, y) in M with velocity (vx, vy) as a fraction of the local
   * circular speed; with no velocity, a circular orbit.
   */
  launch(x: number, y: number, vx: number, vy: number): void {
    const r = Math.max(HORIZON + 0.5, Math.hypot(x, y))
    const phi = Math.atan2(y, x)
    const hues: [number, number, number][] = [
      [255, 220, 150], [150, 210, 255], [190, 255, 180], [255, 160, 200], [230, 190, 255],
    ]
    const hue = hues[this.bodies.length % hues.length]
    if (Math.hypot(vx, vy) < 1e-3) {
      if (r > PHOTON_SPHERE + 0.05) {
        const c = circularOrbit(r)
        this.add({ r, phi, ur: 0, E: c.E, L: c.L, tau: 0, t: 0, captured: false }, hue, "placed")
      }
      return
    }
    // Static observer's speeds → geodesic constants, scaled by the circular
    // speed there (or the Newtonian one inside 3M).
    const vc = r > PHOTON_SPHERE ? Math.sqrt(1 / (r - 3)) * Math.sqrt(1 - 2 / r) : Math.sqrt(1 / r)
    const vr = (vx * Math.cos(phi) + vy * Math.sin(phi)) * vc
    const vt = (-vx * Math.sin(phi) + vy * Math.cos(phi)) * vc
    const v2 = Math.min(0.995, vr * vr + vt * vt)
    const gamma = 1 / Math.sqrt(1 - v2)
    this.add(makeBody(r, phi, gamma * vr * Math.sqrt(1 - 2 / r), r * gamma * vt), hue, "thrown")
  }

  /** Coordinate time per wall second for a view of half-height `half` M. */
  static clockRate(half: number): number {
    // Beyond the S-stars there is nothing of the hole's to watch: past twice
    // their scale the clock stops speeding up.
    return KEPLER_CLOCK * Math.pow(Math.min(2 * NUCLEUS_EXTENT, Math.max(3, half)), 1.5)
  }

  step(dtSec: number, rate: number, view: View): void {
    const half = (0.5 * Math.min(view.w, view.h)) / view.scale
    const dt = dtSec * rate * NucleusLayer.clockRate(half)
    this.time += dt
    this.gasClock += dt
    this.fallPhase += dtSec * rate
    for (const b of this.bodies) {
      stepCoordinate(b, dt)
      // A trail sampled more coarsely than its orbit is a scribble: when the
      // clock races (the view is far out), start it afresh instead.
      if (dt > 0.06 * 2 * Math.PI * Math.pow(b.r, 1.5)) b.count = 0
      b.trail[b.head * 2] = b.r * Math.cos(b.phi)
      b.trail[b.head * 2 + 1] = b.r * Math.sin(b.phi)
      b.head = (b.head + 1) % TRAIL
      b.count = Math.min(TRAIL, b.count + 1)
    }
    const sel = this.bodies[this.selected]
    this.bodies = this.bodies.filter((b) => !b.captured || b.r > HORIZON)
    this.selected = sel ? this.bodies.indexOf(sel) : -1
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  render(out: Uint32Array, v: View, ctx: DrawContext): void {
    const { w, h } = v
    const lens = this.lens(ctx.lens)
    this.background(v)
    out.set(this.bg)
    this.gas(out, v, lens, ctx.accent)
    const r: Raster = { out, w, h }
    const cx = w * 0.5 - v.x * v.scale
    const cy = h * 0.5 + v.y * v.scale
    const s = v.scale
    // Coordinate markers: the horizon, the photon sphere (dashed), the last
    // stable orbit in the accent. They label the map; they are not light.
    if (s * HORIZON > 1.5) {
      const [ar, ag, ab] = ctx.accent
      ring(r, cx, cy, HORIZON * s, 0.4, 255, 255, 255)
      ring(r, cx, cy, PHOTON_SPHERE * s, 0.22, 255, 210, 150, 5)
      ring(r, cx, cy, ISCO * s, 0.28, ar * 255, ag * 255, ab * 255, 3)
    } else {
      // Too small to resolve: the hole's light is a point.
      sprite(r, cx, cy, 4, 255, 230, 190)
    }
    for (let k = 0; k < this.bodies.length; k++) this.drawBody(r, cx, cy, s, this.bodies[k], k === this.selected)
  }

  /**
   * The lensed sky, cached until the camera moves. Each pixel is a ray with
   * impact parameter b; inside 3√3 M it is captured. Outside, it was bent
   * through α(b) and lands on the background plane at β = b − D·α(b), on the
   * far side of the axis once β goes negative: the Einstein ring is where
   * β = 0, at b = 2√D.
   */
  private background(v: View): void {
    const { w, h } = v
    const key = `${w}x${h}:${v.x.toPrecision(9)}:${v.y.toPrecision(9)}:${v.scale.toPrecision(9)}`
    // While the camera moves, trace every other pixel; once it rests, all.
    const moving = key !== this.bgKey
    if (!moving && !this.bgCoarse) return
    const step = moving && this.bgKey !== "" ? 2 : 1
    this.bgCoarse = step > 1
    this.bgKey = key
    this.gasKey = ""
    if (this.bg.length !== w * h) this.bg = new Uint32Array(w * h)
    const out = this.bg
    const inv = 1 / v.scale
    const sky = this.sky
    const lvlF = Math.log2(inv * STAR_CELL_PX)
    const L = Math.floor(lvlF)
    const f = lvlF - L
    const weights = [1 - f, 1, f]
    const cells = [Math.pow(2, L - 1), Math.pow(2, L), Math.pow(2, L + 1)]
    const inv2 = inv * inv
    for (let py = 0; py < h; py += step) {
      const wy = v.y + (h * 0.5 - py - step * 0.5) * inv
      for (let px = 0; px < w; px += step) {
        const wx = v.x + (px + step * 0.5 - w * 0.5) * inv
        const i = py * w + px
        const b = Math.sqrt(wx * wx + wy * wy)
        if (b <= B_CRIT) {
          out[i] = 0xff000000
          if (step > 1) fillBlock(out, w, h, px, py, step)
          continue
        }
        const k = (b - LENS_DISTANCE * deflectionAt(b)) / b
        const sx = wx * k
        const sy = wy * k
        // A point source's flux goes as its magnification: images squeezed
        // toward the hole (|k| > 1) are fainter as well as crowded.
        const k2 = k * k
        const mag = k2 < 0.625 ? 1.6 : 1 / k2
        let rr = 0.025, gg = 0.03, bb = 0.05
        for (let q = 0; q < 3; q++) {
          const level = L - 1 + q
          const cell = cells[q]
          const ix = Math.floor(sx / cell)
          const iy = Math.floor(sy / cell)
          const hs = hash3(ix, iy, level)
          if (hs > STAR_DENSITY) continue
          const stx = (ix + hash3(ix, iy, level + 101)) * cell
          const sty = (iy + hash3(ix, iy, level + 202)) * cell
          // Distance in screen pixels, through the local stretch of the lens.
          const d2 = ((sx - stx) * (sx - stx) + (sy - sty) * (sy - sty)) / (inv2 * k2 + 1e-30)
          if (d2 > 1.2) continue
          const lum = (1 - d2 / 1.2) * weights[q] * (0.25 + 0.55 * hash3(ix, iy, level + 303)) * mag
          const warm = hs / STAR_DENSITY
          rr += lum * (0.85 + 0.15 * warm)
          gg += lum * 0.88
          bb += lum * (1 - 0.25 * warm)
        }
        if (sky) {
          const u = (sx - PORTRAIT_X) / PORTRAIT_HALF
          const t = (sy - PORTRAIT_Y) / PORTRAIT_HALF
          if (u > -1 && u < 1 && t > -1 && t < 1) {
            // Lensing conserves surface brightness: the arcs are exactly as
            // bright as the galaxy is. Bilinear, as they magnify it a lot.
            const fx = (u * 0.5 + 0.5) * (sky.w - 1)
            const fy = (0.5 - t * 0.5) * (sky.h - 1)
            const x0 = Math.floor(fx)
            const y0 = Math.floor(fy)
            const ax = fx - x0
            const ay = fy - y0
            const x1 = Math.min(sky.w - 1, x0 + 1)
            const y1 = Math.min(sky.h - 1, y0 + 1)
            const im = sky.image
            const c00 = im[y0 * sky.w + x0], c10 = im[y0 * sky.w + x1], c01 = im[y1 * sky.w + x0], c11 = im[y1 * sky.w + x1]
            const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay
            const k255 = 0.75 / 255
            rr += ((c00 & 255) * w00 + (c10 & 255) * w10 + (c01 & 255) * w01 + (c11 & 255) * w11) * k255
            gg += (((c00 >> 8) & 255) * w00 + ((c10 >> 8) & 255) * w10 + ((c01 >> 8) & 255) * w01 + ((c11 >> 8) & 255) * w11) * k255
            bb += (((c00 >> 16) & 255) * w00 + ((c10 >> 16) & 255) * w10 + ((c01 >> 16) & 255) * w01 + ((c11 >> 16) & 255) * w11) * k255
          }
        }
        // The photon ring: light that looped the hole, piled up at b → 3√3 M.
        const ringGlow = 0.9 * Math.exp(-(b - B_CRIT) / 0.11)
        rr += ringGlow
        gg += ringGlow * 0.86
        bb += ringGlow * 0.7
        out[i] = (0xff000000 | (tone(bb) << 16) | (tone(gg) << 8) | tone(rr)) >>> 0
        if (step > 1) fillBlock(out, w, h, px, py, step)
      }
    }
  }

  /**
   * Everything about the gas that depends only on where a pixel is: which
   * pixels the ring covers, their radius and angle, flux and frequency shift.
   * Cached with the sky; only the turning texture is redone each frame.
   */
  private gasCache(v: View, lens: LensName, accent: [number, number, number]): void {
    const key = `${this.bgKey}:${lens}:${accent.join(",")}`
    if (key === this.gasKey) return
    this.gasKey = key
    const { w, h } = v
    const inv = 1 / v.scale
    const cx = w * 0.5 - v.x * v.scale
    const cy = h * 0.5 + v.y * v.scale
    const R = GAS_OUTER * v.scale
    const x0 = Math.max(0, Math.floor(cx - R))
    const x1 = Math.min(w - 1, Math.ceil(cx + R))
    const y0 = Math.max(0, Math.floor(cy - R))
    const y1 = Math.min(h - 1, Math.ceil(cy + R))
    const doppler = lens === "doppler"
    if (doppler) {
      const lk = accent.join(",")
      if (lk !== this.lutKey) {
        this.lutKey = lk
        buildLensPalette(this.lensLut, "doppler", accent)
      }
    }
    const cap = Math.max(0, (x1 - x0 + 1) * (y1 - y0 + 1))
    if (this.gIdx.length < cap) {
      this.gIdx = new Int32Array(cap)
      this.gLr = new Float32Array(cap)
      this.gAng = new Float32Array(cap)
      this.gOmega = new Float32Array(cap)
      this.gBase = new Float32Array(cap)
      this.gCol = new Float32Array(cap * 3)
    }
    const fluxNorm = 1 / 2.63e-4
    // Sub-pixel rings get their brightness spread instead of aliasing.
    const coverage = Math.min(1, v.scale * 0.6)
    const hueTop = HUE_BINS - 1e-3
    let n = 0
    for (let py = y0; py <= y1; py++) {
      const wy = v.y + (h * 0.5 - py - 0.5) * inv
      for (let px = x0; px <= x1; px++) {
        const wx = v.x + (px + 0.5 - w * 0.5) * inv
        const r = Math.sqrt(wx * wx + wy * wy)
        if (r < ISCO || r > GAS_OUTER) continue
        // Novikov–Thorne flux shape (1 − √(6/r))/r³, peaking at r ≈ 9.5 M.
        const flux = ((1 - Math.sqrt(ISCO / r)) / (r * r * r)) * fluxNorm
        const omega = 1 / (r * Math.sqrt(r))
        // Seen face-on, only gravity and time dilation shift the light. A
        // spectrograph far off in the plane, below, also sees the orbital
        // motion: line-of-sight speed −v_y, photon angular momentum −x.
        let g = Math.sqrt(1 - 3 / r)
        if (doppler) g = g / (1 + omega * wx)
        const edge = Math.min(1, (r - ISCO) / 0.6) * Math.min(1, (GAS_OUTER - r) / 8)
        const g2 = g * g
        this.gIdx[n] = py * w + px
        this.gLr[n] = Math.log(r)
        this.gAng[n] = Math.atan2(wy, wx)
        this.gOmega[n] = omega
        this.gBase[n] = 2.4 * flux * g2 * g2 * edge * coverage
        if (doppler) {
          this.gCol[n * 3] = ((signedHue(1 - g, 0.25) * hueTop) | 0) << 8
        } else {
          heat(Math.sqrt(Math.sqrt(flux)) * g * 1.05)
          this.gCol[n * 3] = heatR
          this.gCol[n * 3 + 1] = heatG
          this.gCol[n * 3 + 2] = heatB
        }
        n++
      }
    }
    this.gCount = n
  }

  /**
   * The gas ring, over the sky; optically thick, so it hides what is behind.
   * Differential rotation winds any pattern ever tighter, so the texture is two
   * patterns, each reset in turn while the other carries the picture: it turns
   * at the true Ω(r) without ever winding into noise.
   */
  private gas(out: Uint32Array, v: View, lens: LensName, accent: [number, number, number]): void {
    this.gasCache(v, lens, accent)
    const n = this.gCount
    if (n === 0) return
    const doppler = lens === "doppler"
    const lut = this.lensLut
    const period = SWIRL_PERIOD
    const tA = this.gasClock % period
    const tB = (this.gasClock + period * 0.5) % period
    const wA = 1 - Math.abs(1 - (2 * tA) / period)
    const wB = 1 - wA
    const { gIdx, gLr, gAng, gOmega, gBase, gCol } = this
    for (let k = 0; k < n; k++) {
      const lr = gLr[k]
      const om = gOmega[k]
      const phA = gAng[k] - om * tA
      const phB = gAng[k] - om * tB + 1.7
      const sA = fastSin(9 * lr - 3 * phA) * (0.6 + 0.4 * fastSin(23 * lr + 7 * phA))
      const sB = fastSin(9 * lr - 3 * phB + 2.1) * (0.6 + 0.4 * fastSin(23 * lr + 7 * phB))
      const swirl = 0.72 + 0.28 * (wA * sA + wB * sB)
      const I = Math.min(3.5, gBase[k] * swirl)
      let cr: number, cg: number, cb: number
      if (doppler) {
        const idx = Math.min(255, Math.max(1, Math.round(255 * (1 - Math.exp(-I * 1.6)))))
        const c = lut[gCol[k * 3] | idx]
        cr = c & 255
        cg = (c >> 8) & 255
        cb = (c >> 16) & 255
      } else {
        cr = tone(gCol[k * 3] * I)
        cg = tone(gCol[k * 3 + 1] * I)
        cb = tone(gCol[k * 3 + 2] * I)
      }
      // The sky is already in display values; the gas is tone-mapped on its own.
      const keep = 1 - Math.min(0.9, I * 1.5)
      const i = gIdx[k]
      const s = out[i]
      const br = Math.min(255, (s & 255) * keep + cr)
      const bg = Math.min(255, ((s >> 8) & 255) * keep + cg)
      const bb = Math.min(255, ((s >> 16) & 255) * keep + cb)
      out[i] = (0xff000000 | (bb << 16) | (bg << 8) | br) >>> 0
    }
  }

  private drawBody(r: Raster, cx: number, cy: number, s: number, b: Tracked, selected: boolean): void {
    const [hr, hg, hb] = b.hue
    let px = NaN
    let py = NaN
    for (let k = 0; k < b.count; k++) {
      const idx = (b.head - 1 - k + TRAIL) % TRAIL
      const x = cx + b.trail[idx * 2] * s
      const y = cy - b.trail[idx * 2 + 1] * s
      const age = 1 - k / TRAIL
      const kk = age * age * (selected ? 0.5 : 0.28)
      // Fill gaps between samples so fast orbits read as lines, not beads.
      if (px === px) {
        const d = Math.hypot(x - px, y - py)
        if (d > 1.5 && d < 60) {
          const n = Math.ceil(d)
          for (let j = 1; j < n; j++) dot(r, px + ((x - px) * j) / n, py + ((y - py) * j) / n, kk, hr, hg, hb)
        }
      }
      dot(r, x, y, kk, hr, hg, hb)
      px = x
      py = y
    }
    // The body, dimmed and reddened by the redshift its light suffers
    // climbing out: dτ/dt = (1 − 2/r)/E.
    const fade = Math.max(0, Math.min(1, (1 - 2 / b.r) / b.E))
    const x = cx + b.r * Math.cos(b.phi) * s
    const y = cy - b.r * Math.sin(b.phi) * s
    sprite(r, x, y, 3.2, 255 * (0.4 + 0.6 * fade), (200 * fade + hg * 0.2) * (0.4 + 0.6 * fade), 255 * fade * fade)
    if (selected) ring(r, x, y, 6.5, 0.55, 255, 255, 255)
  }

  /** The body nearest a point (M), within `reach` M, for selection. */
  pick(x: number, y: number, reach: number): number {
    let best = -1
    let bestD = reach
    this.bodies.forEach((b, k) => {
      const d = Math.hypot(b.r * Math.cos(b.phi) - x, b.r * Math.sin(b.phi) - y)
      if (d < bestD) {
        best = k
        bestD = d
      }
    })
    return best
  }

  // ---------------------------------------------------------------------------
  // Readout
  // ---------------------------------------------------------------------------

  readout(): NucleusReadout {
    let orbit: NucleusReadout["orbit"] = null
    const b = this.bodies[this.selected]
    if (b) {
      const rMax = Math.max(60, b.r * 2)
      const r_: number[] = []
      const V: number[] = []
      for (let i = 0; i <= 160; i++) {
        const r = 2.05 * Math.pow(rMax / 2.05, i / 160)
        r_.push(r)
        V.push(effectivePotential(r, b.L))
      }
      orbit = { E: b.E, L: b.L, r: b.r, captured: b.captured, name: b.name, r_, V }
    }
    // A probe dropped from rest at 10 M, falling once every twelve seconds:
    // where it is on its own clock, and on the distant one.
    const r0 = 10
    const tauTotal = Math.PI * Math.sqrt((r0 * r0 * r0) / 8)
    const tau = ((this.fallPhase / 12) % 1) * tauTotal * 1.15
    const k = Math.sqrt((r0 * r0 * r0) / 8)
    let eta = Math.min(Math.PI, tau / (2 * k))
    for (let i = 0; i < 30; i++) {
      const fz = k * (eta + Math.sin(eta)) - Math.min(tau, tauTotal)
      eta = Math.max(0, Math.min(Math.PI, eta - fz / (k * (1 + Math.cos(eta)) + 1e-12)))
    }
    const p = infall(r0, eta)
    const E = Math.sqrt(1 - 2 / r0)
    const curveT: number[] = []
    const curveTau: number[] = []
    const etaH = infallEta(r0, HORIZON)
    for (let i = 0; i <= 80; i++) {
      const e = infall(r0, (etaH - 1e-9) * (1 - Math.pow(1 - i / 80, 3)))
      curveT.push(e.t)
      curveTau.push(e.tau)
    }
    return {
      orbit,
      clocks: {
        r0,
        r: p.r,
        tau: p.tau,
        t: p.r > HORIZON ? p.t : Infinity,
        redshift: p.r > HORIZON ? infallRedshift(p.r, E) : Infinity,
        tauTotal,
        curveT,
        curveTau,
      },
    }
  }

  instruments(): NucleusInstruments {
    return { kind: "nucleus", ...this.readout(), massSun: this.massSun, units: this.units, time: this.time }
  }
}
