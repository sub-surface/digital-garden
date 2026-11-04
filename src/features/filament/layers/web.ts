/**
 * The web: a periodic, expanding box 180 Mpc across, evolved by FastPM
 * (`engine/cosmos.ts`) and drawn by folding its dark-matter sheet into pixels
 * (`render/sheet.ts`).
 *
 * Physics runs on its own schedule (steps equal in ln D) and the display
 * interpolates between steps, so playback speed and accuracy are independent.
 * The layer keeps snapshots on the way through history, so the timeline can
 * be scrubbed backwards: restore the nearest earlier state and replay, which
 * the deterministic integrator does exactly.
 */

import { Cosmos, type CosmosSnapshot } from "../engine/cosmos"
import { A_REC, cmbGlow, HUBBLE_TIME_GYR, PATCH_MPC, type Afterglow } from "../engine/cosmology"
import { COSMO_KMS, findHalos, haloMassSun, type Halo } from "../engine/halos"
import type { InitialConditions } from "../engine/ics"
import { wrapPeriodic } from "../engine/particle-mesh"
import { MeshAnalysis, densityPdf, type WebCensus, type WebClass } from "../engine/analysis"
import { K_BINS, kBinCentre } from "../engine/spectrum"
import { SheetRaster } from "../render/sheet"
import { Events } from "../render/events"
import { ring } from "../render/draw"
import {
  HUE_BINS,
  HUE_SCALE,
  buildDensityPalette,
  buildLensPalette,
  buildLogTone,
  LOG_TONE,
  lensHasHue,
  signedHue,
  streamHue,
} from "../render/palettes"
import type { CosmicInstruments, HaloCard, LensName, ProbeReading, WorldUnits } from "../protocol"
import type { DrawContext, Layer, View } from "./layer"

export const WEB_UNITS: WorldUnits = { kpc: PATCH_MPC * 1000, kms: COSMO_KMS, myr: HUBBLE_TIME_GYR * 1000 }

/** Seconds from recombination to today at ▶. */
const RUN_SECONDS = 70
/** Wall-clock budget for physics per frame. */
const STEP_BUDGET_MS = 22
/** Share of the playback clock spent per e-fold of expansion vs of growth. */
const CLOCK_EXPANSION_SHARE = 0.22
/** T-web smoothing (3 comoving Mpc) and eigenvalue threshold. */
const WEB_SMOOTHING = 3 / PATCH_MPC
const WEB_THRESHOLD = 0.3
/** Wavenumbers treated as "the largest modes" for the growth instrument. */
const GROWTH_K_MAX = 4.5
const HISTORY_CAP = 360
/** Haloes worth a ring, and how many. */
const RING_MIN_MEMBERS = 40
const RING_MAX = 90
/** Haloes are catalogued only once there is structure to find. */
const CATALOGUE_FROM_A = 0.06

const WEB_LENSES: LensName[] = ["density", "streams", "web", "flow", "potential", "redshift"]

export interface WebOptions {
  seed: number
  grid: number
  meshSize: number
  ic: InitialConditions
}

export class WebLayer implements Layer {
  readonly kind = "web" as const
  readonly extent = 1
  readonly units = WEB_UNITS
  readonly cosmos: Cosmos

  /** Playback position, 0 at recombination and 1 today. */
  private playhead = 0
  /** Scale factor on screen; lies within the cosmos's current step. */
  aShow: number
  private dispX: Float32Array
  private dispY: Float32Array
  private readonly sheet = new SheetRaster()

  // Time travel.
  private snapshots: CosmosSnapshot[] = []
  private nextSnapshot = 0
  private readonly snapshotEvery: number
  /** A scrub in progress: the scale factor the web is being run to. */
  pendingSeek: number | null = null

  // Haloes.
  catalogue: Halo[] = []
  catalogueA = 0
  private sinceCatalogue = Infinity
  /** Halo under the pointer, ringed brighter. */
  hover = -1

  // Analysis.
  private readonly analysis: MeshAnalysis
  private readonly analysisMass: Float32Array
  private readonly hueMesh: Float32Array
  private webValid = false
  private phiValid = false
  private flowValid = false
  private census: WebCensus | null = null
  private readonly spectrum = new Float64Array(K_BINS)
  private growth = { lnA: [] as number[], measured: [] as number[] }

  // Colour.
  private readonly palette = new Uint32Array(256)
  private readonly lensLut = new Uint32Array(HUE_BINS * 256)
  private readonly logTone = buildLogTone()
  private glowKey = -1
  private lutKey = ""

  readonly events: Events

  constructor(opts: WebOptions) {
    const c = new Cosmos({ seed: opts.seed, grid: opts.grid, meshSize: opts.meshSize, ic: opts.ic })
    this.cosmos = c
    this.aShow = c.a
    this.dispX = new Float32Array(c.n)
    this.dispY = new Float32Array(c.n)
    // As many rewind points as ~64 MB allows, up to forty across the run.
    const count = Math.max(8, Math.min(40, Math.floor((64 * 1024 * 1024) / c.snapshotBytes)))
    this.snapshotEvery = 1 / count
    this.snapshots = [c.snapshot()]
    this.nextSnapshot = this.snapshotEvery
    const an = Math.min(256, c.pm.size, Math.max(64, c.grid))
    this.analysis = new MeshAnalysis(an, c.half)
    this.hueMesh = new Float32Array(an * an).fill(0.5)
    this.analysisMass = new Float32Array(an * an)
    this.events = new Events(opts.seed, c.half, true)
  }

  /** The lens this layer reads; anything else falls back to density. */
  lens(lens: LensName): LensName {
    return WEB_LENSES.includes(lens) ? lens : "density"
  }

  get finished(): boolean {
    return this.cosmos.done && this.playhead >= 1
  }

  /** True while the web is being run to a scrubbed epoch. */
  get busy(): boolean {
    return this.pendingSeek !== null
  }

  // ---------------------------------------------------------------------------
  // Clock
  // ---------------------------------------------------------------------------

  /**
   * Playback position of scale factor a: a blend of e-folds of expansion and
   * of growth. Pure ln a would spend most of the run in the dark ages, where
   * nothing moves; pure ln D would flash through them in a frame.
   */
  private playheadOf(a: number): number {
    const h = this.cosmos.history
    const lnRec = Math.log(A_REC)
    const dRec = Math.log(h.growth(A_REC))
    const e = (Math.log(a) - lnRec) / -lnRec
    const g = (Math.log(h.growth(a)) - dRec) / -dRec
    return CLOCK_EXPANSION_SHARE * e + (1 - CLOCK_EXPANSION_SHARE) * g
  }

  private scaleFactorAtPlayhead(s: number): number {
    if (s <= 0) return A_REC
    if (s >= 1) return 1
    let lo = Math.log(A_REC)
    let hi = 0
    for (let i = 0; i < 36; i++) {
      const mid = 0.5 * (lo + hi)
      if (this.playheadOf(Math.exp(mid)) < s) lo = mid
      else hi = mid
    }
    return Math.exp(0.5 * (lo + hi))
  }

  private maybeSnapshot(): void {
    if (this.playhead < this.nextSnapshot) return
    this.snapshots.push(this.cosmos.snapshot())
    this.nextSnapshot = this.playhead + this.snapshotEvery
  }

  step(dtSec: number, rate: number): void {
    const c = this.cosmos
    if (this.finished) return
    this.playhead = Math.min(1, this.playhead + (dtSec * rate) / RUN_SECONDS)
    const want = this.scaleFactorAtPlayhead(this.playhead)
    const t0 = performance.now()
    while (!c.done && c.a < want && performance.now() - t0 < STEP_BUDGET_MS) c.step()
    this.maybeSnapshot()
    if (c.a < want) {
      // Physics is behind: show what exists rather than run ahead of it.
      this.aShow = c.a
      this.playhead = this.playheadOf(this.aShow)
    } else {
      this.aShow = Math.max(c.aPrev, want)
    }
    this.events.advance(dtSec, (cb) => c.forEachDensityCell(cb), 1 / this.aShow - 1, 2 * c.half)
    this.sinceCatalogue += dtSec
    if (this.sinceCatalogue > 1.2 && Math.log(c.a / Math.max(1e-9, this.catalogueA)) > 0.04) this.refreshCatalogue()
  }

  /**
   * Scrub to scale factor `a`. Forward runs the physics on; backward restores
   * the latest snapshot before `a` and replays from there.
   */
  seek(a: number): void {
    const c = this.cosmos
    const target = Math.max(this.snapshots[0].a, Math.min(1, a))
    if (target < c.a) {
      let k = this.snapshots.length - 1
      while (k > 0 && this.snapshots[k].a > target) k--
      c.restore(this.snapshots[k])
      this.snapshots.length = k + 1
      this.nextSnapshot = this.playheadOf(c.a) + this.snapshotEvery
      const keep = this.growth.lnA.filter((v) => v <= Math.log(target)).length
      this.growth = { lnA: this.growth.lnA.slice(0, keep), measured: this.growth.measured.slice(0, keep) }
    }
    this.pendingSeek = target
    this.catalogue = []
    this.catalogueA = 0
    this.hover = -1
    this.events.clear()
  }

  /** Work on a scrub for up to `budgetMs`; true once it has landed. */
  catchUp(budgetMs: number): boolean {
    const c = this.cosmos
    const target = this.pendingSeek
    if (target === null) return true
    const t = performance.now()
    while (!c.done && c.a < target && performance.now() - t < budgetMs) {
      c.step()
      this.playhead = this.playheadOf(c.a)
      this.maybeSnapshot()
    }
    if (c.done || c.a >= target) {
      this.aShow = Math.max(c.aPrev, Math.min(c.a, target))
      this.pendingSeek = null
      this.refreshCatalogue()
    } else {
      this.aShow = c.a
    }
    this.playhead = this.playheadOf(this.aShow)
    return this.pendingSeek === null
  }

  /** A monotonic count of physics steps, to key anything derived from this epoch. */
  get epochKey(): number {
    return this.cosmos.steps
  }

  // ---------------------------------------------------------------------------
  // Haloes
  // ---------------------------------------------------------------------------

  refreshCatalogue(): void {
    const c = this.cosmos
    this.sinceCatalogue = 0
    if (c.a < CATALOGUE_FROM_A) {
      this.catalogue = []
      this.catalogueA = c.a
      return
    }
    this.catalogue = findHalos(c.x, c.y, c.vx, c.vy, c.grid, c.a, c.half)
      .filter((h) => h.members.length >= RING_MIN_MEMBERS)
      .slice(0, RING_MAX)
    this.catalogueA = c.a
  }

  card(h: Halo): HaloCard {
    const c = this.cosmos
    return {
      id: h.id,
      members: h.members.length,
      massSun: haloMassSun(h.members.length, c.grid),
      radiusKpc: h.radius * this.catalogueA * PATCH_MPC * 1000,
      sigmaKms: h.sigma * COSMO_KMS,
      spin: h.spin,
      z: 1 / this.catalogueA - 1,
    }
  }

  /** Ring radius of a halo in web units, at `scale` pixels per unit. */
  ringRadius(h: Halo, scale: number): number {
    return Math.max(2.2 * h.radius, 7 / Math.max(1e-9, scale))
  }

  /** The halo whose ring contains (x, y); the smallest ring wins. */
  haloAt(x: number, y: number, scale: number): Halo | null {
    let best: Halo | null = null
    let bestR = Infinity
    for (const h of this.catalogue) {
      const r = this.ringRadius(h, scale)
      const dx = wrapPeriodic(x - h.x, 1)
      const dy = wrapPeriodic(y - h.y, 1)
      if (dx * dx + dy * dy < r * r && r < bestR) {
        best = h
        bestR = r
      }
    }
    return best
  }

  /**
   * The halo the camera is closing in on: the nearest whose ring holds the
   * screen centre, preferring the heaviest when rings overlap.
   */
  haloUnder(x: number, y: number, scale: number, prefer = -1): Halo | null {
    let best: Halo | null = null
    let bestD = Infinity
    for (const h of this.catalogue) {
      const dx = wrapPeriodic(h.x - x, 1)
      const dy = wrapPeriodic(h.y - y, 1)
      const d = Math.hypot(dx, dy)
      if (h.id === prefer && d < this.ringRadius(h, scale) * 3) return h
      if (d < this.ringRadius(h, scale) * 1.5 && d < bestD) {
        best = h
        bestD = d
      }
    }
    return best
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  private syncPalettes(lens: LensName, accent: [number, number, number], events: boolean): void {
    const glow: Afterglow = events && lens === "density" ? cmbGlow(this.aShow) : { strength: 0, r: 0, g: 0, b: 0 }
    const key = Math.round(glow.strength * 96) * 128 + Math.round(glow.g * 64) + accent[0] * 7 + accent[1] * 11
    if (key !== this.glowKey) {
      this.glowKey = key
      buildDensityPalette(this.palette, accent, glow)
    }
    if (lensHasHue(lens)) {
      const lk = `${lens}:${accent.join(",")}`
      if (lk !== this.lutKey) {
        this.lutKey = lk
        buildLensPalette(this.lensLut, lens, accent)
      }
    }
  }

  /** Mesh-lens hue at a pixel, bilinear from the periodic analysis mesh. */
  private sampleHue(px: number, py: number, v: View): number {
    const n = this.analysis.n
    const g = n / 2
    const wx = (px + 0.5 - v.w * 0.5) / v.scale + v.x + 1
    const wy = (v.h * 0.5 - py - 0.5) / v.scale + v.y + 1
    const gx = wx * g - 0.5
    const gy = wy * g - 0.5
    const fx = Math.floor(gx)
    const fy = Math.floor(gy)
    const tx = gx - fx
    const ty = gy - fy
    const x0 = ((fx % n) + n) % n
    const y0 = ((fy % n) + n) % n
    const x1 = x0 + 1 === n ? 0 : x0 + 1
    const y1 = y0 + 1 === n ? 0 : y0 + 1
    const hm = this.hueMesh
    const a = hm[y0 * n + x0] * (1 - tx) + hm[y0 * n + x1] * tx
    const b = hm[y1 * n + x0] * (1 - tx) + hm[y1 * n + x1] * tx
    return a * (1 - ty) + b * ty
  }

  render(out: Uint32Array, v: View, ctx: DrawContext, hideHalo = -1): void {
    const c = this.cosmos
    const lens = this.lens(ctx.lens)
    const { w, h } = v

    // Within a FastPM step every particle moves on a straight line linear in
    // D, so this interpolation *is* the drift.
    const wt = c.displayWeight(this.aShow)
    const { x, y, prevX, prevY, vy } = c
    const n = c.n
    const dispX = this.dispX
    const dispY = this.dispY
    if (lens === "redshift") {
      // Distance read from redshift: s = y + v_y/H, comoving — u/(a²H).
      const shift = 1 / (this.aShow * this.aShow * c.history.hubble(this.aShow))
      for (let i = 0; i < n; i++) {
        dispX[i] = prevX[i] + (x[i] - prevX[i]) * wt
        dispY[i] = prevY[i] + (y[i] - prevY[i]) * wt + vy[i] * shift
      }
    } else {
      for (let i = 0; i < n; i++) {
        dispX[i] = prevX[i] + (x[i] - prevX[i]) * wt
        dispY[i] = prevY[i] + (y[i] - prevY[i]) * wt
      }
    }
    this.sheet.resize(w, h)
    this.sheet.draw(dispX, dispY, c.grid, 2 * c.half, { cx: v.x, cy: v.y, scale: v.scale })
    this.syncPalettes(lens, ctx.accent, ctx.events)

    const density = this.sheet.density
    const bits = new Int32Array(density.buffer)
    const streams = this.sheet.streams
    const { lut, keyLo } = this.logTone
    const top = lut.length - 1
    const offset = Math.round(Math.log2(Math.max(1e-3, ctx.exposure)) * LOG_TONE.perOctave) - keyLo
    const meshHue =
      (lens === "web" && this.webValid) || (lens === "flow" && this.flowValid) || (lens === "potential" && this.phiValid)
    const hueTop = HUE_BINS - 1e-3
    const px = w * h
    const palette = this.palette
    const lensLut = this.lensLut
    if (lens === "streams") {
      for (let i = 0; i < px; i++) {
        const q = (density[i] > 0 ? bits[i] >> 16 : -1e9) + offset
        const idx = q <= 0 ? 0 : q >= top ? lut[top] : lut[q]
        out[i] = lensLut[(((streamHue(streams[i]) * hueTop) | 0) << 8) | idx]
      }
    } else if (meshHue) {
      for (let py = 0; py < h; py++) {
        const row = py * w
        for (let pxx = 0; pxx < w; pxx++) {
          const i = row + pxx
          const q = (density[i] > 0 ? bits[i] >> 16 : -1e9) + offset
          const idx = q <= 0 ? 0 : q >= top ? lut[top] : lut[q]
          out[i] = lensLut[(((this.sampleHue(pxx, py, v) * hueTop) | 0) << 8) | idx]
        }
      }
    } else {
      for (let i = 0; i < px; i++) {
        const q = (density[i] > 0 ? bits[i] >> 16 : -1e9) + offset
        out[i] = palette[q <= 0 ? 0 : q >= top ? lut[top] : lut[q]]
      }
    }

    if (ctx.fading) return
    const raster = { out, w, h }
    const toScreen = (wx: number, wy: number): [number, number] => [
      wrapPeriodic(wx - v.x, 1) * v.scale + w * 0.5,
      h * 0.5 - wrapPeriodic(wy - v.y, 1) * v.scale,
    ]
    if (ctx.events && this.catalogue.length) {
      const top = this.catalogue[0].members.length
      for (const halo of this.catalogue) {
        if (halo.id === hideHalo) continue
        const [sx, sy] = toScreen(halo.x, halo.y)
        const r = this.ringRadius(halo, v.scale) * v.scale
        if (sx < -r || sy < -r || sx > w + r || sy > h + r) continue
        const hot = halo.id === this.hover
        const k = hot ? 0.95 : 0.16 + 0.34 * Math.sqrt(halo.members.length / top)
        ring(raster, sx, sy, r, k, 205, 225, 255)
        if (hot) ring(raster, sx, sy, r + 2.5, 0.35, 205, 225, 255)
      }
    }
    if (ctx.events && lens === "density") this.events.draw(raster, toScreen, 0.6)
  }

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------

  private refreshHueMesh(lens: LensName): void {
    const an = this.analysis
    const hm = this.hueMesh
    const cells = hm.length
    if (lens === "web" && this.webValid) {
      for (let i = 0; i < cells; i++) hm[i] = an.web[i] * 0.5
    } else if (lens === "flow" && this.flowValid) {
      for (let i = 0; i < cells; i++) hm[i] = signedHue(an.theta[i], HUE_SCALE.flow)
    } else if (lens === "potential" && this.phiValid) {
      for (let i = 0; i < cells; i++) hm[i] = signedHue(an.phi[i], HUE_SCALE.potential)
    }
  }

  /** Measure the box; returns the instrument payload when asked for one. */
  analyse(lensIn: LensName, advancing: boolean, instruments: boolean, probing: boolean): CosmicInstruments | null {
    const c = this.cosmos
    const an = this.analysis
    const lens = this.lens(lensIn)
    binDown(c.pm.cellMass, c.pm.size, this.analysisMass, an.n)
    an.load(this.analysisMass)
    an.powerSpectrum(this.spectrum)
    if (lens === "web" || instruments || probing) {
      this.census = an.tidalWeb(WEB_SMOOTHING, WEB_THRESHOLD)
      this.webValid = true
    }
    if (lens === "potential" || probing) {
      an.potential()
      this.phiValid = true
    }
    if (lens === "flow") {
      an.flow([{ c: c.cloud, n: c.n }], 1 / (c.a * c.a * c.hubbleRate))
      this.flowValid = true
    }
    this.refreshHueMesh(lens)

    // Growth of the largest modes, recorded whether or not anyone is looking.
    let meas = 0
    let lin = 0
    for (let b = 0; b < K_BINS; b++) {
      if (kBinCentre(b) > GROWTH_K_MAX || c.linearToday[b] <= 0 || this.spectrum[b] <= 0) continue
      meas += this.spectrum[b]
      lin += c.linearToday[b]
    }
    if (lin > 0 && (advancing || this.growth.lnA.length === 0)) {
      const lnA = Math.log(c.a)
      const last = this.growth.lnA[this.growth.lnA.length - 1]
      if (last === undefined || lnA > last) {
        this.growth.lnA.push(lnA)
        this.growth.measured.push(Math.sqrt(meas / lin))
        if (this.growth.lnA.length > HISTORY_CAP) {
          this.growth.lnA = this.growth.lnA.filter((_, i) => i % 2 === 0)
          this.growth.measured = this.growth.measured.filter((_, i) => i % 2 === 0)
        }
      }
    }
    return instruments ? this.instruments() : null
  }

  private instruments(): CosmicInstruments {
    const c = this.cosmos
    const D = c.growthFactor
    const spectrum = this.spectrum
    const k: number[] = []
    const measured: number[] = []
    const linear: number[] = []
    const shot: number[] = []
    let kNL: number | null = null
    let prevK = 0
    let prevLin = 0
    for (let b = 0; b < K_BINS; b++) {
      if (spectrum[b] <= 0) continue
      const kc = kBinCentre(b)
      const lin = c.linearToday[b] * D * D
      k.push(kc)
      measured.push(spectrum[b])
      linear.push(lin)
      shot.push((2 * Math.PI * kc * kc) / c.n)
      // Largest scale at which linear theory has reached Δ² = 1.
      if (kNL === null && lin >= 1) {
        kNL = prevLin > 0 && prevLin < 1
          ? Math.exp(Math.log(prevK) + (Math.log(kc) - Math.log(prevK)) * (-Math.log(prevLin) / (Math.log(lin) - Math.log(prevLin))))
          : kc
      }
      if (lin > 0) {
        prevK = kc
        prevLin = lin
      }
    }
    const theoryLnA: number[] = []
    const theoryD: number[] = []
    const lo = Math.log(A_REC)
    for (let i = 0; i <= 64; i++) {
      const s = lo * (1 - i / 64)
      theoryLnA.push(s)
      theoryD.push(c.history.growth(Math.exp(s)))
    }
    return {
      kind: "cosmic",
      a: c.a,
      k,
      measured,
      linear,
      shot,
      kNL,
      growth: { lnA: [...this.growth.lnA], measured: [...this.growth.measured] },
      growthTheory: { lnA: theoryLnA, D: theoryD },
      pdf: densityPdf(this.analysis.delta),
      web: this.census,
    }
  }

  /** Read the field at web point (x, y). */
  probe(x: number, y: number, scale: number, lens: LensName): ProbeReading {
    const reading: ProbeReading = { x, y, cosmological: true, units: WEB_UNITS }
    const halo = this.haloAt(x, y, scale)
    this.hover = halo ? halo.id : -1
    if (halo) reading.halo = this.card(halo)
    const an = this.analysis
    const n = an.n
    const ix = Math.min(n - 1, Math.max(0, Math.floor(((x + 1) / 2) * n)))
    const iy = Math.min(n - 1, Math.max(0, Math.floor(((y + 1) / 2) * n)))
    const i = iy * n + ix
    reading.delta = an.delta[i]
    if (this.webValid) reading.web = an.web[i] as WebClass
    if (this.phiValid) reading.phi = an.phi[i]
    if (this.flowValid && this.lens(lens) === "flow") reading.theta = an.theta[i]
    return reading
  }

  /** Whether probing needs fields the current lens did not compute. */
  get probeFieldsReady(): boolean {
    return this.webValid && this.phiValid
  }
}

/** Sum a fine periodic mesh down to the analysis mesh, block by block. */
function binDown(src: Float32Array, n: number, dst: Float32Array, m: number): void {
  if (n === m) {
    dst.set(src)
    return
  }
  dst.fill(0)
  const f = n / m
  for (let y = 0; y < n; y++) {
    const row = ((y / f) | 0) * m
    for (let x = 0; x < n; x++) dst[row + ((x / f) | 0)] += src[y * n + x]
  }
}
