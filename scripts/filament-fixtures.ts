/**
 * Isolated N-body test fixtures for scripts/test-fmm.ts: a disc, an encounter,
 * a satellite stream and a cold collapse. These were FILAMENT's lab worlds
 * before the descent replaced them; the integrator and diagnostics tests still
 * want systems with known answers, so they live on here, outside the app.
 */

import { mulberry32 } from "../src/lib/composer/rng"
import { TAG, type Cloud, type InitialState } from "../src/features/filament/engine/ics"

export type FixtureName = "disc" | "collision" | "stream" | "collapse"

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
    tag: new Float32Array(n),
  }
}

export function makeInitialState(
  preset: FixtureName,
  seed: number,
  nMass: number,
  nTracer: number,
): InitialState {
  const masses = allocate(nMass, true)
  const tracers = allocate(nTracer, false)
  const fill = (c: Cloud, n: number, salt: number) => {
    const rnd = mulberry32((seed ^ (salt * 0x85ebca6b)) >>> 0)
    switch (preset) {
      case "disc":
        layDisc(c, 0, n, rnd, { cx: 0, cy: 0, bvx: 0, bvy: 0, rd: 0.28, mass: 1, sign: 1, heat: 0.09 })
        c.tag!.fill(TAG.stars)
        break

      case "collision": {
        const half = n >> 1
        layDisc(c, 0, half, rnd, { cx: -0.62, cy: -0.18, bvx: 0.42, bvy: 0.05, rd: 0.2, mass: 0.5, sign: 1, heat: 0.08 })
        layDisc(c, half, n, rnd, { cx: 0.62, cy: 0.18, bvx: -0.42, bvy: -0.05, rd: 0.2, mass: 0.5, sign: -1, heat: 0.08 })
        c.tag!.fill(TAG.stars, 0, half)
        c.tag!.fill(TAG.companion, half, n)
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
        c.tag!.fill(TAG.stars, 0, host)
        c.tag!.fill(TAG.companion, host, n)
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
