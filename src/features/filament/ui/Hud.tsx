import { memo, useMemo, useRef } from "react"
import { A_REC, accelerationOnset, ageOf, formatAge, PATCH_MPC, type Cosmology } from "../engine/cosmology"
import { WEB_LABELS } from "../engine/analysis"
import { LENSES, lensGradient, type Rgb } from "../render/palettes"
import type { HaloCard, LensName, LevelName, ProbeReading } from "../protocol"
import styles from "./FilamentPage.module.scss"

/**
 * The quiet furniture around the field: where we are in cosmic history, how
 * big things are, what the colours mean, and what lies under the pointer.
 */

const LN_REC = Math.log(A_REC)

/** Position of scale factor a on the timeline, 0 at recombination, 1 today. */
const along = (a: number) => Math.max(0, Math.min(1, (Math.log(a) - LN_REC) / -LN_REC))

/** Inverse of {@link along}. */
export const scaleFactorAlong = (f: number) => Math.exp(LN_REC * (1 - Math.max(0, Math.min(1, f))))

/**
 * Cosmic history on a logarithmic axis in a, which is the integrator's own
 * clock: every e-fold of expansion gets the same width, so the dark ages, which
 * take a few hundred million years, get as much room as the last ten billion.
 */
export const Timeline = memo(function Timeline({
  cosmology,
  a,
  onSeek,
}: {
  cosmology: Cosmology
  a: number
  /** Scrub to a scale factor; dragging scrubs continuously. */
  onSeek: (a: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const marks = useMemo(() => {
    const list: { a: number; label: string }[] = [
      { a: A_REC, label: "last scattering" },
      { a: 1 / 21, label: "first stars" },
      { a: 1 / 7, label: "reionised" },
      { a: 1 / 3, label: "cosmic noon" },
    ]
    const acc = accelerationOnset(cosmology)
    if (acc !== null && acc < 1) list.push({ a: acc, label: "Λ takes over" })
    list.push({ a: 1, label: "today" })
    return list.map((m) => ({
      ...m,
      at: along(m.a),
      z: 1 / m.a - 1,
      age: formatAge(ageOf(m.a, cosmology)),
    }))
  }, [cosmology])

  const head = along(a)
  const at = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r || r.width <= 0) return null
    return scaleFactorAlong((clientX - r.left) / r.width)
  }
  return (
    <div className={styles.timeline}>
      <div
        className={styles.timelineHit}
        role="slider"
        tabIndex={0}
        aria-label="Cosmic time: drag to scrub, [ and ] to step"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(head * 100)}
        aria-valuetext={`z = ${(1 / a - 1).toFixed(2)}`}
        onPointerDown={(e) => {
          dragging.current = true
          try {
            ;(e.target as Element).setPointerCapture?.(e.pointerId)
          } catch {
            // A pointer that is already gone cannot be captured; nothing to hold.
          }
          const v = at(e.clientX)
          if (v !== null) onSeek(v)
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          const v = at(e.clientX)
          if (v !== null) onSeek(v)
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault()
            e.stopPropagation()
            onSeek(scaleFactorAlong(head + (e.key === "ArrowRight" ? 0.02 : -0.02)))
          }
        }}
      />
      <div className={styles.timelineTrack} ref={trackRef}>
        <span className={styles.timelineFill} style={{ transform: `scaleX(${head})` }} />
        <span className={styles.timelineHead} style={{ left: `${head * 100}%` }} />
        {marks.map((m, i) => (
          <span
            key={m.label}
            className={styles.timelineMark}
            data-row={i % 2}
            data-edge={i === 0 ? "start" : i === marks.length - 1 ? "end" : undefined}
            data-passed={head >= m.at || undefined}
            style={{ left: `${m.at * 100}%` }}
            title={`z = ${m.z < 10 ? m.z.toFixed(1) : m.z.toFixed(0)} · ${m.age}`}
          >
            <span>{m.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
})

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹"

/** A mass in solar masses as a × 10ⁿ M☉. */
export function fmtMass(m: number): string {
  if (!(m > 0)) return "—"
  const e = Math.floor(Math.log10(m))
  const mant = m / Math.pow(10, e)
  const sup = String(e).split("").map((d) => SUPERSCRIPT[Number(d)]).join("")
  return `${mant.toFixed(1)} × 10${sup} M☉`
}

/**
 * Where the camera is in the descent: one crumb per layer built beneath it.
 * A crumb above the current one flies the camera back up to it.
 */
export const Breadcrumb = memo(function Breadcrumb({
  stack,
  level,
  focus,
  holeMass,
  lone,
  moving,
  onAscend,
}: {
  stack: LevelName[]
  level: LevelName
  focus: HaloCard | null
  holeMass: number | null
  lone: boolean
  moving: boolean
  onAscend: (to: LevelName) => void
}) {
  const label = (l: LevelName) =>
    l === "web" ? "The web" : l === "galaxy" ? (focus ? `Halo ${focus.id} · ${fmtMass(focus.massSun)}` : "Galaxy") : `Black hole · ${fmtMass(holeMass ?? 0)}`
  const short = (l: LevelName) => (l === "web" ? "The web" : l === "galaxy" ? (focus ? `Halo ${focus.id}` : "Galaxy") : "Black hole")
  const here = stack.indexOf(level)
  return (
    <nav className={styles.breadcrumb} aria-label="Where you are" data-moving={moving || undefined}>
      {lone && (
        <>
          <a href="?" title="Start from the cosmic web instead">FILAMENT</a>
          <span aria-hidden="true">›</span>
          <span data-current>Sgr A* · {fmtMass(holeMass ?? 0)}</span>
        </>
      )}
      {!lone &&
        stack.map((l, k) => (
          <span key={l} className={styles.crumb}>
            {k > 0 && <span aria-hidden="true">›</span>}
            {k < here ? (
              <button type="button" onClick={() => onAscend(l)} title={`Back up to ${short(l).toLowerCase()} (Esc climbs one)`}>
                {short(l)}
              </button>
            ) : k === here ? (
              <span data-current>{label(l)}</span>
            ) : (
              <span data-below title="Built beneath the camera; zoom in to reach it">{short(l)}</span>
            )}
          </span>
        ))}
    </nav>
  )
})

const LENGTH_UNITS = [
  { name: "Mpc", kpc: 1000 },
  { name: "kpc", kpc: 1 },
  { name: "pc", kpc: 1e-3 },
  { name: "AU", kpc: 4.848e-9 },
  { name: "km", kpc: 3.2408e-17 },
]

function unitFor(kpc: number) {
  return LENGTH_UNITS.find((u) => kpc >= u.kpc) ?? LENGTH_UNITS[LENGTH_UNITS.length - 1]
}

/** A length in kpc as the unit that reads best: 2 Mpc, 500 pc, 30 AU. */
export function fmtLength(kpc: number): string {
  const u = unitFor(kpc * 1.0001)
  const v = kpc / u.kpc
  return `${v >= 100 ? Math.round(v) : Number(v.toPrecision(2))} ${u.name}`
}

/** Round a length to 1, 2 or 5 × 10ⁿ. */
function niceLength(target: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(target)))
  const m = target / mag
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * mag
}

/**
 * A scale bar in physical units. `cssPerWorld` is how many CSS pixels one code
 * length spans on screen right now.
 */
export const ScaleBar = memo(function ScaleBar({
  cssPerWorld,
  kpcPerWorld,
  comoving,
}: {
  cssPerWorld: number
  kpcPerWorld: number
  comoving: boolean
}) {
  if (!(cssPerWorld > 0) || !(kpcPerWorld > 0)) return null
  // One scale for every level of the descent, switching to Mpc when it helps.
  const kpcPerCss = kpcPerWorld / cssPerWorld
  // Nice numbers in whichever unit the length reads best in.
  const unit = unitFor(kpcPerCss * 110)
  const length = niceLength((kpcPerCss * 110) / unit.kpc) * unit.kpc
  const px = length / kpcPerCss
  const value = fmtLength(length)
  const label = comoving ? `${value} comoving` : value
  return (
    <div className={styles.scaleBar} aria-hidden="true">
      <span className={styles.scaleRule} style={{ width: `${px}px` }} />
      <span>{label}</span>
    </div>
  )
})

export const Legend = memo(function Legend({ lens, accent }: { lens: LensName; accent: Rgb }) {
  const info = LENSES.find((l) => l.name === lens) ?? LENSES[0]
  const gradient = useMemo(() => lensGradient(lens, accent), [lens, accent])
  const lineOfSight = lens === "redshift" || lens === "doppler"
  return (
    <div className={styles.legend} title={info.description}>
      <span className={styles.legendTitle}>
        {info.label}
        {lineOfSight && <span className={styles.lineOfSight}> · line of sight ↑</span>}
      </span>
      <span className={styles.legendBar} style={{ background: gradient }} />
      <span className={styles.legendScale}>
        {info.scale.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </span>
    </div>
  )
})

const signed = (v: number, digits = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`

export function ProbeTip({ reading, x, y }: { reading: ProbeReading; x: number; y: number }) {
  const rows: string[] = []
  if (reading.cosmological) {
    rows.push(`${(reading.x * PATCH_MPC).toFixed(1)}, ${(reading.y * PATCH_MPC).toFixed(1)} Mpc`)
    if (reading.delta !== undefined) rows.push(`δ = ${signed(reading.delta)}   (${(1 + reading.delta).toFixed(2)} × mean)`)
    if (reading.web !== undefined) rows.push(WEB_LABELS[reading.web])
    if (reading.phi !== undefined) rows.push(`φ = ${signed(reading.phi, 1)} σ`)
    if (reading.theta !== undefined) rows.push(`∇·v = ${signed(reading.theta)} H`)
  } else {
    rows.push(`${(reading.x * reading.units.kpc).toFixed(1)}, ${(reading.y * reading.units.kpc).toFixed(1)} kpc`)
  }
  const h = reading.halo
  if (h) {
    rows.unshift(
      `Halo ${h.id} · ${fmtMass(h.massSun)}`,
      `r ≈ ${h.radiusKpc.toFixed(0)} kpc · σ ≈ ${h.sigmaKms.toFixed(0)} km/s · ${h.members.toLocaleString()} particles`,
      `${h.spin > 0.3 ? "rotating" : h.spin > 0.12 ? "slowly turning" : "dispersion-supported"} (spin ${h.spin.toFixed(2)}) · click to dive`,
    )
  }
  return (
    <div className={styles.probe} style={{ transform: `translate(${x + 14}px, ${y + 14}px)` }} aria-hidden="true">
      {rows.map((r, i) => (
        <span key={i} data-first={i === 0 || undefined}>{r}</span>
      ))}
    </div>
  )
}
