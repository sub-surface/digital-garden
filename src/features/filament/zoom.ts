/**
 * FILAMENT — zooming in on one halo.
 *
 * Cosmologists study a single galaxy by *resimulation*: find a halo in a big
 * box, take the patch of matter that will end up in it, and run that patch
 * again at far higher resolution, with the rest of the universe reduced to the
 * tidal field it exerts. This file does that, in the plane, from the halo as
 * the web left it:
 *
 *   • Dark matter: every cosmos particle within a few halo radii — so
 *     neighbours already falling in come along, and a merger is whatever the
 *     web was about to do — split into several finer particles each.
 *   • Stars: a cold exponential disc carrying the baryon fraction of the
 *     halo's mass, turning in the sense of the halo's own measured spin.
 *   • Tide: the environment's tidal tensor at the halo, smoothed on the halo's
 *     scale, as a linear external force.
 *
 * The result is an ordinary {@link InitialState} for the isolated FMM world,
 * in its units (G = 1, total mass 1, halo radius 1), plus the conversion of
 * those units to kpc, km/s and Myr so the scale bar stays continuous.
 */

import { mulberry32 } from "@/lib/composer/rng"
import { PATCH_MPC } from "./cosmology"
import type { Cosmos } from "./cosmos"
import { COSMO_KMS, environmentTide, type Halo } from "./halos"
import { wrapPeriodic } from "./particle-mesh"
import { TAG, type Cloud, type InitialState } from "./presets"

/** Region kept around the halo, in halo radii. */
const REGION = 2.5
/** Cosmic baryon fraction, Ω_b/Ω_m. */
const BARYON_FRACTION = 0.157
/** Disc scale length, in halo radii. */
const DISC_SCALE = 0.1

export interface ZoomUnits {
  kpc: number
  kms: number
  myr: number
}

export interface ZoomWorld {
  initial: InitialState
  tidal: [number, number, number]
  units: ZoomUnits
  nMass: number
  /** Scale factor at which the halo was taken. */
  a: number
  /** Halo mass fraction of the region, and the stars' share. */
  haloMass: number
  starMass: number
}

function gauss(rnd: () => number): number {
  const u = Math.max(1e-12, rnd())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
}

/**
 * Build a zoom-in world for `halo` in `cosmos`.
 *
 * @param budget total massive particles to spend (dark matter + stars)
 */
export function zoomWorld(cosmos: Cosmos, halo: Halo, budget: number, seed: number): ZoomWorld {
  const { x, y, vx, vy, n, a } = cosmos
  const rnd = mulberry32((seed ^ (halo.id * 0x9e3779b1)) >>> 0)
  const R = halo.radius
  const reach = REGION * R
  const inHalo = new Uint8Array(n)
  for (let k = 0; k < halo.members.length; k++) inHalo[halo.members[k]] = 1

  // The region, in the halo's frame: comoving offset / R, and physical
  // velocity (peculiar plus Hubble flow) in code units.
  const H = cosmos.hubbleRate
  const pick: number[] = []
  for (let i = 0; i < n; i++) {
    const dx = wrapPeriodic(x[i] - halo.x)
    const dy = wrapPeriodic(y[i] - halo.y)
    if (dx * dx + dy * dy < reach * reach) pick.push(i)
  }
  const region = pick.length
  const starsShare = 0.4
  const nStars = Math.max(200, Math.round(budget * starsShare))
  const split = Math.max(1, Math.min(12, Math.floor((budget - nStars) / Math.max(1, region))))
  const nDark = region * split
  const nMass = nDark + nStars

  const masses: Cloud = {
    x: new Float32Array(nMass),
    y: new Float32Array(nMass),
    vx: new Float32Array(nMass),
    vy: new Float32Array(nMass),
    m: new Float32Array(nMass),
    tag: new Float32Array(nMass),
  }

  // Physical velocities first, to measure the halo's dispersion and so fix the
  // velocity unit: a halo in equilibrium obeys the 2D virial theorem,
  // ⟨v²⟩ = G·M/2, independent of its size.
  const vel = new Float64Array(region * 2)
  let haloV2 = 0
  let haloN = 0
  const spacing = (2 / cosmos.grid) / R
  for (let k = 0; k < region; k++) {
    const i = pick[k]
    const dx = wrapPeriodic(x[i] - halo.x)
    const dy = wrapPeriodic(y[i] - halo.y)
    const px = ((vx[i] - halo.ux) / a) + H * a * dx
    const py = ((vy[i] - halo.uy) / a) + H * a * dy
    vel[2 * k] = px
    vel[2 * k + 1] = py
    if (inHalo[i]) {
      haloV2 += px * px + py * py
      haloN++
    }
  }
  const haloMass = (haloN / region) * (1 - BARYON_FRACTION)
  const starMass = (haloN / region) * BARYON_FRACTION
  const darkTotal = 1 - starMass
  const meanV2 = haloV2 / Math.max(1, haloN)
  const vScale = meanV2 > 0 ? Math.sqrt((0.5 * (haloMass + starMass)) / meanV2) : 1

  // Dark matter, each parent split into `split` children spread over its own
  // Lagrangian cell (as the finer lattice of a real zoom would be) with a
  // whisper of velocity scatter so they do not move as a rigid clump.
  const mDark = darkTotal / nDark
  const sigma = Math.sqrt(0.5 * haloMass)
  let o = 0
  for (let k = 0; k < region; k++) {
    const i = pick[k]
    const cx = wrapPeriodic(x[i] - halo.x) / R
    const cy = wrapPeriodic(y[i] - halo.y) / R
    const tag = inHalo[i] ? TAG.dark : TAG.infall
    for (let s = 0; s < split; s++) {
      masses.x[o] = cx + (split > 1 ? (rnd() - 0.5) * spacing * 0.6 : 0)
      masses.y[o] = cy + (split > 1 ? (rnd() - 0.5) * spacing * 0.6 : 0)
      masses.vx[o] = vel[2 * k] * vScale + gauss(rnd) * sigma * 0.05
      masses.vy[o] = vel[2 * k + 1] * vScale + gauss(rnd) * sigma * 0.05
      masses.m[o] = mDark
      masses.tag![o] = tag
      o++
    }
  }

  // Enclosed mass of the dark halo, for the disc's rotation curve.
  const radii = new Float64Array(nDark)
  for (let k = 0; k < nDark; k++) radii[k] = Math.hypot(masses.x[k], masses.y[k])
  radii.sort()
  const darkWithin = (r: number) => {
    let lo = 0
    let hi = nDark
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (radii[mid] < r) lo = mid + 1
      else hi = mid
    }
    return lo * mDark
  }

  // The disc: exponential, cold, turning with the halo. In 2D v_c = √(G·M(<r)).
  const rd = DISC_SCALE
  const mStar = starMass / nStars
  for (let k = 0; k < nStars; k++, o++) {
    let r = 0
    for (let t = 0; t < 64; t++) {
      const c = rnd() * rd * 7
      if (rnd() * (rd / Math.E) <= c * Math.exp(-c / rd)) {
        r = c
        break
      }
    }
    const phi = rnd() * Math.PI * 2
    const u = r / rd
    const discWithin = starMass * (1 - (1 + u) * Math.exp(-u))
    const soft = rd * 0.1
    const vc = Math.sqrt(darkWithin(r) + discWithin) * (r / Math.sqrt(r * r + soft * soft))
    masses.x[o] = Math.cos(phi) * r
    masses.y[o] = Math.sin(phi) * r
    masses.vx[o] = -halo.sense * Math.sin(phi) * vc + gauss(rnd) * 0.07 * vc
    masses.vy[o] = halo.sense * Math.cos(phi) * vc + gauss(rnd) * 0.07 * vc
    masses.m[o] = mStar
    masses.tag![o] = TAG.stars
  }

  // Centre-of-mass frame.
  let mx = 0, my = 0, mvx = 0, mvy = 0
  for (let k = 0; k < nMass; k++) {
    mx += masses.m[k] * masses.x[k]
    my += masses.m[k] * masses.y[k]
    mvx += masses.m[k] * masses.vx[k]
    mvy += masses.m[k] * masses.vy[k]
  }
  for (let k = 0; k < nMass; k++) {
    masses.x[k] -= mx
    masses.y[k] -= my
    masses.vx[k] -= mvx
    masses.vy[k] -= mvy
  }

  // The environment's tide, made dimensionless against the halo's own pull at
  // its radius (both from the same Poisson equation, so the ratio is free of
  // units), then re-expressed in the zoom's units where that pull is M_halo.
  const [txx, txy, tyy] = environmentTide(x, y, n, Int32Array.from(pick), halo.x, halo.y, 2 * R, cosmos.history.source)
  const haloFraction = halo.members.length / n
  const selfPull = (cosmos.history.source * 4 * haloFraction) / (2 * Math.PI * R)
  const k = selfPull > 0 ? (R * (haloMass + starMass)) / selfPull : 0
  const tidal: [number, number, number] = [txx * k, txy * k, tyy * k]

  // Units: length R (physical), velocity from the virial rescaling.
  const kpc = R * a * PATCH_MPC * 1000
  const kms = COSMO_KMS / vScale
  const myr = (kpc / kms) * 977.8

  const softening = rd * 0.22
  const dt = Math.min(0.004, 0.09 * softening)
  return {
    initial: {
      masses,
      tracers: { x: new Float32Array(0), y: new Float32Array(0), vx: new Float32Array(0), vy: new Float32Array(0), m: new Float32Array(0) },
      dt,
      softening,
      extent: REGION * 0.9,
    },
    tidal,
    units: { kpc, kms, myr },
    nMass,
    a,
    haloMass,
    starMass,
  }
}
