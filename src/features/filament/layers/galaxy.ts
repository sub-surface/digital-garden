/**
 * A galaxy: one halo of the web, resimulated.
 *
 * `engine/zoom.ts` cuts the halo and its surroundings out of the web as the
 * web left it, splits the dark matter finer, lays down a cold stellar disc
 * turning with the halo's own spin, and keeps the rest of the universe as a
 * tidal field. `engine/universe.ts` evolves it on the fast multipole method.
 *
 * Coordinates: the halo's radius is the unit, and the origin is the halo's
 * centre in the web, so the frame nests in the web's exactly.
 */

import { Universe } from "../engine/universe"
import { zoomWorld } from "../engine/zoom"
import { isolatedDiagnostics } from "../engine/analysis"
import type { Halo } from "../engine/halos"
import { depositCic, timedDecay } from "../render/density-raster"
import { Events } from "../render/events"
import {
  HUE_BINS,
  HUE_SCALE,
  buildDensityPalette,
  buildLensPalette,
  originHue,
  signedHue,
} from "../render/palettes"
import type { GalaxyInstruments, HaloCard, LensName, WorldUnits } from "../protocol"
import type { DrawContext, Layer, View } from "./layer"
import type { WebLayer } from "./web"

/** Tone-map index the auto-exposure aims the mean occupied pixel at. */
const TARGET_LEVEL = 7.5
/** Neighbours inside a kernel; sets the adaptive radius. */
const KERNEL_NEIGHBOURS = 7
const KERNEL_MAX_PX = 5
/** Coarse cell, in pixels, for the local density estimate. */
const COARSE_PX = 8
/** Brightness by particle origin: dark matter is faint, light is stars. */
const TAG_WEIGHT = [0.45, 2.2, 2.2, 0.45]
const MASS_WEIGHT = 2.6
const HISTORY_CAP = 360
/** Half-size of the natural framing, in halo radii. */
export const GALAXY_EXTENT = 2.25

const GALAXY_LENSES: LensName[] = ["density", "doppler", "origin"]

export interface GalaxyOptions {
  budget: number
  seed: number
  order: number
}

export class GalaxyLayer implements Layer {
  readonly kind = "galaxy" as const
  readonly extent = GALAXY_EXTENT
  readonly units: WorldUnits
  readonly uni: Universe
  /** The halo this galaxy was cut from, and the web epoch it was cut at. */
  readonly haloId: number
  readonly card: HaloCard
  readonly epochKey: number
  /** Where the galaxy sits in the web, and the size of its unit there. */
  readonly anchor: { x: number; y: number; unit: number }

  private accum = new Float32Array(0)
  private hueAccum = new Float32Array(0)
  private coarse = new Float32Array(0)
  private coarseW = 0
  private coarseH = 0
  private rw = 0
  private rh = 0
  private autoGain = 0
  private readonly palette = new Uint32Array(256)
  private readonly lensLut = new Uint32Array(HUE_BINS * 256)
  private paletteKey = ""
  private lutKey = ""
  private history = { t: [] as number[], virial: [] as number[], r10: [] as number[], r50: [] as number[], r90: [] as number[] }
  private angularZero: number | null = null
  readonly events: Events
  private centreCache = { t: -1, x: 0, y: 0 }

  constructor(web: WebLayer, halo: Halo, opts: GalaxyOptions) {
    const z = zoomWorld(web.cosmos, halo, opts.budget, opts.seed)
    this.uni = new Universe({ initial: z.initial, tidal: z.tidal, order: opts.order, softening: 1 })
    this.units = z.units
    this.haloId = halo.id
    this.card = web.card(halo)
    this.epochKey = web.epochKey
    this.anchor = { x: halo.x, y: halo.y, unit: halo.radius }
    this.events = new Events(opts.seed ^ halo.id, 0, false)
  }

  lens(lens: LensName): LensName {
    return GALAXY_LENSES.includes(lens) ? lens : "density"
  }

  /** Softening length, the smallest scale the galaxy resolves, in halo radii. */
  get softening(): number {
    return this.uni.softeningLength
  }

  step(dtSec: number, rate: number): void {
    const n = Math.max(1, Math.round(rate))
    for (let s = 0; s < n; s++) this.uni.step()
    this.events.advance(dtSec, (cb) => this.uni.forEachDensityCell(cb), 0, this.uni.boxHalf * 2)
  }

  /**
   * The stellar centre: mean of the stars, shrunk three times onto the
   * densest part, so a passing satellite cannot drag it off the nucleus.
   */
  centre(): { x: number; y: number } {
    const u = this.uni
    if (this.centreCache.t === u.time) return this.centreCache
    const m = u.masses
    let cx = 0
    let cy = 0
    let radius = Infinity
    for (let pass = 0; pass < 4; pass++) {
      let sx = 0
      let sy = 0
      let n = 0
      let r2sum = 0
      for (let i = 0; i < u.nMass; i++) {
        if (m.tag && m.tag[i] !== 1) continue
        const dx = m.x[i] - cx
        const dy = m.y[i] - cy
        const d2 = dx * dx + dy * dy
        if (d2 > radius * radius) continue
        sx += m.x[i]
        sy += m.y[i]
        r2sum += d2
        n++
      }
      if (n < 8) break
      cx = sx / n
      cy = sy / n
      radius = Math.sqrt(r2sum / n) * 0.7
    }
    this.centreCache = { t: u.time, x: cx, y: cy }
    return this.centreCache
  }

  clearTrails(): void {
    this.accum.fill(0)
    this.hueAccum.fill(0)
  }

  private ensure(w: number, h: number): void {
    if (w === this.rw && h === this.rh) return
    this.rw = w
    this.rh = h
    this.accum = new Float32Array(w * h)
    this.hueAccum = new Float32Array(w * h)
    this.coarseW = Math.ceil(w / COARSE_PX)
    this.coarseH = Math.ceil(h / COARSE_PX)
    this.coarse = new Float32Array(this.coarseW * this.coarseH)
  }

  private syncPalettes(lens: LensName, accent: [number, number, number]): void {
    const key = accent.join(",")
    if (key !== this.paletteKey) {
      this.paletteKey = key
      buildDensityPalette(this.palette, accent, { strength: 0, r: 0, g: 0, b: 0 })
    }
    if (lens === "doppler" || lens === "origin") {
      const lk = `${lens}:${key}`
      if (lk !== this.lutKey) {
        this.lutKey = lk
        buildLensPalette(this.lensLut, lens, accent)
      }
    }
  }

  /**
   * Adaptive-kernel splat. Each particle's kernel is sized so that about
   * {@link KERNEL_NEIGHBOURS} others fall inside it, from a coarse count of
   * particles per screen cell: sparse outskirts become smooth light, dense
   * cores keep their full, pixel-sharp resolution.
   */
  private splat(v: View, hueLens: "doppler" | "origin" | null): void {
    const u = this.uni
    const { w, h, scale } = v
    const ox = w * 0.5 - v.x * scale
    const oy = h * 0.5 + v.y * scale
    const accum = this.accum
    const hueAccum = this.hueAccum
    const coarse = this.coarse
    const cw = this.coarseW
    const ch = this.coarseH
    coarse.fill(0)
    const c = u.masses
    const n = u.nMass
    const invC = 1 / COARSE_PX
    for (let i = 0; i < n; i++) {
      const sx = c.x[i] * scale + ox
      const sy = oy - c.y[i] * scale
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue
      coarse[((sy * invC) | 0) * cw + ((sx * invC) | 0)]++
    }
    const perPx = 1 / (COARSE_PX * COARSE_PX)
    const h2Scale = KERNEL_NEIGHBOURS / Math.PI
    const tags = c.tag && c.tag.length === n ? c.tag : null
    const doppler = hueLens !== null
    for (let i = 0; i < n; i++) {
      const tag = tags ? tags[i] : -1
      const wPart = tag >= 0 ? MASS_WEIGHT * TAG_WEIGHT[tag | 0] : MASS_WEIGHT
      const sx = c.x[i] * scale + ox
      const sy = oy - c.y[i] * scale
      if (sx < -KERNEL_MAX_PX || sx >= w + KERNEL_MAX_PX || sy < -KERNEL_MAX_PX || sy >= h + KERNEL_MAX_PX) continue
      const gx = Math.min(cw - 1, Math.max(0, (sx * invC) | 0))
      const gy = Math.min(ch - 1, Math.max(0, (sy * invC) | 0))
      const density = Math.max(1, coarse[gy * cw + gx]) * perPx
      const hk = Math.min(KERNEL_MAX_PX, Math.sqrt(h2Scale / density))
      const hue =
        hueLens === "doppler" ? signedHue(c.vy[i], HUE_SCALE.doppler) : hueLens === "origin" ? originHue(Math.max(0, tag)) : 0
      if (hk < 1.25) {
        depositCic(accum, w, h, sx, sy, wPart)
        if (doppler) depositCic(hueAccum, w, h, sx, sy, wPart * hue)
        continue
      }
      // (1 − r²/h²)², which integrates to πh²/3 over the disc.
      const norm = (3 * wPart) / (Math.PI * hk * hk)
      const invH2 = 1 / (hk * hk)
      const y0 = Math.max(0, Math.ceil(sy - hk))
      const y1 = Math.min(h - 1, Math.floor(sy + hk))
      const x0 = Math.max(0, Math.ceil(sx - hk))
      const x1 = Math.min(w - 1, Math.floor(sx + hk))
      for (let y = y0; y <= y1; y++) {
        const dy = y - sy
        const row = y * w
        for (let x = x0; x <= x1; x++) {
          const dx = x - sx
          const q = 1 - (dx * dx + dy * dy) * invH2
          if (q <= 0) continue
          const wgt = norm * q * q
          accum[row + x] += wgt
          if (doppler) hueAccum[row + x] += wgt * hue
        }
      }
    }
  }

  render(out: Uint32Array, v: View, ctx: DrawContext): void {
    const { w, h } = v
    this.ensure(w, h)
    const lens = this.lens(ctx.lens)
    const hueLens = lens === "doppler" || lens === "origin" ? lens : null
    this.syncPalettes(lens, ctx.accent)
    this.splat(v, hueLens)

    // Paused redraws are fresh reconstructions: they must not brighten merely
    // because the same state was asked for again.
    const decay = ctx.dt > 0 ? timedDecay(ctx.trails, ctx.dt) : 0
    const accum = this.accum
    const hueAccum = this.hueAccum
    const palette = this.palette
    const lensLut = this.lensLut
    const empty = palette[0]
    const px = w * h

    if (this.autoGain === 0) {
      let sum = 0
      let occ = 0
      for (let i = 0; i < px; i++) {
        if (accum[i] <= 0) continue
        sum += accum[i]
        occ++
      }
      if (occ > 0) this.autoGain = (TARGET_LEVEL * occ) / sum
    }
    const gain = this.autoGain * ctx.exposure
    const hueTop = HUE_BINS - 1e-3
    let sum = 0
    let occupied = 0
    for (let i = 0; i < px; i++) {
      const val = accum[i]
      if (val > 1e-4) {
        const k = val * gain
        const idx = k >= 255 ? 255 : k | 0
        if (hueLens) {
          const hh = Math.max(0, Math.min(1, hueAccum[i] / val))
          out[i] = lensLut[(((hh * hueTop) | 0) << 8) | idx]
          hueAccum[i] *= decay
        } else {
          out[i] = palette[idx]
        }
        accum[i] = val * decay
        sum += val
        occupied++
      } else {
        out[i] = empty
        accum[i] = 0
        hueAccum[i] = 0
      }
    }
    // Auto-exposure, metered off the frame just drawn, but only while the
    // galaxy dominates the screen: deep in its core, or fading in from the
    // web, the meter would chase a handful of particles.
    if (occupied > px * 0.02 && !ctx.fading) {
      const want = (TARGET_LEVEL * occupied) / sum
      const ease = 1 - Math.exp(-Math.max(1 / 240, ctx.dt) / 0.75)
      this.autoGain += (want - this.autoGain) * ease
    }

    if (ctx.events && lens === "density" && !ctx.fading) {
      const ox = w * 0.5 - v.x * v.scale
      const oy = h * 0.5 + v.y * v.scale
      this.events.draw({ out, w, h }, (x, y) => [x * v.scale + ox, oy - y * v.scale], 1)
    }
  }

  /** A still of the galaxy at its natural framing, for the sky behind its black hole. */
  portrait(size: number, ctx: DrawContext): { image: Uint32Array; w: number; h: number } {
    const out = new Uint32Array(size * size)
    const keep = { accum: this.accum, hue: this.hueAccum, coarse: this.coarse, cw: this.coarseW, ch: this.coarseH, rw: this.rw, rh: this.rh }
    this.rw = this.rh = 0
    const c = this.centre()
    this.render(out, { x: c.x, y: c.y, scale: (size * 0.5) / (GALAXY_EXTENT * 0.6), w: size, h: size }, { ...ctx, lens: "density", dt: 0, events: false, fading: true })
    this.accum = keep.accum
    this.hueAccum = keep.hue
    this.coarse = keep.coarse
    this.coarseW = keep.cw
    this.coarseH = keep.ch
    this.rw = keep.rw
    this.rh = keep.rh
    return { image: out, w: size, h: size }
  }

  analyse(instruments: boolean): GalaxyInstruments | null {
    const u = this.uni
    const diag = isolatedDiagnostics(u.masses, u.nMass)
    if (this.angularZero === null) this.angularZero = diag.angularMomentum
    const hist = this.history
    const last = hist.t[hist.t.length - 1]
    if (last === undefined || u.time > last) {
      hist.t.push(u.time)
      hist.virial.push(diag.virial)
      hist.r10.push(diag.lagrangian[0])
      hist.r50.push(diag.lagrangian[1])
      hist.r90.push(diag.lagrangian[2])
      if (hist.t.length > HISTORY_CAP) {
        for (const k of Object.keys(hist) as (keyof typeof hist)[]) hist[k] = hist[k].filter((_, i) => i % 2 === 0)
      }
    }
    if (!instruments) return null
    return {
      kind: "galaxy",
      t: [...hist.t],
      virial: [...hist.virial],
      r10: [...hist.r10],
      r50: [...hist.r50],
      r90: [...hist.r90],
      rotation: diag.rotation,
      angularDrift: Math.abs(diag.angularMomentum - this.angularZero) / Math.max(1e-12, diag.angularScale),
      momentumDrift: diag.momentumDrift,
      units: this.units,
    }
  }
}
