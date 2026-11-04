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
 * Particle-mesh checks cover FFT round trips and periodic equilibrium. Cosmos
 * checks cover FastPM's exact linear growth, the recombination spectrum, σ₈,
 * a full recombination-to-today run, and the sheet renderer's mass and tiling.
 */
import { Fmm, applyPerm, directAccel, chooseDepth } from "../src/features/filament/fmm"
import { Universe } from "../src/features/filament/universe"
import { PATCH_SOURCE, makeInitialState, type DarkMatter } from "../src/features/filament/presets"
import {
  A_REC,
  ageOf,
  COSMOLOGIES,
  growthTable,
  sampleGrowth,
  sourceFor,
  HUBBLE_TIME_GYR,
} from "../src/features/filament/cosmology"
import {
  MeshAnalysis,
  densityPdf,
  depositPeriodic,
  isolatedDiagnostics,
} from "../src/features/filament/analysis"
import { K_BINS, kBin, kBinCentre } from "../src/features/filament/spectrum"
import { HUE_BINS, buildLensPalette, lensGradient } from "../src/features/filament/palettes"
import { Cosmos } from "../src/features/filament/cosmos"
import { SheetRaster } from "../src/features/filament/sheet"
import { findHalos, friendsOfFriends, measureHalo, progenitors } from "../src/features/filament/halos"
import { zoomWorld } from "../src/features/filament/zoom"
import { fft2, ParticleMesh } from "../src/features/filament/particle-mesh"
import {
  depositCic,
  resampleConservative,
  timedDecay,
} from "../src/features/filament/density-raster"
import { mulberry32 } from "../src/lib/composer/rng"
import { execFileSync } from "node:child_process"

if (process.env.SKIP_FILAMENT === "true" || process.env.SKIP_FILAMENT === "1") {
  console.log("FILAMENT: skipped (SKIP_FILAMENT set).")
  process.exit(0)
}

if (!process.env.FORCE_FILAMENT && !process.env.CI) {
  try {
    const diff = execFileSync("git", ["diff", "HEAD", "--", "src/features/filament", "scripts/test-fmm.ts"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim()
    const status = execFileSync("git", ["status", "--porcelain", "--", "src/features/filament", "scripts/test-fmm.ts"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim()
    if (!diff && !status) {
      console.log("FILAMENT: solvers unchanged since HEAD — skipped (set FORCE_FILAMENT=1 to run full 6k-step suite).")
      process.exit(0)
    }
  } catch {
    // If git probe fails, fall through to running test
  }
}

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

// A round trip passes for any self-inverse transform, so also pin the forward
// FFT against the textbook 2D DFT, X[ky,kx] = Σ x[y,x]·e^{-2πi(kx·x + ky·y)/n}.
for (const n of [8, 32]) {
  const rnd = mulberry32(1000 + n)
  const re = new Float64Array(n * n)
  const im = new Float64Array(n * n)
  for (let i = 0; i < re.length; i++) {
    re[i] = rnd() * 2 - 1
    im[i] = rnd() * 2 - 1
  }
  const srcR = re.slice()
  const srcI = im.slice()
  fft2(re, im, n, false)
  let maxError = 0
  for (let ky = 0; ky < n; ky++) {
    for (let kx = 0; kx < n; kx++) {
      let sr = 0
      let si = 0
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const angle = (-2 * Math.PI * (kx * x + ky * y)) / n
          const c = Math.cos(angle)
          const s = Math.sin(angle)
          const j = y * n + x
          sr += srcR[j] * c - srcI[j] * s
          si += srcR[j] * s + srcI[j] * c
        }
      }
      const k = ky * n + kx
      maxError = Math.max(maxError, Math.abs(re[k] - sr), Math.abs(im[k] - si))
    }
  }
  if (!(maxError < 1e-9)) fail(`periodic FFT ${n}² disagrees with direct DFT by ${maxError.toExponential(2)}`)
  console.log(`  periodic  FFT ${n}² vs direct DFT: ${maxError.toExponential(2)}`)
}

{
  const side = 32
  const n = side * side
  const px = new Float32Array(n)
  const py = new Float32Array(n)
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = y * side + x
      // Whole boxes off: the solver must accept unwrapped positions.
      px[i] = -1 + ((x + 0.5) * 2) / side + 2
      py[i] = -1 + ((y + 0.5) * 2) / side - 4
    }
  }
  const ax = new Float32Array(n)
  const ay = new Float32Array(n)
  const pm = new ParticleMesh(side, PATCH_SOURCE)
  pm.solve(px, py, n, ax, ay)
  let peakAccel = 0
  for (let i = 0; i < n; i++) peakAccel = Math.max(peakAccel, Math.hypot(ax[i], ay[i]))
  if (!(peakAccel < 1e-6)) fail(`uniform periodic mesh accelerated by ${peakAccel.toExponential(2)}`)
  console.log(`  periodic  uniform equilibrium: max |a|=${peakAccel.toExponential(2)}`)
}

// Presentation continuity is a numerical property. Density must be conserved
// through sub-pixel motion and adaptive resizes, and trail time must not change
// when a machine presents fewer frames.
{
  const a = new Float32Array(16 * 16)
  const b = new Float32Array(16 * 16)
  depositCic(a, 16, 16, 5.49, 7.25, 2)
  depositCic(b, 16, 16, 5.51, 7.25, 2)
  const sum = (v: Float32Array) => {
    let total = 0
    for (const x of v) total += x
    return total
  }
  const deposited = sum(a)
  let motion = 0
  for (let i = 0; i < a.length; i++) motion += Math.abs(a[i] - b[i])
  if (!(Math.abs(deposited - 2) < 1e-6)) fail(`CIC raster lost density: ${deposited}`)
  if (!(motion < 0.1)) fail(`sub-pixel CIC motion jumped by ${motion}`)

  const smooth = new Float32Array(12 * 10)
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 12; x++) {
      smooth[y * 12 + x] = 1 + 0.2 * Math.sin(x * 0.4) * Math.cos(y * 0.3)
    }
  }
  const resized = resampleConservative(smooth, 12, 10, 19, 17)
  const energyError = Math.abs(sum(resized) / sum(smooth) - 1)
  if (!(energyError < 0.01)) fail(`adaptive raster resize changed energy by ${energyError}`)

  const at30Hz = Math.pow(timedDecay(0.9, 1 / 30), 30)
  const at60Hz = Math.pow(timedDecay(0.9, 1 / 60), 60)
  if (!(Math.abs(at30Hz - at60Hz) < 1e-12)) fail("trail half-life depends on frame rate")
  console.log(
    `  raster    CIC conserved ${deposited.toFixed(2)} · resize error ` +
      `${energyError.toExponential(2)} · frame-rate invariant`,
  )
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

for (const preset of ["disc", "collision", "stream", "collapse"] as const) {
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
  // Nothing should blow up by orders of magnitude: the isolated systems are
  // bound. A runaway integrator shows up here long before it shows up on screen.
  if (r1 > r0 * 8) fail(`${preset}: RMS radius grew ${(r1 / r0).toFixed(1)}× — integrator unstable`)

  const extra = `  t=${u.time.toFixed(2)}`
  console.log(
    `  ${preset.padEnd(10)} ${String(steps).padStart(4)} steps  rms ${r0.toFixed(3)}→${r1.toFixed(3)}` +
      `  depth=${u.stats.depth}  ${Math.round(u.stats.speedup).toLocaleString()}× vs direct${extra}`,
  )
}

// ---------------------------------------------------------------------------
// Cosmos: FastPM, the whole of cosmic history, and the sheet
// ---------------------------------------------------------------------------

// FastPM's claim is that linear growth is exact at *any* step size. Replace
// the field with one gentle box-scale mode and the displacement today must be
// D(1)·ψ, the momentum G_p(1)·ψ — to within the mesh's force accuracy.
{
  // A 256 mesh puts the force softening (0.8 cells) at 0.15% for this mode,
  // so what remains is the integrator's own error.
  const c = new Cosmos({ seed: 1, grid: 32, meshSize: 256 })
  const h = c.history
  const A = 2e-3
  const D0 = h.growth(c.a)
  const Gp0 = h.momentumGrowth(c.a)
  const q = new Float64Array(c.n)
  for (let j = 0; j < c.grid; j++) {
    for (let i = 0; i < c.grid; i++) {
      const k = j * c.grid + i
      q[k] = -1 + ((i + 0.5) * 2) / c.grid
      const psi = (A * Math.sin(Math.PI * q[k])) / Math.PI
      c.sx[k] = D0 * psi
      c.sy[k] = 0
      c.vx[k] = Gp0 * psi
      c.vy[k] = 0
    }
  }
  c.refresh()
  while (!c.done) c.step()
  let err = 0
  let norm = 0
  let uErr = 0
  const Gp1 = h.momentumGrowth(1)
  for (let k = 0; k < c.n; k++) {
    const psi = (A * Math.sin(Math.PI * q[k])) / Math.PI
    err += (c.x[k] - q[k] - psi) ** 2
    uErr += (c.vx[k] - Gp1 * psi) ** 2
    norm += psi * psi
  }
  const posErr = Math.sqrt(err / norm)
  const momErr = Math.sqrt(uErr / (norm * Gp1 * Gp1))
  if (!(posErr < 0.004)) fail(`FastPM linear displacement off by ${(posErr * 100).toFixed(2)}% after ${c.steps} steps`)
  if (!(momErr < 0.004)) fail(`FastPM linear momentum off by ${(momErr * 100).toFixed(2)}%`)
  console.log(
    `  FastPM    single mode, recombination → today in ${c.steps} steps: ` +
      `ψ err ${(posErr * 100).toFixed(3)}% · u err ${(momErr * 100).toFixed(3)}%`,
  )
}

// The measured spectrum at recombination is the linear prediction for the
// same realisation — one check for the Zel'dovich normalisation, the CIC
// deconvolution, the binning, and the Δ² convention.
{
  const make = (darkMatter: DarkMatter, grid = 128) =>
    new Cosmos({ seed: 5, grid, meshSize: grid, ic: { cosmology: COSMOLOGIES.planck, darkMatter, amplitude: 1 } })
  const cold = make("cold")
  const an = new MeshAnalysis(128)
  const pk = new Float64Array(K_BINS)
  an.load(cold.pm.cellMass)
  an.powerSpectrum(pk)
  const D2 = cold.growthFactor ** 2
  let worst = 0
  for (let b = 0; b < K_BINS; b++) {
    if (kBinCentre(b) > 16 || cold.linearToday[b] <= 0 || pk[b] <= 0) continue
    worst = Math.max(worst, Math.abs(pk[b] / (cold.linearToday[b] * D2) - 1))
  }
  if (!(worst < 0.06)) fail(`recombination spectrum departs from linear theory by ${(worst * 100).toFixed(1)}%`)

  // σ₈ of the realised linear field, measured the way it is defined: smooth
  // δ/D with a top-hat 8 Mpc across, take the rms. The normalisation is to the
  // ensemble, so this realisation may differ by its cosmic variance.
  const n = 128
  const re = new Float64Array(n * n)
  const im = new Float64Array(n * n)
  for (let i = 0; i < n * n; i++) re[i] = an.delta[i] / cold.growthFactor
  fft2(re, im, n, false)
  const R = 8 / 90
  const sinc = (v: number) => (Math.abs(v) < 1e-9 ? 1 : Math.sin(v) / v)
  for (let y = 0; y < n; y++) {
    const ky = Math.PI * (y <= n / 2 ? y : y - n)
    for (let x = 0; x < n; x++) {
      const kx = Math.PI * (x <= n / 2 ? x : x - n)
      const kr = Math.hypot(kx, ky) * R
      // 2J₁(x)/x from its power series, ample at these arguments.
      let w = 1
      if (kr > 1e-6) {
        let j1 = 0
        let term = kr / 2
        for (let m = 0; m < 40; m++) {
          j1 += term
          term *= -(kr * kr) / 4 / ((m + 1) * (m + 2))
        }
        w = (2 * j1) / kr
      }
      // Divide out the CIC deposit window too: σ₈ is a property of the field.
      const cic = (sinc(kx / n) * sinc(ky / n)) ** 2
      re[y * n + x] *= w / cic
      im[y * n + x] *= w / cic
    }
  }
  fft2(re, im, n, true)
  let s2 = 0
  for (let i = 0; i < n * n; i++) s2 += re[i] * re[i]
  const sigma8 = Math.sqrt(s2 / (n * n))
  if (!(Math.abs(sigma8 - 1) < 0.15)) fail(`realised σ₈ ${sigma8.toFixed(3)}, requested 1`)

  // Same phases: the hot/cold ratio is exactly T² in every bin, since both
  // spectra are normalised to the same cold σ₈.
  const hot = make("hot", 64)
  const cold64 = make("cold", 64)
  const big = kBin(1)
  const small = kBin(14)
  const tHot = Math.exp(-3.9 / 30 - 2.1 / 900)
  const sameLarge = Math.abs(hot.linearToday[big] / cold64.linearToday[big] / (tHot * tHot) - 1)
  const suppressed = hot.linearToday[small] / cold64.linearToday[small]
  if (!(sameLarge < 1e-6)) fail(`hot/cold box-scale ratio is not T(1)²: off by ${sameLarge.toExponential(2)}`)
  if (!(suppressed < 0.05)) fail(`hot dark matter kept ${(suppressed * 100).toFixed(1)}% of k=14 power`)
  console.log(
    `  spectrum  recombination vs linear: worst ${(worst * 100).toFixed(1)}% (k ≤ 16) · σ₈ ${sigma8.toFixed(3)} · ` +
      `hot/cold = T² to ${sameLarge.toExponential(0)} · k=14 ${suppressed.toExponential(1)}`,
  )
}

// A full nonlinear run: it must reach today, stay finite, conserve momentum,
// and actually form structure — sheets folding into many streams.
{
  const c = new Cosmos({ seed: 77, grid: 64, meshSize: 128 })
  const peak0 = c.pm.stats.peakCellMass
  while (!c.done && c.steps < 2000) c.step()
  if (!c.done) fail(`cosmos did not reach the present day in ${c.steps} steps`)
  let bad = 0
  for (let i = 0; i < c.n; i++) if (!Number.isFinite(c.x[i]) || !Number.isFinite(c.vx[i])) bad++
  if (bad > 0) fail(`${bad} non-finite cosmos particles today`)
  const drift = c.meanMomentum()
  if (!(drift < 1e-4)) fail(`periodic mean momentum drifted ${drift.toExponential(2)}`)
  const peak1 = c.pm.stats.peakCellMass
  if (!(peak1 > peak0 * 20)) fail(`no structure formed: densest cell ${peak0.toExponential(2)} → ${peak1.toExponential(2)}`)

  const sheet = new SheetRaster()
  sheet.resize(256, 256)
  sheet.draw(c.x, c.y, c.grid, 2, { cx: 0, cy: 0, scale: 128 })
  let mass = 0
  let multi = 0
  for (let i = 0; i < 256 * 256; i++) {
    mass += sheet.density[i]
    if (sheet.streams[i] >= 2.5) multi++
  }
  const massErr = Math.abs(mass / (256 * 256) - 1)
  if (!(massErr < 0.01)) fail(`sheet raster lost ${(massErr * 100).toFixed(2)}% of the box's mass`)
  const multiFrac = multi / (256 * 256)
  if (!(multiFrac > 0.02 && multiFrac < 0.8)) fail(`multistream fraction today ${(multiFrac * 100).toFixed(1)}%`)
  console.log(
    `  cosmos    recombination → today in ${c.steps} steps · momentum ${drift.toExponential(1)} · ` +
      `densest cell ×${(peak1 / peak0).toFixed(0)} · sheet mass ${(massErr * 100).toFixed(2)}% off · ` +
      `${(multiFrac * 100).toFixed(1)}% of the box multistream`,
  )
}

// The sheet on an undisturbed lattice is exactly the mean, pixel by pixel —
// the top-left rule gives every pixel to exactly one triangle — and the box
// tiles: a camera one period over sees the same picture, half a period over
// sees it rolled. (Panning used to stop at the box edge.)
{
  const grid = 32
  const lattice = (wobble: number) => {
    const x = new Float32Array(grid * grid)
    const y = new Float32Array(grid * grid)
    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        x[j * grid + i] = -1 + ((i + 0.5) * 2) / grid + wobble * Math.sin((2 * Math.PI * j) / grid)
        y[j * grid + i] = -1 + ((j + 0.5) * 2) / grid
      }
    }
    return { x, y }
  }
  const flat = new SheetRaster()
  flat.resize(200, 120)
  const u = lattice(0)
  flat.draw(u.x, u.y, grid, 2, { cx: 0.3, cy: -0.7, scale: 64 })
  let flatErr = 0
  for (let i = 0; i < flat.density.length; i++) {
    flatErr = Math.max(flatErr, Math.abs(flat.density[i] - 1), Math.abs(flat.streams[i] - 1))
  }

  const w = lattice(0.02)
  const a = new SheetRaster()
  const b = new SheetRaster()
  const r = new SheetRaster()
  for (const s of [a, b, r]) s.resize(128, 128)
  a.draw(w.x, w.y, grid, 2, { cx: 0.1, cy: 0.2, scale: 64 })
  b.draw(w.x, w.y, grid, 2, { cx: 0.1 + 2, cy: 0.2 - 6, scale: 64 })
  r.draw(w.x, w.y, grid, 2, { cx: 0.1 + 1, cy: 0.2, scale: 64 })
  let periodErr = 0
  let rollErr = 0
  for (let py = 0; py < 128; py++) {
    for (let px = 0; px < 128; px++) {
      const i = py * 128 + px
      periodErr = Math.max(periodErr, Math.abs(a.density[i] - b.density[i]))
      rollErr = Math.max(rollErr, Math.abs(a.density[py * 128 + ((px + 64) % 128)] - r.density[i]))
    }
  }
  if (!(flatErr < 1e-5)) fail(`undisturbed sheet is not uniform: max error ${flatErr.toExponential(2)}`)
  if (!(periodErr < 1e-4)) fail(`camera one period over draws a different sky: ${periodErr.toExponential(2)}`)
  if (!(rollErr < 1e-4)) fail(`half-period pan does not roll the sky: ${rollErr.toExponential(2)}`)
  console.log(
    `  sheet     uniform lattice exact to ${flatErr.toExponential(1)} · periodic camera ${periodErr.toExponential(1)} · ` +
      `pan roll ${rollErr.toExponential(1)}`,
  )
}


// ---------------------------------------------------------------------------
// The descent: haloes, zoom-ins, and a solver that survives escapers
// ---------------------------------------------------------------------------

// Friends-of-friends on a field with known answers: two tight clumps (one
// straddling the periodic edge) and a sprinkling of loners.
{
  const rnd = mulberry32(31)
  const n = 600
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (i < 200) {
      x[i] = 0.3 + (rnd() - 0.5) * 0.02
      y[i] = -0.2 + (rnd() - 0.5) * 0.02
    } else if (i < 350) {
      // Across the x = ±1 seam.
      x[i] = (rnd() < 0.5 ? 0.995 : -0.995) + (rnd() - 0.5) * 0.008
      y[i] = 0.5 + (rnd() - 0.5) * 0.02
    } else {
      x[i] = -1 + 2 * rnd()
      y[i] = -1 + 2 * rnd()
    }
  }
  const groups = friendsOfFriends(x, y, n, 0.01, 24)
  const sizes = groups.map((g) => g.length).sort((a, b) => b - a)
  if (sizes.length !== 2 || sizes[0] !== 200 || sizes[1] !== 150) {
    fail(`friends-of-friends found ${JSON.stringify(sizes)}, expected [200, 150]`)
  }
  const zero = new Float32Array(n)
  const seam = groups.find((g) => g.length === 150)
  const h = seam ? measureHalo(seam, x, y, zero, zero, 1) : null
  if (!h || Math.abs(Math.abs(h.x) - 0.995) > 0.01) fail(`seam halo centred at ${h?.x.toFixed(3)}, expected ±0.995`)
  console.log(`  haloes    FoF ${JSON.stringify(sizes)} · seam-straddling centre ${h?.x.toFixed(3)}`)
}

// On a real run: haloes form, grow, and keep their Lagrangian identity.
{
  const c = new Cosmos({ seed: 9, grid: 128, meshSize: 128 })
  while (!c.done && c.a < 0.6) c.step()
  const early = findHalos(c.x, c.y, c.vx, c.vy, c.grid, c.a)
  while (!c.done) c.step()
  const late = findHalos(c.x, c.y, c.vx, c.vy, c.grid, c.a)
  const massEarly = early.reduce((s, h) => s + h.members.length, 0) / c.n
  const massLate = late.reduce((s, h) => s + h.members.length, 0) / c.n
  if (!(late.length > 0 && massLate > massEarly)) {
    fail(`haloes did not grow: ${(massEarly * 100).toFixed(1)}% → ${(massLate * 100).toFixed(1)}% of mass`)
  }
  const tree = progenitors(late.slice(0, 1), early, c.n)[0]
  if (early.length === 0) fail("no haloes at z = 0.67 to trace back to")
  if (!(tree.main !== null && tree.fraction > 0.1)) {
    fail(`largest halo today has no clear progenitor (${tree.fraction.toFixed(2)})`)
  }

  // Zoom into the biggest: mass sums to one, the frame is at rest, and the
  // halo starts near virial equilibrium.
  const big = late[0]
  const zw = zoomWorld(c, big, 3000, 1)
  const m = zw.initial.masses
  let mass = 0, px = 0, py = 0, mx = 0
  for (let i = 0; i < zw.nMass; i++) {
    mass += m.m[i]
    px += m.m[i] * m.vx[i]
    py += m.m[i] * m.vy[i]
    mx += m.m[i] * m.x[i]
  }
  if (Math.abs(mass - 1) > 1e-4) fail(`zoom-in mass ${mass.toFixed(5)}`)
  if (Math.hypot(px, py) > 1e-5 || Math.abs(mx) > 1e-5) fail("zoom-in not in its centre-of-mass frame")
  const u = new Universe({
    preset: "disc", seed: 1, nMass: zw.nMass, nTracer: 0, order: 4, softening: 1,
    initial: zw.initial, tidal: zw.tidal,
  })
  for (let s = 0; s < 150; s++) u.step()
  let bad = 0
  for (let i = 0; i < u.nMass; i++) if (!Number.isFinite(u.masses.x[i]) || !Number.isFinite(u.masses.vx[i])) bad++
  const d = isolatedDiagnostics(u.masses, u.nMass)
  if (bad > 0) fail(`${bad} non-finite particles in the zoom-in`)
  if (!(d.virial > 0.3 && d.virial < 3)) fail(`zoom-in virial ratio ${d.virial.toFixed(2)} after 150 steps`)
  if (!(zw.units.kpc > 1 && zw.units.kms > 1 && zw.units.myr > 1)) fail("zoom-in units are not physical")
  console.log(
    `  zoom-in   ${late.length} haloes today (${(massLate * 100).toFixed(0)}% of mass) · progenitor share ` +
      `${(tree.fraction * 100).toFixed(0)}% · ${zw.nMass} particles, Q ${d.virial.toFixed(2)} · ` +
      `1 unit = ${zw.units.kpc.toFixed(0)} kpc, ${zw.units.kms.toFixed(0)} km/s, ${zw.units.myr.toFixed(0)} Myr`,
  )
}

// An escaper far outside the tree's box: its pull must be the whole system's
// monopole, not a local expansion evaluated far outside its convergence disc.
{
  const n = 400
  const rnd = mulberry32(5)
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const m = new Float32Array(n).fill(1 / n)
  for (let i = 0; i < n - 1; i++) {
    x[i] = (rnd() - 0.5) * 0.5
    y[i] = (rnd() - 0.5) * 0.5
  }
  x[n - 1] = 9
  y[n - 1] = 0
  const fmm = new Fmm(6)
  fmm.setBox(0, 0, 0.3)
  const perm = fmm.sort(x, y, n, 4)
  const sx = new Float32Array(n), sy = new Float32Array(n), sm = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    sx[k] = x[perm[k]]
    sy[k] = y[perm[k]]
    sm[k] = m[perm[k]]
  }
  fmm.build(sx, sy, sm)
  const ax = new Float32Array(n)
  const ay = new Float32Array(n)
  fmm.evalMasses(sx, sy, sm, ax, ay, 1, 1e-6)
  const k = [...perm].indexOf(n - 1)
  const expect = -(1 - 1 / n) / 9
  const err = Math.abs(ax[k] / expect - 1)
  let worst = 0
  for (let i = 0; i < n; i++) worst = Math.max(worst, Math.hypot(ax[i], ay[i]))
  if (!(err < 0.05)) fail(`escaper pull off by ${(err * 100).toFixed(1)}%`)
  if (!(worst < 100)) fail(`an escaper made the field explode: max |a| ${worst.toExponential(2)}`)
  console.log(`  escaper   monopole pull within ${(err * 100).toFixed(2)}% · max |a| ${worst.toFixed(1)}`)
}


// ---------------------------------------------------------------------------
// Instruments: every measurement checked against a field with a known answer.
// ---------------------------------------------------------------------------

// Other universes: the expansion history must reproduce the textbook ages.
{
  const eds = ageOf(1, COSMOLOGIES.eds) * HUBBLE_TIME_GYR
  // Einstein–de Sitter is exactly two-thirds of a Hubble time old.
  if (Math.abs(eds - (2 / 3) * HUBBLE_TIME_GYR) > 0.03) fail(`EdS age ${eds.toFixed(3)} Gyr, expected 9.65`)
  const open = ageOf(1, COSMOLOGIES.open) * HUBBLE_TIME_GYR
  const vacuum = ageOf(1, COSMOLOGIES.vacuum) * HUBBLE_TIME_GYR
  if (!(eds < open && open < ageOf(1) * HUBBLE_TIME_GYR && ageOf(1) * HUBBLE_TIME_GYR < vacuum)) {
    fail(`cosmology ages out of order: EdS ${eds.toFixed(2)}, open ${open.toFixed(2)}, Λ-heavy ${vacuum.toFixed(2)}`)
  }
  // Late growth: EdS keeps growing, Λ-heavy has stalled.
  const late = (c: typeof COSMOLOGIES.planck) => {
    const t = growthTable(sourceFor(c), c)
    return sampleGrowth(t, 1).D / sampleGrowth(t, 0.5).D
  }
  if (!(late(COSMOLOGIES.eds) > late(COSMOLOGIES.planck) && late(COSMOLOGIES.planck) > late(COSMOLOGIES.vacuum))) {
    fail("late-time growth should order EdS > ΛCDM > Λ-heavy")
  }
  console.log(
    `  ages      EdS ${eds.toFixed(2)} · open ${open.toFixed(2)} · Λ-heavy ${vacuum.toFixed(2)} Gyr · ` +
      `growth z=1→0 ${late(COSMOLOGIES.eds).toFixed(2)} / ${late(COSMOLOGIES.planck).toFixed(2)} / ${late(COSMOLOGIES.vacuum).toFixed(2)}`,
  )
}

// T-web, potential and flow on analytic fields.
{
  const n = 64
  const an = new MeshAnalysis(n)
  const mass = new Float32Array(n * n)
  const at = (i: number) => -1 + ((i + 0.5) * 2) / n
  // δ = A(cos πx + cos πy): a node where both crests meet, a void at the troughs.
  const A = 0.6
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) mass[y * n + x] = 1 + A * (Math.cos(Math.PI * at(x)) + Math.cos(Math.PI * at(y)))
  }
  an.load(mass)
  const census = an.tidalWeb(0.01, 0.3)
  const centre = (n / 2) * n + n / 2
  const corner = 0
  const edge = (n / 2) * n // x ≈ −1 trough, y ≈ 0 crest
  if (an.web[centre] !== 2) fail(`T-web: crest intersection classed ${an.web[centre]}, expected node`)
  if (an.web[corner] !== 0) fail(`T-web: trough classed ${an.web[corner]}, expected void`)
  if (an.web[edge] !== 1) fail(`T-web: saddle classed ${an.web[edge]}, expected filament`)
  const totalVolume = census.volume[0] + census.volume[1] + census.volume[2]
  if (Math.abs(totalVolume - 1) > 1e-9) fail("T-web volume fractions do not sum to one")

  // ∇²φ = δ for a single cosine gives φ ∝ −cos: perfectly anticorrelated.
  an.potential()
  let dot = 0, d2 = 0, p2 = 0
  for (let i = 0; i < n * n; i++) {
    dot += an.delta[i] * an.phi[i]
    d2 += an.delta[i] * an.delta[i]
    p2 += an.phi[i] * an.phi[i]
  }
  const corr = dot / Math.sqrt(d2 * p2)
  if (!(corr < -0.999)) fail(`potential/density correlation ${corr.toFixed(4)}, expected −1`)

  // A uniform lattice with u = c·sin(πx) has ∇·u = cπ·cos(πx) exactly.
  const side = 128
  const cloud = {
    x: new Float32Array(side * side),
    y: new Float32Array(side * side),
    vx: new Float32Array(side * side),
    vy: new Float32Array(side * side),
    m: new Float32Array(0),
  }
  const c = 0.05
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const k = j * side + i
      cloud.x[k] = -1 + ((i + 0.5) * 2) / side
      cloud.y[k] = -1 + ((j + 0.5) * 2) / side
      cloud.vx[k] = c * Math.sin(Math.PI * cloud.x[k])
    }
  }
  an.flow([{ c: cloud, n: side * side }], 1)
  let flowErr = 0
  for (let x = 0; x < n; x++) {
    const expect = c * Math.PI * Math.cos(Math.PI * at(x))
    flowErr = Math.max(flowErr, Math.abs(an.theta[(n / 3 | 0) * n + x] - expect) / (c * Math.PI))
  }
  if (!(flowErr < 0.03)) fail(`velocity divergence error ${(flowErr * 100).toFixed(1)}%`)

  // Redshift-space deposit moves mass but never creates or destroys it.
  const rsd = new Float32Array(n * n)
  depositPeriodic(rsd, n, 1, cloud, side * side, 1 / (side * side), 0.8)
  const rsdTotal = rsd.reduce((s, v) => s + v, 0)
  if (Math.abs(rsdTotal - 1) > 1e-4) fail(`redshift-space deposit total ${rsdTotal}`)

  const pdf = densityPdf(an.delta)
  const covered = pdf.measured.reduce((s, v) => s + v, 0) + pdf.empty
  if (Math.abs(covered - 1) > 1e-9) fail(`density PDF covers ${covered} of the cells`)
  console.log(
    `  analysis  T-web node/filament/void ✓ · φ↔δ corr ${corr.toFixed(4)} · ∇·v err ${(flowErr * 100).toFixed(2)}% · PDF closed`,
  )
}

// Isolated diagnostics: a cold disc starts rotationally supported, a cold
// cloud starts with no kinetic support at all, and the stream preset is
// assembled at rest about its centre of mass.
{
  const probe = (preset: "disc" | "collapse" | "stream") => {
    const s = makeInitialState(preset, 3, 6000, 0)
    return { s, d: isolatedDiagnostics(s.masses, 6000) }
  }
  const disc = probe("disc").d
  const cold = probe("collapse").d
  const stream = probe("stream")
  if (!(disc.virial > 0.8 && disc.virial < 1.25)) fail(`disc virial ratio ${disc.virial.toFixed(3)}, expected ≈1`)
  if (!(cold.virial < 0.05)) fail(`cold collapse virial ratio ${cold.virial.toFixed(3)}, expected ≈0`)
  let rcErr = 0
  let rcCount = 0
  for (let b = 0; b < disc.rotation.r.length; b++) {
    if (disc.rotation.r[b] < 0.15 || disc.rotation.r[b] > 0.6) continue
    rcErr = Math.max(rcErr, Math.abs(disc.rotation.vPhi[b] / disc.rotation.vCirc[b] - 1))
    rcCount++
  }
  if (rcCount === 0 || !(rcErr < 0.15)) fail(`disc rotation curve departs from √(GM(<r)) by ${(rcErr * 100).toFixed(1)}%`)
  if (!(stream.d.momentumDrift < 0.02)) fail(`stream preset carries net momentum ${stream.d.momentumDrift.toFixed(3)}`)
  if (!(disc.lagrangian[0] < disc.lagrangian[1] && disc.lagrangian[1] < disc.lagrangian[2])) {
    fail("Lagrangian radii are not ordered")
  }
  console.log(
    `  isolated  Q disc ${disc.virial.toFixed(2)} · collapse ${cold.virial.toFixed(3)} · ` +
      `rotation curve within ${(rcErr * 100).toFixed(1)}% · stream momentum ${stream.d.momentumDrift.toExponential(1)}`,
  )
}

// Palettes: tables are fully populated, legends parse.
{
  const lut = new Uint32Array(HUE_BINS * 256)
  for (const lens of ["web", "flow", "potential", "doppler", "streams"] as const) {
    lut.fill(0)
    buildLensPalette(lut, lens, [0.4, 0.5, 0.7])
    if (lut[HUE_BINS * 256 - 1] === 0 || lut[(HUE_BINS >> 1) * 256 + 128] === 0) fail(`${lens} palette has holes`)
    if (!lensGradient(lens, [0.4, 0.5, 0.7]).startsWith("linear-gradient(")) fail(`${lens} legend gradient malformed`)
  }
}

if (failures > 0) {
  console.error(`${failures} FMM failure(s)`)
  process.exit(1)
}
console.log(
  `FMM: ${clouds.length} distributions × 4 orders vs direct N² — converges as expected, depth-independent.\n` +
    `Cosmos: FastPM linear exactness, σ₈, recombination spectrum, full nonlinear run, sheet mass and tiling.\n` +
    `Instruments: spectrum vs linear theory, T-web, potential, flow, PDF, virial, rotation curve.`,
)
