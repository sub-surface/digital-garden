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
 * the logarithmic potential — not a 3D simulation flattened into a plane. That
 * is what makes the complex multipole expansion exact rather than approximate,
 * and it has a lovely consequence: Gauss's law in 2D gives |a| = G·M(<r)/r for
 * anything circularly symmetric, so the circular speed is
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

export type PresetName = "cosmos" | "disc" | "collision" | "collapse"

/**
 * The 2D analogue of 4πGρ̄ — the constant relating a density contrast to the
 * divergence of the peculiar field, C = 2πGΣ̄. With the patch normalised to
 * G = 1, total mass 1 and comoving radius 1, Σ̄ = 1/π and C falls out as
 * exactly 2, with no free parameter to fudge.
 *
 * It is worth knowing what that buys: from z = 6 to z = 0 — the era in which
 * the web actually assembles — this system's linear growth factor rises 5.9×,
 * against ΛCDM's ≈7×. The late universe therefore evolves at very nearly the
 * right rate. The early universe does not: a 2D source term falls off as a⁻²
 * against a matter-dominated a⁻³ Hubble friction, so perturbations essentially
 * coast until a ≈ Ω_m/C. The dark ages really are quiet here — rather more
 * quiet than they should be.
 */
export const PATCH_SOURCE = 2

/**
 * Linear density contrast the seed field would reach today if it kept growing
 * linearly. Caustics — the first sheets and filaments — appear when this
 * crosses 1, so a value of 7 puts first structure at z ≈ 7.5 and leaves a
 * well-developed, thoroughly nonlinear web by the present day.
 *
 * The honest caveat: real perturbations at recombination are of order 10⁻⁵,
 * and this field starts about 10⁴ times louder than that. Nothing else would
 * be visible on a screen, and every visualisation of the early universe makes
 * the same trade.
 */
const LINEAR_DELTA_TODAY = 7

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
  /** Present only for the massive species; tracers are massless. */
  m: Float32Array
}

type Rng = () => number

/** Box-Muller, one draw at a time. */
function gauss(rnd: Rng): number {
  const u = Math.max(1e-9, rnd())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
}

/**
 * Sunflower packing: r ∝ √(i/n) at successive golden angles.
 *
 * Exactly uniform in area, with no lattice directions for caustics to align
 * with and no clumping from independent random draws — which matters, because
 * shot noise in the initial sampling competes directly with the seeded modes we
 * actually want to watch grow.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
function sunflower(
  i: number,
  n: number,
  radius: number,
  phase: number,
  rnd: Rng,
  jitter: number,
): [number, number] {
  const r = radius * Math.sqrt((i + 0.5) / n)
  const a = i * GOLDEN_ANGLE + phase
  // Jitter by a fraction of the mean interparticle spacing. Undisplaced, the
  // bare spiral is regular enough to alias against the pixel grid into visible
  // arcs; a "glass" configuration — quasi-uniform, locally disordered — keeps
  // the low shot noise that matters for the seed field while destroying the
  // long-range order that shows up as moiré.
  const spacing = radius * Math.sqrt(Math.PI / n) * jitter
  return [
    Math.cos(a) * r + (rnd() - 0.5) * spacing,
    Math.sin(a) * r + (rnd() - 0.5) * spacing,
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
 * A Zel'dovich displacement field, as a small sum of random Fourier modes.
 *
 * Cosmological initial conditions are made by displacing particles off a
 * uniform distribution by the gradient of a random Gaussian potential, and
 * giving them a velocity along that displacement — the growing mode. Where
 * neighbouring trajectories cross, matter piles up in a caustic: sheets first,
 * then the filaments where sheets intersect, then knots where filaments do.
 * Sampling the potential as a few dozen analytic sinusoids rather than an FFT
 * keeps this exact and dependency-free, and the power-law amplitude (A ∝ |k|⁻²)
 * is what makes large scales dominate and the web look like a web.
 */
function zeldovich(rnd: Rng, modes = 28) {
  const kx = new Float64Array(modes)
  const ky = new Float64Array(modes)
  const amp = new Float64Array(modes)
  const phase = new Float64Array(modes)
  for (let i = 0; i < modes; i++) {
    const a = rnd() * Math.PI * 2
    const k = Math.PI * (1 + rnd() * 7) // one to eight waves across the patch
    kx[i] = Math.cos(a) * k
    ky[i] = Math.sin(a) * k
    amp[i] = Math.pow(k, -2) * (0.6 + rnd() * 0.8)
    phase[i] = rnd() * Math.PI * 2
  }

  // ψ = -∇φ with φ = Σ A sin(k·q + ψ₀).
  const displace = (qx: number, qy: number, out: { x: number; y: number }) => {
    let dx = 0
    let dy = 0
    for (let i = 0; i < modes; i++) {
      const c = Math.cos(kx[i] * qx + ky[i] * qy + phase[i]) * amp[i]
      dx -= kx[i] * c
      dy -= ky[i] * c
    }
    out.x = dx
    out.y = dy
  }

  // RMS of ∇·ψ over the patch. Normalising by the *divergence* rather than by
  // the displacement makes the amplitude mean something physical — it is the
  // linear density contrast — and keeps every random seed equally evolved.
  let sum = 0
  const samples = 4096
  const srnd = mulberry32(0x5eed)
  for (let s = 0; s < samples; s++) {
    const r = Math.sqrt(srnd())
    const a = srnd() * Math.PI * 2
    const qx = Math.cos(a) * r
    const qy = Math.sin(a) * r
    let div = 0
    for (let i = 0; i < modes; i++) {
      const c = Math.sin(kx[i] * qx + ky[i] * qy + phase[i]) * amp[i]
      div += (kx[i] * kx[i] + ky[i] * ky[i]) * c
    }
    sum += div * div
  }
  return { displace, rmsDiv: Math.sqrt(sum / samples) }
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
        const phase = salt * 1.7
        for (let i = 0; i < n; i++) {
          const [qx, qy] = sunflower(i, n, 1, phase, rnd, 0.9)
          zel!.displace(qx, qy, out)
          c.x[i] = qx + out.x * growthAmp
          c.y[i] = qy + out.y * growthAmp
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

  // Softening tracks the mean interparticle spacing: fine enough not to smear
  // real structure, coarse enough that a chance close pair cannot fling a
  // particle out of the simulation. The cosmological patch needs a floor as
  // well, because comoving halos become very much denser than the mean.
  const extent = cosmological ? 1.06 : preset === "collapse" ? 0.95 : 1.0
  // Softening tracks the mean interparticle spacing, √(π/N) for a unit disc.
  // The cosmological patch wants a *fraction* of that: comoving halos grow far
  // denser than the mean, and a softening as coarse as the mean spacing forces
  // the tree to stop subdividing (see `Universe.maxUsefulDepth`) exactly where
  // the structure needs resolving most. The isolated scenarios are not
  // hierarchical in the same way and can afford the gentler value.
  const spacing = extent * Math.sqrt(Math.PI / Math.max(1, nMass))
  const softening = cosmological
    ? Math.max(0.0015, spacing * 0.5)
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
