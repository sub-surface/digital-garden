/**
 * FILAMENT initial conditions — pure, seeded, DOM-free.
 *
 * Two families of scenario, which differ in more than their particle layout:
 *
 *   • `cosmos` is a periodic, expanding box built and run by `cosmos.ts`;
 *     only its cosmological options (background, dark matter, σ₈) live here.
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
import { PLANCK, sourceFor, type Cosmology } from "./cosmology"

export type PresetName = "cosmos" | "disc" | "collision" | "stream" | "collapse"

/**
 * What the dark matter is, as far as the initial conditions can tell: how far
 * it streams freely before it is slow enough to clump. Fast particles smear out
 * every perturbation smaller than the distance they travel, so the choice is a
 * cutoff in the primordial spectrum — nothing else changes. All three share the
 * same random phases, so switching between them on one seed is a controlled
 * experiment: same universe, different particle.
 */
export type DarkMatter = "cold" | "warm" | "hot"

export const DARK_MATTER: { name: DarkMatter; label: string; blurb: string }[] = [
  {
    name: "cold",
    label: "Cold",
    blurb: "Slow, heavy particles that clump on every scale. Small haloes form first and merge upward: bottom-up, hierarchical.",
  },
  {
    name: "warm",
    label: "Warm",
    blurb:
      "Lighter particles that stream far enough to erase the smallest seeds. The cutoff is exaggerated here, to about 25 Mpc, so you can see it: fewer small knots, smoother filaments.",
  },
  {
    name: "hot",
    label: "Hot",
    blurb:
      "Neutrino-like particles that stream across ~40 Mpc. Only the largest pancakes survive; they collapse first and fragment late. This top-down picture was ruled out in the 1980s, partly by simulations like this one: the web forms too late.",
  },
]

/**
 * Transfer function T(k) for each species, on integer wavenumber k.
 *
 * Warm uses the thermal-relic fit of Bode, Ostriker & Turok (2001), with the
 * half-mode placed at k = 7. Hot uses the BBKS (1986) neutrino fit,
 * exp(−3.9q − 2.1q²), with q = k/30 putting its half-mode near k = 5.
 */
export function transferFor(dm: DarkMatter): (k: number) => number {
  if (dm === "warm") {
    const nu = 1.12
    const alpha = Math.pow(Math.pow(2, nu / 5) - 1, 1 / (2 * nu)) / 7
    return (k) => Math.pow(1 + Math.pow(alpha * k, 2 * nu), -5 / nu)
  }
  if (dm === "hot") {
    return (k) => {
      const q = k / 30
      return Math.exp(-3.9 * q - 2.1 * q * q)
    }
  }
  return () => 1
}

/** Everything about a cosmological initial condition beyond its seed. */
export interface InitialConditions {
  cosmology: Cosmology
  darkMatter: DarkMatter
  /**
   * σ₈: the rms linear density contrast today, in top-hat circles 8 Mpc
   * across — the same normalisation real surveys quote (Planck: 0.81).
   */
  amplitude: number
}

export const DEFAULT_IC: InitialConditions = {
  cosmology: PLANCK,
  darkMatter: "cold",
  amplitude: 1,
}

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
export const PATCH_SOURCE = sourceFor(PLANCK)


/**
 * Physical units for the isolated worlds, scaled to a Milky-Way-like disc: a
 * code length of 10 kpc puts the default disc scale length near 3 kpc, and a
 * code speed of 200 km/s puts its flat rotation curve where the Sun's orbit
 * is. Time follows: 10 kpc at 200 km/s is 48.9 Myr.
 */
export const ISO_KPC = 10
export const ISO_KMS = 200
export const ISO_MYR = 48.9

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
    name: "stream",
    label: "Stream",
    blurb:
      "A dwarf satellite on an eccentric orbit around a disc galaxy. Each pericentre strips stars into a leading and a trailing arm: the tidal streams Gaia now maps around the Milky Way, and one of the few ways to weigh a dark halo directly.",
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
 * A compact, self-bound satellite: Gaussian in position, isotropic Gaussian in
 * velocity. In 2D the virial theorem fixes the dispersion independent of size —
 * 2K = GM²/2 gives σ² = GM/4 per axis — so a clump of any radius is in global
 * equilibrium at this speed. Softening weakens its self-binding slightly, so
 * it runs a little cool.
 */
function laySatellite(
  c: Cloud,
  from: number,
  to: number,
  rnd: Rng,
  o: { cx: number; cy: number; bvx: number; bvy: number; rs: number; mass: number },
): void {
  const sigma = 0.85 * Math.sqrt(o.mass / 4)
  for (let i = from; i < to; i++) {
    c.x[i] = o.cx + gauss(rnd) * o.rs
    c.y[i] = o.cy + gauss(rnd) * o.rs
    c.vx[i] = o.bvx + gauss(rnd) * sigma
    c.vy[i] = o.bvy + gauss(rnd) * sigma
  }
}

/**
 * Move an isolated world into its centre-of-mass frame. Random sampling leaves
 * a net momentum of order 1/√N; uncorrected, the whole system drifts and the
 * camera spends the run chasing it. Tracers are shifted by the same amount so
 * they stay where the masses are.
 */
function toRestFrame(masses: Cloud, nMass: number, tracers: Cloud, nTracer: number): void {
  let m = 0, x = 0, y = 0, vx = 0, vy = 0
  for (let i = 0; i < nMass; i++) {
    const mi = masses.m[i]
    m += mi
    x += mi * masses.x[i]
    y += mi * masses.y[i]
    vx += mi * masses.vx[i]
    vy += mi * masses.vy[i]
  }
  if (!(m > 0)) return
  x /= m; y /= m; vx /= m; vy /= m
  for (const [c, n] of [[masses, nMass], [tracers, nTracer]] as const) {
    for (let i = 0; i < n; i++) {
      c.x[i] -= x
      c.y[i] -= y
      c.vx[i] -= vx
      c.vy[i] -= vy
    }
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
  /** Physical-coordinate integration step. */
  dt: number
  /** Plummer softening length. */
  softening: number
  /** Half-width the view should frame. */
  extent: number
}

export function makeInitialState(
  preset: PresetName,
  seed: number,
  nMass: number,
  nTracer: number,
): InitialState {
  if (preset === "cosmos") throw new Error("Cosmos is built by cosmos.ts, not as an isolated world")
  const masses = allocate(nMass, true)
  const tracers = allocate(nTracer, false)
  const fill = (c: Cloud, n: number, salt: number) => {
    const rnd = mulberry32((seed ^ (salt * 0x85ebca6b)) >>> 0)
    switch (preset) {
      case "disc":
        layDisc(c, 0, n, rnd, { cx: 0, cy: 0, bvx: 0, bvy: 0, rd: 0.28, mass: 1, sign: 1, heat: 0.09 })
        break

      case "collision": {
        const half = n >> 1
        layDisc(c, 0, half, rnd, { cx: -0.62, cy: -0.18, bvx: 0.42, bvy: 0.05, rd: 0.2, mass: 0.5, sign: 1, heat: 0.08 })
        layDisc(c, half, n, rnd, { cx: 0.62, cy: 0.18, bvx: -0.42, bvy: -0.05, rd: 0.2, mass: 0.5, sign: -1, heat: 0.08 })
        break
      }

      case "stream": {
        // Host and satellite placed so the centre of mass sits at rest at the
        // origin; otherwise the whole system drifts out of frame.
        const fSat = 0.12
        const host = Math.round(n * (1 - fSat))
        const sx = 1.05
        const svy = 0.6
        const hx = (-fSat * sx) / (1 - fSat)
        const hvy = (-fSat * svy) / (1 - fSat)
        layDisc(c, 0, host, rnd, { cx: hx, cy: 0, bvx: 0, bvy: hvy, rd: 0.24, mass: 1 - fSat, sign: 1, heat: 0.1 })
        laySatellite(c, host, n, rnd, { cx: hx + sx, cy: 0, bvx: 0, bvy: hvy + svy, rs: 0.045, mass: fSat })
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
  toRestFrame(masses, nMass, tracers, nTracer)

  // Softening tracks the mean interparticle spacing: fine enough not to smear real structure,
  // coarse enough that a chance close pair cannot fling a particle away.
  const extent = preset === "collapse" ? 0.95 : preset === "stream" ? 1.3 : 1.0
  const spacing = extent * Math.sqrt(Math.PI / Math.max(1, nMass))
  const softening = Math.max(0.0012, spacing * 0.9)

  // The timestep has to resolve the shortest orbit the simulation can represent,
  // which is the one at the softening length. In 2D, v_c = √(GM) ≈ 1 there, so
  // that orbit takes ~2πε and a step of ~0.09ε gives it about seventy steps.
  // Raising the particle count sharpens the softening and must therefore
  // shorten the step — the cost of resolution, paid honestly.
  const dt = Math.min(preset === "collapse" ? 0.0016 : 0.0022, 0.09 * softening)

  return {
    masses,
    tracers,
    dt,
    softening,
    extent,
  }
}
