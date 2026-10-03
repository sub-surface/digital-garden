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
  /** cos/sin(2πk/n) for k < n/2 — every stage indexes this one table. */
  cos: Float64Array
  sin: Float64Array
  /** Contiguous scratch for {@link COLUMN_BLOCK} gathered columns. */
  blockR: Float64Array
  blockI: Float64Array
}

/**
 * Columns are transformed in blocks: gathering 8 adjacent columns reads each
 * row as one 64-byte cache line, where a column-at-a-time pass touched a new
 * line for every element. At a 256² mesh that stride walk, not arithmetic, was
 * most of the solve.
 */
const COLUMN_BLOCK = 8

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
  // A table rather than a running rotation (w ← w·step): exact to the last
  // bit at every stage, and one load instead of four multiplies per butterfly.
  const cos = new Float64Array(n >> 1)
  const sin = new Float64Array(n >> 1)
  for (let k = 0; k < n >> 1; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / n)
    sin[k] = Math.sin((2 * Math.PI * k) / n)
  }
  const block = Math.min(COLUMN_BLOCK, n)
  const plan = {
    n,
    reverse,
    cos,
    sin,
    blockR: new Float64Array(block * n),
    blockI: new Float64Array(block * n),
  }
  FFT_PLANS.set(n, plan)
  return plan
}

/** In-place radix-2 transform of `n` contiguous complex values at `offset`. */
function fft1d(
  re: Float64Array,
  im: Float64Array,
  offset: number,
  inverse: boolean,
  plan: FftPlan,
): void {
  const { n, reverse, cos, sin } = plan

  for (let i = 0; i < n; i++) {
    const j = reverse[i]
    if (j <= i) continue
    const a = offset + i
    const b = offset + j
    let t = re[a]
    re[a] = re[b]
    re[b] = t
    t = im[a]
    im[a] = im[b]
    im[b] = t
  }

  // Forward uses e^{-2πik/n}; inverse e^{+2πik/n}.
  const sign = inverse ? 1 : -1
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const step = n / len
    for (let base = offset; base < offset + n; base += len) {
      for (let j = 0, t = 0; j < half; j++, t += step) {
        const wr = cos[t]
        const wi = sign * sin[t]
        const even = base + j
        const odd = even + half
        const or = re[odd] * wr - im[odd] * wi
        const oi = re[odd] * wi + im[odd] * wr
        const er = re[even]
        const ei = im[even]
        re[even] = er + or
        im[even] = ei + oi
        re[odd] = er - or
        im[odd] = ei - oi
      }
    }
  }

  if (inverse) {
    const scale = 1 / n
    for (let i = offset; i < offset + n; i++) {
      re[i] *= scale
      im[i] *= scale
    }
  }
}

/** In-place radix-2 transform of a square row-major complex field. */
export function fft2(re: Float64Array, im: Float64Array, n: number, inverse: boolean): void {
  if (re.length !== n * n || im.length !== n * n) {
    throw new Error("FILAMENT FFT arrays do not match the requested mesh")
  }
  const plan = fftPlan(n)
  for (let y = 0; y < n; y++) fft1d(re, im, y * n, inverse, plan)

  const { blockR, blockI } = plan
  const width = Math.min(COLUMN_BLOCK, n)
  for (let x0 = 0; x0 < n; x0 += width) {
    // Gather: block column c lives contiguously at [c·n, (c+1)·n).
    for (let y = 0; y < n; y++) {
      const row = y * n + x0
      for (let c = 0; c < width; c++) {
        blockR[c * n + y] = re[row + c]
        blockI[c * n + y] = im[row + c]
      }
    }
    for (let c = 0; c < width; c++) fft1d(blockR, blockI, c * n, inverse, plan)
    for (let y = 0; y < n; y++) {
      const row = y * n + x0
      for (let c = 0; c < width; c++) {
        re[row + c] = blockR[c * n + y]
        im[row + c] = blockI[c * n + y]
      }
    }
  }
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
