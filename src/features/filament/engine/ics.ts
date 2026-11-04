/**
 * FILAMENT initial conditions — the shared vocabulary of particle clouds.
 *
 *   • The cosmic web (`cosmos.ts`) is built from the cosmological options
 *     here: background, dark-matter species, σ₈.
 *   • A galaxy (`zoom.ts`) is an {@link InitialState} for the FMM, cut out of
 *     the web: G = 1, total mass 1, halo radius 1.
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

import { PLANCK, sourceFor, type Cosmology } from "./cosmology"

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


export interface Cloud {
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  /** Used by isolated FMM worlds; Cosmos treats both arrays as equal-mass. */
  m: Float32Array
  /**
   * Where each particle came from, for the Origin lens and for brightness:
   * see {@link TAG}. Optional — Cosmos clouds carry none.
   */
  tag?: Float32Array
}

/** Particle origins. Dark matter is drawn faint; light comes from stars. */
export const TAG = {
  dark: 0,
  stars: 1,
  companion: 2,
  infall: 3,
} as const

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
