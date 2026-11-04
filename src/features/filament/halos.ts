/**
 * FILAMENT — finding haloes in the cosmic web, and reading them.
 *
 * Friends-of-friends (Davis, Efstathiou, Frenk & White 1985): link every pair
 * of particles closer than b times the mean interparticle spacing, and call
 * each connected group a halo. With b = 0.2 the groups enclose an overdensity
 * of roughly the virial one — the standard choice, and the one used here.
 *
 * Particles are lattice vertices, so a halo is a set of *Lagrangian* indices:
 * the patch of the early universe that collapsed to make it. That identity
 * survives from one snapshot to the next, which is what makes merger trees a
 * matter of counting shared indices (`progenitors`).
 *
 * Everything here is pure and DOM-free; `scripts/test-fmm.ts` checks it.
 */

import { fft2, wrapPeriodic } from "./particle-mesh"
import { PATCH_MPC } from "./cosmology"

/** Linking length in units of the mean interparticle spacing. */
export const FOF_LINK = 0.2
/** Smallest group worth calling a halo. */
export const MIN_MEMBERS = 24

/** Matter density today, M☉ per comoving Mpc³ (Ω_m = 0.315, h = 0.674). */
const RHO_M = 0.315 * 2.775e11 * 0.674 * 0.674
/** Code velocity unit (comoving box half-width per Hubble time), km/s. */
export const COSMO_KMS = PATCH_MPC * 67.4

export interface Halo {
  /** Stable label: the smallest lattice index among the members. */
  id: number
  /** Lattice indices of the members. */
  members: Int32Array
  /** Centre (wrapped into the box), by shrinking circles. */
  x: number
  y: number
  /** Mean canonical momentum u = a²ẋ. */
  ux: number
  uy: number
  /** RMS member distance from the centre, comoving code units. */
  radius: number
  /** RMS peculiar velocity about the mean, code units (u/a). */
  sigma: number
  /**
   * Rotational support: |J| / (N · R · σ) — 0 for a hot, random swarm, about
   * 1 for a cold disc in pure rotation. The 2D stand-in for the spin λ.
   */
  spin: number
  /** Sign of the rotation (+1 counter-clockwise). */
  sense: number
}

/** Mass of a halo of `members` particles, M☉, for a lattice of `grid`². */
export function haloMassSun(members: number, grid: number): number {
  // Each particle stands for the matter in one lattice cell of a 3D box of
  // the same comoving side — what an N³ simulation of this box would assign.
  const cellMpc = (2 * PATCH_MPC) / grid
  return members * RHO_M * cellMpc * cellMpc * cellMpc
}

/** Union-find with path halving and union by size. */
class Groups {
  readonly parent: Int32Array
  readonly size: Int32Array
  constructor(n: number) {
    this.parent = new Int32Array(n)
    this.size = new Int32Array(n).fill(1)
    for (let i = 0; i < n; i++) this.parent[i] = i
  }
  find(i: number): number {
    const p = this.parent
    while (p[i] !== i) {
      p[i] = p[p[i]]
      i = p[i]
    }
    return i
  }
  union(a: number, b: number): void {
    let ra = this.find(a)
    let rb = this.find(b)
    if (ra === rb) return
    if (this.size[ra] < this.size[rb]) {
      const t = ra
      ra = rb
      rb = t
    }
    this.parent[rb] = ra
    this.size[ra] += this.size[rb]
  }
}

/**
 * Friends-of-friends on a periodic box of side 2·half.
 *
 * Particles are bucketed into cells at least one linking length wide, so a
 * particle's friends can only be in its own cell or the eight around it; each
 * cell pair is visited once.
 */
export function friendsOfFriends(
  x: Float32Array,
  y: Float32Array,
  n: number,
  link: number,
  minMembers = MIN_MEMBERS,
  half = 1,
): Int32Array[] {
  const period = 2 * half
  const side = Math.max(1, Math.min(1024, Math.floor(period / link)))
  const cell = period / side
  const cellOf = new Int32Array(n)
  const count = new Int32Array(side * side + 1)
  const wx = new Float32Array(n)
  const wy = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const px = wrapPeriodic(x[i], half)
    const py = wrapPeriodic(y[i], half)
    wx[i] = px
    wy[i] = py
    const cx = Math.min(side - 1, Math.floor((px + half) / cell))
    const cy = Math.min(side - 1, Math.floor((py + half) / cell))
    const c = cy * side + cx
    cellOf[i] = c
    count[c + 1]++
  }
  for (let c = 0; c < side * side; c++) count[c + 1] += count[c]
  const start = count.slice()
  const order = new Int32Array(n)
  for (let i = 0; i < n; i++) order[start[cellOf[i]]++] = i

  const groups = new Groups(n)
  const l2 = link * link
  // Self, then four forward neighbours (E, NW, N, NE): each pair once.
  const fwd = [0, 0, 1, 0, -1, 1, 0, 1, 1, 1]
  for (let cy = 0; cy < side; cy++) {
    for (let cx = 0; cx < side; cx++) {
      const c = cy * side + cx
      const s0 = count[c]
      const e0 = count[c + 1]
      if (s0 === e0) continue
      for (let f = 0; f < fwd.length; f += 2) {
        const nx = (cx + fwd[f] + side) % side
        const ny = (cy + fwd[f + 1] + side) % side
        const d = ny * side + nx
        if (f > 0 && d === c) continue // tiny grids wrap onto themselves
        const s1 = count[d]
        const e1 = count[d + 1]
        for (let a = s0; a < e0; a++) {
          const i = order[a]
          const xi = wx[i]
          const yi = wy[i]
          for (let b = f === 0 ? a + 1 : s1; b < e1; b++) {
            const j = order[b]
            const dx = wrapPeriodic(wx[j] - xi, half)
            const dy = wrapPeriodic(wy[j] - yi, half)
            if (dx * dx + dy * dy < l2) groups.union(i, j)
          }
        }
      }
    }
  }

  const members = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = groups.find(i)
    if (groups.size[r] < minMembers) continue
    let list = members.get(r)
    if (!list) members.set(r, (list = []))
    list.push(i)
  }
  return [...members.values()].map((m) => Int32Array.from(m))
}

/**
 * Measure a group: centre by shrinking circles (robust to the outskirts a
 * plain mean is dragged by), then size, dispersion and rotation about it.
 */
export function measureHalo(
  members: Int32Array,
  x: Float32Array,
  y: Float32Array,
  ux: Float32Array,
  uy: Float32Array,
  a: number,
  half = 1,
): Halo {
  const n = members.length
  // Unwrap every member next to the first, so a halo straddling the box edge
  // is measured in one piece.
  const ox = x[members[0]]
  const oy = y[members[0]]
  const px = new Float64Array(n)
  const py = new Float64Array(n)
  let cx = 0
  let cy = 0
  let mux = 0
  let muy = 0
  for (let k = 0; k < n; k++) {
    const i = members[k]
    px[k] = ox + wrapPeriodic(x[i] - ox, half)
    py[k] = oy + wrapPeriodic(y[i] - oy, half)
    cx += px[k]
    cy += py[k]
    mux += ux[i]
    muy += uy[i]
  }
  cx /= n
  cy /= n
  mux /= n
  muy /= n

  let r2 = 0
  for (let k = 0; k < n; k++) r2 = Math.max(r2, (px[k] - cx) ** 2 + (py[k] - cy) ** 2)
  for (let pass = 0; pass < 12; pass++) {
    const limit = r2 * 0.7
    let sx = 0
    let sy = 0
    let m = 0
    for (let k = 0; k < n; k++) {
      if ((px[k] - cx) ** 2 + (py[k] - cy) ** 2 > limit) continue
      sx += px[k]
      sy += py[k]
      m++
    }
    if (m < Math.max(8, n * 0.1)) break
    cx = sx / m
    cy = sy / m
    r2 = limit
  }

  let rr = 0
  let vv = 0
  let J = 0
  let lever = 0
  for (let k = 0; k < n; k++) {
    const i = members[k]
    const dx = px[k] - cx
    const dy = py[k] - cy
    const vx = (ux[i] - mux) / a
    const vy = (uy[i] - muy) / a
    rr += dx * dx + dy * dy
    vv += vx * vx + vy * vy
    J += dx * vy - dy * vx
    lever += Math.hypot(dx, dy) * Math.hypot(vx, vy)
  }
  const radius = Math.sqrt(rr / n)
  const sigma = Math.sqrt(vv / n)
  let id = members[0]
  for (let k = 1; k < n; k++) if (members[k] < id) id = members[k]
  return {
    id,
    members,
    x: wrapPeriodic(cx, half),
    y: wrapPeriodic(cy, half),
    ux: mux,
    uy: muy,
    radius,
    sigma,
    spin: lever > 0 ? Math.abs(J) / lever : 0,
    sense: J >= 0 ? 1 : -1,
  }
}

/** Find and measure every halo, most massive first. */
export function findHalos(
  x: Float32Array,
  y: Float32Array,
  ux: Float32Array,
  uy: Float32Array,
  grid: number,
  a: number,
  half = 1,
): Halo[] {
  const n = grid * grid
  const link = FOF_LINK * ((2 * half) / grid)
  const groups = friendsOfFriends(x, y, n, link, MIN_MEMBERS, half)
  return groups
    .map((m) => measureHalo(m, x, y, ux, uy, a, half))
    .sort((p, q) => q.members.length - p.members.length)
}

/**
 * The tidal tensor of everything *except* a halo, at the halo's centre:
 * T_ij = ∂_i∂_j φ_env, with ∇²φ = C·δ, smoothed on the halo's own scale.
 *
 * This is how the rest of the universe reaches into a zoom-in: as a linear
 * stretching and squeezing across the region, a = −T·r.
 */
export function environmentTide(
  x: Float32Array,
  y: Float32Array,
  n: number,
  exclude: Int32Array,
  cx: number,
  cy: number,
  smoothing: number,
  source: number,
  mesh = 128,
  half = 1,
): [number, number, number] {
  const cells = mesh * mesh
  const re = new Float64Array(cells)
  const im = new Float64Array(cells)
  const skip = new Uint8Array(n)
  for (let k = 0; k < exclude.length; k++) skip[exclude[k]] = 1
  const inv = mesh / (2 * half)
  for (let i = 0; i < n; i++) {
    if (skip[i]) continue
    const gx = (x[i] + half) * inv - 0.5
    const gy = (y[i] + half) * inv - 0.5
    const fx = Math.floor(gx)
    const fy = Math.floor(gy)
    const tx = gx - fx
    const ty = gy - fy
    const x0 = ((fx % mesh) + mesh) % mesh
    const y0 = ((fy % mesh) + mesh) % mesh
    const x1 = (x0 + 1) % mesh
    const y1 = (y0 + 1) % mesh
    re[y0 * mesh + x0] += (1 - tx) * (1 - ty)
    re[y0 * mesh + x1] += tx * (1 - ty)
    re[y1 * mesh + x0] += (1 - tx) * ty
    re[y1 * mesh + x1] += tx * ty
  }
  // δ relative to the full box's mean (the excluded halo is a hole in it).
  const mean = n / cells
  for (let i = 0; i < cells; i++) re[i] = re[i] / mean - 1
  fft2(re, im, mesh, false)
  let txx = 0
  let txy = 0
  let tyy = 0
  const s2 = smoothing * smoothing
  for (let j = 0; j < mesh; j++) {
    const ky = (Math.PI * (j <= mesh / 2 ? j : j - mesh)) / half
    for (let i = 0; i < mesh; i++) {
      const kx = (Math.PI * (i <= mesh / 2 ? i : i - mesh)) / half
      const k2 = kx * kx + ky * ky
      if (k2 === 0) continue
      const c = j * mesh + i
      // e^{ik·x₀}, real part of δ_k e^{ik·x₀} / cells.
      const ph = kx * (cx + half) + ky * (cy + half)
      const cr = Math.cos(ph)
      const ci = Math.sin(ph)
      const v = ((re[c] * cr - im[c] * ci) / cells) * Math.exp(-0.5 * k2 * s2) * (source / k2)
      txx += kx * kx * v
      txy += kx * ky * v
      tyy += ky * ky * v
    }
  }
  return [txx, txy, tyy]
}

/**
 * For each halo, the earlier halo that contributed most of its Lagrangian
 * indices, and what fraction — a merger tree's single step.
 */
export function progenitors(
  now: Halo[],
  before: Halo[],
  n: number,
): { main: number | null; fraction: number; count: number }[] {
  const owner = new Int32Array(n).fill(-1)
  before.forEach((h, k) => {
    for (let i = 0; i < h.members.length; i++) owner[h.members[i]] = k
  })
  return now.map((h) => {
    const tally = new Map<number, number>()
    for (let i = 0; i < h.members.length; i++) {
      const o = owner[h.members[i]]
      if (o >= 0) tally.set(o, (tally.get(o) ?? 0) + 1)
    }
    let best = -1
    let bestN = 0
    for (const [k, c] of tally) {
      if (c > bestN) {
        best = k
        bestN = c
      }
    }
    return {
      main: best >= 0 ? before[best].id : null,
      fraction: h.members.length ? bestN / h.members.length : 0,
      count: tally.size,
    }
  })
}
