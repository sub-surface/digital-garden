/**
 * FILAMENT — the cosmological engine.
 *
 * A periodic patch 180 Mpc across, filled with cold dark matter, run from the
 * surface of last scattering to today. Pure, seeded, DOM-free: the worker
 * draws it, `scripts/test-fmm.ts` checks it.
 *
 * ---------------------------------------------------------------------------
 * THE MATTER IS A SHEET, NOT A SWARM
 * ---------------------------------------------------------------------------
 * Cold dark matter starts with essentially zero velocity dispersion: at each
 * point of space there is one velocity. It is therefore not a gas of particles
 * but a two-dimensional *sheet* folded through the four-dimensional phase
 * space (x, y, vx, vy). The particles here are not bodies; they are the
 * vertices of that sheet, laid on a regular Lagrangian lattice q and carried
 * by their displacement ψ:
 *
 *     x(q, t) = q + ψ(q, t)
 *
 * Because the lattice connectivity never changes, every little triangle of
 * three neighbours carries a fixed mass, and its area on screen gives the
 * density exactly — no counting noise at all. Where the sheet folds over
 * itself the triangles invert and several streams overlap: that is a halo, and
 * the fold lines are caustics, where the density of a single stream formally
 * diverges. Rendering the sheet (Abel, Hahn & Kaehler 2012; Shandarin et al.
 * 2012) instead of the points is what turns a blurry particle cloud into the
 * crisp web of real simulations.
 *
 * ---------------------------------------------------------------------------
 * TIME: FastPM
 * ---------------------------------------------------------------------------
 * Kick-drift-kick in the canonical momentum u = a²ẋ, with the kick and drift
 * factors of Feng et al. (2016): instead of ∫dt/a² and ∫dt, the drift moves a
 * particle by ΔD/G_p and the kick by ΔG_p/G_f — the exact Zel'dovich trajectory
 * whenever the force is linear. Large-scale growth is therefore exact at *any*
 * step size, and the step only has to resolve the nonlinear dynamics. Steps
 * are equal in ln D: equal effort per e-fold of *structure*, not of expansion,
 * so the dark ages — when D barely moves in this 2D universe — cost almost
 * nothing.
 */

import { mulberry32 } from "@/lib/composer/rng"
import { A_REC, CosmicHistory, cmbGlow, epochOf, PATCH_MPC } from "./cosmology"
import { fft2, ParticleMesh, wrapPeriodic } from "./particle-mesh"
import { K_BINS, kBin } from "./spectrum"
import { DEFAULT_IC, transferFor, type InitialConditions } from "./presets"
import type { Cloud } from "./presets"

export { cmbGlow }

/** Steps per unit ln D. 100 → ~300 steps from recombination to today. */
const STEPS_PER_LN_D = 100
/** Never let a step span more than this in ln a, so the clock stays smooth. */
const MAX_DLNA = 0.2
/** Turnover of the primordial spectrum, in box modes (≈ 30 Mpc). */
const K_TURN = 6
/** σ₈ is defined in a top-hat of 8 Mpc. */
const R8 = 8 / PATCH_MPC

export interface CosmosOptions {
  seed: number
  /** Lagrangian lattice width; particles = grid². Power of two. */
  grid: number
  /** Force mesh width. Power of two. */
  meshSize: number
  ic?: InitialConditions
}

/** Box-Muller, one draw at a time. */
function gauss(rnd: () => number): number {
  const u = Math.max(1e-12, rnd())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
}

/** Bessel J₁, Abramowitz & Stegun 9.4.4 / 9.4.6 (|ε| < 1e-7). */
function besselJ1(x: number): number {
  const ax = Math.abs(x)
  if (ax < 3) {
    const t = (x / 3) * (x / 3)
    return x * (0.5 + t * (-0.56249985 + t * (0.21093573 + t * (-0.03954289 + t * (0.00443319 + t * (-0.00031761 + t * 0.00001109))))))
  }
  const t = 3 / ax
  const f = 0.79788456 + t * (0.00000156 + t * (0.01659667 + t * (0.00017105 + t * (-0.00249511 + t * (0.00113653 - t * 0.00020033)))))
  const th = ax - 2.35619449 + t * (0.12499612 + t * (0.0000565 + t * (-0.00637879 + t * (0.00074348 + t * (0.00079824 - t * 0.00029166)))))
  const v = (f * Math.cos(th)) / Math.sqrt(ax)
  return x < 0 ? -v : v
}

/** 2D top-hat window, 2J₁(x)/x. */
function topHat(x: number): number {
  return x < 1e-6 ? 1 : (2 * besselJ1(x)) / x
}

/**
 * Shape of the primordial spectrum as Δ²(k): rising as k³ on the largest
 * scales, turning over near k = 6 and then growing slowly, as k^0.8, toward
 * small scales. That slow rise is the 2D analogue of CDM's logarithmic one —
 * every smaller scale is a little more unstable than the last, so structure
 * forms bottom-up: small knots first, merging into filaments and nodes.
 */
function shape(k: number): number {
  return (k * k * k) / Math.pow(1 + (k / K_TURN) * (k / K_TURN), 1.1)
}

export interface Lattice {
  /** Displacement today (D = 1), per lattice point. */
  psiX: Float32Array
  psiY: Float32Array
  /** Linear Δ²(k) today for this realisation, per spectrum bin. */
  linearToday: Float64Array
}

/**
 * Zel'dovich displacements on the lattice, ψ_k = i·k·δ_k / k², normalised so
 * that the *cold* linear field today has σ₈ = `ic.amplitude`. Every species
 * draws the same random numbers; only its transfer function differs.
 */
export function zeldovichLattice(grid: number, seed: number, ic: InitialConditions): Lattice {
  const n = grid
  const cells = n * n
  const rnd = mulberry32((seed ^ 0x9e3779b1) >>> 0)
  const transfer = transferFor(ic.darkMatter)
  const xr = new Float64Array(cells)
  const xi = new Float64Array(cells)
  const yr = new Float64Array(cells)
  const yi = new Float64Array(cells)
  const binSum = new Float64Array(K_BINS)
  const binCount = new Float64Array(K_BINS)
  const kMax = n / 2 - 1
  // Smooth roll-off well before the lattice Nyquist so no mode aliases.
  const kCut = 0.7 * (n / 2)
  let sigma2 = 0

  const at = (x: number, y: number) => ((y + n) % n) * n + ((x + n) % n)
  for (let ky = 0; ky <= kMax; ky++) {
    for (let kx = -kMax; kx <= kMax; kx++) {
      if (ky === 0 && kx <= 0) continue
      const k = Math.hypot(kx, ky)
      if (k > kMax) continue
      const g1 = gauss(rnd)
      const g2 = gauss(rnd)
      const cut = Math.exp(-Math.pow(k / kCut, 4))
      // E|c_k|² = Δ²(k) / (2πk²); half in each of the real and imaginary parts.
      const cold2 = (shape(k) * cut * cut) / (2 * Math.PI * k * k)
      const t = transfer(k)
      const amp = Math.sqrt(cold2 / 2) * t
      const cr = amp * g1
      const ci = amp * g2
      // σ₈ from the expectation over both ±k, with the cold spectrum.
      sigma2 += 2 * cold2 * Math.pow(topHat(Math.PI * k * R8), 2)
      const b = kBin(k)
      if (b >= 0) {
        binSum[b] += 2 * Math.PI * k * k * (cr * cr + ci * ci)
        binCount[b]++
      }
      // ψ_k = i·k·δ_k/|k|² in physical wavenumbers (π per box mode).
      const qx = Math.PI * kx
      const qy = Math.PI * ky
      const q2 = qx * qx + qy * qy
      // F = n²·c, so the inverse transform (which divides by n²) returns c.
      const fr = cr * cells
      const fi = ci * cells
      const sx = qx / q2
      const sy = qy / q2
      const a = at(kx, ky)
      const m = at(-kx, -ky)
      // i·(fr + i·fi)·s = (−fi + i·fr)·s
      xr[a] = -fi * sx; xi[a] = fr * sx
      xr[m] = -fi * sx; xi[m] = -fr * sx
      yr[a] = -fi * sy; yi[a] = fr * sy
      yr[m] = -fi * sy; yi[m] = -fr * sy
    }
  }
  fft2(xr, xi, n, true)
  fft2(yr, yi, n, true)

  const norm = ic.amplitude / Math.sqrt(sigma2)
  const psiX = new Float32Array(cells)
  const psiY = new Float32Array(cells)
  for (let i = 0; i < cells; i++) {
    psiX[i] = xr[i] * norm
    psiY[i] = yr[i] * norm
  }
  const linearToday = new Float64Array(K_BINS)
  for (let b = 0; b < K_BINS; b++) {
    if (binCount[b] > 0) linearToday[b] = (binSum[b] / binCount[b]) * norm * norm
  }
  return { psiX, psiY, linearToday }
}

export interface CosmosSnapshot {
  a: number
  steps: number
  sx: Float32Array
  sy: Float32Array
  vx: Float32Array
  vy: Float32Array
}

export class Cosmos {
  readonly grid: number
  readonly n: number
  /**
   * Displacement from the lattice site, s = x − q: the integrated state.
   *
   * Positions near 1 have a float32 resolution of ~10⁻⁷, and in the dark ages
   * a whole step moves a particle about that far — so accumulating into the
   * position itself would round early growth away, systematically. The
   * displacement is small and keeps its full relative precision.
   */
  readonly sx: Float32Array
  readonly sy: Float32Array
  /** Unwrapped comoving positions q + s, derived after every drift. */
  readonly x: Float32Array
  readonly y: Float32Array
  /** Canonical momentum u = a²ẋ. */
  readonly vx: Float32Array
  readonly vy: Float32Array
  /** Positions at the start of the current step, for display interpolation. */
  readonly prevX: Float32Array
  readonly prevY: Float32Array
  private readonly ax: Float32Array
  private readonly ay: Float32Array

  readonly pm: ParticleMesh
  readonly history: CosmicHistory
  readonly linearToday: Float64Array
  readonly half = 1

  /** Scale factor of the physics state, and of the step before it. */
  a = A_REC
  aPrev = A_REC
  done = false
  steps = 0

  constructor(opts: CosmosOptions) {
    const ic = opts.ic ?? DEFAULT_IC
    const grid = opts.grid
    this.grid = grid
    this.n = grid * grid
    this.history = new CosmicHistory(ic.cosmology)
    const lattice = zeldovichLattice(grid, opts.seed, ic)
    this.linearToday = lattice.linearToday

    const n = this.n
    this.sx = new Float32Array(n)
    this.sy = new Float32Array(n)
    this.x = new Float32Array(n)
    this.y = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.prevX = new Float32Array(n)
    this.prevY = new Float32Array(n)
    this.ax = new Float32Array(n)
    this.ay = new Float32Array(n)

    // The growing mode: x = q + D·ψ, u = G_p·ψ.
    const D = this.history.growth(this.a)
    const Gp = this.history.momentumGrowth(this.a)
    for (let k = 0; k < n; k++) {
      this.sx[k] = D * lattice.psiX[k]
      this.sy[k] = D * lattice.psiY[k]
      this.vx[k] = Gp * lattice.psiX[k]
      this.vy[k] = Gp * lattice.psiY[k]
    }
    this.pm = new ParticleMesh(opts.meshSize, this.history.source)
    this.refresh()
    this.prevX.set(this.x)
    this.prevY.set(this.y)
  }

  /** Rebuild positions from displacements and re-solve the force on them. */
  refresh(): void {
    const grid = this.grid
    const spacing = 2 / grid
    const { x, y, sx, sy } = this
    for (let j = 0; j < grid; j++) {
      const qy = -1 + (j + 0.5) * spacing
      for (let i = 0; i < grid; i++) {
        const k = j * grid + i
        x[k] = -1 + (i + 0.5) * spacing + sx[k]
        y[k] = qy + sy[k]
      }
    }
    this.pm.solve(x, y, this.n, this.ax, this.ay)
  }

  /** The integrated state, for rewinding: displacements, momenta, clock. */
  snapshot(): CosmosSnapshot {
    return {
      a: this.a,
      steps: this.steps,
      sx: this.sx.slice(),
      sy: this.sy.slice(),
      vx: this.vx.slice(),
      vy: this.vy.slice(),
    }
  }

  /** Return to a snapshot. Forces are re-solved, so stepping resumes exactly. */
  restore(snap: CosmosSnapshot): void {
    this.sx.set(snap.sx)
    this.sy.set(snap.sy)
    this.vx.set(snap.vx)
    this.vy.set(snap.vy)
    this.a = snap.a
    this.aPrev = snap.a
    this.steps = snap.steps
    this.done = snap.a >= 1
    this.refresh()
    this.prevX.set(this.x)
    this.prevY.set(this.y)
  }

  /** Bytes one snapshot holds. */
  get snapshotBytes(): number {
    return this.n * 16
  }

  /** The next scale factor: one step in ln D, capped in ln a. */
  private nextA(): number {
    const D = this.history.growth(this.a)
    const byGrowth = this.history.scaleFactorAt(D * Math.exp(1 / STEPS_PER_LN_D))
    return Math.min(1, byGrowth, this.a * Math.exp(MAX_DLNA))
  }

  /** One FastPM kick-drift-kick, a → next. */
  step(): void {
    if (this.done) return
    const h = this.history
    const a0 = this.a
    const a1 = this.nextA()
    const ah = Math.sqrt(a0 * a1)
    const n = this.n
    const { x, y, sx, sy, vx, vy, ax, ay } = this

    const kick0 = (h.momentumGrowth(ah) - h.momentumGrowth(a0)) / h.forceGrowth(a0)
    const drift = (h.growth(a1) - h.growth(a0)) / h.momentumGrowth(ah)
    this.prevX.set(x)
    this.prevY.set(y)
    for (let i = 0; i < n; i++) {
      const ux = vx[i] + ax[i] * kick0
      const uy = vy[i] + ay[i] * kick0
      vx[i] = ux
      vy[i] = uy
      sx[i] += ux * drift
      sy[i] += uy * drift
    }

    this.refresh()
    const kick1 = (h.momentumGrowth(a1) - h.momentumGrowth(ah)) / h.forceGrowth(a1)
    for (let i = 0; i < n; i++) {
      vx[i] += ax[i] * kick1
      vy[i] += ay[i] * kick1
    }

    this.aPrev = a0
    this.a = a1
    this.steps++
    if (a1 >= 1) this.done = true
  }

  /**
   * Interpolation weight for displaying epoch `aShow` ∈ [aPrev, a]. Within a
   * step every particle drifts in a straight line *linear in D*, so this lerp
   * is not an approximation of the drift — it is the drift.
   */
  displayWeight(aShow: number): number {
    const h = this.history
    const d0 = h.growth(this.aPrev)
    const d1 = h.growth(this.a)
    if (!(d1 > d0)) return 1
    return Math.max(0, Math.min(1, (h.growth(aShow) - d0) / (d1 - d0)))
  }

  get z(): number {
    return 1 / this.a - 1
  }

  get time(): number {
    return this.history.ageAt(this.a)
  }

  get growthFactor(): number {
    return this.history.growth(this.a)
  }

  get hubbleRate(): number {
    return this.history.hubble(this.a)
  }

  epoch(): string {
    return epochOf(this.z, this.done)
  }

  /** Named epoch at an arbitrary scale factor (the one on screen). */
  epochAt(a: number): string {
    return epochOf(1 / a - 1, false)
  }

  /** A {@link Cloud} view for the analysis code (momentum in vx/vy). */
  get cloud(): Cloud {
    return { x: this.x, y: this.y, vx: this.vx, vy: this.vy, m: new Float32Array(0) }
  }

  forEachDensityCell(cb: (mass: number, x: number, y: number, size: number) => void): void {
    this.pm.forEachCell(cb)
  }

  /** Mean canonical momentum — zero for an isolated periodic box. */
  meanMomentum(): number {
    let sx = 0
    let sy = 0
    for (let i = 0; i < this.n; i++) {
      sx += this.vx[i]
      sy += this.vy[i]
    }
    return Math.hypot(sx, sy) / this.n
  }

  /** Wrapped copy of a position, for anything that wants the box image. */
  static wrap(v: number): number {
    return wrapPeriodic(v, 1)
  }
}
