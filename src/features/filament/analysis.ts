/**
 * FILAMENT's instruments — what a cosmologist would measure in the box.
 *
 * Pure functions over typed arrays, no DOM, so `scripts/test-fmm.ts` can check
 * each one against a field with a known answer. Nothing here feeds back into
 * the dynamics: the worker reads these to draw lenses and charts, and the
 * particles never learn they were observed.
 *
 * Periodic-box measurements (Cosmos):
 *   • {@link MeshAnalysis.powerSpectrum} — Δ²(k), the variance per log-interval
 *     of scale, CIC-deconvolved, against the linear prediction for the same
 *     realisation. Where the two part company is where gravity has gone
 *     nonlinear.
 *   • {@link MeshAnalysis.tidalWeb} — the T-web of Hahn et al. (2007): the
 *     eigenvalues of the tidal tensor ∂ᵢ∂ⱼΦ say in how many directions matter is
 *     collapsing — none (void), one (filament), both (node).
 *   • {@link MeshAnalysis.potential} — the peculiar gravitational potential.
 *   • {@link MeshAnalysis.flow} — the divergence of the peculiar velocity in
 *     units of the Hubble rate: where matter is falling in, and where voids are
 *     expanding faster than the universe around them.
 *   • {@link densityPdf} — the one-point distribution of density, beside the
 *     log-normal model of Coles & Jones (1991).
 *
 * Isolated-system measurements (Disc, Encounter, Stream, Cold collapse) live in
 * {@link isolatedDiagnostics}: the 2D virial ratio, Lagrangian radii, the
 * rotation curve against √(GM(<r)), and the conserved quantities.
 */

import { fft2 } from "./particle-mesh"
import { K_BINS, cicWindow2, kBin } from "./spectrum"
import type { Cloud } from "./presets"

export type WebClass = 0 | 1 | 2
export const WEB_LABELS = ["void", "filament", "node"] as const

export interface WebCensus {
  /** Fraction of area in void, filament, node. */
  volume: [number, number, number]
  /** Fraction of mass in void, filament, node. */
  mass: [number, number, number]
}

/**
 * Spectral analysis on one periodic mesh. Owns its FFT buffers so a whole
 * analysis pass allocates nothing.
 */
export class MeshAnalysis {
  readonly n: number
  readonly half: number
  /** Forward transform of δ from the most recent {@link load}. */
  private readonly dR: Float64Array
  private readonly dI: Float64Array
  private readonly aR: Float64Array
  private readonly aI: Float64Array
  private readonly bR: Float64Array
  private readonly bI: Float64Array
  private readonly cR: Float64Array
  private readonly cI: Float64Array
  /** Physical wavenumber per mesh index, 2πk/L. */
  private readonly wave: Float64Array
  /** Integer wavenumber per mesh index. */
  private readonly kint: Int32Array

  /** Density contrast on the mesh, δ = ρ/ρ̄ − 1. */
  readonly delta: Float32Array
  /** Smoothed density contrast, from the last web pass. */
  readonly deltaSmooth: Float32Array
  /** Web class per cell, from the last web pass. */
  readonly web: Uint8Array
  /** Peculiar potential per cell, in units of its own rms. */
  readonly phi: Float32Array
  /** Velocity divergence per cell, in units of the Hubble rate. */
  readonly theta: Float32Array

  /** Mass per cell from the most recent load, normalised to a unit total. */
  private mass: Float32Array

  constructor(n: number, half = 1) {
    this.n = n
    this.half = half
    const cells = n * n
    this.dR = new Float64Array(cells)
    this.dI = new Float64Array(cells)
    this.aR = new Float64Array(cells)
    this.aI = new Float64Array(cells)
    this.bR = new Float64Array(cells)
    this.bI = new Float64Array(cells)
    this.cR = new Float64Array(cells)
    this.cI = new Float64Array(cells)
    this.delta = new Float32Array(cells)
    this.deltaSmooth = new Float32Array(cells)
    this.web = new Uint8Array(cells)
    this.phi = new Float32Array(cells)
    this.theta = new Float32Array(cells)
    this.mass = new Float32Array(cells)
    this.wave = new Float64Array(n)
    this.kint = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      const k = i <= n / 2 ? i : i - n
      this.kint[i] = k
      this.wave[i] = (Math.PI * k) / half
    }
  }

  /** Load a cell-mass field (any normalisation) and transform its contrast. */
  load(cellMass: Float32Array): void {
    const cells = this.n * this.n
    let total = 0
    for (let i = 0; i < cells; i++) total += cellMass[i]
    if (!(total > 0)) throw new Error("FILAMENT analysis received an empty mesh")
    const mean = total / cells
    for (let i = 0; i < cells; i++) {
      const d = cellMass[i] / mean - 1
      this.delta[i] = d
      this.mass[i] = cellMass[i] / total
      this.dR[i] = d
      this.dI[i] = 0
    }
    fft2(this.dR, this.dI, this.n, false)
  }

  /**
   * Dimensionless power Δ²(k) = 2πk²|δ_k|² per {@link K_BINS} bin.
   *
   * Each mode is divided by the CIC window it was deposited through, so the
   * mesh's own blur is not mistaken for missing power. Modes beyond 70% of
   * Nyquist are dropped: there aliasing, not physics, dominates.
   */
  powerSpectrum(out: Float64Array): void {
    const n = this.n
    const cells = n * n
    const sum = new Float64Array(K_BINS)
    const count = new Float64Array(K_BINS)
    const limit = 0.7 * (n / 2)
    for (let y = 0; y < n; y++) {
      const ky = this.kint[y]
      for (let x = 0; x < n; x++) {
        const kx = this.kint[x]
        const k = Math.hypot(kx, ky)
        if (k === 0 || k > limit) continue
        const b = kBin(k)
        if (b < 0) continue
        const i = y * n + x
        const p = (this.dR[i] * this.dR[i] + this.dI[i] * this.dI[i]) / (cells * cells)
        sum[b] += (k * k * p) / cicWindow2(kx, ky, n)
        count[b]++
      }
    }
    for (let b = 0; b < K_BINS; b++) out[b] = count[b] > 0 ? (2 * Math.PI * sum[b]) / count[b] : 0
  }

  /**
   * Classify every cell by its tidal tensor.
   *
   * T_ij = ∂ᵢ∂ⱼΦ with ∇²Φ = δ, smoothed by a Gaussian of radius `smoothing`
   * (code units), so its trace is the smoothed density contrast. A cell with
   * k eigenvalues above `threshold` is collapsing along k axes: 0 is a void,
   * 1 a filament — a sheet, seen edge-on in two dimensions — and 2 a node.
   */
  tidalWeb(smoothing: number, threshold: number): WebCensus {
    const n = this.n
    const cells = n * n
    const { dR, dI, aR, aI, bR, bI, cR, cI, wave } = this
    const r2 = smoothing * smoothing
    for (let y = 0; y < n; y++) {
      const ky = wave[y]
      for (let x = 0; x < n; x++) {
        const kx = wave[x]
        const i = y * n + x
        const k2 = kx * kx + ky * ky
        if (k2 === 0) {
          aR[i] = aI[i] = bR[i] = bI[i] = cR[i] = cI[i] = 0
          continue
        }
        const w = Math.exp(-0.5 * k2 * r2) / k2
        const xx = kx * kx * w
        const yy = ky * ky * w
        const xy = kx * ky * w
        aR[i] = dR[i] * xx
        aI[i] = dI[i] * xx
        bR[i] = dR[i] * yy
        bI[i] = dI[i] * yy
        cR[i] = dR[i] * xy
        cI[i] = dI[i] * xy
      }
    }
    fft2(aR, aI, n, true)
    fft2(bR, bI, n, true)
    fft2(cR, cI, n, true)

    const volume: [number, number, number] = [0, 0, 0]
    const mass: [number, number, number] = [0, 0, 0]
    for (let i = 0; i < cells; i++) {
      const txx = aR[i]
      const tyy = bR[i]
      const txy = cR[i]
      const mid = 0.5 * (txx + tyy)
      const rad = Math.sqrt(0.25 * (txx - tyy) * (txx - tyy) + txy * txy)
      const cls = ((mid + rad > threshold ? 1 : 0) + (mid - rad > threshold ? 1 : 0)) as WebClass
      this.web[i] = cls
      this.deltaSmooth[i] = txx + tyy
      volume[cls]++
      mass[cls] += this.mass[i]
    }
    for (let c = 0; c < 3; c++) volume[c] /= cells
    return { volume, mass }
  }

  /**
   * Peculiar potential, ∇²φ = δ, normalised to unit rms so the lens and the
   * probe read in σ. The potential is the smoothest field in the box — it is
   * δ with two powers of k divided out — which is why it is the one the CMB's
   * large-angle temperature pattern traces.
   */
  potential(): number {
    const n = this.n
    const cells = n * n
    const { dR, dI, aR, aI, wave } = this
    for (let y = 0; y < n; y++) {
      const ky = wave[y]
      for (let x = 0; x < n; x++) {
        const kx = wave[x]
        const i = y * n + x
        const k2 = kx * kx + ky * ky
        const g = k2 === 0 ? 0 : -1 / k2
        aR[i] = dR[i] * g
        aI[i] = dI[i] * g
      }
    }
    fft2(aR, aI, n, true)
    let s2 = 0
    for (let i = 0; i < cells; i++) s2 += aR[i] * aR[i]
    const rms = Math.sqrt(s2 / cells) || 1
    for (let i = 0; i < cells; i++) this.phi[i] = aR[i] / rms
    return rms
  }

  /**
   * Peculiar velocity divergence θ = ∇·v / H, smoothed by `smoothing`.
   *
   * Mass and momentum are deposited with the same CIC kernel as the force
   * solver, both smoothed by the same Gaussian, and divided — a mass-weighted
   * velocity field, the quantity peculiar-velocity surveys reconstruct. Linear
   * theory predicts θ = −f·δ; voids read positive (expanding faster than the
   * background) and collapsing structures strongly negative.
   *
   * `velocityScale` converts the stored momentum into velocity over the Hubble
   * rate: in Cosmos, u = a²ẋ, so ∇·v/H = ∇ₓ·u / (a²H).
   */
  flow(clouds: { c: Cloud; n: number }[], velocityScale: number): void {
    const n = this.n
    const cells = n * n
    const { aR, aI, bR, bI, cR, cI, wave } = this
    aR.fill(0)
    bR.fill(0)
    cR.fill(0)
    aI.fill(0)
    bI.fill(0)
    cI.fill(0)
    const half = this.half
    const invCell = n / (2 * half)
    let total = 0
    for (const { c, n: count } of clouds) {
      total += count
      for (let i = 0; i < count; i++) {
        const gx = (c.x[i] + half) * invCell - 0.5
        const gy = (c.y[i] + half) * invCell - 0.5
        const fx0 = Math.floor(gx)
        const fy0 = Math.floor(gy)
        const x0 = ((fx0 % n) + n) % n
        const y0 = ((fy0 % n) + n) % n
        const x1 = x0 + 1 === n ? 0 : x0 + 1
        const y1 = y0 + 1 === n ? 0 : y0 + 1
        const tx = gx - fx0
        const ty = gy - fy0
        const vx = c.vx[i]
        const vy = c.vy[i]
        const w00 = (1 - tx) * (1 - ty)
        const w10 = tx * (1 - ty)
        const w01 = (1 - tx) * ty
        const w11 = tx * ty
        const i00 = y0 * n + x0
        const i10 = y0 * n + x1
        const i01 = y1 * n + x0
        const i11 = y1 * n + x1
        aR[i00] += w00; aR[i10] += w10; aR[i01] += w01; aR[i11] += w11
        bR[i00] += w00 * vx; bR[i10] += w10 * vx; bR[i01] += w01 * vx; bR[i11] += w11 * vx
        cR[i00] += w00 * vy; cR[i10] += w10 * vy; cR[i01] += w01 * vy; cR[i11] += w11 * vy
      }
    }
    fft2(aR, aI, n, false)
    fft2(bR, bI, n, false)
    fft2(cR, cI, n, false)
    const r2 = this.flowSmoothing * this.flowSmoothing
    for (let y = 0; y < n; y++) {
      const ky = wave[y]
      for (let x = 0; x < n; x++) {
        const kx = wave[x]
        const i = y * n + x
        const w = Math.exp(-0.5 * (kx * kx + ky * ky) * r2)
        aR[i] *= w; aI[i] *= w
        bR[i] *= w; bI[i] *= w
        cR[i] *= w; cI[i] *= w
      }
    }
    fft2(aR, aI, n, true)
    fft2(bR, bI, n, true)
    fft2(cR, cI, n, true)

    // Where smoothing still leaves almost nothing, the velocity is undefined;
    // a floor at a tenth of the mean count biases those few cells toward rest
    // instead of dividing noise by noise.
    const floor = (0.1 * total) / cells
    for (let i = 0; i < cells; i++) {
      const m = Math.max(aR[i], floor)
      bR[i] /= m
      cR[i] /= m
    }
    const inv2h = invCell / 2
    for (let y = 0; y < n; y++) {
      const ym = (y === 0 ? n - 1 : y - 1) * n
      const yp = (y + 1 === n ? 0 : y + 1) * n
      const row = y * n
      for (let x = 0; x < n; x++) {
        const xm = x === 0 ? n - 1 : x - 1
        const xp = x + 1 === n ? 0 : x + 1
        const div = (bR[row + xp] - bR[row + xm] + cR[yp + x] - cR[ym + x]) * inv2h
        this.theta[row + x] = div * velocityScale
      }
    }
  }

  /** Gaussian smoothing radius for {@link flow}, in code units. */
  flowSmoothing = 0.03
}

// ---------------------------------------------------------------------------
// One-point statistics
// ---------------------------------------------------------------------------

export interface DensityPdf {
  /** log₁₀(1+δ) range covered by the bins. */
  lo: number
  hi: number
  /** Fraction of cells per bin. */
  measured: number[]
  /** Log-normal prediction per bin, from the measured variance alone. */
  model: number[]
  /** Fraction of cells with no mass at all. */
  empty: number
  /** rms density contrast. */
  sigma: number
}

/**
 * Histogram of log₁₀(1+δ), and the log-normal it should approach.
 *
 * Gravity drives an initially Gaussian δ toward a skewed distribution: δ cannot
 * fall below −1 but can climb without bound. Coles & Jones (1991) noticed that
 * ln(1+δ) stays close to Gaussian, with variance ln(1+σ²) fixed by σ alone —
 * a one-parameter prediction for the whole curve, drawn here with no fit.
 */
export function densityPdf(delta: Float32Array, bins = 36, lo = -1.5, hi = 2): DensityPdf {
  const cells = delta.length
  const measured = new Array<number>(bins).fill(0)
  const width = (hi - lo) / bins
  let empty = 0
  let s2 = 0
  for (let i = 0; i < cells; i++) {
    const d = delta[i]
    s2 += d * d
    const one = 1 + d
    if (one <= 1e-6) {
      empty++
      continue
    }
    // Tails beyond the axis pile into the edge bins rather than vanishing.
    const b = Math.floor((Math.log10(one) - lo) / width)
    measured[b < 0 ? 0 : b >= bins ? bins - 1 : b]++
  }
  for (let b = 0; b < bins; b++) measured[b] /= cells
  const sigma = Math.sqrt(s2 / cells)
  const varLn = Math.log(1 + sigma * sigma)
  const model = new Array<number>(bins).fill(0)
  if (varLn > 0) {
    const mu = -0.5 * varLn
    const norm = 1 / Math.sqrt(2 * Math.PI * varLn)
    for (let b = 0; b < bins; b++) {
      const y = (lo + (b + 0.5) * width) * Math.LN10
      model[b] = norm * Math.exp(-((y - mu) * (y - mu)) / (2 * varLn)) * width * Math.LN10
    }
  }
  return { lo, hi, measured, model, empty: empty / cells, sigma }
}

// ---------------------------------------------------------------------------
// Isolated systems
// ---------------------------------------------------------------------------

export interface IsolatedDiagnostics {
  /**
   * 2D virial ratio Q = 2K / (G(M² − Σm²)/2).
   *
   * In two dimensions r·F for a pair is −Gm₁m₂ whatever their separation, so
   * the virial sum is a constant: a self-gravitating system in equilibrium has
   * 2K = G(M² − Σm²)/2 exactly, independent of its size or shape. Q = 1 is
   * relaxed, Q < 1 is falling in, Q > 1 is flying apart. (Softening shaves a
   * percent or two off the equilibrium value.)
   */
  virial: number
  /** Radii enclosing 10%, 50%, 90% of the mass about the density centre. */
  lagrangian: [number, number, number]
  /** Rotation curve: bin centres, mean tangential speed, √(GM(<r)). */
  rotation: { r: number[]; vPhi: number[]; vCirc: number[] }
  /** Total angular momentum about the centre of mass. */
  angularMomentum: number
  /** Σ m·|r|·|v| — the scale against which angular-momentum drift is judged. */
  angularScale: number
  /** |Σ m v| / Σ m |v| — zero for an exact momentum-conserving solver. */
  momentumDrift: number
  /** Density centre, by shrinking spheres. */
  centre: { x: number; y: number }
}

/**
 * Find the density centre by shrinking spheres (Power et al. 2003): take the
 * centre of mass, keep only what lies within a radius, shrink, repeat. Unlike
 * the plain centre of mass it locks onto the dominant core and ignores tails,
 * escapers and satellites — the centre a rotation curve should be measured
 * about.
 */
function shrinkingCentre(x: Float32Array, y: Float32Array, m: Float32Array, n: number) {
  let cx = 0, cy = 0, mt = 0
  for (let i = 0; i < n; i++) {
    cx += m[i] * x[i]
    cy += m[i] * y[i]
    mt += m[i]
  }
  cx /= mt
  cy /= mt
  let r2max = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - cx
    const dy = y[i] - cy
    r2max = Math.max(r2max, dx * dx + dy * dy)
  }
  let radius = Math.sqrt(r2max)
  const minCount = Math.max(32, n * 0.02)
  for (let iter = 0; iter < 40; iter++) {
    radius *= 0.8
    const r2 = radius * radius
    let sx = 0, sy = 0, sm = 0, count = 0
    for (let i = 0; i < n; i++) {
      const dx = x[i] - cx
      const dy = y[i] - cy
      if (dx * dx + dy * dy > r2) continue
      sx += m[i] * x[i]
      sy += m[i] * y[i]
      sm += m[i]
      count++
    }
    if (count < minCount || sm <= 0) break
    cx = sx / sm
    cy = sy / sm
  }
  return { x: cx, y: cy, radius }
}

export function isolatedDiagnostics(c: Cloud, n: number, bins = 18): IsolatedDiagnostics {
  const { x, y, vx, vy, m } = c
  // Centre-of-mass frame for the global quantities.
  let mt = 0, sx = 0, sy = 0, px = 0, py = 0, pAbs = 0, m2 = 0
  for (let i = 0; i < n; i++) {
    const mi = m[i]
    mt += mi
    m2 += mi * mi
    sx += mi * x[i]
    sy += mi * y[i]
    px += mi * vx[i]
    py += mi * vy[i]
    pAbs += mi * Math.hypot(vx[i], vy[i])
  }
  const comX = sx / mt
  const comY = sy / mt
  const comVx = px / mt
  const comVy = py / mt
  let kinetic = 0
  let lz = 0
  let lScale = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - comX
    const dy = y[i] - comY
    const ux = vx[i] - comVx
    const uy = vy[i] - comVy
    kinetic += 0.5 * m[i] * (ux * ux + uy * uy)
    lz += m[i] * (dx * uy - dy * ux)
    lScale += m[i] * Math.hypot(dx, dy) * Math.hypot(ux, uy)
  }
  const virial = (2 * kinetic) / Math.max(1e-12, 0.5 * (mt * mt - m2))

  // Profiles about the density centre, in its own rest frame.
  const centre = shrinkingCentre(x, y, m, n)
  const coreR2 = centre.radius * centre.radius * 4
  let cvx = 0, cvy = 0, cm = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - centre.x
    const dy = y[i] - centre.y
    if (dx * dx + dy * dy > coreR2) continue
    cvx += m[i] * vx[i]
    cvy += m[i] * vy[i]
    cm += m[i]
  }
  if (cm > 0) {
    cvx /= cm
    cvy /= cm
  }

  const order = new Uint32Array(n)
  const radius = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    order[i] = i
    radius[i] = Math.hypot(x[i] - centre.x, y[i] - centre.y)
  }
  order.sort((a, b) => radius[a] - radius[b])

  const lagrangian: [number, number, number] = [0, 0, 0]
  const targets = [0.1, 0.5, 0.9]
  let acc = 0
  let t = 0
  for (let j = 0; j < n && t < 3; j++) {
    acc += m[order[j]]
    while (t < 3 && acc >= targets[t] * mt) lagrangian[t++] = radius[order[j]]
  }

  // Rotation curve out to 1.2 × r90, in equal-width radial bins.
  const rMax = Math.max(1e-6, lagrangian[2] * 1.2)
  const vSum = new Float64Array(bins)
  const mSum = new Float64Array(bins)
  for (let i = 0; i < n; i++) {
    const r = radius[i]
    if (r >= rMax || r <= 0) continue
    const b = Math.floor((r / rMax) * bins)
    const dx = (x[i] - centre.x) / r
    const dy = (y[i] - centre.y) / r
    const vt = -dy * (vx[i] - cvx) + dx * (vy[i] - cvy)
    vSum[b] += m[i] * vt
    mSum[b] += m[i]
  }
  // Enclosed mass at each bin centre, from the sorted radii.
  const rotR: number[] = []
  const vPhi: number[] = []
  const vCirc: number[] = []
  let j = 0
  let enclosed = 0
  for (let b = 0; b < bins; b++) {
    const rc = ((b + 0.5) / bins) * rMax
    while (j < n && radius[order[j]] <= rc) enclosed += m[order[j++]]
    if (mSum[b] <= 0) continue
    rotR.push(rc)
    // Sign-agnostic: report the sense of rotation of the bulk, so a clockwise
    // disc and an anticlockwise one draw the same curve.
    vPhi.push(vSum[b] / mSum[b])
    vCirc.push(Math.sqrt(enclosed))
  }
  const sense = vPhi.reduce((s, v) => s + v, 0) < 0 ? -1 : 1
  for (let b = 0; b < vPhi.length; b++) vPhi[b] *= sense

  return {
    virial,
    lagrangian,
    rotation: { r: rotR, vPhi, vCirc },
    angularMomentum: lz,
    angularScale: lScale,
    momentumDrift: Math.hypot(px, py) / Math.max(1e-12, pAbs),
    centre: { x: centre.x, y: centre.y },
  }
}

// ---------------------------------------------------------------------------
// Redshift space
// ---------------------------------------------------------------------------

/**
 * Deposit a cloud onto a periodic mesh with CIC, displaced along y by
 * `shiftY · vy` — the redshift-space map of a survey whose line of sight is the
 * vertical. A galaxy's redshift measures its Hubble distance plus its peculiar
 * velocity, so anything moving away looks farther than it is.
 */
export function depositPeriodic(
  field: Float32Array,
  n: number,
  half: number,
  c: Cloud,
  count: number,
  mass: number,
  shiftY = 0,
): void {
  const invCell = n / (2 * half)
  const width = 2 * half
  for (let i = 0; i < count; i++) {
    let y = c.y[i] + c.vy[i] * shiftY
    y -= Math.floor((y + half) / width) * width
    const gx = (c.x[i] + half) * invCell - 0.5
    const gy = (y + half) * invCell - 0.5
    const fx0 = Math.floor(gx)
    const fy0 = Math.floor(gy)
    const x0 = fx0 < 0 ? n - 1 : fx0 >= n ? fx0 - n : fx0
    const y0 = fy0 < 0 ? n - 1 : fy0 >= n ? fy0 - n : fy0
    const x1 = x0 + 1 === n ? 0 : x0 + 1
    const y1 = y0 + 1 === n ? 0 : y0 + 1
    const tx = gx - fx0
    const ty = gy - fy0
    field[y0 * n + x0] += mass * (1 - tx) * (1 - ty)
    field[y0 * n + x1] += mass * tx * (1 - ty)
    field[y1 * n + x0] += mass * (1 - tx) * ty
    field[y1 * n + x1] += mass * tx * ty
  }
}
