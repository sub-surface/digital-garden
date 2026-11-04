import { memo, useMemo } from "react"
import { A_REC, accelerationOnset, ageOf, formatAge, PATCH_MPC, type Cosmology } from "./cosmology"
import { WEB_LABELS } from "./analysis"
import { LENSES, lensGradient, type Rgb } from "./palettes"
import type { HaloCard, LensName, ProbeReading } from "./protocol"
import styles from "./FilamentPage.module.scss"

/**
 * The quiet furniture around the field: where we are in cosmic history, how
 * big things are, what the colours mean, and what lies under the pointer.
 */

const LN_REC = Math.log(A_REC)

/** Position of scale factor a on the timeline, 0 at recombination, 1 today. */
const along = (a: number) => Math.max(0, Math.min(1, (Math.log(a) - LN_REC) / -LN_REC))

/**
 * Cosmic history on a logarithmic axis in a, which is the integrator's own
 * clock: every e-fold of expansion gets the same width, so the dark ages, which
 * take a few hundred million years, get as much room as the last ten billion.
 */
export const Timeline = memo(function Timeline({ cosmology, a }: { cosmology: Cosmology; a: number }) {
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
  return (
    <div className={styles.timeline} aria-hidden="true">
      <div className={styles.timelineTrack}>
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
 * Where we are in the descent. Each crumb above the current one climbs back.
 */
export const Breadcrumb = memo(function Breadcrumb({
  world,
  focus,
  moving,
  onAscend,
}: {
  /** A lab world's name, or null for the cosmic web. */
  world: string | null
  focus: HaloCard | null
  moving: boolean
  onAscend: () => void
}) {
  if (world) {
    return (
      <nav className={styles.breadcrumb} aria-label="Where you are">
        <span>Lab</span>
        <span aria-hidden="true">›</span>
        <span data-current>{world}</span>
      </nav>
    )
  }
  return (
    <nav className={styles.breadcrumb} aria-label="Where you are" data-moving={moving || undefined}>
      {focus ? (
        <button type="button" onClick={onAscend} title="Back to the cosmic web (Esc)">
          The web
        </button>
      ) : (
        <span data-current>The web</span>
      )}
      {focus && (
        <>
          <span aria-hidden="true">›</span>
          <span data-current title={`${focus.members.toLocaleString()} particles, found at z = ${focus.z.toFixed(2)}`}>
            Halo {focus.id} · {fmtMass(focus.massSun)}
          </span>
        </>
      )}
    </nav>
  )
})

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
  const length = niceLength(kpcPerCss * 110)
  const px = length / kpcPerCss
  const value = length >= 1000 ? `${length / 1000} Mpc` : `${length} kpc`
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
