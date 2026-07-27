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

/** E(a) = H(a)/H₀. */
export function hubble(a: number): number {
  const ai = 1 / a
  return Math.sqrt(OMEGA_R * ai * ai * ai * ai + OMEGA_M * ai * ai * ai + OMEGA_L)
}

/** d ln H / d ln a — needed by the growth equation. */
function dlnHdlna(a: number): number {
  const ai = 1 / a
  const r = OMEGA_R * ai * ai * ai * ai
  const m = OMEGA_M * ai * ai * ai
  return (-4 * r - 3 * m) / (2 * (r + m + OMEGA_L))
}

/** Cosmic time at scale factor `a`, in units of 1/H₀. */
export function ageOf(a: number, steps = 4096): number {
  // ∫₀^a da'/(a'H) — substitute a = e^s so the integrand is finite at a → 0
  // in radiation domination (where it behaves as a·da).
  const s1 = Math.log(a)
  const s0 = Math.log(1e-8)
  const h = (s1 - s0) / steps
  let sum = 0
  for (let i = 0; i <= steps; i++) {
    const s = s0 + i * h
    const w = i === 0 || i === steps ? 0.5 : 1
    sum += w / hubble(Math.exp(s))
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

export function growthTable(C: number, aStart = A_REC, aEnd = 3, samples = 1024): GrowthTable {
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
    const H = hubble(a)
    return {
      dd: vv,
      dv: (C / (a * a * H * H)) * dv - (2 + dlnHdlna(a)) * vv,
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
