/**
 * GEODESIC — motion in the Schwarzschild geometry, the bottom of the descent.
 *
 * Units G = c = M = 1: lengths and times in units of the hole's mass, so the
 * horizon sits at r = 2. Everything happens in the equatorial plane, which
 * loses nothing — a free particle or a light ray around a non-rotating hole
 * stays in the plane it starts in, by symmetry.
 *
 * Conserved along every geodesic: the energy E = (1 − 2/r)·dt/dτ and the
 * angular momentum L = r²·dφ/dτ. With them the radial motion is a particle in
 * a one-dimensional well,
 *
 *     (dr/dτ)² = E² − V(r),     V(r) = (1 − 2/r)(1 + L²/r²),
 *
 * whose extra −2L²/r³ term (absent in Newton) is the whole story: the
 * precession of Mercury, the innermost stable orbit at r = 6, the photon
 * sphere at r = 3, and the plunge.
 *
 * Pure and DOM-free; `scripts/test-fmm.ts` checks it against the classic
 * analytic results.
 */

export const HORIZON = 2
export const PHOTON_SPHERE = 3
/** Innermost stable circular orbit. */
export const ISCO = 6
/** Innermost bound circular orbit (E = 1). */
export const MARGINALLY_BOUND = 4
/** Critical impact parameter: light aimed closer than this is captured. */
export const B_CRIT = 3 * Math.sqrt(3)

/** Effective potential V(r) for angular momentum L (timelike, per unit mass). */
export function effectivePotential(r: number, L: number): number {
  return (1 - 2 / r) * (1 + (L * L) / (r * r))
}

/** E and L of the circular orbit at radius r (r > 3; stable only for r ≥ 6). */
export function circularOrbit(r: number): { E: number; L: number } {
  return {
    E: (1 - 2 / r) / Math.sqrt(1 - 3 / r),
    L: Math.sqrt((r * r) / (r - 3)),
  }
}

/** E and L of the bound orbit with periapsis rp and apoapsis ra. */
export function orbitBetween(rp: number, ra: number): { E: number; L: number } {
  if (Math.abs(ra - rp) < 1e-9) return circularOrbit(rp)
  // V(rp) = V(ra) = E² is linear in L².
  const fp = 1 - 2 / rp
  const fa = 1 - 2 / ra
  const L2 = (fp - fa) / (fa / (ra * ra) - fp / (rp * rp))
  const L = Math.sqrt(Math.max(0, L2))
  return { E: Math.sqrt(effectivePotential(rp, L)), L }
}

/** A massive test particle: position, conserved E and L, and its two clocks. */
export interface Body {
  r: number
  phi: number
  /** dr/dτ. */
  ur: number
  E: number
  L: number
  /** Proper time, and the distant observer's coordinate time. */
  tau: number
  t: number
  /** Fell through the horizon. */
  captured: boolean
}

export function makeBody(r: number, phi: number, ur: number, L: number): Body {
  // E from the normalisation u·u = −1.
  const E = Math.sqrt(ur * ur + effectivePotential(r, L))
  return { r, phi, ur, E, L, tau: 0, t: 0, captured: false }
}

/** Radial acceleration d²r/dτ² = −½ dV/dr. */
function radialAccel(r: number, L: number): number {
  const L2 = L * L
  return -1 / (r * r) + L2 / (r * r * r) - (3 * L2) / (r * r * r * r)
}

/**
 * Advance a body by proper time dτ with fourth-order Runge–Kutta on
 * (r, dr/dτ, φ, t). The second-order radial equation has no square root and
 * so no sign to flip at turning points. E is then re-imposed from L and the
 * new radius, so the orbit cannot slowly drift onto a different energy shell.
 */
export function stepProper(b: Body, dtau: number): void {
  if (b.captured) return
  const L = b.L
  const E = b.E
  const f = (r: number, ur: number) => [ur, radialAccel(r, L), L / (r * r), E / (1 - 2 / r)] as const
  const r0 = b.r
  const u0 = b.ur
  const k1 = f(r0, u0)
  const k2 = f(r0 + 0.5 * dtau * k1[0], u0 + 0.5 * dtau * k1[1])
  const k3 = f(r0 + 0.5 * dtau * k2[0], u0 + 0.5 * dtau * k2[1])
  const k4 = f(r0 + dtau * k3[0], u0 + dtau * k3[1])
  const s = dtau / 6
  b.r = r0 + s * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
  b.ur = u0 + s * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
  b.phi += s * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
  b.t += s * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3])
  b.tau += dtau
  if (b.r <= HORIZON * 1.0005 || !Number.isFinite(b.r)) {
    b.captured = true
    return
  }
  const want = E * E - effectivePotential(b.r, L)
  if (want > 0) b.ur = Math.sign(b.ur || 1) * Math.sqrt(want)
}

/** A proper-time step small enough for the local orbital timescale. */
export function properStep(b: Body, accuracy = 0.004): number {
  // ~ the local free-fall time, r^{3/2}, shrinking near the horizon.
  return accuracy * Math.pow(b.r, 1.5) * Math.min(1, (b.r - 2) / 2 + 0.05)
}

/**
 * Advance a body by *coordinate* time Δt — the clock of a distant observer.
 * Near the horizon dt/dτ diverges, so a falling body takes ever smaller
 * proper-time steps and, to that observer, never quite arrives.
 */
export function stepCoordinate(b: Body, dt: number, maxSubsteps = 400): void {
  let left = dt
  for (let k = 0; k < maxSubsteps && left > 0 && !b.captured; k++) {
    const dtdtau = b.E / (1 - 2 / b.r)
    const dtau = Math.min(properStep(b), left / dtdtau)
    stepProper(b, dtau)
    left -= dtau * dtdtau
  }
}

/**
 * Light bending: the total deflection α(b) of a ray from infinity with impact
 * parameter b, or NaN if it is captured (b < 3√3). Integrates the orbit
 * equation u'' = −u + 3u² (u = 1/r, prime = d/dφ) from u = 0 to periapsis;
 * by symmetry the sweep out is the same, so α = 2φ_peri − π.
 */
export function deflection(b: number): number {
  if (b <= B_CRIT) return NaN
  // Periapsis: the smallest positive root of 1/b² − u²(1 − 2u) = 0 below 1/3.
  const g = (u: number) => 1 / (b * b) - u * u * (1 - 2 * u)
  let lo = 0
  let hi = 1 / 3
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi)
    if (g(mid) > 0) lo = mid
    else hi = mid
  }
  const up = lo
  // φ_peri = ∫₀^{u_p} du / √g(u). Substitute u = u_p(1 − s²) to remove the
  // inverse-square-root endpoint: du = −2u_p·s ds, smooth in s.
  const n = 400
  let sum = 0
  for (let i = 0; i < n; i++) {
    // Gauss–Legendre would be finer; midpoint on the smooth integrand is ample.
    const s = (i + 0.5) / n
    const u = up * (1 - s * s)
    const gu = g(u)
    if (gu <= 0) continue
    sum += (2 * up * s) / Math.sqrt(gu)
  }
  const phiPeri = sum / n
  return 2 * phiPeri - Math.PI
}

/** A deflection table α(b) on b ∈ (3√3, bMax], spaced to resolve the photon ring. */
export class DeflectionTable {
  readonly b: Float64Array
  readonly alpha: Float64Array
  constructor(bMax = 200, samples = 512) {
    this.b = new Float64Array(samples)
    this.alpha = new Float64Array(samples)
    // Logarithmic in (b − b_c): α diverges logarithmically there.
    const lo = Math.log(1e-6)
    const hi = Math.log(bMax - B_CRIT)
    for (let i = 0; i < samples; i++) {
      const b = B_CRIT + Math.exp(lo + ((hi - lo) * i) / (samples - 1))
      this.b[i] = b
      this.alpha[i] = deflection(b)
    }
  }

  /** α(b); NaN inside the shadow; the weak-field 4/b beyond the table. */
  at(b: number): number {
    if (b <= B_CRIT) return NaN
    const { b: bs, alpha } = this
    const n = bs.length
    if (b >= bs[n - 1]) return 4 / b
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (bs[mid] < b) lo = mid
      else hi = mid
    }
    const f = (Math.log(b - B_CRIT) - Math.log(bs[lo] - B_CRIT)) / (Math.log(bs[hi] - B_CRIT) - Math.log(bs[lo] - B_CRIT))
    return alpha[lo] + (alpha[hi] - alpha[lo]) * Math.max(0, Math.min(1, f))
  }
}

/**
 * Radial infall from rest at r0, in closed form (Misner, Thorne & Wheeler
 * §31.4), parametrised by the cycloid angle η ∈ [0, π]:
 *
 *     r = (r0/2)(1 + cos η)
 *     τ = √(r0³/8)·(η + sin η)
 *     t = 2·ln|(k + tan(η/2)) / (k − tan(η/2))| + 2k·[η + (r0/4)(η + sin η)],
 *     k = √(r0/2 − 1)
 *
 * τ is finite all the way to r = 0 — π√(r0³/8) in total — while t diverges as
 * r → 2: the faller crosses the horizon on their own clock and never does on
 * anyone else's.
 */
export function infall(r0: number, eta: number): { r: number; tau: number; t: number } {
  const k = Math.sqrt(r0 / 2 - 1)
  const th = Math.tan(eta / 2)
  const r = (r0 / 2) * (1 + Math.cos(eta))
  const tau = Math.sqrt((r0 * r0 * r0) / 8) * (eta + Math.sin(eta))
  const t = th < k
    ? 2 * Math.log((k + th) / (k - th)) + 2 * k * (eta + (r0 / 4) * (eta + Math.sin(eta)))
    : Infinity
  return { r, tau, t }
}

/** Cycloid angle η at which the faller from r0 reaches radius r. */
export function infallEta(r0: number, r: number): number {
  return Math.acos(Math.max(-1, Math.min(1, (2 * r) / r0 - 1)))
}

/**
 * Redshift, 1 + z, of light sent straight outward by a radial faller at r
 * (energy E) and received far away: dt_received / dτ_sent. It grows without
 * bound at the horizon — the faller fades to black, frozen and reddened.
 */
export function infallRedshift(r: number, E: number): number {
  // Received time for an outgoing ray is t − r* + const, with dr*/dr = 1/f,
  // so dt_received/dτ = dt/dτ − (dr/dτ)/f = (E − dr/dτ)/f.
  const f = 1 - 2 / r
  if (f <= 0) return Infinity
  const ur = -Math.sqrt(Math.max(0, E * E - f))
  return (E - ur) / f
}

/**
 * Periapsis advance per orbit, in radians, measured by integrating a bound
 * orbit from periapsis to the next periapsis.
 */
export function measurePrecession(rp: number, ra: number): number {
  const { E, L } = orbitBetween(rp, ra)
  const b: Body = { r: rp, phi: 0, ur: 0, E, L, tau: 0, t: 0, captured: false }
  let passedApo = false
  for (let i = 0; i < 5_000_000; i++) {
    const dtau = properStep(b, 0.0005)
    const before = b.ur
    const phiBefore = b.phi
    stepProper(b, dtau)
    if (b.captured) return NaN
    if (!passedApo && before > 0 && b.ur <= 0 && b.r > (rp + ra) / 2) passedApo = true
    if (passedApo && before < 0 && b.ur >= 0) {
      // Interpolate the instant dr/dτ crossed zero.
      const f = -before / (b.ur - before)
      return phiBefore + (b.phi - phiBefore) * f - 2 * Math.PI
    }
  }
  return NaN
}
