/**
 * FILAMENT — the isolated worlds: discs, mergers, streams and collapses.
 *
 * Kept separate from `sim.worker.ts` so the physics is headlessly testable
 * (`scripts/test-fmm.ts`). The worker owns pixels, events and the camera; this
 * owns particles, the FMM force solver, and time. The expanding periodic box
 * is a different machine entirely and lives in `cosmos.ts`.
 *
 * Integration is ordinary kick-drift-kick leapfrog in physical time:
 * symplectic, time-reversible, and second order, which is what keeps a disc's
 * energy and angular momentum from drifting over thousands of orbits.
 */

import { Fmm, applyPerm, chooseDepth, MAX_DEPTH } from "./fmm"
import { makeInitialState, type Cloud, type InitialState, type PresetName } from "./presets"

export interface UniverseOptions {
  preset: PresetName
  seed: number
  nMass: number
  nTracer: number
  order: number
  /** Multiplier on the preset's softening length. */
  softening: number
  /** A ready-made world (a zoom-in), used instead of the preset. */
  initial?: InitialState
  /**
   * Tidal tensor of the outside universe, [T_xx, T_xy, T_yy]: every particle
   * feels a = −T·r about the origin, the linear stretch of a distant field.
   */
  tidal?: [number, number, number]
}

export interface UniverseStats {
  cells: number
  depth: number
  nearPairs: number
  translations: number
  /** Direct-sum pair count divided by the work actually done. */
  speedup: number
  /** Fraction of total mass in the densest force cell. */
  peakCellMass: number
  occupiedCells: number
}

export class Universe {
  masses!: Cloud
  tracers!: Cloud
  fmm!: Fmm

  readonly nMass: number
  readonly nTracer: number

  dt = 0.002
  /** Elapsed time, code units. */
  time = 0

  /** External tidal tensor [T_xx, T_xy, T_yy], or null for an island universe. */
  private readonly tidal: [number, number, number] | null
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

  readonly stats: UniverseStats = {
    cells: 0,
    depth: 0,
    nearPairs: 0,
    translations: 0,
    speedup: 1,
    peakCellMass: 0,
    occupiedCells: 0,
  }

  constructor(opts: UniverseOptions) {
    this.nMass = opts.nMass
    this.nTracer = opts.nTracer
    this.softeningScale = opts.softening

    const init = opts.initial ?? makeInitialState(opts.preset, opts.seed, opts.nMass, opts.nTracer)
    this.tidal = opts.tidal ?? null
    this.masses = init.masses
    this.tracers = init.tracers
    this.dt = init.dt
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
      if (!Number.isFinite(xi) || !Number.isFinite(yi)) {
        throw new Error(`non-finite massive particle ${i}`)
      }
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
    const arrays = [masses.x, masses.y, masses.vx, masses.vy, masses.m]
    if (masses.tag) arrays.push(masses.tag)
    for (const arr of arrays) {
      applyPerm(arr, this.scratch, perm, n)
      arr.set(this.scratch.subarray(0, n))
    }

    fmm.build(masses.x, masses.y, masses.m)
    const eps = this.softeningBase * this.softeningScale
    fmm.evalMasses(masses.x, masses.y, masses.m, this.ax, this.ay, 1, eps * eps)
    if (this.nTracer > 0) {
      fmm.evalTracers(tracers.x, tracers.y, this.nTracer, this.tax, this.tay, 1)
    }
    if (this.tidal) {
      const [txx, txy, tyy] = this.tidal
      for (const [c, n, ax, ay] of [
        [masses, this.nMass, this.ax, this.ay],
        [tracers, this.nTracer, this.tax, this.tay],
      ] as const) {
        for (let i = 0; i < n; i++) {
          ax[i] -= txx * c.x[i] + txy * c.y[i]
          ay[i] -= txy * c.x[i] + tyy * c.y[i]
        }
      }
    }

    const s = this.stats
    s.cells = fmm.stats.cells
    s.depth = fmm.depth
    s.nearPairs = fmm.stats.nearPairs
    s.translations = fmm.stats.translations

    const com = { x: 0, y: 0 }
    const cells = 1 << (2 * fmm.depth)
    let peak = 0
    let occupied = 0
    for (let c = 0; c < cells; c++) {
      const mass = fmm.leafCom(c, com)
      if (mass <= 0) continue
      occupied++
      if (mass > peak) peak = mass
    }
    s.peakCellMass = peak
    s.occupiedCells = occupied

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
      if (perParticle > 160 && this.depthAdj < 5) this.depthAdj++
      else if (perParticle < 35 && this.depthAdj > -2) this.depthAdj--
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

  /** One kick-drift-kick step. */
  step(): void {
    const h = this.dt * 0.5
    this.kick(this.masses, this.ax, this.ay, this.nMass, h)
    this.kick(this.tracers, this.tax, this.tay, this.nTracer, h)
    this.drift(this.masses, this.nMass, this.dt)
    this.drift(this.tracers, this.nTracer, this.dt)
    this.solve()
    this.kick(this.masses, this.ax, this.ay, this.nMass, h)
    this.kick(this.tracers, this.tax, this.tay, this.nTracer, h)
    this.time += this.dt
  }

  /** The tree's box, which the camera follows. */
  get boxCx(): number {
    return this.fmm.boxCx
  }

  get boxCy(): number {
    return this.fmm.boxCy
  }

  get boxHalf(): number {
    return this.fmm.boxHalf
  }

  /**
   * Solver-independent density cells for luminous-event detection.
   *
   * The callback is observational: it receives numbers only and cannot mutate
   * particle state, keeping quasars and starbursts provably outside dynamics.
   */
  forEachDensityCell(cb: (mass: number, x: number, y: number, size: number) => void): void {
    const side = 1 << this.fmm.depth
    const cells = side * side
    const h = (2 * this.fmm.boxHalf) / side
    const com = { x: 0, y: 0 }
    for (let c = 0; c < cells; c++) {
      const mass = this.fmm.leafCom(c, com)
      if (mass > 0) cb(mass, com.x, com.y, h)
    }
  }

  /** RMS comoving displacement of the massive species — a clustering proxy. */
  rmsRadius(): number {
    let s = 0
    const { x, y } = this.masses
    for (let i = 0; i < this.nMass; i++) s += x[i] * x[i] + y[i] * y[i]
    return Math.sqrt(s / Math.max(1, this.nMass))
  }
}
