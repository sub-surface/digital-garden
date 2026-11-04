/**
 * FILAMENT — the background cosmology.
 *
 * Pure functions and one precomputed table. No DOM, no imports.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS REAL HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------
 * Real: the expansion history. a(t) comes from the Friedmann equation with
 * Planck-like parameters, so the clock on screen — redshift, cosmic time,
 * the 13.8 Gyr from recombination to now — is the actual one. Integrating the
 * simulation in equal steps of ln a rather than equal steps of t is what makes
 * that span affordable: the first e-fold after recombination gets the same
 * number of steps as the last, which is exactly where the effort belongs.
 *
 * Real: the method. Comoving coordinates, the mean density subtracted from the
 * source (otherwise the whole patch collapses on itself), Zel'dovich initial
 * conditions displaced by the growing mode of *this system's* own linear growth
 * equation, integrated numerically at startup rather than assumed to be D ∝ a.
 *
 * Not real: the dimensionality. Gravity in the plane is the 2D law — force
 * ∝ 1/r — because that is what makes the multipole expansion exact rather than
 * approximate. A 2D force reaches further than a 3D one, so structure here is
 * more filamentary and, once it turns nonlinear, collapses harder than ΛCDM
 * would. The story is right; the growth index is not.
 *
 * ---------------------------------------------------------------------------
 * THE EQUATIONS OF MOTION
 * ---------------------------------------------------------------------------
 * With physical position r = a·x, Newton's law splits into the homogeneous
 * background and everything else:
 *
 *     ẍ + 2H ẋ = Γ(x) / a²
 *
 * where Γ is the *peculiar* acceleration evaluated on comoving coordinates.
 * (In 2D, converting the force from physical to comoving separations costs one
 * factor of a, not two — both the separation vector and the r² denominator
 * carry a, so a single power survives.)
 *
 * Substituting the canonical momentum u = a² ẋ kills the drag term outright:
 *
 *     dx/dt = u / a²          dx/d(ln a) = u / (a² H)
 *     du/dt = Γ(x)            du/d(ln a) = Γ(x) / H
 *
 * — a two-line symplectic integrator with no friction to leak energy through,
 * which is the whole reason cosmological codes use this variable.
 */

/** Planck-2018-like flat ΛCDM. */
export const OMEGA_M = 0.315
export const OMEGA_L = 0.685
/** Photons + neutrinos: only matters in the first few e-folds, but that is
 * precisely where we start, so it is not optional. */
export const OMEGA_R = 9.24e-5
/** 1/H₀ in Gyr, for H₀ = 67.7 km/s/Mpc. Code time is measured in these. */
export const HUBBLE_TIME_GYR = 14.47
/** Recombination: the surface of last scattering, z ≈ 1100. */
export const A_REC = 1 / 1101
/** Comoving radius of the simulated patch, in Mpc — sets the distance scale. */
export const PATCH_MPC = 90

/**
 * A background universe: the three density parameters that fix H(a).
 *
 * Curvature is whatever is left over, Ω_k = 1 − Ω_m − Ω_Λ − Ω_r, so an open
 * universe is simply one whose matter and vacuum do not add up to one. H₀ is
 * shared by all of them, which makes the comparison the classic one: the same
 * expansion rate today, different histories behind it.
 */
export type CosmologyName = "planck" | "eds" | "open" | "vacuum"

export interface Cosmology {
  name: CosmologyName
  label: string
  omegaM: number
  omegaL: number
  omegaR: number
  blurb: string
}

export const COSMOLOGIES: Record<CosmologyName, Cosmology> = {
  planck: {
    name: "planck",
    label: "ΛCDM",
    omegaM: OMEGA_M,
    omegaL: OMEGA_L,
    omegaR: OMEGA_R,
    blurb: "Planck 2018: 31.5% matter, 68.5% vacuum energy, flat. The universe we measure.",
  },
  eds: {
    name: "eds",
    label: "Einstein–de Sitter",
    omegaM: 1,
    omegaL: 0,
    omegaR: OMEGA_R,
    blurb:
      "All matter, no Λ — the standard model until 1998. Structure keeps growing to the present day, and the universe is only two-thirds of a Hubble time old: younger than its oldest stars.",
  },
  open: {
    name: "open",
    label: "Open",
    omegaM: 0.3,
    omegaL: 0,
    omegaR: OMEGA_R,
    blurb:
      "The right amount of matter with no vacuum energy, so space is negatively curved. Curvature takes over late and freezes the web in place.",
  },
  vacuum: {
    name: "vacuum",
    label: "Λ-heavy",
    omegaM: 0.1,
    omegaL: 0.9,
    omegaR: OMEGA_R,
    blurb:
      "Thin matter, dominant Λ. Acceleration begins early, so to reach today's clumpiness the web must assemble long ago and then stall.",
  },
}

export const PLANCK = COSMOLOGIES.planck

/** Ω_k — positive for an open universe. */
export function omegaK(c: Cosmology = PLANCK): number {
  return 1 - c.omegaM - c.omegaL - c.omegaR
}

/**
 * The 2D analogue of 4πGρ̄ for a given matter density: C = 2πGΣ̄.
 *
 * The ΛCDM value is fixed by the patch (side two, total mass one, so C = π/2),
 * and every other universe scales with its matter content, exactly as the 3D
 * source 3/2·Ω_m·H₀² does. More matter, stronger self-gravity, same box.
 */
export function sourceFor(c: Cosmology = PLANCK): number {
  return (Math.PI / 2) * (c.omegaM / OMEGA_M)
}

/** E(a) = H(a)/H₀. */
export function hubble(a: number, c: Cosmology = PLANCK): number {
  const ai = 1 / a
  return Math.sqrt(
    c.omegaR * ai * ai * ai * ai + c.omegaM * ai * ai * ai + omegaK(c) * ai * ai + c.omegaL,
  )
}

/** d ln H / d ln a — needed by the growth equation. */
function dlnHdlna(a: number, c: Cosmology): number {
  const ai = 1 / a
  const r = c.omegaR * ai * ai * ai * ai
  const m = c.omegaM * ai * ai * ai
  const k = omegaK(c) * ai * ai
  return (-4 * r - 3 * m - 2 * k) / (2 * (r + m + k + c.omegaL))
}

/**
 * Scale factor at which the expansion starts to accelerate (q = 0), or null
 * for a universe without Λ. Radiation is negligible this late.
 */
export function accelerationOnset(c: Cosmology = PLANCK): number | null {
  if (c.omegaL <= 0) return null
  return Math.cbrt(c.omegaM / (2 * c.omegaL))
}

/** Cosmic time at scale factor `a`, in units of 1/H₀. */
export function ageOf(a: number, c: Cosmology = PLANCK, steps = 4096): number {
  // ∫₀^a da'/(a'H) — substitute a = e^s so the integrand is finite at a → 0
  // in radiation domination (where it behaves as a·da).
  const s1 = Math.log(a)
  const s0 = Math.log(1e-8)
  const h = (s1 - s0) / steps
  let sum = 0
  for (let i = 0; i <= steps; i++) {
    const s = s0 + i * h
    const w = i === 0 || i === steps ? 0.5 : 1
    sum += w / hubble(Math.exp(s), c)
  }
  return sum * h
}

/** Format a code-unit time as a human cosmic age. */
export function formatAge(tCode: number): string {
  const gyr = tCode * HUBBLE_TIME_GYR
  if (gyr < 1e-3) return `${(gyr * 1e6).toFixed(0)} kyr`
  if (gyr < 1) return `${(gyr * 1e3).toFixed(0)} Myr`
  return `${gyr.toFixed(2)} Gyr`
}

/**
 * Linear growth of density perturbations in *this* system.
 *
 * A Zel'dovich initial condition is only correct if the displacement and the
 * velocity are related by the actual growing mode — get that wrong and the
 * decaying mode contaminates the field, which shows up as spurious small-scale
 * noise rather than a clean web. Our force law is 2D, so the familiar D ∝ a of
 * matter-dominated ΛCDM does not hold and there is no closed form. Integrating
 * the linear equation numerically is a few lines and gets it exactly right:
 *
 *     D'' + (2 + d lnH/d lna) D' = (C / (a²H²)) D          ' = d/d(ln a)
 *
 * where C = 2πGΣ̄ is the 2D analogue of 4πGρ̄ — the constant that turns a
 * density contrast into a divergence of the peculiar field.
 */
export interface GrowthTable {
  /** ln a samples, uniformly spaced. */
  lnA: Float64Array
  /** D(a), normalised so D = 1 today. */
  D: Float64Array
  /** dD/d(ln a), same normalisation. */
  dD: Float64Array
}

export function growthTable(
  C: number,
  c: Cosmology = PLANCK,
  aStart = A_REC,
  aEnd = 3,
  samples = 1024,
): GrowthTable {
  const s0 = Math.log(aStart)
  const s1 = Math.log(aEnd)
  const h = (s1 - s0) / (samples - 1)
  const lnA = new Float64Array(samples)
  const D = new Float64Array(samples)
  const dD = new Float64Array(samples)

  // Deep in radiation/matter domination the source term is negligible, so the
  // growing mode is well approximated by D ∝ a. Any decaying-mode contamination
  // this leaves behind decays away long before the interesting epochs.
  let d = aStart
  let v = aStart

  const deriv = (s: number, dv: number, vv: number) => {
    const a = Math.exp(s)
    const H = hubble(a, c)
    return {
      dd: vv,
      dv: (C / (a * a * H * H)) * dv - (2 + dlnHdlna(a, c)) * vv,
    }
  }

  for (let i = 0; i < samples; i++) {
    const s = s0 + i * h
    lnA[i] = s
    D[i] = d
    dD[i] = v
    if (i === samples - 1) break
    // Classic RK4 on the pair (D, D').
    const k1 = deriv(s, d, v)
    const k2 = deriv(s + h / 2, d + (h / 2) * k1.dd, v + (h / 2) * k1.dv)
    const k3 = deriv(s + h / 2, d + (h / 2) * k2.dd, v + (h / 2) * k2.dv)
    const k4 = deriv(s + h, d + h * k3.dd, v + h * k3.dv)
    d += (h / 6) * (k1.dd + 2 * k2.dd + 2 * k3.dd + k4.dd)
    v += (h / 6) * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv)
  }

  // Normalise to D(a = 1) = 1 so initial amplitudes can be specified as "how
  // nonlinear this field would be today", which is how real ICs are set.
  const dToday = sampleGrowth({ lnA, D, dD }, 1).D
  if (dToday > 0) {
    for (let i = 0; i < samples; i++) {
      D[i] /= dToday
      dD[i] /= dToday
    }
  }
  return { lnA, D, dD }
}

/** Linear interpolation into a {@link GrowthTable}. */
export function sampleGrowth(t: GrowthTable, a: number): { D: number; dD: number } {
  const s = Math.log(a)
  const n = t.lnA.length
  const h = (t.lnA[n - 1] - t.lnA[0]) / (n - 1)
  const f = (s - t.lnA[0]) / h
  if (f <= 0) return { D: t.D[0], dD: t.dD[0] }
  if (f >= n - 1) return { D: t.D[n - 1], dD: t.dD[n - 1] }
  const i = f | 0
  const u = f - i
  return {
    D: t.D[i] + (t.D[i + 1] - t.D[i]) * u,
    dD: t.dD[i] + (t.dD[i + 1] - t.dD[i]) * u,
  }
}

// ---------------------------------------------------------------------------
// A whole expansion history, tabulated once
// ---------------------------------------------------------------------------

/**
 * Everything the integrator and the readout need to know about one universe,
 * as dense tables in ln a: growth D and its log-derivative, the Hubble rate,
 * and cosmic age. Built once per run, so a frame never integrates anything.
 *
 * It also supplies the two functions the FastPM integrator is built on:
 *
 *     G_p(a) = a²·dD/dt          (momentum of the linear growing mode, per ψ)
 *     G_f(a) = C·D(a)            (force of the linear growing mode, per ψ)
 *
 * which satisfy dG_p/dt = G_f exactly — that identity *is* the growth
 * equation, rewritten in the canonical momentum u = a²ẋ.
 */
export class CosmicHistory {
  readonly cosmology: Cosmology
  readonly source: number
  private readonly lnA: Float64Array
  private readonly D: Float64Array
  private readonly dD: Float64Array
  private readonly age: Float64Array
  private readonly lo: number
  private readonly step: number

  constructor(c: Cosmology = PLANCK, samples = 4096) {
    this.cosmology = c
    this.source = sourceFor(c)
    const g = growthTable(this.source, c, A_REC, 1.2, samples)
    this.lnA = g.lnA
    this.D = g.D
    this.dD = g.dD
    this.lo = g.lnA[0]
    this.step = (g.lnA[samples - 1] - g.lnA[0]) / (samples - 1)
    // Age by the trapezoid rule in ln a, seeded with the exact age at the
    // first sample (radiation era included).
    this.age = new Float64Array(samples)
    this.age[0] = ageOf(Math.exp(this.lo), c)
    for (let i = 1; i < samples; i++) {
      const h0 = 1 / hubble(Math.exp(g.lnA[i - 1]), c)
      const h1 = 1 / hubble(Math.exp(g.lnA[i]), c)
      this.age[i] = this.age[i - 1] + 0.5 * (h0 + h1) * this.step
    }
  }

  private lerp(table: Float64Array, a: number): number {
    const f = (Math.log(a) - this.lo) / this.step
    const n = table.length
    if (f <= 0) return table[0]
    if (f >= n - 1) return table[n - 1]
    const i = f | 0
    return table[i] + (table[i + 1] - table[i]) * (f - i)
  }

  /** Linear growth factor, D(today) = 1. */
  growth(a: number): number {
    return this.lerp(this.D, a)
  }

  /** dD/d ln a. */
  growthRate(a: number): number {
    return this.lerp(this.dD, a)
  }

  /** Cosmic time in units of 1/H₀. */
  ageAt(a: number): number {
    return this.lerp(this.age, a)
  }

  hubble(a: number): number {
    return hubble(a, this.cosmology)
  }

  /** G_p(a) = a²·dD/dt = a²·H·dD/dln a. */
  momentumGrowth(a: number): number {
    return a * a * hubble(a, this.cosmology) * this.growthRate(a)
  }

  /** G_f(a) = C·D. */
  forceGrowth(a: number): number {
    return this.source * this.growth(a)
  }

  /** Inverse of {@link growth}, by bisection on the monotone table. */
  scaleFactorAt(D: number): number {
    let lo = 0
    let hi = this.D.length - 1
    if (D <= this.D[lo]) return Math.exp(this.lnA[lo])
    if (D >= this.D[hi]) return Math.exp(this.lnA[hi])
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.D[mid] < D) lo = mid
      else hi = mid
    }
    const f = (D - this.D[lo]) / (this.D[hi] - this.D[lo])
    return Math.exp(this.lnA[lo] + f * (this.lnA[hi] - this.lnA[lo]))
  }
}

/** Where we are in the story, for the readout. */
export function epochOf(z: number, done: boolean): string {
  if (done) return "today"
  if (z > 900) return "recombination"
  if (z > 30) return "the dark ages"
  if (z > 10) return "cosmic dawn"
  if (z > 6) return "reionisation"
  if (z > 1.2) return "cosmic noon"
  return "the modern era"
}

/**
 * The afterglow of recombination, as a screen colour.
 *
 * At last scattering the universe is a 3000 K fog — orange, and everywhere at
 * once. It does not go out; it redshifts, T ∝ 1/a, until it is microwaves and
 * the sky is dark. That is the actual reason the night sky is black, and it is
 * worth showing.
 *
 * The falloff below is compressed: bolometric surface brightness of an
 * expanding blackbody sky drops like a⁻⁴, which on screen would be gone within
 * a frame or two. The colour temperature track is the honest part — 3000 K
 * orange sliding to deep red and out of the visible band entirely.
 */
export interface Afterglow {
  /** 1 at last scattering, 0 once the sky has gone dark. */
  strength: number
  /** Colour of the glow at this epoch, 0–1 RGB. */
  r: number
  g: number
  b: number
}

export function cmbGlow(a: number): Afterglow {
  const z = 1 / a - 1
  // Bolometric surface brightness of an expanding blackbody sky falls as a⁻⁴,
  // which on screen would be over within a frame. This is compressed to about
  // one e-fold of expansion — still fast, and still the honest shape: it does
  // not fade because it dims, it fades because it reddens out of the visible.
  const strength = z < 380 ? 0 : Math.min(1, (z - 380) / 480)
  if (strength <= 0) return { strength: 0, r: 0, g: 0, b: 0 }
  // 3000 K at recombination, cooling toward deep red as it goes.
  const cool = Math.min(1, (1100 - z) / 700)
  return {
    strength,
    r: 1,
    g: 0.42 - cool * 0.18,
    b: 0.16 - cool * 0.12,
  }
}
