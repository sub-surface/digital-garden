/**
 * GEODESIC — the black hole at the bottom of the descent, drawn three ways.
 *
 *   • orbits — the equatorial plane from above. Test particles on true
 *     Schwarzschild geodesics, advanced in the distant observer's time, so
 *     anything falling in slows, reddens and freezes at the horizon exactly as
 *     that observer would see it. Rosettes, zoom-whirls, plunges.
 *   • shadow — a camera at 40 M looking at the hole, every pixel bent through
 *     the deflection α(b). The background is the galaxy you dived from; it
 *     wraps into an Einstein ring and a photon ring at b = 3√3 M.
 *   • clocks — a probe dropped from rest, sending light pulses home. Watched
 *     from afar it never arrives; riding along, it crosses the horizon at a
 *     finite time on its own clock and meets r = 0 a moment later.
 *
 * Units G = c = M = 1 throughout; `units` converts to the world.
 */

import {
  B_CRIT,
  DeflectionTable,
  HORIZON,
  ISCO,
  PHOTON_SPHERE,
  circularOrbit,
  effectivePotential,
  infall,
  infallEta,
  infallRedshift,
  makeBody,
  orbitBetween,
  stepCoordinate,
  type Body,
} from "./geodesic"
import type { WorldUnits } from "./protocol"

export type NucleusMode = "orbits" | "shadow" | "clocks"
export type ClockFrame = "far" | "rider"

/** Sgr A*, for a nucleus visited without a galaxy around it. */
export const SGR_A_STAR = 4.3e6

/** World units for a hole of `massSun`: lengths GM/c², times GM/c³. */
export function nucleusUnits(massSun: number): WorldUnits {
  return {
    kpc: 4.785e-17 * massSun,
    kms: 299_792.458,
    myr: 1.5608e-19 * massSun,
  }
}

const TRAIL = 900
/** Camera distance for the shadow view, in M. */
const CAMERA_R = 40
/** Half-height of the shadow view, radians, at zoom 1. */
const SHADOW_FOV = 0.7
/** Angular half-size the background image is taken to span, radians. */
const BACKGROUND_FOV = 0.95
/** Coordinate time per wall second at ▶, in M. */
const ORBIT_RATE = 140

interface Tracked extends Body {
  trail: Float32Array
  head: number
  count: number
  hue: [number, number, number]
}

export interface NucleusReadout {
  mode: NucleusMode
  /** The selected orbit's conserved quantities and V_eff curve. */
  orbit: { E: number; L: number; r: number; captured: boolean; r_: number[]; V: number[] } | null
  clocks: {
    frame: ClockFrame
    r0: number
    r: number
    tau: number
    t: number
    redshift: number
    tauTotal: number
    /** τ against t for the whole fall, for the plot. */
    curveT: number[]
    curveTau: number[]
  } | null
}

export class Nucleus {
  readonly massSun: number
  readonly units: WorldUnits
  mode: NucleusMode = "orbits"
  bodies: Tracked[] = []
  selected = 0
  private table: DeflectionTable | null = null
  private background: Uint32Array | null = null
  private bgW = 0
  private bgH = 0
  /** Cached per-pixel lensing map for the shadow view. */
  private mapKey = ""
  private mapR = new Float32Array(0)
  private mapAz = new Float32Array(0)
  private spin = 0

  // --- clocks ---
  frame: ClockFrame = "far"
  r0 = 10
  /** Elapsed time on the clock being shown (t when far, τ when riding). */
  private clockT = 0
  private pulses: { t: number; r: number }[] = []
  private nextPulse = 0

  constructor(massSun: number, background: Uint32Array | null, bgW: number, bgH: number) {
    this.massSun = massSun
    this.units = nucleusUnits(massSun)
    if (background) {
      this.background = background.slice()
      this.bgW = bgW
      this.bgH = bgH
    }
    this.seedOrbits()
  }

  /** A small zoo: a precessing rosette, a zoom-whirl, an ISCO orbit, a plunge. */
  private seedOrbits(): void {
    const add = (body: Body, hue: [number, number, number]) => this.add(body, hue)
    const ros = orbitBetween(9, 30)
    add({ r: 30, phi: 0, ur: 0, E: ros.E, L: ros.L, tau: 0, t: 0, captured: false }, [255, 200, 130])
    const whirl = orbitBetween(4.35, 24)
    add({ r: 24, phi: 2.2, ur: 0, E: whirl.E, L: whirl.L, tau: 0, t: 0, captured: false }, [140, 220, 255])
    const c6 = circularOrbit(ISCO + 0.4)
    add({ r: ISCO + 0.4, phi: 4.1, ur: 0, E: c6.E, L: c6.L, tau: 0, t: 0, captured: false }, [200, 255, 170])
    add(makeBody(28, 3.4, -0.05, 3.7), [255, 140, 180])
  }

  add(body: Body, hue: [number, number, number]): void {
    if (this.bodies.length >= 8) this.bodies.shift()
    this.bodies.push({ ...body, trail: new Float32Array(TRAIL * 2), head: 0, count: 0, hue })
    this.selected = this.bodies.length - 1
  }

  /**
   * Launch from (x, y) in M with velocity (vx, vy) as a fraction of the local
   * circular speed; a click with no drag launches a circular orbit.
   */
  launch(x: number, y: number, vx: number, vy: number): void {
    const r = Math.max(HORIZON + 0.5, Math.hypot(x, y))
    const phi = Math.atan2(y, x)
    const hues: [number, number, number][] = [
      [255, 220, 150], [150, 210, 255], [190, 255, 180], [255, 160, 200], [230, 190, 255],
    ]
    const hue = hues[this.bodies.length % hues.length]
    if (Math.hypot(vx, vy) < 1e-3) {
      if (r > PHOTON_SPHERE + 0.05) {
        const c = circularOrbit(r)
        this.add({ r, phi, ur: 0, E: c.E, L: c.L, tau: 0, t: 0, captured: false }, hue)
      }
      return
    }
    // Local frame: radial and tangential components of the launch velocity,
    // scaled by the circular speed there (or the Newtonian one inside 3M).
    const vc = r > PHOTON_SPHERE ? Math.sqrt(1 / (r - 3)) * Math.sqrt(1 - 2 / r) : Math.sqrt(1 / r)
    const vr = (vx * Math.cos(phi) + vy * Math.sin(phi)) * vc
    const vt = (-vx * Math.sin(phi) + vy * Math.cos(phi)) * vc
    // Static observer's speeds → geodesic constants: γ from the local speed.
    const v2 = Math.min(0.995, vr * vr + vt * vt)
    const gamma = 1 / Math.sqrt(1 - v2)
    const L = r * gamma * vt
    const ur = gamma * vr * Math.sqrt(1 - 2 / r)
    this.add(makeBody(r, phi, ur, L), hue)
  }

  /** Advance by `dtWall` seconds of the page clock at playback `rate`. */
  step(dtWall: number, rate: number): void {
    if (this.mode === "orbits") {
      const dt = dtWall * rate * ORBIT_RATE
      for (const b of this.bodies) {
        stepCoordinate(b, dt)
        // Trail in coordinate positions.
        b.trail[b.head * 2] = b.r * Math.cos(b.phi)
        b.trail[b.head * 2 + 1] = b.r * Math.sin(b.phi)
        b.head = (b.head + 1) % TRAIL
        b.count = Math.min(TRAIL, b.count + 1)
      }
      this.bodies = this.bodies.filter((b) => !b.captured || b.r > HORIZON)
      if (this.selected >= this.bodies.length) this.selected = this.bodies.length - 1
    } else if (this.mode === "shadow") {
      this.spin += dtWall * rate * 0.05
    } else {
      this.stepClocks(dtWall * rate)
    }
  }

  // ---------------------------------------------------------------------------
  // Clocks
  // ---------------------------------------------------------------------------

  drop(r0: number): void {
    this.r0 = Math.max(4, Math.min(60, r0))
    this.clockT = 0
    this.pulses = []
    this.nextPulse = 0
  }

  private tauTotal(): number {
    return Math.PI * Math.sqrt((this.r0 * this.r0 * this.r0) / 8)
  }

  /** The probe's state at the shown clock reading. */
  private probe(): { r: number; tau: number; t: number } {
    const r0 = this.r0
    if (this.frame === "rider") {
      // τ = √(r0³/8)(η + sin η): solve for η by Newton.
      const target = Math.min(this.clockT, this.tauTotal())
      const k = Math.sqrt((r0 * r0 * r0) / 8)
      let eta = Math.min(Math.PI, target / (2 * k))
      for (let i = 0; i < 30; i++) {
        const f = k * (eta + Math.sin(eta)) - target
        eta = Math.max(0, Math.min(Math.PI, eta - f / (k * (1 + Math.cos(eta)) + 1e-12)))
      }
      return infall(r0, eta)
    }
    // Far frame: invert t(η) by bisection; t → ∞ at the horizon.
    let lo = 0
    let hi = infallEta(r0, HORIZON) - 1e-12
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi)
      if (infall(r0, mid).t < this.clockT) lo = mid
      else hi = mid
    }
    return infall(r0, lo)
  }

  private stepClocks(dtWall: number): void {
    // ~ one free-fall time per 10 s of wall clock.
    const rate = this.tauTotal() / 10
    this.clockT += dtWall * rate
    // Pulses every fixed interval of the probe's own proper time.
    const p = this.probe()
    const every = this.tauTotal() / 24
    while (this.nextPulse <= p.tau && p.r > HORIZON) {
      const e = infall(this.r0, infallEta(this.r0, Math.max(HORIZON + 1e-6, this.rAtTau(this.nextPulse))))
      this.pulses.push({ t: e.t, r: e.r })
      this.nextPulse += every
    }
    if (this.frame === "rider" && this.clockT > this.tauTotal() * 1.25) this.drop(this.r0)
  }

  private rAtTau(tau: number): number {
    const r0 = this.r0
    const k = Math.sqrt((r0 * r0 * r0) / 8)
    let eta = 0
    for (let i = 0; i < 30; i++) {
      const f = k * (eta + Math.sin(eta)) - tau
      eta = Math.max(0, Math.min(Math.PI, eta - f / (k * (1 + Math.cos(eta)) + 1e-12)))
    }
    return (r0 / 2) * (1 + Math.cos(eta))
  }

  // ---------------------------------------------------------------------------
  // Readout
  // ---------------------------------------------------------------------------

  readout(): NucleusReadout {
    let orbit: NucleusReadout["orbit"] = null
    const b = this.bodies[this.selected]
    if (b) {
      const r_: number[] = []
      const V: number[] = []
      for (let i = 0; i <= 160; i++) {
        const r = 2.05 * Math.pow(60 / 2.05, i / 160)
        r_.push(r)
        V.push(effectivePotential(r, b.L))
      }
      orbit = { E: b.E, L: b.L, r: b.r, captured: b.captured, r_, V }
    }
    let clocks: NucleusReadout["clocks"] = null
    if (this.mode === "clocks") {
      const p = this.probe()
      const E = Math.sqrt(1 - 2 / this.r0)
      const curveT: number[] = []
      const curveTau: number[] = []
      const etaH = infallEta(this.r0, HORIZON)
      for (let i = 0; i <= 80; i++) {
        const e = infall(this.r0, (etaH - 1e-9) * (1 - Math.pow(1 - i / 80, 3)))
        curveT.push(e.t)
        curveTau.push(e.tau)
      }
      clocks = {
        frame: this.frame,
        r0: this.r0,
        r: p.r,
        tau: p.tau,
        t: this.frame === "far" ? this.clockT : p.t,
        redshift: p.r > HORIZON ? infallRedshift(p.r, E) : Infinity,
        tauTotal: this.tauTotal(),
        curveT,
        curveTau,
      }
    }
    return { mode: this.mode, orbit, clocks }
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  /** Half-width of the plane on screen, in M, at zoom 1. */
  static readonly VIEW = 30

  /**
   * The clocks view's layout: the hole near the left edge, the drop height
   * (plus room for the pulses to travel) across the rest. Shared with the
   * worker so a click maps back to a radius.
   */
  clocksGeometry(w: number, h: number, zoom: number): { scale: number; ox: number } {
    const scale = Math.min((w * 0.78) / (this.r0 * 1.9), h * 0.06) * zoom
    return { scale, ox: w * 0.12 }
  }

  render(out: Uint32Array, w: number, h: number, zoom: number, accent: [number, number, number]): number {
    if (this.mode === "shadow") return this.renderShadow(out, w, h, zoom)
    out.fill(0)
    if (this.mode === "orbits") {
      const scale = (Math.min(w, h) * 0.5 * zoom) / Nucleus.VIEW
      const cx = w * 0.5
      const cy = h * 0.5
      this.renderPlane(out, w, h, cx, cy, scale, accent)
      for (let k = 0; k < this.bodies.length; k++) this.renderBody(out, w, h, cx, cy, scale, this.bodies[k], k === this.selected)
      return scale
    }
    const g = this.clocksGeometry(w, h, zoom)
    this.renderClocks(out, w, h, g.ox, h * 0.5, g.scale, accent)
    return g.scale
  }

  /** Horizon, photon sphere, ISCO. */
  private renderPlane(out: Uint32Array, w: number, h: number, cx: number, cy: number, scale: number, accent: [number, number, number]): void {
    const rH = HORIZON * scale
    const r2 = rH * rH
    const x0 = Math.max(0, Math.floor(cx - rH - 2))
    const x1 = Math.min(w - 1, Math.ceil(cx + rH + 2))
    const y0 = Math.max(0, Math.floor(cy - rH - 2))
    const y1 = Math.min(h - 1, Math.ceil(cy + rH + 2))
    // The horizon: true black, with a faint rim so it reads against black.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2
        if (d2 <= r2) out[y * w + x] = 0xff000000
      }
    }
    circle(out, w, h, cx, cy, rH, 0.55, 255, 255, 255, 0)
    circle(out, w, h, cx, cy, PHOTON_SPHERE * scale, 0.32, 255, 210, 150, 6)
    const [ar, ag, ab] = accent
    circle(out, w, h, cx, cy, ISCO * scale, 0.36, ar * 255, ag * 255, ab * 255, 3)
  }

  private renderBody(out: Uint32Array, w: number, h: number, cx: number, cy: number, scale: number, b: Tracked, selected: boolean): void {
    const [hr, hg, hb] = b.hue
    for (let k = 0; k < b.count; k++) {
      const idx = (b.head - 1 - k + TRAIL) % TRAIL
      const x = cx + b.trail[idx * 2] * scale
      const y = cy - b.trail[idx * 2 + 1] * scale
      const age = 1 - k / TRAIL
      plot(out, w, h, x, y, age * age * (selected ? 0.55 : 0.32), hr, hg, hb)
    }
    // The body, dimmed and reddened by the redshift its light suffers
    // climbing out to us: dτ/dt = (1 − 2/r)/E.
    const fade = Math.max(0, Math.min(1, (1 - 2 / b.r) / b.E))
    const x = cx + b.r * Math.cos(b.phi) * scale
    const y = cy - b.r * Math.sin(b.phi) * scale
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const f = Math.max(0, 1 - Math.hypot(dx, dy) / 2.6)
        plot(out, w, h, x + dx, y + dy, f * (0.4 + 0.6 * fade), 255, 255 * fade + hg * (1 - fade) * 0.2, 255 * fade * fade)
      }
    }
    if (selected) circle(out, w, h, x, y, 6, 0.6, 255, 255, 255, 0)
  }

  private renderClocks(out: Uint32Array, w: number, h: number, ox: number, cy: number, scale: number, accent: [number, number, number]): void {
    // The hole at the left; the probe falls along the axis from the right.
    this.renderPlane(out, w, h, ox, cy, scale, accent)
    const p = this.probe()
    const E = Math.sqrt(1 - 2 / this.r0)
    // Pulses travelling out: radial light obeys dr*/dt = 1 with the tortoise
    // coordinate r* = r + 2·ln(r/2 − 1). Where is each pulse now?
    const tNow = this.frame === "far" ? this.clockT : p.t
    const tort = (r: number) => r + 2 * Math.log(r / 2 - 1)
    for (const q of this.pulses) {
      if (!Number.isFinite(q.t) || q.t > tNow) continue
      const target = tort(q.r) + (tNow - q.t)
      let r = Math.max(q.r, 2.0001)
      for (let i = 0; i < 40; i++) {
        const f = tort(r) - target
        r = Math.max(2.00001, r - f / (1 / (1 - 2 / r)))
      }
      const x = ox + r * scale
      if (x > w + 4) continue
      // Received colour: redshifted by the faller's 1 + z at emission.
      const z1 = infallRedshift(q.r, E)
      const warm = Math.min(1, Math.log(z1) / Math.log(8))
      for (let dy = -10; dy <= 10; dy++) {
        const f = (1 - Math.abs(dy) / 10.5) * (1 - warm * 0.7)
        plot(out, w, h, x, cy + dy, f * 0.8, 160 + 95 * warm, 210 - 120 * warm, 255 - 200 * warm)
      }
    }
    // The probe, fading as its light reddens.
    if (p.r > 0.01) {
      const z1 = p.r > HORIZON ? infallRedshift(p.r, E) : Infinity
      const glow = Number.isFinite(z1) ? 1 / z1 : 0
      const shown = this.frame === "rider" ? 1 : glow
      const x = ox + p.r * scale
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const f = Math.max(0, 1 - Math.hypot(dx, dy) / 3.4)
          plot(out, w, h, x + dx, cy + dy, f * shown, 255, 160 + 95 * glow, 120 + 135 * glow)
        }
      }
    }
    // The start, a tick on the axis.
    for (let dy = -6; dy <= 6; dy++) plot(out, w, h, ox + this.r0 * scale, cy + dy, 0.35, 255, 255, 255)
  }

  /** Shadow view: every pixel follows its ray back through α(b). */
  private renderShadow(out: Uint32Array, w: number, h: number, zoom: number): number {
    if (!this.table) this.table = new DeflectionTable()
    const fov = SHADOW_FOV / zoom
    const key = `${w}x${h}@${zoom.toFixed(4)}`
    if (key !== this.mapKey) {
      this.mapKey = key
      this.mapR = new Float32Array(w * h)
      this.mapAz = new Float32Array(w * h)
      const half = Math.min(w, h) * 0.5
      const lapse = Math.sqrt(1 - 2 / CAMERA_R)
      const table = this.table
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x + 0.5 - w * 0.5
          const dy = y + 0.5 - h * 0.5
          const theta = (Math.hypot(dx, dy) / half) * fov
          const i = y * w + x
          this.mapAz[i] = Math.atan2(dy, dx)
          // The impact parameter of the ray leaving the camera at angle θ.
          const b = (CAMERA_R * Math.sin(theta)) / lapse
          if (b <= B_CRIT) {
            // Captured: NaN marks the shadow (negative radii are real — the
            // far side of the sky, seen round the hole).
            this.mapR[i] = NaN
            continue
          }
          // Total bending, less the part the ray would have picked up on the
          // near side of the camera, which it never travels.
          const near = (2 / b) * (1 - Math.sqrt(Math.max(0, 1 - (b / CAMERA_R) ** 2)))
          const psi = theta - (table.at(b) - near)
          // Where it lands on the background sky, which spans ±BACKGROUND_FOV.
          if (Math.cos(psi) <= 0.05) this.mapR[i] = 1e9 + psi
          else this.mapR[i] = Math.tan(psi) / Math.tan(BACKGROUND_FOV)
        }
      }
    }
    const bg = this.background
    const bw = this.bgW
    const bh = this.bgH
    const spin = this.spin
    for (let i = 0; i < w * h; i++) {
      const rr = this.mapR[i]
      if (rr !== rr) {
        out[i] = 0xff000000
        continue
      }
      const az = this.mapAz[i] + spin
      if (rr >= 1e8 || !bg) {
        out[i] = starfield(az, rr >= 1e8 ? rr - 1e9 : Math.atan(rr * Math.tan(BACKGROUND_FOV)))
        continue
      }
      // A negative radius is the far side: the image is flipped through the hole.
      const sx = Math.round(bw * 0.5 + Math.cos(az) * rr * Math.min(bw, bh) * 0.5)
      const sy = Math.round(bh * 0.5 + Math.sin(az) * rr * Math.min(bw, bh) * 0.5)
      if (sx < 0 || sy < 0 || sx >= bw || sy >= bh) {
        out[i] = starfield(az, Math.atan(rr * Math.tan(BACKGROUND_FOV)))
        continue
      }
      const v = bg[sy * bw + sx]
      // The galaxy image is mostly empty sky; let the stars show through it.
      const lum = (v & 255) + ((v >> 8) & 255) + ((v >> 16) & 255)
      out[i] = lum < 30 ? starfield(az, Math.atan(rr * Math.tan(BACKGROUND_FOV))) : (v | 0xff000000) >>> 0
    }
    return (Math.min(w, h) * 0.5) / fov
  }
}

/** A sparse, deterministic star on direction (az, el). */
function starfield(az: number, el: number): number {
  const a = Math.floor(((az / (Math.PI * 2)) % 1 + 1) * 1400)
  const e = Math.floor((el + 4) * 420)
  let hsh = (a * 73856093) ^ (e * 19349663)
  hsh = Math.imul(hsh ^ (hsh >>> 13), 0x5bd1e995)
  hsh ^= hsh >>> 15
  const v = (hsh >>> 0) / 4294967296
  // A faint, deep-blue sky glow, so the shadow is the only true black.
  if (v < 0.975) return 0xff0e0806
  const k = Math.round(90 + 165 * ((v - 0.975) / 0.025) ** 3)
  return (0xff000000 | (k << 16) | (k << 8) | k) >>> 0
}

function plot(out: Uint32Array, w: number, h: number, x: number, y: number, k: number, r: number, g: number, b: number): void {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= w || yi >= h || k <= 0) return
  const i = yi * w + xi
  const v = out[i]
  out[i] =
    ((0xff << 24) |
      (Math.min(255, ((v >> 16) & 255) + b * k) << 16) |
      (Math.min(255, ((v >> 8) & 255) + g * k) << 8) |
      Math.min(255, (v & 255) + r * k)) >>>
    0
}

/** A ring; `dash` > 0 draws it dashed with that many pixels per gap. */
function circle(out: Uint32Array, w: number, h: number, cx: number, cy: number, r: number, k: number, cr: number, cg: number, cb: number, dash: number): void {
  const steps = Math.max(32, Math.ceil(Math.PI * 2 * r))
  for (let s = 0; s < steps; s++) {
    if (dash > 0 && Math.floor(s / dash) % 2 === 1) continue
    const t = (s / steps) * Math.PI * 2
    plot(out, w, h, cx + Math.cos(t) * r, cy + Math.sin(t) * r, k, cr, cg, cb)
  }
}
