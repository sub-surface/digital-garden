/**
 * FILAMENT — the simulation proper, with no rendering and no messaging.
 *
 * Kept separate from `sim.worker.ts` so the physics is headlessly testable
 * (`scripts/test-fmm.ts`), the same way `src/lib/sigil.ts` is separate from the
 * page that draws it. The worker owns pixels, events and the camera; this owns
 * particles, the tree, and time.
 *
 * Two integrators live here, chosen by the scenario:
 *
 *   • {@link Universe.stepStatic} — ordinary kick-drift-kick in physical time,
 *     for isolated systems.
 *   • {@link Universe.stepCosmo} — kick-drift-kick in ln a, in comoving
 *     coordinates on a ΛCDM background, for the run from recombination to now.
 *     See `cosmology.ts` for the derivation; the short version is that with the
 *     canonical momentum u = a²ẋ the Hubble drag term vanishes, leaving a
 *     genuinely symplectic scheme with no friction to leak energy through.
 */

import { Fmm, applyPerm, chooseDepth, MAX_DEPTH } from "./fmm"
import { makeInitialState, type Cloud, type PresetName } from "./presets"
import { ageOf, hubble } from "./cosmology"

/** Scale factor at which a cosmological run stops: the present day. */
export const A_TODAY = 1

export interface UniverseOptions {
  preset: PresetName
  seed: number
  nMass: number
  nTracer: number
  order: number
  /** Multiplier on the preset's softening length. */
  softening: number
}

export interface UniverseStats {
  cells: number
  depth: number
  nearPairs: number
  translations: number
  /** Direct-sum pair count divided by the work actually done. */
  speedup: number
}

export class Universe {
  masses!: Cloud
  tracers!: Cloud
  fmm!: Fmm

  readonly nMass: number
  readonly nTracer: number
  cosmological = false

  /** Physical-time clock (isolated scenarios). */
  dt = 0.002
  simTime = 0
  /** Cosmological clock. */
  a = 1
  dlnA = 1e-3
  cosmicTime = 0
  done = false

  private softeningBase = 0.004
  private softeningScale = 1
  private ax!: Float32Array
  private ay!: Float32Array
  private tax!: Float32Array
  private tay!: Float32Array
  private scratch!: Float32Array
  private depthAdj = 0
  private depthTick = 0

  /** Half-width the view should frame initially. */
  extent = 1

  readonly stats: UniverseStats = { cells: 0, depth: 0, nearPairs: 0, translations: 0, speedup: 1 }

  constructor(opts: UniverseOptions) {
    this.nMass = opts.nMass
    this.nTracer = opts.nTracer
    this.softeningScale = opts.softening

    const init = makeInitialState(opts.preset, opts.seed, opts.nMass, opts.nTracer)
    this.masses = init.masses
    this.tracers = init.tracers
    this.cosmological = init.cosmological
    this.dt = init.dt
    this.dlnA = init.dlnA
    this.a = init.aStart
    this.cosmicTime = init.cosmological ? ageOf(init.aStart) : 0
    this.softeningBase = init.softening
    this.extent = init.extent

    this.ax = new Float32Array(opts.nMass)
    this.ay = new Float32Array(opts.nMass)
    this.tax = new Float32Array(opts.nTracer)
    this.tay = new Float32Array(opts.nTracer)
    this.scratch = new Float32Array(Math.max(opts.nMass, 1))
    this.fmm = new Fmm(opts.order)

    // Prime the accelerations so the first half-kick is not a free fall.
    this.solve()
  }

  /** Swap the expansion order; the tree is rebuilt from scratch. */
  setOrder(order: number): void {
    this.fmm = new Fmm(order)
    this.solve()
  }

  setSoftening(scale: number): void {
    this.softeningScale = scale
  }

  /** Redshift, or 0 for the isolated scenarios. */
  get z(): number {
    return this.cosmological ? 1 / this.a - 1 : 0
  }

  /** The clock the readout should show — cosmic time, or elapsed sim time. */
  get time(): number {
    return this.cosmological ? this.cosmicTime : this.simTime
  }

  private get softening(): number {
    return this.softeningBase * this.softeningScale
  }

  /**
   * Deepest tree that stays consistent with the softening length.
   *
   * The near field is softened and the far field is not, so the two only agree
   * if every far-field interaction happens at a separation where softening is
   * negligible. The closest far-field pair sits two cells apart, so requiring a
   * leaf at least ~1.2 softening lengths across puts that at r ≳ 2.4ε, where the
   * Plummer correction is a few per cent. Let the tree get finer than that and
   * particles a fraction of a softening length apart start exchanging *hard*
   * unsoftened kicks through the multipole expansion — which is exactly how a
   * cold collapse tears itself apart.
   */
  private maxUsefulDepth(): number {
    const leaf = 1.2 * this.softening
    if (!(leaf > 0)) return MAX_DEPTH
    return Math.max(2, Math.min(MAX_DEPTH, Math.floor(Math.log2((2 * this.fmm.boxHalf) / leaf))))
  }

  /**
   * Enclose the massive particles in a square box.
   *
   * The exact bounding box is the obvious choice and the wrong one: a single
   * escaper on a hyperbolic orbit doubles the box every so often and quarters
   * the resolution of everything that matters. Capping it at a few times the
   * RMS radius keeps the tree tight around the bulk of the mass; the handful of
   * particles outside get clamped into the border cells by `Fmm.sort`, which is
   * exactly as much accuracy as an escaper deserves.
   */
  private boundBox(): void {
    const n = this.nMass
    const { x, y } = this.masses
    let sx = 0, sy = 0, sxx = 0, syy = 0
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let i = 0; i < n; i++) {
      const xi = x[i], yi = y[i]
      sx += xi; sy += yi
      sxx += xi * xi; syy += yi * yi
      if (xi < minX) minX = xi
      if (xi > maxX) maxX = xi
      if (yi < minY) minY = yi
      if (yi > maxY) maxY = yi
    }
    const cx = sx / n
    const cy = sy / n
    const rx = Math.sqrt(Math.max(0, sxx / n - cx * cx))
    const ry = Math.sqrt(Math.max(0, syy / n - cy * cy))
    const tight = Math.max(maxX - cx, cx - minX, maxY - cy, cy - minY)
    // Floor the box at the resolution limit: a system that has collapsed inside
    // its own softening length has no structure left to resolve, and letting the
    // box chase it down only produces a degenerate tree.
    const floor = 8 * this.softening
    const half = Math.max(floor, Math.min(tight, 3.5 * Math.max(rx, ry)) * 1.02)
    this.fmm.setBox(cx, cy, half)
  }

  /** Sort, build, evaluate — one full force solve. */
  solve(): void {
    const n = this.nMass
    const { fmm, masses, tracers } = this
    this.boundBox()

    const depth = Math.max(
      2,
      Math.min(MAX_DEPTH, this.maxUsefulDepth(), chooseDepth(n) + this.depthAdj),
    )
    const perm = fmm.sort(masses.x, masses.y, n, depth)
    for (const arr of [masses.x, masses.y, masses.vx, masses.vy, masses.m]) {
      applyPerm(arr, this.scratch, perm, n)
      arr.set(this.scratch.subarray(0, n))
    }

    fmm.build(masses.x, masses.y, masses.m)
    const eps = this.softeningBase * this.softeningScale
    fmm.evalMasses(masses.x, masses.y, masses.m, this.ax, this.ay, 1, eps * eps)
    if (this.nTracer > 0) {
      fmm.evalTracers(tracers.x, tracers.y, this.nTracer, this.tax, this.tay, 1)
    }

    // In comoving coordinates the source of the peculiar field is (Σ - Σ̄), not
    // Σ: without subtracting the mean, the entire patch simply collapses on
    // itself, expansion or no expansion. For a uniform disc of unit mass and
    // unit comoving radius the mean field is exactly -x, so the correction is
    // +x — one line, and exact for the unperturbed state, which is the state
    // whose equilibrium actually needs preserving.
    if (this.cosmological) {
      // Inside the patch the uniform-disc field is exactly -x, so the
      // correction is +x. Outside it, the shell theorem takes over and the mean
      // field falls as M/r — so the correction has to fall too. Continuing the
      // linear interior form past the rim would push anything that strayed
      // outside ever harder outwards, steadily eroding the boundary; this is
      // the exact mean field at every radius, which leaves the rim in genuine
      // equilibrium rather than approximate equilibrium.
      const bg = (x: number, y: number) => {
        const r2 = x * x + y * y
        return r2 <= 1 ? 1 : 1 / r2
      }
      for (let i = 0; i < n; i++) {
        const k = bg(masses.x[i], masses.y[i])
        this.ax[i] += masses.x[i] * k
        this.ay[i] += masses.y[i] * k
      }
      for (let i = 0; i < this.nTracer; i++) {
        const k = bg(tracers.x[i], tracers.y[i])
        this.tax[i] += tracers.x[i] * k
        this.tay[i] += tracers.y[i] * k
      }
    }

    const s = this.stats
    s.cells = fmm.stats.cells
    s.depth = fmm.depth
    s.nearPairs = fmm.stats.nearPairs
    s.translations = fmm.stats.translations

    // An M2L translation is p² complex multiply-adds; a near-field pair is one.
    // Counting them in the same currency gives an honest ratio against the
    // direct sum rather than a flattering one.
    const p = fmm.p
    const work = s.nearPairs + s.translations * p * p + n * p * 2
    s.speedup = (n * Math.max(0, n - 1)) / Math.max(1, work)

    // Retune the tree depth from what the near field actually cost. As the
    // universe clusters, leaves that were comfortable fill up; this is the
    // cheap half of what adaptive FMM does properly, for one comparison.
    // `chooseDepth` assumes a uniform distribution, which the interesting
    // configurations emphatically are not: two compact discs inside a box sized
    // by their separation start out with hundreds of particles per leaf. React
    // every few solves rather than every twenty, so the opening seconds of a
    // scenario are not spent at a depth chosen for a universe that isn't there.
    if (++this.depthTick >= 5) {
      this.depthTick = 0
      const perParticle = s.nearPairs / Math.max(1, n)
      if (perParticle > 320 && this.depthAdj < 5) this.depthAdj++
      else if (perParticle < 70 && this.depthAdj > -2) this.depthAdj--
    }
  }

  private kick(c: Cloud, a: Float32Array, b: Float32Array, n: number, f: number): void {
    for (let i = 0; i < n; i++) {
      c.vx[i] += a[i] * f
      c.vy[i] += b[i] * f
    }
  }

  private drift(c: Cloud, n: number, f: number): void {
    for (let i = 0; i < n; i++) {
      c.x[i] += c.vx[i] * f
      c.y[i] += c.vy[i] * f
    }
  }

  /** Kick-drift-kick in physical time. */
  private stepStatic(): void {
    const h = this.dt * 0.5
    this.kick(this.masses, this.ax, this.ay, this.nMass, h)
    this.kick(this.tracers, this.tax, this.tay, this.nTracer, h)
    this.drift(this.masses, this.nMass, this.dt)
    this.drift(this.tracers, this.nTracer, this.dt)
    this.solve()
    this.kick(this.masses, this.ax, this.ay, this.nMass, h)
    this.kick(this.tracers, this.tax, this.tay, this.nTracer, h)
    this.simTime += this.dt
  }

  /**
   * Kick-drift-kick in ln a.
   *
   *     dx/d(ln a) = u / (a²H)      du/d(ln a) = Γ(x) / H
   *
   * Drift factors are evaluated at the midpoint of the step, which keeps the
   * scheme second order across the enormous range of a it has to cover — seven
   * e-folds, from the surface of last scattering to the present day.
   */
  private stepCosmo(): void {
    const half = this.dlnA * 0.5
    const lnA0 = Math.log(this.a)

    const k0 = half / hubble(this.a)
    this.kick(this.masses, this.ax, this.ay, this.nMass, k0)
    this.kick(this.tracers, this.tax, this.tay, this.nTracer, k0)

    const aMid = Math.exp(lnA0 + half)
    const driftF = this.dlnA / (aMid * aMid * hubble(aMid))
    this.drift(this.masses, this.nMass, driftF)
    this.drift(this.tracers, this.nTracer, driftF)

    this.a = Math.exp(lnA0 + this.dlnA)
    // dt = d(ln a)/H — the cosmic clock falls straight out of the integrator.
    this.cosmicTime += this.dlnA / hubble(aMid)

    this.solve()

    const k1 = half / hubble(this.a)
    this.kick(this.masses, this.ax, this.ay, this.nMass, k1)
    this.kick(this.tracers, this.tax, this.tay, this.nTracer, k1)

    if (this.a >= A_TODAY) {
      this.a = A_TODAY
      this.done = true
    }
  }

  /** Advance one step, in whichever time variable this scenario uses. */
  step(): void {
    if (this.cosmological) {
      if (!this.done) this.stepCosmo()
    } else {
      this.stepStatic()
    }
  }

  /** Where we are in the story, for the readout. */
  epoch(): string {
    if (!this.cosmological) return ""
    if (this.done) return "today"
    const z = this.z
    if (z > 900) return "recombination"
    if (z > 30) return "the dark ages"
    if (z > 10) return "cosmic dawn"
    if (z > 6) return "reionisation"
    if (z > 1.2) return "cosmic noon"
    return "the modern era"
  }

  /** RMS comoving displacement of the massive species — a clustering proxy. */
  rmsRadius(): number {
    let s = 0
    const { x, y } = this.masses
    for (let i = 0; i < this.nMass; i++) s += x[i] * x[i] + y[i] * y[i]
    return Math.sqrt(s / Math.max(1, this.nMass))
  }
}
