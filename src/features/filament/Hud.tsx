import { memo, useMemo } from "react"
import { A_REC, accelerationOnset, ageOf, formatAge, PATCH_MPC, type Cosmology } from "./cosmology"
import { ISO_KPC } from "./presets"
import { WEB_LABELS } from "./analysis"
import { LENSES, lensGradient, type Rgb } from "./palettes"
import type { LensName, ProbeReading } from "./protocol"
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
  cosmological,
}: {
  cssPerWorld: number
  cosmological: boolean
}) {
  if (!(cssPerWorld > 0)) return null
  const unitsPerWorld = cosmological ? PATCH_MPC : ISO_KPC
  const unitsPerCss = unitsPerWorld / cssPerWorld
  const length = niceLength(unitsPerCss * 110)
  const px = length / unitsPerCss
  const label = cosmological ? `${length} Mpc comoving` : `${length} kpc`
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
    rows.push(`${(reading.x * ISO_KPC).toFixed(1)}, ${(reading.y * ISO_KPC).toFixed(1)} kpc`)
  }
  return (
    <div className={styles.probe} style={{ transform: `translate(${x + 14}px, ${y + 14}px)` }} aria-hidden="true">
      {rows.map((r, i) => (
        <span key={i} data-first={i === 0 || undefined}>{r}</span>
      ))}
    </div>
  )
}
