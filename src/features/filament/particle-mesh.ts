/**
 * Periodic particle-mesh gravity for FILAMENT's cosmological volume.
 *
 * A cosmological patch is not an isolated island: every production large-scale
 * structure code solves a periodic box, subtracting the homogeneous density
 * before gravity is evaluated. The old circular FMM patch approximated that
 * subtraction analytically, but its open boundary still let one late-time halo
 * become the attractor for the whole simulation.
 *
 * This solver deposits every particle onto a periodic mesh with cloud-in-cell
 * (CIC), solves the 2D Poisson equation by FFT, differentiates the potential,
 * then interpolates the field back with the same CIC kernel. The matching
 * deposit/sample pair conserves momentum, the mesh supplies a natural
 * softening scale, and the cost is O(N + M log M).
 */

import type { Cloud } from "./presets"

interface FftPlan {
  n: number
  reverse: Uint32Array
  /** One twiddle rotation per radix-2 stage, shared by every transform. */
  stepR: Float64Array
  stepI: Float64Array
}

const FFT_PLANS = new Map<number, FftPlan>()

function fftPlan(n: number): FftPlan {
  const cached = FFT_PLANS.get(n)
  if (cached) return cached
  if (n < 2 || (n & (n - 1)) !== 0) {
    throw new Error(`FILAMENT particle mesh must be a power of two; received ${n}`)
  }

  const bits = Math.log2(n)
  const reverse = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    let x = i
    let y = 0
    for (let b = 0; b < bits; b++) {
      y = (y << 1) | (x & 1)
      x >>>= 1
    }
    reverse[i] = y
  }
  const stepR = new Float64Array(bits + 1)
  const stepI = new Float64Array(bits + 1)
  for (let level = 1, len = 2; level <= bits; level++, len <<= 1) {
    const angle = (2 * Math.PI) / len
    stepR[level] = Math.cos(angle)
    stepI[level] = Math.sin(angle)
  }
  const plan = { n, reverse, stepR, stepI }
  FFT_PLANS.set(n, plan)
  return plan
}

function fft1d(
  re: Float64Array,
  im: Float64Array,
  offset: number,
  stride: number,
  inverse: boolean,
  plan: FftPlan,
): void {
  const { n, reverse, stepR, stepI } = plan

  for (let i = 0; i < n; i++) {
    const j = reverse[i]
    if (j <= i) continue
    const a = offset + i * stride
    const b = offset + j * stride
    let t = re[a]
    re[a] = re[b]
    re[b] = t
    t = im[a]
    im[a] = im[b]
    im[b] = t
  }

  for (let len = 2, level = 1; len <= n; len <<= 1, level++) {
    const wrStep = stepR[level]
    const wiStep = stepI[level] * (inverse ? 1 : -1)
    const half = len >> 1
    for (let base = 0; base < n; base += len) {
      let wr = 1
      let wi = 0
      for (let j = 0; j < half; j++) {
        const even = offset + (base + j) * stride
        const odd = offset + (base + j + half) * stride
        const or = re[odd] * wr - im[odd] * wi
        const oi = re[odd] * wi + im[odd] * wr
        const er = re[even]
        const ei = im[even]
        re[even] = er + or
        im[even] = ei + oi
        re[odd] = er - or
        im[odd] = ei - oi
        const nextR = wr * wrStep - wi * wiStep
        wi = wr * wiStep + wi * wrStep
        wr = nextR
      }
    }
  }

  if (inverse) {
    const scale = 1 / n
    for (let i = 0; i < n; i++) {
      const o = offset + i * stride
      re[o] *= scale
      im[o] *= scale
    }
  }
}

/** In-place radix-2 transform of a square row-major complex field. */
export function fft2(re: Float64Array, im: Float64Array, n: number, inverse: boolean): void {
  if (re.length !== n * n || im.length !== n * n) {
    throw new Error("FILAMENT FFT arrays do not match the requested mesh")
  }
  const plan = fftPlan(n)
  for (let y = 0; y < n; y++) fft1d(re, im, y * n, 1, inverse, plan)
  for (let x = 0; x < n; x++) fft1d(re, im, x, n, inverse, plan)
}

/** Wrap a coordinate into [-half, half) without an iteration. */
export function wrapPeriodic(x: number, half = 1): number {
  const width = half * 2
  return x - Math.floor((x + half) / width) * width
}

export interface ParticleMeshStats {
  cells: number
  occupied: number
  peakCellMass: number
  /** Approximate complex butterflies across the forward and inverse FFTs. */
  fftOps: number
}

export class ParticleMesh {
  readonly size: number
  readonly half: number
  readonly cellSize: number
  readonly cellMass: Float32Array
  readonly fieldX: Float32Array
  readonly fieldY: Float32Array
  readonly stats: ParticleMeshStats

  private readonly spectralR: Float64Array
  private readonly spectralI: Float64Array
  private readonly poissonScale: Float64Array
  private readonly previous: Uint16Array
  private readonly next: Uint16Array

  constructor(size: number, source: number, half = 1) {
    fftPlan(size)
    this.size = size
    this.half = half
    this.cellSize = (2 * half) / size
    const cells = size * size
    this.cellMass = new Float32Array(cells)
    this.fieldX = new Float32Array(cells)
    this.fieldY = new Float32Array(cells)
    this.spectralR = new Float64Array(cells)
    this.spectralI = new Float64Array(cells)
    this.poissonScale = new Float64Array(cells)
    this.previous = new Uint16Array(size)
    this.next = new Uint16Array(size)
    for (let i = 0; i < size; i++) {
      this.previous[i] = i === 0 ? size - 1 : i - 1
      this.next[i] = i + 1 === size ? 0 : i + 1
    }

    // The discrete Green function depends only on mesh geometry. Cache it once
    // instead of evaluating thousands of trigonometric functions per step.
    const invDx = 1 / this.cellSize
    const wave = new Float64Array(size)
    for (let i = 0; i < size; i++) {
      const k = i <= size / 2 ? i : i - size
      wave[i] = 2 * Math.sin(Math.PI * k / size) * invDx
    }
    for (let y = 0; y < size; y++) {
      const sy = wave[y]
      for (let x = 0; x < size; x++) {
        const sx = wave[x]
        const k2 = sx * sx + sy * sy
        this.poissonScale[y * size + x] = k2 === 0 ? 0 : -source / k2
      }
    }
    this.stats = {
      cells,
      occupied: 0,
      peakCellMass: 0,
      fftOps: 2 * cells * Math.log2(size),
    }
  }

  private deposit(c: Cloud, nParticles: number, mass: number): void {
    const n = this.size
    const rho = this.cellMass
    const invCell = 1 / this.cellSize
    const half = this.half
    for (let i = 0; i < nParticles; i++) {
      const x = c.x[i]
      const y = c.y[i]
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`non-finite periodic particle ${i}`)
      }
      // Mesh values live at cell centres. Subtracting half a cell makes
      // deposit and interpolation address those centres rather than corners.
      const gx = (x + half) * invCell - 0.5
      const gy = (y + half) * invCell - 0.5
      const fx0 = Math.floor(gx)
      const fy0 = Math.floor(gy)
      // Positions are already periodic, so these floors are only -1..n-1.
      // Branches avoid four general modulo operations in this hottest loop.
      const x0 = fx0 < 0 ? n - 1 : fx0
      const y0 = fy0 < 0 ? n - 1 : fy0
      const x1 = x0 + 1 === n ? 0 : x0 + 1
      const y1 = y0 + 1 === n ? 0 : y0 + 1
      const tx = gx - fx0
      const ty = gy - fy0
      const wx0 = 1 - tx
      const wy0 = 1 - ty
      rho[y0 * n + x0] += mass * wx0 * wy0
      rho[y0 * n + x1] += mass * tx * wy0
      rho[y1 * n + x0] += mass * wx0 * ty
      rho[y1 * n + x1] += mass * tx * ty
    }
  }

  private sample(
    c: Cloud,
    nParticles: number,
    ax: Float32Array,
    ay: Float32Array,
  ): void {
    const n = this.size
    const fx = this.fieldX
    const fy = this.fieldY
    const invCell = 1 / this.cellSize
    const half = this.half
    for (let i = 0; i < nParticles; i++) {
      const gx = (c.x[i] + half) * invCell - 0.5
      const gy = (c.y[i] + half) * invCell - 0.5
      const fx0 = Math.floor(gx)
      const fy0 = Math.floor(gy)
      const x0 = fx0 < 0 ? n - 1 : fx0
      const y0 = fy0 < 0 ? n - 1 : fy0
      const x1 = x0 + 1 === n ? 0 : x0 + 1
      const y1 = y0 + 1 === n ? 0 : y0 + 1
      const tx = gx - fx0
      const ty = gy - fy0
      const wx0 = 1 - tx
      const wy0 = 1 - ty
      const i00 = y0 * n + x0
      const i10 = y0 * n + x1
      const i01 = y1 * n + x0
      const i11 = y1 * n + x1
      ax[i] =
        fx[i00] * wx0 * wy0 +
        fx[i10] * tx * wy0 +
        fx[i01] * wx0 * ty +
        fx[i11] * tx * ty
      ay[i] =
        fy[i00] * wx0 * wy0 +
        fy[i10] * tx * wy0 +
        fy[i01] * wx0 * ty +
        fy[i11] * tx * ty
    }
  }

  /**
   * Solve the periodic peculiar field.
   *
   * In Cosmos, both arrays are equal-mass particles. Keeping two arrays is a
   * storage/performance detail inherited from the isolated FMM scenarios, not a
   * distinction in their cosmological dynamics.
   */
  solve(
    masses: Cloud,
    nMass: number,
    tracers: Cloud,
    nTracer: number,
    ax: Float32Array,
    ay: Float32Array,
    tax: Float32Array,
    tay: Float32Array,
  ): void {
    const total = nMass + nTracer
    if (total <= 0) throw new Error("FILAMENT cannot solve an empty universe")

    const n = this.size
    const cells = n * n
    const rho = this.cellMass
    rho.fill(0)
    const particleMass = 1 / total
    this.deposit(masses, nMass, particleMass)
    this.deposit(tracers, nTracer, particleMass)

    const mean = 1 / cells
    const re = this.spectralR
    const im = this.spectralI
    let occupied = 0
    let peak = 0
    for (let i = 0; i < cells; i++) {
      const m = rho[i]
      if (m > 0) occupied++
      if (m > peak) peak = m
      re[i] = m / mean - 1
      im[i] = 0
    }
    this.stats.occupied = occupied
    this.stats.peakCellMass = peak

    fft2(re, im, n, false)

    // Cached discrete periodic Laplacian: the mesh operator and centred force
    // remain consistent at the grid scale without recomputing any sines.
    const poisson = this.poissonScale
    for (let i = 0; i < cells; i++) {
      re[i] *= poisson[i]
      im[i] *= poisson[i]
    }

    fft2(re, im, n, true)

    const gx = this.fieldX
    const gy = this.fieldY
    const invDx = 1 / this.cellSize
    const derivative = 0.5 * invDx
    const previous = this.previous
    const next = this.next
    for (let y = 0; y < n; y++) {
      const ym = previous[y]
      const yp = next[y]
      for (let x = 0; x < n; x++) {
        const xm = previous[x]
        const xp = next[x]
        const i = y * n + x
        gx[i] = -(re[y * n + xp] - re[y * n + xm]) * derivative
        gy[i] = -(re[yp * n + x] - re[ym * n + x]) * derivative
      }
    }

    this.sample(masses, nMass, ax, ay)
    this.sample(tracers, nTracer, tax, tay)
  }

  /** Iterate physical cell masses and centres for halo/event detection. */
  forEachCell(cb: (mass: number, x: number, y: number, size: number) => void): void {
    const n = this.size
    const h = this.cellSize
    for (let y = 0; y < n; y++) {
      const cy = -this.half + (y + 0.5) * h
      for (let x = 0; x < n; x++) {
        const mass = this.cellMass[y * n + x]
        if (mass > 0) cb(mass, -this.half + (x + 0.5) * h, cy, h)
      }
    }
  }
}
