/**
 * FILAMENT initial conditions — pure, seeded, DOM-free.
 *
 * Two families of scenario, which differ in more than their particle layout:
 *
 *   • `cosmos` runs in *comoving* coordinates on a real ΛCDM background, from
 *     recombination to the present day, stepping in equal intervals of ln a.
 *     See `cosmology.ts` for the equations of motion and what is and is not
 *     physically honest about them.
 *
 *   • `disc` / `encounter` / `collapse` run in ordinary physical coordinates
 *     with no expansion — isolated systems, ordinary leapfrog, ordinary time.
 *
 * Units for the isolated scenarios: G = 1, total mass = 1, characteristic
 * radius = 1, so circular speeds are ~1 and a dynamical time is ~1.
 *
 * A NOTE ON TWO-DIMENSIONAL GRAVITY
 * The force law throughout is the genuine 2D one — force ∝ 1/r, the field of
 * the logarithmic potential — not a 3D simulation flattened into a plane. The
 * isolated worlds evaluate it with an exact complex multipole expansion; Cosmos
 * solves the same Poisson law on a periodic mesh. Gauss's law in 2D gives
 * |a| = G·M(<r)/r for anything circularly symmetric, so the circular speed is
 *
 *     v_c = √(G · M(<r))
 *
 * — independent of radius once the mass is enclosed. Discs here have flat
 * rotation curves for free, the thing real galaxies need dark matter to
 * explain. It also means gravity reaches further than in 3D, so cosmological
 * structure is more sharply filamentary.
 */

import { mulberry32 } from "@/lib/composer/rng"
import { A_REC, growthTable, hubble, sampleGrowth } from "./cosmology"
import { fft2, wrapPeriodic } from "./particle-mesh"

export type PresetName = "cosmos" | "disc" | "collision" | "collapse"

/**
 * The 2D analogue of 4πGρ̄ — the constant relating a density contrast to the
 * divergence of the peculiar field, C = 2πGΣ̄. The periodic box has side two,
 * total mass one and therefore Σ̄ = 1/4, giving C = π/2 with no free parameter
 * to fudge.
 *
 * It is worth knowing what that buys: from z = 6 to z = 0 — the era in which
 * the web actually assembles — this system's linear growth factor rises 4.5×,
 * against ΛCDM's ≈7×. The late universe therefore evolves at very nearly the
 * right rate. The early universe does not: a 2D source term falls off as a⁻²
 * against a matter-dominated a⁻³ Hubble friction, so perturbations essentially
 * coast until a ≈ Ω_m/C. The dark ages really are quiet here — rather more
 * quiet than they should be.
 */
export const PATCH_SOURCE = Math.PI / 2

/**
 * Linear density contrast the seed field would reach today if it kept growing
 * linearly. Caustics — the first sheets and filaments — appear when this
 * crosses 1, so a value of 5 puts first structure around cosmic dawn and leaves
 * a well-developed, thoroughly nonlinear web by the present day.
 *
 * The honest caveat: real perturbations at recombination are of order 10⁻⁵,
 * and this field starts about 10⁴ times louder than that. Nothing else would
 * be visible on a screen, and every visualisation of the early universe makes
 * the same trade.
 */
const LINEAR_DELTA_TODAY = 5

export interface PresetInfo {
  name: PresetName
  label: string
  blurb: string
  cosmological: boolean
}

export const PRESETS: PresetInfo[] = [
  {
    name: "cosmos",
    label: "Cosmos",
    blurb:
      "From recombination to now. A comoving patch 180 Mpc across on a real ΛCDM clock, seeded with Zel'dovich displacements and released at z = 1100 as the CMB is emitted. The glow fades, the dark ages pass, and matter drains out of the voids into sheets, then filaments, then the knots where filaments cross.",
    cosmological: true,
  },
  {
    name: "disc",
    label: "Disc",
    blurb:
      "One galaxy: an exponential disc on near-circular orbits. Cold enough that swing amplification grows flocculent spiral arms out of nothing but shot noise.",
    cosmological: false,
  },
  {
    name: "collision",
    label: "Encounter",
    blurb:
      "Two discs on a grazing pass. Tidal tails first, then a merger — and, as in the real universe, the merger is what lights the quasar.",
    cosmological: false,
  },
  {
    name: "collapse",
    label: "Cold collapse",
    blurb:
      "A uniform cloud released from rest. Everything falls to the centre at once, overshoots, and phase-mixes into a relaxed halo.",
    cosmological: false,
  },
]

export interface Cloud {
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  /** Used by isolated FMM worlds; Cosmos treats both arrays as equal-mass. */
  m: Float32Array
}

type Rng = () => number

/** Box-Muller, one draw at a time. */
function gauss(rnd: Rng): number {
  const u = Math.max(1e-9, rnd())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
}

/**
 * Low-discrepancy periodic "glass".
 *
 * A rank-two irrational sequence covers the square evenly without rows,
 * spokes, or an incomplete final lattice row. Tiny local jitter destroys its
 * remaining quasiperiodicity while staying far quieter than random sampling.
 */
const PLASTIC = 1.324717957244746
const R2_X = 1 / PLASTIC
const R2_Y = 1 / (PLASTIC * PLASTIC)
const fract = (x: number) => x - Math.floor(x)

function periodicGlass(i: number, n: number, phase: number, rnd: Rng): [number, number] {
  const spacing = 2 / Math.sqrt(Math.max(1, n))
  const jitter = spacing * 0.32
  return [
    wrapPeriodic(2 * fract(0.5 + phase + (i + 1) * R2_X) - 1 + (rnd() - 0.5) * jitter),
    wrapPeriodic(2 * fract(0.5 + phase * 1.73 + (i + 1) * R2_Y) - 1 + (rnd() - 0.5) * jitter),
  ]
}

/**
 * Radius drawn from an exponential disc, Σ(r) ∝ exp(-r/Rd), by rejection on
 * r·exp(-r/Rd) — which peaks at r = Rd, so the bound is tight.
 */
function expDiscRadius(rnd: Rng, rd: number, rMax: number): number {
  const peak = rd / Math.E
  for (let tries = 0; tries < 64; tries++) {
    const r = rnd() * rMax
    if (rnd() * peak <= r * Math.exp(-r / rd)) return r
  }
  return rd
}

/** Enclosed-mass fraction of an exponential disc inside radius r. */
function expDiscMassFrac(r: number, rd: number): number {
  const u = r / rd
  return 1 - (1 + u) * Math.exp(-u)
}

function layDisc(
  c: Cloud,
  from: number,
  to: number,
  rnd: Rng,
  o: { cx: number; cy: number; bvx: number; bvy: number; rd: number; mass: number; sign: number; heat: number },
): void {
  const rMax = o.rd * 6
  const softR = o.rd * 0.06
  for (let i = from; i < to; i++) {
    const r = expDiscRadius(rnd, o.rd, rMax)
    const a = rnd() * Math.PI * 2
    // v_c = √(G·M_enc) — flat once the mass is enclosed. Soften the very centre
    // so the innermost particles are not launched on absurd orbits.
    const menc = o.mass * expDiscMassFrac(r, o.rd)
    const vc = Math.sqrt(menc) * (r / Math.sqrt(r * r + softR * softR))
    c.x[i] = o.cx + Math.cos(a) * r
    c.y[i] = o.cy + Math.sin(a) * r
    c.vx[i] = o.bvx + o.sign * -Math.sin(a) * vc + gauss(rnd) * o.heat * vc
    c.vy[i] = o.bvy + o.sign * Math.cos(a) * vc + gauss(rnd) * o.heat * vc
  }
}

/**
 * A periodic Zel'dovich displacement field sampled from a spectral mesh.
 *
 * The former implementation evaluated 28 sinusoids separately for every
 * particle. This one fills a Gaussian Fourier field once, resolves hundreds of
 * modes, inverse-transforms it onto a compact atlas, then samples that atlas
 * bilinearly. High-count worlds therefore start faster and inherit far more
 * small-scale structure. Integer wave vectors make the field exactly periodic,
 * matching the particle-mesh force that evolves it.
 */
function zeldovich(rnd: Rng, size = 128) {
  const cells = size * size
  const dxR = new Float64Array(cells)
  const dxI = new Float64Array(cells)
  const dyR = new Float64Array(cells)
  const dyI = new Float64Array(cells)
  const divR = new Float64Array(cells)
  const divI = new Float64Array(cells)
  const kMax = Math.min(28, size / 2 - 2)

  const at = (x: number, y: number) =>
    ((y % size + size) % size) * size + ((x % size + size) % size)
  const setPair = (
    re: Float64Array,
    im: Float64Array,
    kx: number,
    ky: number,
    vr: number,
    vi: number,
  ) => {
    const a = at(kx, ky)
    const b = at(-kx, -ky)
    re[a] = vr
    im[a] = vi
    re[b] = vr
    im[b] = -vi
  }

  // A compact CDM-like spectrum: near scale-invariant on large scales, turning
  // over and damping toward the mesh Nyquist limit. It is intentionally a 2D
  // visual analogue, not a claim to reproduce a 3D transfer function exactly.
  for (let ky = -kMax; ky <= kMax; ky++) {
    for (let kx = -kMax; kx <= kMax; kx++) {
      if (ky < 0 || (ky === 0 && kx <= 0)) continue
      const k = Math.hypot(kx, ky)
      if (k < 1 || k > kMax) continue
      const transfer = 1 / (1 + Math.pow(k / 7, 2))
      const cutoff = Math.exp(-Math.pow(k / kMax, 6))
      const sqrtPower = Math.pow(k, 0.48) * transfer * cutoff
      const physicalK2 = Math.PI * Math.PI * k * k
      const scale = sqrtPower / physicalK2
      const pr = gauss(rnd) * scale
      const pi = gauss(rnd) * scale
      const px = Math.PI * kx
      const py = Math.PI * ky

      // ψ = -∇φ, so ψ_k = -i k φ_k. Its divergence is k²φ_k.
      setPair(dxR, dxI, kx, ky, px * pi, -px * pr)
      setPair(dyR, dyI, kx, ky, py * pi, -py * pr)
      setPair(divR, divI, kx, ky, physicalK2 * pr, physicalK2 * pi)
    }
  }

  fft2(dxR, dxI, size, true)
  fft2(dyR, dyI, size, true)
  fft2(divR, divI, size, true)

  let sum = 0
  for (let i = 0; i < cells; i++) sum += divR[i] * divR[i]
  const rmsDiv = Math.sqrt(sum / cells)

  const sample = (field: Float64Array, x: number, y: number) => {
    const gx = ((wrapPeriodic(x) + 1) * 0.5) * size
    const gy = ((wrapPeriodic(y) + 1) * 0.5) * size
    const ix = Math.floor(gx)
    const iy = Math.floor(gy)
    const tx = gx - ix
    const ty = gy - iy
    const x0 = (ix % size + size) % size
    const y0 = (iy % size + size) % size
    const x1 = x0 + 1 === size ? 0 : x0 + 1
    const y1 = y0 + 1 === size ? 0 : y0 + 1
    return (
      field[y0 * size + x0] * (1 - tx) * (1 - ty) +
      field[y0 * size + x1] * tx * (1 - ty) +
      field[y1 * size + x0] * (1 - tx) * ty +
      field[y1 * size + x1] * tx * ty
    )
  }

  return {
    displace(qx: number, qy: number, out: { x: number; y: number }) {
      out.x = sample(dxR, qx, qy)
      out.y = sample(dyR, qx, qy)
    },
    rmsDiv,
  }
}

function allocate(n: number, withMass: boolean): Cloud {
  return {
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    m: withMass ? new Float32Array(n) : new Float32Array(0),
  }
}

export interface InitialState {
  masses: Cloud
  tracers: Cloud
  cosmological: boolean
  /** Physical-coordinate integration step (isolated scenarios only). */
  dt: number
  /** Step in ln a (cosmological only). */
  dlnA: number
  /** Starting scale factor (cosmological only). */
  aStart: number
  /** Plummer softening length. */
  softening: number
  /** Half-width the view should frame. */
  extent: number
}

/**
 * Total ln a spanned from recombination to today, divided into this many steps.
 * Equal steps in ln a spend equal effort per e-fold of expansion, which is what
 * makes 13.8 Gyr affordable: the first million years after recombination gets
 * as much resolution as the last billion, and neither is wasted on the other.
 */
const COSMO_STEPS = 6000

export function makeInitialState(
  preset: PresetName,
  seed: number,
  nMass: number,
  nTracer: number,
): InitialState {
  const masses = allocate(nMass, true)
  const tracers = allocate(nTracer, false)
  const cosmological = preset === "cosmos"

  // One rng per species so that changing the tracer count never perturbs the
  // dynamics — the same seed is the same universe. The Zel'dovich modes are
  // drawn from a *third*, shared stream so both species see the same field.
  const fieldRnd = mulberry32((seed ^ 0x9e3779b1) >>> 0)
  const zel = cosmological ? zeldovich(fieldRnd) : null

  let growthAmp = 0
  let growthVel = 0
  if (zel) {
    const table = growthTable(PATCH_SOURCE)
    const start = sampleGrowth(table, A_REC)
    const amp = LINEAR_DELTA_TODAY / zel.rmsDiv // A, from δ_linear(today) = target
    growthAmp = amp * start.D
    // u = a²ẋ, and for the growing mode ẋ = H·D'·ψ, so u = a²·H·D'·A·ψ.
    growthVel = amp * start.dD * A_REC * A_REC * hubble(A_REC)
  }

  const fill = (c: Cloud, n: number, salt: number) => {
    const rnd = mulberry32((seed ^ (salt * 0x85ebca6b)) >>> 0)
    switch (preset) {
      case "cosmos": {
        const out = { x: 0, y: 0 }
        const phase = fract(salt * 0.271828 + seed * 0.000000119)
        for (let i = 0; i < n; i++) {
          const [qx, qy] = periodicGlass(i, n, phase, rnd)
          zel!.displace(qx, qy, out)
          c.x[i] = wrapPeriodic(qx + out.x * growthAmp)
          c.y[i] = wrapPeriodic(qy + out.y * growthAmp)
          c.vx[i] = out.x * growthVel
          c.vy[i] = out.y * growthVel
        }
        break
      }

      case "disc":
        layDisc(c, 0, n, rnd, { cx: 0, cy: 0, bvx: 0, bvy: 0, rd: 0.28, mass: 1, sign: 1, heat: 0.09 })
        break

      case "collision": {
        const half = n >> 1
        layDisc(c, 0, half, rnd, { cx: -0.62, cy: -0.18, bvx: 0.42, bvy: 0.05, rd: 0.2, mass: 0.5, sign: 1, heat: 0.08 })
        layDisc(c, half, n, rnd, { cx: 0.62, cy: 0.18, bvx: -0.42, bvy: -0.05, rd: 0.2, mass: 0.5, sign: -1, heat: 0.08 })
        break
      }

      case "collapse":
        // Randomly sampled, not sunflower-packed. A perfectly regular cold disc
        // collapses to a genuine caustic — every particle arriving at the centre
        // in the same instant — which no softening length makes integrable. Real
        // cold-collapse experiments have Poisson noise, and that noise is what
        // lets the cloud phase-mix into a halo instead of detonating.
        for (let i = 0; i < n; i++) {
          const r = 0.85 * Math.sqrt(rnd())
          const a = rnd() * Math.PI * 2
          c.x[i] = Math.cos(a) * r
          c.y[i] = Math.sin(a) * r
          c.vx[i] = gauss(rnd) * 0.03
          c.vy[i] = gauss(rnd) * 0.03
        }
        break
    }
    if (c.m.length) {
      const per = 1 / n
      for (let i = 0; i < n; i++) c.m[i] = per
    }
  }

  fill(masses, nMass, 1)
  if (nTracer > 0) fill(tracers, nTracer, 2)

  // The periodic mesh supplies Cosmos with its force-resolution scale. The
  // explicit softening below belongs to isolated FMM worlds, where it tracks
  // the mean interparticle spacing: fine enough not to smear real structure,
  // coarse enough that a chance close pair cannot fling a particle away.
  const extent = cosmological ? 1.02 : preset === "collapse" ? 0.95 : 1.0
  const spacing = extent * Math.sqrt(Math.PI / Math.max(1, nMass))
  const softening = cosmological
    ? spacing
    : Math.max(0.0012, spacing * 0.9)

  // The timestep has to resolve the shortest orbit the simulation can represent,
  // which is the one at the softening length. In 2D, v_c = √(GM) ≈ 1 there, so
  // that orbit takes ~2πε and a step of ~0.09ε gives it about seventy steps.
  // Raising the particle count sharpens the softening and must therefore
  // shorten the step — the cost of resolution, paid honestly.
  const dt = Math.min(preset === "collapse" ? 0.0016 : 0.0022, 0.09 * softening)

  return {
    masses,
    tracers,
    cosmological,
    dt,
    dlnA: -Math.log(A_REC) / COSMO_STEPS,
    aStart: A_REC,
    softening,
    extent,
  }
}
