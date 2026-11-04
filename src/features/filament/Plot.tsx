import { useId, type ReactNode } from "react"
import styles from "./Instruments.module.scss"

/**
 * A small, dependency-free SVG plot for the instrument panel.
 *
 * Deliberately narrow: linear or log axes, lines, points, bars and reference
 * rules. Colour comes from CSS tones, never inline hex, so every chart follows
 * the site's accent and theme. Values outside the domain are clipped by the
 * plot area rather than distorting the axes.
 */

export type Tone = "accent" | "muted" | "faint" | "text"

export interface Axis {
  domain: [number, number]
  log?: boolean
  ticks: { v: number; label: string }[]
  label?: string
}

export interface Series {
  kind: "line" | "points" | "bars"
  x: number[]
  y: number[]
  tone: Tone
  dash?: "dashed" | "dotted"
  /** Bar width in x units (bars only). */
  width?: number
}

export interface Rule {
  axis: "x" | "y"
  v: number
  label?: string
}

const W = 300
const H = 132
const PAD = { l: 34, r: 8, t: 8, b: 26 }

function scaler(axis: Axis, from: number, to: number) {
  const [d0, d1] = axis.domain
  if (axis.log) {
    const l0 = Math.log(d0)
    const l1 = Math.log(d1)
    return (v: number) => (v > 0 ? from + ((Math.log(v) - l0) / (l1 - l0)) * (to - from) : NaN)
  }
  return (v: number) => from + ((v - d0) / (d1 - d0)) * (to - from)
}

export function Plot({
  x,
  y,
  series,
  rules = [],
  label,
  children,
}: {
  x: Axis
  y: Axis
  series: Series[]
  rules?: Rule[]
  /** Accessible description of what the chart shows. */
  label: string
  children?: ReactNode
}) {
  const clip = useId()
  const sx = scaler(x, PAD.l, W - PAD.r)
  const sy = scaler(y, H - PAD.b, PAD.t)
  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "")

  return (
    <svg className={styles.plot} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs>
        <clipPath id={clip}>
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
        </clipPath>
      </defs>

      {x.ticks.map((t) => {
        const px = sx(t.v)
        if (!Number.isFinite(px)) return null
        return (
          <g key={`x${t.v}`}>
            <line className={styles.grid} x1={px} x2={px} y1={PAD.t} y2={H - PAD.b} />
            <text className={styles.tick} x={px} y={H - PAD.b + 11} textAnchor="middle">
              {t.label}
            </text>
          </g>
        )
      })}
      {y.ticks.map((t) => {
        const py = sy(t.v)
        if (!Number.isFinite(py)) return null
        return (
          <g key={`y${t.v}`}>
            <line className={styles.grid} x1={PAD.l} x2={W - PAD.r} y1={py} y2={py} />
            <text className={styles.tick} x={PAD.l - 4} y={py + 3} textAnchor="end">
              {t.label}
            </text>
          </g>
        )
      })}
      {x.label && (
        <text className={styles.axisLabel} x={(PAD.l + W - PAD.r) / 2} y={H - 3} textAnchor="middle">
          {x.label}
        </text>
      )}
      {y.label && (
        <text
          className={styles.axisLabel}
          x={9}
          y={(PAD.t + H - PAD.b) / 2}
          textAnchor="middle"
          transform={`rotate(-90 9 ${(PAD.t + H - PAD.b) / 2})`}
        >
          {y.label}
        </text>
      )}

      <g clipPath={`url(#${clip})`}>
        {rules.map((r) => {
          if (r.axis === "y") {
            const py = sy(r.v)
            if (!Number.isFinite(py)) return null
            return (
              <g key={`ry${r.v}`}>
                <line className={styles.rule} x1={PAD.l} x2={W - PAD.r} y1={py} y2={py} />
                {r.label && (
                  <text className={styles.ruleLabel} x={W - PAD.r - 3} y={py - 3} textAnchor="end">
                    {r.label}
                  </text>
                )}
              </g>
            )
          }
          const px = sx(r.v)
          if (!Number.isFinite(px)) return null
          return (
            <g key={`rx${r.v}`}>
              <line className={styles.rule} x1={px} x2={px} y1={PAD.t} y2={H - PAD.b} />
              {r.label && (
                <text className={styles.ruleLabel} x={px + 3} y={PAD.t + 9}>
                  {r.label}
                </text>
              )}
            </g>
          )
        })}

        {series.map((s, si) => {
          const cls = `${styles[`tone_${s.tone}`]} ${s.dash ? styles[s.dash] : ""}`
          if (s.kind === "bars") {
            const base = sy(y.log ? y.domain[0] : Math.max(0, y.domain[0]))
            return (
              <g key={si} className={cls}>
                {s.x.map((xv, i) => {
                  const half = (s.width ?? 0) / 2
                  const x0 = sx(xv - half)
                  const x1 = sx(xv + half)
                  const top = sy(s.y[i])
                  if (![x0, x1, top].every(Number.isFinite) || s.y[i] <= 0) return null
                  return (
                    <rect
                      key={i}
                      className={styles.bar}
                      x={x0 + 0.4}
                      y={top}
                      width={Math.max(0.5, x1 - x0 - 0.8)}
                      height={Math.max(0, base - top)}
                    />
                  )
                })}
              </g>
            )
          }
          const dots: [number, number][] = []
          let path = ""
          let pen = false
          for (let i = 0; i < s.x.length; i++) {
            const px = sx(s.x[i])
            const py = sy(s.y[i])
            if (!Number.isFinite(px) || !Number.isFinite(py)) {
              pen = false
              continue
            }
            path += `${pen ? "L" : "M"}${fmt(px)} ${fmt(py)}`
            pen = true
            dots.push([px, py])
          }
          if (s.kind === "points") {
            return (
              <g key={si} className={cls}>
                {dots.map(([px, py], i) => (
                  <circle key={i} className={styles.dot} cx={px} cy={py} r={1.6} />
                ))}
              </g>
            )
          }
          return <path key={si} className={`${styles.line} ${cls}`} d={path} />
        })}
      </g>

      <rect className={styles.frame} x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
      {children}
    </svg>
  )
}

/** Decade ticks for a log axis, labelled 10ⁿ. */
export function decadeTicks(lo: number, hi: number): { v: number; label: string }[] {
  const sup = "⁰¹²³⁴⁵⁶⁷⁸⁹"
  const ticks: { v: number; label: string }[] = []
  for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) {
    const s = String(Math.abs(e)).split("").map((d) => sup[Number(d)]).join("")
    ticks.push({ v: Math.pow(10, e), label: e === 0 ? "1" : e === 1 ? "10" : `10${e < 0 ? "⁻" : ""}${s}` })
  }
  return ticks
}

/** A handful of round linear ticks across [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4, unit = ""): { v: number; label: string }[] {
  const span = hi - lo
  if (!(span > 0)) return []
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: { v: number; label: string }[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    const digits = step < 1 ? Math.min(3, Math.ceil(-Math.log10(step))) : 0
    ticks.push({ v, label: `${v.toFixed(digits)}${unit}` })
  }
  return ticks
}
