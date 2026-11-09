import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"
import { perState, FONT, rng } from "./scratch"

// ── Orrery background ──
// The solar system as it stands today, seen from above the ecliptic.
//
// Positions come from JPL's approximate Keplerian elements (Standish, "Keplerian
// Elements for Approximate Positions of the Major Planets", table 1: valid
// 1800–2050, a few arcminutes of error), so the planets sit where they really
// are tonight. Distances are drawn on a square-root scale (Mercury to Neptune
// spans 80x; linear would crush the inner planets into the Sun); directions
// are true. 0° ecliptic longitude (the vernal equinox) points right, north up.
//
// The outer ring is the zodiac, marked every 30°. Halley's comet is out near
// aphelion, beyond Neptune, until it turns back in 2061. Hover a planet for
// its distance. Time-lapse (Settings) runs the clock forward; 0 is now.

interface Elements {
  name: string
  // value at J2000 and rate per Julian century: a (AU), e, I, L, ϖ, Ω (degrees)
  a: [number, number]; e: [number, number]; I: [number, number]
  L: [number, number]; w: [number, number]; O: [number, number]
  r: number // drawn radius (px)
}

const PLANETS: Elements[] = [
  { name: "Mercury", a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.2503235, 149472.67411175], w: [77.45779628, 0.16047689], O: [48.33076593, -0.12534081], r: 1.3 },
  { name: "Venus", a: [0.72333566, 0.0000039], e: [0.00677672, -0.00004107], I: [3.39467605, -0.0007889], L: [181.9790995, 58517.81538729], w: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418], r: 1.9 },
  { name: "Earth", a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], w: [102.93768193, 0.32327364], O: [0, 0], r: 2 },
  { name: "Mars", a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], w: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343], r: 1.6 },
  { name: "Jupiter", a: [5.202887, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], w: [14.72847983, 0.21252668], O: [100.47390909, 0.20469106], r: 3.4 },
  { name: "Saturn", a: [9.53667594, -0.0012506], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], w: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794], r: 3 },
  { name: "Uranus", a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], w: [170.9542763, 0.40805281], O: [74.01692503, 0.04240589], r: 2.4 },
  { name: "Neptune", a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], w: [44.96476227, -0.32241464], O: [131.78422574, -0.00508664], r: 2.4 },
]

// Halley (1P): perihelion 1986-02-09, period ~75.3 years, retrograde.
const HALLEY = { a: 17.834, e: 0.96714, I: 162.26, w: 111.33, O: 58.42, tp: 2446470.5, period: 75.32 * 365.25 }

const ZODIAC = ["ARI", "TAU", "GEM", "CNC", "LEO", "VIR", "LIB", "SCO", "SGR", "CAP", "AQR", "PSC"]
const RAD = Math.PI / 180
const OUTER_AU = 30.5

/** Solve Kepler's equation M = E − e·sin E (radians). */
export function eccentricAnomaly(M: number, e: number): number {
  // Danby's starting value converges even for comet-like eccentricities
  let E = M + 0.85 * e * Math.sign(Math.sin(M))
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-9) break
  }
  return E
}

/** Heliocentric ecliptic x, y (AU) from orbital elements in degrees. */
function eclipticXY(a: number, e: number, I: number, w: number, O: number, E: number): [number, number] {
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const om = (w - O) * RAD, Om = O * RAD, inc = I * RAD
  const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(inc)
  return [
    (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
  ]
}

/** Where a planet is (AU, ecliptic) at Julian date `jd`. Exported for tests. */
export function planetXY(p: Elements, jd: number): [number, number] {
  const T = (jd - 2451545) / 36525
  const v = (k: [number, number]) => k[0] + k[1] * T
  const a = v(p.a), e = v(p.e), I = v(p.I), L = v(p.L), w = v(p.w), O = v(p.O)
  let M = ((L - w) % 360) * RAD
  if (M > Math.PI) M -= 2 * Math.PI
  if (M < -Math.PI) M += 2 * Math.PI
  return eclipticXY(a, e, I, w, O, eccentricAnomaly(M, e))
}

export { PLANETS }

const julian = (ms: number) => ms / 86400000 + 2440587.5

interface Scene {
  t0: number
  belt: { a: number; L0: number; n: number; seed: number }[]
  orbits: { key: number; paths: Path2D[]; halley: Path2D | null }
}

const scene = perState<Scene>(() => {
  const r = rng(1846)
  const belt = Array.from({ length: 280 }, () => {
    const a = 2.15 + r() * 1.15 + (r() - 0.5) * 0.2
    return { a, L0: r() * 360, n: 0.9856076686 / Math.pow(a, 1.5), seed: r() }
  })
  return { t0: performance.now(), belt, orbits: { key: NaN, paths: [], halley: null } }
})

export function drawOrrery(ctx: CanvasRenderingContext2D, state: BgState, config: SiteConfig) {
  const p = config.backgrounds.orrery
  if (!p) return
  const s = scene(state)
  const W = state.w, H = state.h
  const cx = W / 2, cy = H / 2
  const R = Math.min(W, H) * 0.42
  const op = (p.opacity ?? 1) * state.readerAlpha
  const ink = state.colorCache.text
  const accent = state.colorCache.secondary
  const days = ((performance.now() - s.t0) / 1000) * (p.timelapse ?? 0)
  const jd = julian(Date.now()) + days

  // AU → screen, square-root distance scale, north up.
  const map = (x: number, y: number): [number, number] => {
    const d = Math.hypot(x, y) || 1e-9
    const k = (R * Math.sqrt(d / OUTER_AU)) / d
    return [cx + x * k, cy - y * k]
  }

  // Orbits change over centuries: rebuild them only when the size changes.
  const key = Math.round(R)
  if (s.orbits.key !== key) {
    s.orbits.key = key
    s.orbits.paths = PLANETS.map((pl) => {
      const path = new Path2D()
      for (let i = 0; i <= 160; i++) {
        const T = (jd - 2451545) / 36525
        const v = (k: [number, number]) => k[0] + k[1] * T
        const [x, y] = eclipticXY(v(pl.a), v(pl.e), v(pl.I), v(pl.w), v(pl.O), (i / 160) * Math.PI * 2)
        const [sx, sy] = map(x, y)
        if (i) path.lineTo(sx, sy)
        else path.moveTo(sx, sy)
      }
      return path
    })
    const h = new Path2D()
    for (let i = 0; i <= 240; i++) {
      const E = (i / 240) * Math.PI * 2
      const [x, y] = eclipticXY(HALLEY.a, HALLEY.e, HALLEY.I, HALLEY.w, HALLEY.O, E)
      const [sx, sy] = map(x, y)
      if (i) h.lineTo(sx, sy)
      else h.moveTo(sx, sy)
    }
    s.orbits.halley = h
  }

  // Zodiac ring: a fine circle, 72 ticks, the signs every 30°.
  const Z = R * 1.1
  ctx.strokeStyle = ink
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.07 * op
  ctx.beginPath()
  ctx.arc(cx, cy, Z, 0, Math.PI * 2)
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2
    const len = k % 6 === 0 ? 9 : 4
    ctx.moveTo(cx + Math.cos(a) * Z, cy - Math.sin(a) * Z)
    ctx.lineTo(cx + Math.cos(a) * (Z - len), cy - Math.sin(a) * (Z - len))
  }
  ctx.stroke()
  ctx.font = `9px ${FONT.mono}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = ink
  ctx.globalAlpha = 0.16 * op
  for (let k = 0; k < 12; k++) {
    const a = ((k * 30 + 15) * Math.PI) / 180
    ctx.fillText(ZODIAC[k], cx + Math.cos(a) * (Z + 14), cy - Math.sin(a) * (Z + 14))
  }

  // Orbits
  ctx.globalAlpha = 0.08 * op
  for (const path of s.orbits.paths) ctx.stroke(path)
  if (s.orbits.halley) {
    ctx.setLineDash([2, 5])
    ctx.globalAlpha = 0.06 * op
    ctx.stroke(s.orbits.halley)
    ctx.setLineDash([])
  }

  // The asteroid belt: dust on near-circular orbits at Kepler's rate.
  const d2000 = jd - 2451545
  ctx.fillStyle = ink
  ctx.globalAlpha = 0.12 * op
  ctx.beginPath()
  for (const b of s.belt) {
    const L = (b.L0 + b.n * d2000) * RAD
    const [x, y] = map(b.a * Math.cos(L), b.a * Math.sin(L))
    ctx.rect(x, y, 0.9, 0.9)
  }
  ctx.fill()

  // The Sun
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16)
  glow.addColorStop(0, accent)
  glow.addColorStop(1, "transparent")
  ctx.fillStyle = glow
  ctx.globalAlpha = 0.35 * op
  ctx.fillRect(cx - 16, cy - 16, 32, 32)
  ctx.fillStyle = ink
  ctx.globalAlpha = 0.6 * op
  ctx.beginPath()
  ctx.arc(cx, cy, 2.6, 0, Math.PI * 2)
  ctx.fill()

  // Planets
  let hover: { name: string; x: number; y: number; au: number } | null = null
  ctx.textAlign = "left"
  // Labels dodge each other (planets near conjunction sit almost on top of
  // one another): try a few spots round the planet, take the first clear one.
  const placed: [number, number, number, number][] = []
  const label = (text: string, x: number, y: number, r: number) => {
    const w = ctx.measureText(text).width, h = 9
    const spots: [number, number][] = [[r + 5, -r - 3], [r + 5, r + 9], [-w - r - 5, -r - 3], [-w - r - 5, r + 9], [r + 5, -r - 14], [r + 5, r + 20]]
    for (const [dx, dy] of spots) {
      const box: [number, number, number, number] = [x + dx, y + dy - h, w, h]
      if (placed.every((b) => box[0] > b[0] + b[2] + 2 || box[0] + box[2] + 2 < b[0] || box[1] > b[1] + b[3] || box[1] + box[3] < b[1])) {
        placed.push(box)
        ctx.fillText(text, x + dx, y + dy - h / 2)
        return
      }
    }
  }
  for (const pl of PLANETS) {
    const [x, y] = planetXY(pl, jd)
    const [sx, sy] = map(x, y)
    const earth = pl.name === "Earth"
    ctx.fillStyle = earth ? accent : ink
    ctx.globalAlpha = (earth ? 0.75 : 0.5) * op
    ctx.beginPath()
    ctx.arc(sx, sy, pl.r, 0, Math.PI * 2)
    ctx.fill()
    if (pl.name === "Saturn") {
      ctx.strokeStyle = ink
      ctx.globalAlpha = 0.3 * op
      ctx.beginPath()
      ctx.ellipse(sx, sy, pl.r * 2.3, pl.r * 0.8, -0.45, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (earth) {
      // The Moon: mean longitude, 27.32-day sidereal month.
      const m = (218.316 + 13.176396 * d2000) * RAD
      ctx.fillStyle = ink
      ctx.globalAlpha = 0.45 * op
      ctx.beginPath()
      ctx.arc(sx + Math.cos(m) * 6, sy - Math.sin(m) * 6, 0.8, 0, Math.PI * 2)
      ctx.fill()
    }
    if (p.labels) {
      ctx.fillStyle = ink
      ctx.globalAlpha = 0.2 * op
      label(pl.name.toUpperCase(), sx, sy, pl.r)
    }
    const dm = Math.hypot(state.mx - sx, state.my - sy)
    if (dm < 16) hover = { name: pl.name, x: sx, y: sy, au: Math.hypot(x, y) }
  }

  // Halley, somewhere out past Neptune
  {
    const M = (((jd - HALLEY.tp) / HALLEY.period) % 1) * Math.PI * 2
    const [x, y] = eclipticXY(HALLEY.a, HALLEY.e, HALLEY.I, HALLEY.w, HALLEY.O, eccentricAnomaly(M, HALLEY.e))
    const [sx, sy] = map(x, y)
    ctx.fillStyle = ink
    ctx.globalAlpha = 0.4 * op
    ctx.fillRect(sx - 0.8, sy - 0.8, 1.6, 1.6)
    if (p.labels) {
      ctx.globalAlpha = 0.14 * op
      label("1P/HALLEY", sx, sy, 1)
    }
  }

  if (hover) {
    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.5 * op
    ctx.beginPath()
    ctx.arc(hover.x, hover.y, 7, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = ink
    ctx.globalAlpha = 0.55 * op
    ctx.fillText(`${hover.name.toUpperCase()}  ${hover.au.toFixed(2)} AU`, hover.x + 11, hover.y + 12)
  }

  // Ephemeris stamp
  const date = new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10)
  ctx.textAlign = "right"
  ctx.fillStyle = ink
  ctx.globalAlpha = 0.16 * op
  ctx.fillText(`EPHEMERIS ${date}`, cx + Z, cy + Z + 18)
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.globalAlpha = 1
}
