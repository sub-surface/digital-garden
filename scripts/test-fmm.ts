/**
 * FILAMENT's force solvers and cosmology, checked headlessly.
 *
 * FMM is not a heuristic — unlike Barnes-Hut there is no opening angle to tune,
 * only a truncation order p, and the error must fall geometrically as p grows.
 * That is precisely what this asserts, so a broken M2M/M2L/L2L shift shows up
 * as a convergence failure rather than as a subtly wrong-looking galaxy.
 *
 * FMM checks, over clustered and uniform distributions:
 *   - relative L2 error vs. the direct sum is below a per-order budget
 *   - the error genuinely decreases with expansion order
 *   - depth (leaf occupancy) does not change the answer, only the cost
 *   - a shallower tree and a deeper tree agree with each other
 *
 * Particle-mesh checks cover FFT round trips, periodic equilibrium, momentum,
 * structure growth, concentration, and both coarse and shipping timesteps.
 */
import { Fmm, applyPerm, directAccel, chooseDepth } from "../src/features/filament/fmm"
import { Universe } from "../src/features/filament/universe"
import { PATCH_SOURCE } from "../src/features/filament/presets"
import { A_REC, ageOf, growthTable, sampleGrowth, HUBBLE_TIME_GYR } from "../src/features/filament/cosmology"
import { fft2, ParticleMesh } from "../src/features/filament/particle-mesh"
import { mulberry32 } from "../src/lib/composer/rng"

let failures = 0
const fail = (msg: string) => {
  console.error(`FAIL ${msg}`)
  failures++
}

const G = 1
const EPS2 = 1e-6

interface Cloud {
  x: Float32Array
  y: Float32Array
  m: Float32Array
  n: number
  label: string
}

/** Uniform square. */
function uniform(n: number, seed: number): Cloud {
  const rnd = mulberry32(seed)
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const m = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    x[i] = rnd() * 2 - 1
    y[i] = rnd() * 2 - 1
    m[i] = 0.5 + rnd()
  }
  return { x, y, m, n, label: "uniform" }
}

/** Heavily clustered: a handful of tight knots, the hard case for a balanced tree. */
function clustered(n: number, seed: number): Cloud {
  const rnd = mulberry32(seed)
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const m = new Float32Array(n)
  const knots = 7
  const kx: number[] = []
  const ky: number[] = []
  for (let k = 0; k < knots; k++) {
    kx.push(rnd() * 1.6 - 0.8)
    ky.push(rnd() * 1.6 - 0.8)
  }
  for (let i = 0; i < n; i++) {
    const k = (rnd() * knots) | 0
    const r = 0.02 + rnd() * 0.09
    const a = rnd() * Math.PI * 2
    x[i] = kx[k] + Math.cos(a) * r
    y[i] = ky[k] + Math.sin(a) * r
    m[i] = 0.5 + rnd()
  }
  return { x, y, m, n, label: "clustered" }
}

/** Run the solver end to end; returns accelerations in *sorted* order plus the perm. */
function runFmm(cloud: Cloud, order: number, depth: number) {
  const { n } = cloud
  const fmm = new Fmm(order)

  // Square bounding box with a whisker of padding, same as the worker uses.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    if (cloud.x[i] < minX) minX = cloud.x[i]
    if (cloud.x[i] > maxX) maxX = cloud.x[i]
    if (cloud.y[i] < minY) minY = cloud.y[i]
    if (cloud.y[i] > maxY) maxY = cloud.y[i]
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const half = Math.max(maxX - minX, maxY - minY) * 0.5 * 1.02
  fmm.setBox(cx, cy, half)

  const perm = fmm.sort(cloud.x, cloud.y, n, depth)
  const sx = new Float32Array(n)
  const sy = new Float32Array(n)
  const sm = new Float32Array(n)
  applyPerm(cloud.x, sx, perm, n)
  applyPerm(cloud.y, sy, perm, n)
  applyPerm(cloud.m, sm, perm, n)

  fmm.build(sx, sy, sm)
  const ax = new Float32Array(n)
  const ay = new Float32Array(n)
  fmm.evalMasses(sx, sy, sm, ax, ay, G, EPS2)

  // Scatter back to the caller's original ordering so it can be compared.
  const ox = new Float32Array(n)
  const oy = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    ox[perm[i]] = ax[i]
    oy[perm[i]] = ay[i]
  }
  return { ax: ox, ay: oy, stats: { ...fmm.stats }, depth: fmm.depth }
}

/** Relative L2 error between two acceleration fields. */
function relError(ax: Float32Array, ay: Float32Array, bx: Float32Array, by: Float32Array): number {
  let num = 0
  let den = 0
  for (let i = 0; i < ax.length; i++) {
    const dx = ax[i] - bx[i]
    const dy = ay[i] - by[i]
    num += dx * dx + dy * dy
    den += bx[i] * bx[i] + by[i] * by[i]
  }
  return Math.sqrt(num / den)
}

const N = 4000
const clouds = [uniform(N, 12345), clustered(N, 999)]

// Error budget per expansion order. FMM's interaction list guarantees a
// source/target separation ratio of at most ~1/2, so the truncated tail decays
// like 2^-p; these are that bound with generous slack for the leaf geometry.
const BUDGET: Record<number, number> = { 3: 8e-2, 4: 3e-2, 6: 4e-3, 8: 6e-4 }

for (const cloud of clouds) {
  const ref = { ax: new Float32Array(cloud.n), ay: new Float32Array(cloud.n) }
  directAccel(cloud.x, cloud.y, cloud.m, cloud.n, ref.ax, ref.ay, G, EPS2)

  const depth = chooseDepth(cloud.n)
  const errors: number[] = []
  for (const order of [3, 4, 6, 8]) {
    const got = runFmm(cloud, order, depth)
    const err = relError(got.ax, got.ay, ref.ax, ref.ay)
    errors.push(err)
    if (!Number.isFinite(err)) {
      fail(`${cloud.label} p=${order}: non-finite error (NaN in the expansion)`)
      continue
    }
    if (err > BUDGET[order]) {
      fail(`${cloud.label} p=${order}: relative error ${err.toExponential(2)} > budget ${BUDGET[order].toExponential(2)}`)
    }
    console.log(
      `  ${cloud.label.padEnd(9)} p=${order}  depth=${got.depth}  ` +
        `err=${err.toExponential(2)}  near-pairs=${got.stats.nearPairs.toLocaleString()}  ` +
        `M2L=${got.stats.translations.toLocaleString()}`,
    )
  }

  // Convergence: each step up in order must actually buy accuracy.
  for (let i = 1; i < errors.length; i++) {
    if (!(errors[i] < errors[i - 1])) {
      fail(`${cloud.label}: error did not improve from p=${[3, 4, 6, 8][i - 1]} to p=${[3, 4, 6, 8][i]}`)
    }
  }

  // Depth independence: the tree is a cost knob, not a physics knob. A tree two
  // levels apart must give the same field to within the expansion tolerance.
  const shallow = runFmm(cloud, 6, depth - 1)
  const deep = runFmm(cloud, 6, depth + 1)
  const spread = relError(shallow.ax, shallow.ay, deep.ax, deep.ay)
  if (spread > 8e-3) {
    fail(`${cloud.label}: depth ${depth - 1} vs ${depth + 1} disagree by ${spread.toExponential(2)}`)
  }
  console.log(`  ${cloud.label.padEnd(9)} depth ${depth - 1} vs ${depth + 1}: ${spread.toExponential(2)}`)
}

// A single mass must produce exactly the analytic 1/r field on a distant probe
// — this catches a sign or conjugation slip that a relative-error test on a
// symmetric cloud could average away.
{
  const x = new Float32Array([0, 3])
  const y = new Float32Array([0, 4])
  const m = new Float32Array([2, 1e-12])
  const fmm = new Fmm(6)
  fmm.setBox(1.5, 2, 4)
  const perm = fmm.sort(x, y, 2, 4)
  const sx = new Float32Array(2)
  const sy = new Float32Array(2)
  const sm = new Float32Array(2)
  applyPerm(x, sx, perm, 2)
  applyPerm(y, sy, perm, 2)
  applyPerm(m, sm, perm, 2)
  fmm.build(sx, sy, sm)
  const tx = new Float32Array([3])
  const ty = new Float32Array([4])
  const ax = new Float32Array(1)
  const ay = new Float32Array(1)
  fmm.evalTracers(tx, ty, 1, ax, ay, G)
  // Expected: attraction toward the origin, magnitude G·m/r = 2/5.
  const expX = (2 * -3) / 25
  const expY = (2 * -4) / 25
  const err = Math.hypot(ax[0] - expX, ay[0] - expY) / Math.hypot(expX, expY)
  if (!(err < 5e-3)) {
    fail(`analytic probe: got (${ax[0]}, ${ay[0]}), expected (${expX}, ${expY}) — rel ${err.toExponential(2)}`)
  }
  console.log(`  analytic  single-mass probe (tracer path): err=${err.toExponential(2)}`)
}

// ---------------------------------------------------------------------------
// Periodic particle mesh: FFT, equilibrium, and momentum
// ---------------------------------------------------------------------------

{
  const n = 16
  const re = new Float64Array(n * n)
  const im = new Float64Array(n * n)
  const rnd = mulberry32(20260727)
  const original = new Float64Array(re.length)
  for (let i = 0; i < re.length; i++) original[i] = re[i] = rnd() * 2 - 1
  fft2(re, im, n, false)
  fft2(re, im, n, true)
  let maxError = 0
  for (let i = 0; i < re.length; i++) {
    maxError = Math.max(maxError, Math.abs(re[i] - original[i]), Math.abs(im[i]))
  }
  if (!(maxError < 1e-10)) fail(`periodic FFT round trip error ${maxError.toExponential(2)}`)
  console.log(`  periodic  FFT round trip: ${maxError.toExponential(2)}`)
}

{
  const side = 32
  const n = side * side
  const masses = {
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    m: new Float32Array(n),
  }
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = y * side + x
      masses.x[i] = -1 + ((x + 0.5) * 2) / side
      masses.y[i] = -1 + ((y + 0.5) * 2) / side
      masses.m[i] = 1 / n
    }
  }
  const empty = {
    x: new Float32Array(0),
    y: new Float32Array(0),
    vx: new Float32Array(0),
    vy: new Float32Array(0),
    m: new Float32Array(0),
  }
  const ax = new Float32Array(n)
  const ay = new Float32Array(n)
  const pm = new ParticleMesh(side, PATCH_SOURCE)
  pm.solve(masses, n, empty, 0, ax, ay, new Float32Array(0), new Float32Array(0))
  let peakAccel = 0
  for (let i = 0; i < n; i++) peakAccel = Math.max(peakAccel, Math.hypot(ax[i], ay[i]))
  if (!(peakAccel < 1e-6)) fail(`uniform periodic mesh accelerated by ${peakAccel.toExponential(2)}`)
  console.log(`  periodic  uniform equilibrium: max |a|=${peakAccel.toExponential(2)}`)
}

// ---------------------------------------------------------------------------
// Cosmology: the background expansion, and the growth of what sits on it
// ---------------------------------------------------------------------------

{
  // The Friedmann integral has to reproduce the real universe's clock, because
  // the whole point of the cosmological mode is that the readout is not made up.
  const ageToday = ageOf(1) * HUBBLE_TIME_GYR
  if (!(ageToday > 13.5 && ageToday < 14.1)) {
    fail(`age of the universe: got ${ageToday.toFixed(2)} Gyr, expected ≈13.8`)
  }
  const ageRec = ageOf(A_REC) * HUBBLE_TIME_GYR * 1e6
  if (!(ageRec > 300 && ageRec < 450)) {
    fail(`age at recombination: got ${ageRec.toFixed(0)} kyr, expected ≈370`)
  }
  if (!(ageOf(A_REC) < ageOf(0.5) && ageOf(0.5) < ageOf(1))) {
    fail("cosmic time is not monotonic in a")
  }
  console.log(`  age today ${ageToday.toFixed(2)} Gyr · recombination ${ageRec.toFixed(0)} kyr`)

  // Linear growth must be monotonic, normalised at the present day, and — the
  // property the initial conditions actually depend on — a *growing* mode.
  const table = growthTable(PATCH_SOURCE)
  const today = sampleGrowth(table, 1)
  if (Math.abs(today.D - 1) > 1e-6) {
    fail(`growth factor is not normalised: D(a=1) = ${today.D}`)
  }
  let prev = 0
  for (const z of [1100, 300, 100, 30, 10, 6, 3, 2, 1, 0.5, 0]) {
    const { D, dD } = sampleGrowth(table, 1 / (1 + z))
    if (!Number.isFinite(D) || D <= prev) fail(`growth is not increasing at z=${z} (D=${D})`)
    if (dD <= 0) fail(`growth is not a growing mode at z=${z} (dD/dlna=${dD})`)
    prev = D
  }
  const late = sampleGrowth(table, 1).D / sampleGrowth(table, 1 / 7).D
  console.log(`  linear growth z=6 → 0: ${late.toFixed(1)}× (ΛCDM ≈ 7×)`)
}

// ---------------------------------------------------------------------------
// Integrators: nothing may diverge, and nothing may become NaN
// ---------------------------------------------------------------------------

for (const preset of ["cosmos", "disc", "collision", "collapse"] as const) {
  const u = new Universe({ preset, seed: 4242, nMass: 2000, nTracer: 1000, order: 4, softening: 1 })
  const steps = 600
  const r0 = u.rmsRadius()
  for (let i = 0; i < steps; i++) u.step()
  const r1 = u.rmsRadius()

  let bad = 0
  for (let i = 0; i < u.nMass; i++) {
    if (!Number.isFinite(u.masses.x[i]) || !Number.isFinite(u.masses.vx[i])) bad++
  }
  for (let i = 0; i < u.nTracer; i++) {
    if (!Number.isFinite(u.tracers.x[i])) bad++
  }
  if (bad > 0) fail(`${preset}: ${bad} non-finite particles after ${steps} steps`)
  if (!Number.isFinite(r1)) fail(`${preset}: RMS radius is not finite`)
  // Nothing should blow up by orders of magnitude: comoving structure formation
  // keeps the patch roughly its original size, and the isolated systems are
  // bound. A runaway integrator shows up here long before it shows up on screen.
  if (r1 > r0 * 8) fail(`${preset}: RMS radius grew ${(r1 / r0).toFixed(1)}× — integrator unstable`)

  const extra =
    preset === "cosmos"
      ? `  z=${u.z.toFixed(1)}  t=${(u.cosmicTime * HUBBLE_TIME_GYR).toFixed(2)} Gyr  "${u.epoch()}"`
      : `  t=${u.simTime.toFixed(2)}`
  console.log(
    `  ${preset.padEnd(10)} ${String(steps).padStart(4)} steps  rms ${r0.toFixed(3)}→${r1.toFixed(3)}` +
      `  depth=${u.stats.depth}  ${Math.round(u.stats.speedup).toLocaleString()}× vs direct${extra}`,
  )
}

// ---------------------------------------------------------------------------
// The whole of cosmic history, end to end
// ---------------------------------------------------------------------------

/** Peak leaf-cell mass over the mean occupied one — a blunt clustering measure. */
function clustering(u: Universe): number {
  return u.stats.peakCellMass * u.stats.occupiedCells
}

{
  const u = new Universe({ preset: "cosmos", seed: 77, nMass: 4000, nTracer: 0, order: 4, softening: 1 })
  // Coarsen the step so the full seven e-folds fit in a test budget. Running
  // the integrator well outside its shipping resolution is a feature here: if
  // it only holds together at the exact step the presets choose, it is fragile.
  u.dlnA *= 6
  const before = clustering(u)

  let steps = 0
  while (!u.done && steps < 4000) {
    u.step()
    steps++
  }
  if (!u.done) fail(`cosmological run did not reach the present day in ${steps} steps`)

  // The integrator accumulates cosmic time itself, as Σ dlna/H, while `ageOf`
  // integrates the Friedmann equation independently. If those two disagree, the
  // clock on screen is decorative — so check them against each other.
  const walked = u.cosmicTime * HUBBLE_TIME_GYR
  const exact = ageOf(1) * HUBBLE_TIME_GYR
  if (Math.abs(walked - exact) > 0.15) {
    fail(`integrated cosmic time ${walked.toFixed(3)} Gyr vs exact ${exact.toFixed(3)} Gyr`)
  }

  const after = clustering(u)
  let bad = 0
  for (let i = 0; i < u.nMass; i++) if (!Number.isFinite(u.masses.x[i])) bad++
  if (bad > 0) fail(`${bad} non-finite particles at the end of cosmic history`)
  // Structure formation is the entire claim. A run that ends as smooth as it
  // began means the growing mode, the background subtraction, or the force
  // coupling is wrong — none of which the accuracy tests above would catch.
  if (!(after > before * 3)) {
    fail(`no structure formed: peak/mean leaf mass went ${before.toFixed(2)} → ${after.toFixed(2)}`)
  }
  if (!(u.stats.peakCellMass < 0.04)) {
    fail(`periodic cosmos over-collapsed: one cell holds ${(u.stats.peakCellMass * 100).toFixed(1)}% of mass`)
  }
  console.log(
    `  recombination → today in ${steps} coarse steps: clock ${walked.toFixed(2)} Gyr ` +
      `(exact ${exact.toFixed(2)}), clustering ${before.toFixed(2)} → ${after.toFixed(2)}, ` +
      `peak cell ${(u.stats.peakCellMass * 100).toFixed(2)}%`,
  )

  // Comoving momentum conservation: matching CIC deposit/interpolation leaves
  // the periodic patch with nothing external to push against.
  let vx = 0
  let vy = 0
  for (let i = 0; i < u.nMass; i++) {
    vx += u.masses.vx[i]
    vy += u.masses.vy[i]
  }
  for (let i = 0; i < u.nTracer; i++) {
    vx += u.tracers.vx[i]
    vy += u.tracers.vy[i]
  }
  const drift = Math.hypot(vx, vy) / (u.nMass + u.nTracer)
  if (!(drift < 0.05)) {
    fail(`periodic mean momentum drifted ${drift.toExponential(2)}`)
  }
  console.log(`  mean momentum drift across all of cosmic history: ${drift.toExponential(2)}`)
}

// Shipping timestep, reduced particle/mesh census. The coarse-history test
// above is intentionally abusive; this one guards the exact 6000-step path that
// once looked healthy numerically while draining the universe into one quasar
// cell.
{
  const u = new Universe({
    preset: "cosmos",
    seed: 91,
    nMass: 800,
    nTracer: 2400,
    meshSize: 32,
    order: 4,
    softening: 1,
  })
  let steps = 0
  while (!u.done && steps < 6100) {
    u.step()
    steps++
  }
  if (!u.done || steps !== 6000) fail(`shipping cosmology ended after ${steps} steps`)
  if (!(u.stats.peakCellMass < 0.05)) {
    fail(`shipping cosmology concentrated ${(u.stats.peakCellMass * 100).toFixed(1)}% in one cell`)
  }
  console.log(
    `  shipping   recombination → today in ${steps} steps · peak cell ` +
      `${(u.stats.peakCellMass * 100).toFixed(2)}%`,
  )
}

if (failures > 0) {
  console.error(`${failures} FMM failure(s)`)
  process.exit(1)
}
console.log(
  `FMM: ${clouds.length} distributions × 4 orders vs direct N² — converges as expected, depth-independent.\n` +
    `Cosmology: periodic particle mesh, ΛCDM growing mode, and stable recombination-to-present runs.`,
)
