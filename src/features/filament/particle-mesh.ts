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
 * (CIC), solves the 2D Poisson equation by FFT with a deconvolved Green
 * function, takes the gradient spectrally, and interpolates the field back with
 * the same CIC kernel. The matching deposit/sample pair conserves momentum, the
 * mesh supplies a natural softening scale, and the cost is O(N + M log M).
 */

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
  /** Mass per cell from the last solve, normalised to a unit total. */
  readonly cellMass: Float32Array
  readonly stats: ParticleMeshStats

  private readonly re: Float64Array
  private readonly im: Float64Array
  /** −C·S(k)/(k²·W²(k)) per mode: Green function, softening, CIC deconvolution. */
  private readonly green: Float64Array
  /** Physical wavenumber per mesh index; Nyquist set to zero for the gradient. */
  private readonly wave: Float64Array
  /** Interpolated field on the mesh: x in `fx`, y in `fy`. */
  private readonly fx: Float32Array
  private readonly fy: Float32Array

  /**
   * @param source C = 2πGΣ̄, so that ∇²φ = C·δ.
   * @param half   half-width of the periodic box.
   */
  constructor(size: number, source: number, half = 1) {
    fftPlan(size)
    this.size = size
    this.half = half
    this.cellSize = (2 * half) / size
    const cells = size * size
    this.cellMass = new Float32Array(cells)
    this.re = new Float64Array(cells)
    this.im = new Float64Array(cells)
    this.green = new Float64Array(cells)
    this.fx = new Float32Array(cells)
    this.fy = new Float32Array(cells)
    this.wave = new Float64Array(size)

    // Continuous wavenumbers, spectral derivatives. The Nyquist row and column
    // have no defined sign for a first derivative, so they carry no force.
    for (let i = 0; i < size; i++) {
      const k = i <= size / 2 ? i : i - size
      this.wave[i] = i === size / 2 ? 0 : (Math.PI * k) / half
    }
    // Every mode's Green function, cached once: the 1/k² of Poisson, the CIC
    // window divided out *twice* (once for the deposit, once for the
    // interpolation back), and a Gaussian of 0.8 cells so the deconvolution
    // cannot amplify grid-scale noise. Without the deconvolution the force is
    // blurred over ~3 cells; with it, ~1.5.
    const rs = 0.8 * this.cellSize
    for (let y = 0; y < size; y++) {
      const ky = y <= size / 2 ? y : y - size
      const qy = (Math.PI * ky) / half
      for (let x = 0; x < size; x++) {
        const kx = x <= size / 2 ? x : x - size
        const qx = (Math.PI * kx) / half
        const k2 = qx * qx + qy * qy
        if (k2 === 0) continue
        const w = sinc((Math.PI * kx) / size) * sinc((Math.PI * ky) / size)
        const w2 = w * w // CIC window per pass: [sinc·sinc]²
        const deconvolve = 1 / Math.max(0.2, w2 * w2)
        this.green[y * size + x] = (-source * Math.exp(-k2 * rs * rs) * deconvolve) / k2
      }
    }
    this.stats = {
      cells,
      occupied: 0,
      peakCellMass: 0,
      fftOps: 2 * cells * Math.log2(size),
    }
  }

  /** Cloud-in-cell deposit of `n` equal masses; positions may be unwrapped. */
  private deposit(x: Float32Array, y: Float32Array, n: number, mass: number): void {
    const size = this.size
    const rho = this.cellMass
    const invCell = 1 / this.cellSize
    const half = this.half
    for (let i = 0; i < n; i++) {
      const xi = wrapPeriodic(x[i], half)
      const yi = wrapPeriodic(y[i], half)
      if (!Number.isFinite(xi) || !Number.isFinite(yi)) {
        throw new Error(`non-finite periodic particle ${i}`)
      }
      // Mesh values live at cell centres; positions are wrapped, so the
      // floors fall in −1..n−1 and two branches replace four modulos.
      const gx = (xi + half) * invCell - 0.5
      const gy = (yi + half) * invCell - 0.5
      const fx0 = Math.floor(gx)
      const fy0 = Math.floor(gy)
      const x0 = fx0 < 0 ? size - 1 : fx0
      const y0 = fy0 < 0 ? size - 1 : fy0
      const x1 = x0 + 1 === size ? 0 : x0 + 1
      const y1 = y0 + 1 === size ? 0 : y0 + 1
      const tx = gx - fx0
      const ty = gy - fy0
      const wx0 = 1 - tx
      const wy0 = 1 - ty
      rho[y0 * size + x0] += mass * wx0 * wy0
      rho[y0 * size + x1] += mass * tx * wy0
      rho[y1 * size + x0] += mass * wx0 * ty
      rho[y1 * size + x1] += mass * tx * ty
    }
  }

  /** Interpolate the mesh field back with the same CIC kernel. */
  private sample(x: Float32Array, y: Float32Array, n: number, ax: Float32Array, ay: Float32Array): void {
    const size = this.size
    const fx = this.fx
    const fy = this.fy
    const invCell = 1 / this.cellSize
    const half = this.half
    for (let i = 0; i < n; i++) {
      const gx = (wrapPeriodic(x[i], half) + half) * invCell - 0.5
      const gy = (wrapPeriodic(y[i], half) + half) * invCell - 0.5
      const fx0 = Math.floor(gx)
      const fy0 = Math.floor(gy)
      const x0 = fx0 < 0 ? size - 1 : fx0
      const y0 = fy0 < 0 ? size - 1 : fy0
      const x1 = x0 + 1 === size ? 0 : x0 + 1
      const y1 = y0 + 1 === size ? 0 : y0 + 1
      const tx = gx - fx0
      const ty = gy - fy0
      const w00 = (1 - tx) * (1 - ty)
      const w10 = tx * (1 - ty)
      const w01 = (1 - tx) * ty
      const w11 = tx * ty
      const i00 = y0 * size + x0
      const i10 = y0 * size + x1
      const i01 = y1 * size + x0
      const i11 = y1 * size + x1
      ax[i] = fx[i00] * w00 + fx[i10] * w10 + fx[i01] * w01 + fx[i11] * w11
      ay[i] = fy[i00] * w00 + fy[i10] * w10 + fy[i01] * w01 + fy[i11] * w11
    }
  }

  /**
   * Peculiar acceleration Γ = −∇φ, ∇²φ = C·δ, for `n` equal-mass particles.
   *
   * Two FFTs per solve. The forward transform takes δ to k-space; there both
   * gradient components are formed spectrally, Γ_k = −ik·φ_k, and packed as one
   * complex field Γx + iΓy — legitimate because each is real — so a single
   * inverse transform returns both. Spectral gradients are exact on every
   * resolved mode, where the old finite difference lost a third of the force
   * near the grid scale.
   */
  solve(x: Float32Array, y: Float32Array, n: number, ax: Float32Array, ay: Float32Array): void {
    if (n <= 0) throw new Error("FILAMENT cannot solve an empty universe")
    const size = this.size
    const cells = size * size
    const rho = this.cellMass
    rho.fill(0)
    this.deposit(x, y, n, 1 / n)

    const re = this.re
    const im = this.im
    let occupied = 0
    let peak = 0
    for (let i = 0; i < cells; i++) {
      const m = rho[i]
      if (m > 0) occupied++
      if (m > peak) peak = m
      re[i] = m * cells - 1
      im[i] = 0
    }
    this.stats.occupied = occupied
    this.stats.peakCellMass = peak

    fft2(re, im, size, false)
    const green = this.green
    const wave = this.wave
    for (let yy = 0; yy < size; yy++) {
      const ky = wave[yy]
      const row = yy * size
      for (let xx = 0; xx < size; xx++) {
        const i = row + xx
        const kx = wave[xx]
        const pr = re[i] * green[i]
        const pi = im[i] * green[i]
        // Γx + iΓy = −ik_x·φ + k_y·φ  =  φ·(k_y − i·k_x)
        re[i] = pr * ky + pi * kx
        im[i] = pi * ky - pr * kx
      }
    }
    fft2(re, im, size, true)
    for (let i = 0; i < cells; i++) {
      this.fx[i] = re[i]
      this.fy[i] = im[i]
    }
    this.sample(x, y, n, ax, ay)
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

function sinc(x: number): number {
  return Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x
}
