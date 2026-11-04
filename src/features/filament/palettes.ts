/**
 * FILAMENT colour tables — pure, shared by the worker (which paints with them)
 * and the page (which draws their legends from the same functions, so a key can
 * never disagree with the picture).
 *
 * Every table is indexed by tone-mapped density, 0–255, with the asinh stretch
 * baked in: entry i stands for a linear density of i/gain but is coloured as if
 * that density had been passed through asinh. That is the stretch SDSS uses to
 * show a galaxy's core and its outer arms in one image, for one multiply and
 * one array read per pixel.
 *
 * Lenses add a second axis: a hue index for the lens quantity, so the full table
 * is HUE_BINS × 256. Brightness stays density in every lens — the web, the flow
 * and the potential are read *on* the structure, never instead of it.
 */

import type { Afterglow } from "./cosmology"
import type { LensName } from "./protocol"

export type Rgb = [number, number, number]

/** Hue resolution of the lens tables; fine enough for clean contour lines. */
export const HUE_BINS = 128

const ASINH_K = 14
const ASINH_NORM = Math.asinh(ASINH_K)

/** Perceptual brightness of tone-map index i, 0–1. */
export function toneOf(i: number): number {
  return Math.asinh((i / 255) * ASINH_K) / ASINH_NORM
}

/** Little-endian RGBA pack (0xAABBGGRR) — every platform a browser ships on. */
function pack(r: number, g: number, b: number, a: number): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  return ((c(a) << 24) | (c(b) << 16) | (c(g) << 8) | c(r)) >>> 0
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Piecewise-linear ramp through evenly spaced stops. */
function ramp(stops: Rgb[], t: number): Rgb {
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(u))
  return mix(stops[i], stops[i + 1], u - i)
}

/**
 * Density → colour, with the recombination afterglow folded in.
 *
 * Stops are placed so the site's accent lands on the *filaments* — the
 * mid-densities that make up most of the visible field — rather than on a thin
 * shell between "empty" and "clipped to white".
 *
 * The afterglow tints the whole ramp rather than washing over it, and adds only
 * a dim uniform floor. That way the early sky is not a flat orange rectangle:
 * it is the density field itself rendered hot, which is what a CMB map actually
 * is — the same primordial potential, seen in temperature.
 */
export function buildDensityPalette(out: Uint32Array, accent: Rgb, glow: Afterglow): void {
  const [ar, ag, ab] = accent
  const stops: [number, number, number, number][] = [
    [0.0, 0.01, 0.01, 0.035],
    [0.1, 0.05, 0.045, 0.2],
    [0.26, ar * 0.8, ag * 0.8, ab * 0.9],
    [0.55, Math.min(1, ar * 0.6 + 0.45), Math.min(1, ag * 0.55 + 0.36), Math.min(1, ab * 0.45 + 0.26)],
    [1.0, 1.0, 0.97, 0.9],
  ]
  const s = glow.strength
  const tint = s * 0.62
  const floor = s * 0.05
  for (let i = 0; i < 256; i++) {
    const t = toneOf(i)
    let k = 0
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++
    const [t0, r0, g0, b0] = stops[k]
    const [t1, r1, g1, b1] = stops[k + 1]
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0
    let r = r0 + (r1 - r0) * f
    let g = g0 + (g1 - g0) * f
    let b = b0 + (b1 - b0) * f
    if (s > 0) {
      // Warm the ramp, weighted toward the low end so bright knots keep their
      // structure instead of clipping to a single orange.
      const w = tint * (1 - 0.45 * t)
      r = Math.min(1, r * (1 - w) + glow.r * w + floor)
      g = Math.min(1, g * (1 - w) + glow.g * w + floor * 0.45)
      b = Math.min(1, b * (1 - w) + glow.b * w + floor * 0.2)
    }
    // Fade in over the first few levels so empty space stays transparent and
    // the page's own background shows through — except while the sky itself is
    // still glowing, when even empty space carries the afterglow.
    const alpha = Math.max(s * 0.34, Math.min(1, t * 4))
    out[i] = pack(r, g, b, alpha)
  }
  if (s <= 0) out[0] = 0
}

// ---------------------------------------------------------------------------
// Lens hues
// ---------------------------------------------------------------------------

/** Void → filament → node. Cold, structural, warm. */
const WEB_STOPS: Rgb[] = [
  [0.28, 0.3, 0.78],
  [0.2, 0.78, 0.74],
  [1.0, 0.78, 0.36],
]

/** Infall → Hubble flow → outflow: blueshift to redshift. */
const FLOW_STOPS: Rgb[] = [
  [0.2, 0.45, 1.0],
  [0.45, 0.7, 1.0],
  [0.86, 0.85, 0.82],
  [1.0, 0.62, 0.32],
  [1.0, 0.3, 0.2],
]

/** Wells → zero → hills. */
const POTENTIAL_STOPS: Rgb[] = [
  [0.55, 0.25, 0.95],
  [0.25, 0.4, 0.9],
  [0.09, 0.12, 0.2],
  [0.2, 0.62, 0.55],
  [0.85, 0.9, 0.5],
]

/** Approaching → at rest → receding. */
const DOPPLER_STOPS: Rgb[] = [
  [0.25, 0.5, 1.0],
  [0.9, 0.9, 0.92],
  [1.0, 0.32, 0.26],
]

/** The lens quantity's colour at hue h ∈ [0, 1]. */
export function lensHue(lens: LensName, h: number, accent: Rgb): Rgb {
  switch (lens) {
    case "web":
      return ramp(WEB_STOPS, h)
    case "flow":
      return ramp(FLOW_STOPS, h)
    case "potential":
      return ramp(POTENTIAL_STOPS, h)
    case "doppler":
      return ramp(DOPPLER_STOPS, h)
    default:
      return accent
  }
}

/** Lenses that colour by a second quantity. */
export function lensHasHue(lens: LensName): boolean {
  return lens === "web" || lens === "flow" || lens === "potential" || lens === "doppler"
}

/**
 * Map a lens's physical value onto hue ∈ [0, 1]. Signed fields go through tanh
 * so the scale is linear near zero and never clips.
 */
export const HUE_SCALE = {
  /** θ = ∇·v/H at which the flow colour is 76% saturated. */
  flow: 1.2,
  /** φ in σ. */
  potential: 1.6,
  /** Line-of-sight speed, code units (≈ 200 km/s each). */
  doppler: 0.55,
} as const

export function signedHue(value: number, scale: number): number {
  return 0.5 + 0.5 * Math.tanh(value / scale)
}

/** Inverse of {@link signedHue}, for contour placement. */
function hueValue(h: number, scale: number): number {
  const x = Math.max(-0.999999, Math.min(0.999999, 2 * h - 1))
  return scale * Math.atanh(x)
}

/**
 * Fill a HUE_BINS × 256 table for a lens.
 *
 * The flow and potential lenses keep a visible floor in empty space, because
 * that is where they say the most: voids are where the outflow is, and the
 * potential is defined everywhere, matter or not. The potential additionally
 * draws contours every half σ, baked into the table so they cost nothing.
 */
export function buildLensPalette(out: Uint32Array, lens: LensName, accent: Rgb): void {
  const floor = lens === "flow" ? 0.3 : lens === "potential" ? 0.55 : 0.12
  const alphaFloor = lens === "flow" ? 0.42 : lens === "potential" ? 0.82 : 0
  for (let hb = 0; hb < HUE_BINS; hb++) {
    const h = (hb + 0.5) / HUE_BINS
    const base = lensHue(lens, h, accent)
    let contour = 0
    if (lens === "potential") {
      const lo = hueValue(hb / HUE_BINS, HUE_SCALE.potential) / 0.5
      const hi = hueValue((hb + 1) / HUE_BINS, HUE_SCALE.potential) / 0.5
      // A contour level falls inside this bin's value range.
      if (Math.floor(hi) !== Math.floor(lo)) contour = Math.abs(Math.round(hi)) === 0 ? 0.55 : 0.32
    }
    for (let i = 0; i < 256; i++) {
      const t = toneOf(i)
      const lit = floor + (1 - floor) * Math.min(1, t * 1.25)
      let [r, g, b] = [base[0] * lit, base[1] * lit, base[2] * lit]
      // Only the densest knots run to white, so hue survives through filaments.
      const white = Math.max(0, (t - 0.72) / 0.28)
      const w = white * white * 0.65
      r += (1 - r) * w
      g += (1 - g) * w
      b += (1 - b) * w
      if (contour > 0) {
        r += (1 - r) * contour
        g += (1 - g) * contour
        b += (1 - b) * contour
      }
      const alpha = Math.max(alphaFloor, Math.min(1, t * 4))
      out[hb * 256 + i] = pack(r, g, b, alpha)
    }
  }
}

// ---------------------------------------------------------------------------
// Legends
// ---------------------------------------------------------------------------

export interface LensInfo {
  name: LensName
  label: string
  /** Shown in the toolbar tooltip and the legend. */
  description: string
  /** Legend end labels (and an optional middle one). */
  scale: string[]
  cosmological: boolean | "both"
}

export const LENSES: LensInfo[] = [
  {
    name: "density",
    label: "Density",
    description: "Surface density on an asinh stretch, the way survey images show faint arms and bright cores together.",
    scale: ["empty", "dense"],
    cosmological: "both",
  },
  {
    name: "web",
    label: "Web",
    description:
      "The T-web: count the directions in which the tidal field is compressing matter. None is a void, one a filament, two a node. Smoothed over 3 Mpc, threshold λ = 0.3.",
    scale: ["void", "filament", "node"],
    cosmological: true,
  },
  {
    name: "flow",
    label: "Flow",
    description:
      "Peculiar velocity divergence in units of the Hubble rate. Blue is falling in; red is a void expanding faster than the universe around it.",
    scale: ["infall", "Hubble flow", "outflow"],
    cosmological: true,
  },
  {
    name: "potential",
    label: "Potential",
    description:
      "The peculiar gravitational potential, with contours every half σ. It is the smoothest field in the box, and the one the CMB's large-scale temperature pattern traces.",
    scale: ["well", "0", "hill"],
    cosmological: true,
  },
  {
    name: "redshift",
    label: "Redshift space",
    description:
      "The box as a galaxy survey would map it, with distance read from redshift along the vertical line of sight. Peculiar velocities stretch clusters into fingers of God pointing at the observer, and squash infalling filaments flat.",
    scale: ["empty", "dense"],
    cosmological: true,
  },
  {
    name: "doppler",
    label: "Doppler",
    description:
      "Line-of-sight velocity along the vertical, as a spectrograph would measure it. A rotating disc shows the classic dipole: one side approaching, one receding.",
    scale: ["approaching", "at rest", "receding"],
    cosmological: false,
  },
]

export function lensesFor(cosmological: boolean): LensInfo[] {
  return LENSES.filter((l) => l.cosmological === "both" || l.cosmological === cosmological)
}

/** CSS gradient for a lens legend, drawn from the very ramp the worker uses. */
export function lensGradient(lens: LensName, accent: Rgb): string {
  const stops: string[] = []
  const steps = 9
  const lut = new Uint32Array(256)
  if (!lensHasHue(lens)) buildDensityPalette(lut, accent, { strength: 0, r: 0, g: 0, b: 0 })
  for (let s = 0; s < steps; s++) {
    const h = s / (steps - 1)
    let rgb: Rgb
    if (lensHasHue(lens)) {
      rgb = lensHue(lens, h, accent)
    } else {
      // Density lenses: sample the brightness ramp itself.
      const px = lut[Math.max(1, Math.round(h * 255))]
      rgb = [(px & 255) / 255, ((px >> 8) & 255) / 255, ((px >> 16) & 255) / 255]
    }
    const c = rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(", ")
    stops.push(`rgb(${c}) ${Math.round(h * 100)}%`)
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`
}
