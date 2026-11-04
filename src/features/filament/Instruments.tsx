import { memo } from "react"
import { A_REC, PATCH_MPC } from "./cosmology"
import { ISO_KMS, ISO_KPC, ISO_MYR } from "./presets"
import { WEB_LABELS } from "./analysis"
import { lensHue, type Rgb } from "./palettes"
import { Plot, decadeTicks, niceTicks, type Series } from "./Plot"
import type { CosmicInstruments, Instruments, IsolatedInstruments } from "./protocol"
import styles from "./Instruments.module.scss"

/**
 * The instrument panel: what the box would tell a cosmologist.
 *
 * Every chart pairs a measurement with a prediction made *without* looking at
 * the measurement — linear theory, the growth equation, the log-normal model,
 * √(GM(<r)), the virial theorem — because the interesting part of a simulation
 * is always where it departs from the simple story, and you can only see that
 * against the simple story.
 */

const BOX_MPC = 2 * PATCH_MPC

function Figure({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.title}>{title}</figcaption>
      {children}
      {caption && <p className={styles.caption}>{caption}</p>}
    </figure>
  )
}

function logDomain(values: number[], floor: number, pad = 2.5): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (!(v > floor)) continue
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  if (!Number.isFinite(lo)) return [1e-3, 10]
  return [lo / pad, hi * pad]
}

function pct(v: number): string {
  return v >= 0.1 ? `${Math.round(v * 100)}%` : `${(v * 100).toFixed(1)}%`
}

function Cosmic({ data, accent }: { data: CosmicInstruments; accent: Rgb }) {
  // --- power spectrum ------------------------------------------------------
  const kMax = data.k.length ? data.k[data.k.length - 1] * 1.15 : 64
  const yDom = logDomain([...data.measured, ...data.linear.filter((v) => v > 0), 1], 1e-6, 2)
  const lambdaTicks = [180, 60, 20, 6, 2]
    .map((l) => ({ v: BOX_MPC / l, label: String(l) }))
    .filter((t) => t.v >= 0.9 && t.v <= kMax)
  const pkSeries: Series[] = [
    { kind: "line", x: data.k, y: data.shot, tone: "faint", dash: "dotted" },
    { kind: "line", x: data.k, y: data.linear.map((v) => (v > 0 ? v : NaN)), tone: "muted", dash: "dashed" },
    { kind: "line", x: data.k, y: data.measured, tone: "accent" },
    { kind: "points", x: data.k, y: data.measured, tone: "accent" },
  ]
  const lambdaNL = data.kNL ? BOX_MPC / data.kNL : null
  const pkCaption = lambdaNL
    ? `Linear theory reaches Δ² = 1 at λ ≈ ${lambdaNL.toFixed(0)} Mpc. Below that scale the measured curve is gravity's own work: power pumped to small scales as structures collapse.`
    : "Every scale is still linear: the measured curve rides on the prediction, grown in step with D(a)."

  // --- growth --------------------------------------------------------------
  const lnLo = Math.log(A_REC)
  const zTicks = [1000, 100, 10, 1, 0].map((z) => ({ v: -Math.log(1 + z), label: z === 0 ? "0" : String(z) }))
  const gMax = Math.max(1.05, ...data.growth.measured, ...data.growthTheory.D.filter((_, i) => data.growthTheory.lnA[i] <= 0))
  const lastG = data.growth.measured[data.growth.measured.length - 1]
  const lastLnA = data.growth.lnA[data.growth.lnA.length - 1]
  const theoryAtLast = (() => {
    if (lastLnA === undefined) return NaN
    const t = data.growthTheory
    for (let i = 1; i < t.lnA.length; i++) {
      if (t.lnA[i] >= lastLnA) {
        const f = (lastLnA - t.lnA[i - 1]) / (t.lnA[i] - t.lnA[i - 1])
        return t.D[i - 1] + (t.D[i] - t.D[i - 1]) * f
      }
    }
    return t.D[t.D.length - 1]
  })()
  const growthRatio = lastG / theoryAtLast

  // --- PDF -----------------------------------------------------------------
  const { pdf } = data
  const bins = pdf.measured.length
  const width = (pdf.hi - pdf.lo) / bins
  const centres = pdf.measured.map((_, i) => pdf.lo + (i + 0.5) * width)
  const pdfMax = Math.max(1e-3, ...pdf.measured, ...pdf.model) * 1.1

  return (
    <>
      <Figure title="Power spectrum Δ²(k)" caption={pkCaption}>
        <Plot
          label="Dimensionless power spectrum: measured, linear theory, and shot noise against wavelength"
          x={{ domain: [0.9, kMax], log: true, ticks: lambdaTicks, label: "wavelength, Mpc" }}
          y={{ domain: yDom, log: true, ticks: decadeTicks(yDom[0], yDom[1]), label: "Δ²" }}
          series={pkSeries}
          rules={[{ axis: "y", v: 1, label: "nonlinear" }, ...(data.kNL ? [{ axis: "x" as const, v: data.kNL }] : [])]}
        />
        <ul className={styles.key}>
          <li data-tone="accent">measured</li>
          <li data-tone="muted" data-dash="dashed">linear theory, this realisation</li>
          <li data-tone="faint" data-dash="dotted">shot noise</li>
        </ul>
      </Figure>

      <Figure
        title="Growth of the largest modes"
        caption={
          Number.isFinite(growthRatio)
            ? `Measured amplitude of the box-scale modes against the growth equation: ${growthRatio.toFixed(2)}× prediction. Agreement here is the integrator's credential; departure late on is mode coupling.`
            : undefined
        }
      >
        <Plot
          label="Linear growth factor: theory curve and measured points against redshift"
          x={{ domain: [lnLo, 0.02], ticks: zTicks, label: "redshift z" }}
          y={{ domain: [0, gMax * 1.05], ticks: niceTicks(0, gMax, 4), label: "D" }}
          series={[
            { kind: "line", x: data.growthTheory.lnA, y: data.growthTheory.D, tone: "muted", dash: "dashed" },
            { kind: "points", x: data.growth.lnA, y: data.growth.measured, tone: "accent" },
          ]}
        />
      </Figure>

      <Figure
        title="Density distribution"
        caption={`σ = ${pdf.sigma.toFixed(2)}${pdf.empty > 0.001 ? ` · ${pct(pdf.empty)} of cells empty` : ""}. The dashed curve is the log-normal model with that σ and nothing else fitted.`}
      >
        <Plot
          label="Histogram of log density with log-normal model"
          x={{ domain: [pdf.lo, pdf.hi], ticks: [-1, 0, 1, 2].map((v) => ({ v, label: v === 0 ? "ρ̄" : `${v > 0 ? "×" : "÷"}${Math.pow(10, Math.abs(v))}` })), label: "density, relative to mean" }}
          y={{ domain: [0, pdfMax], ticks: [], label: "cells" }}
          series={[
            { kind: "bars", x: centres, y: pdf.measured, tone: "accent", width },
            { kind: "line", x: centres, y: pdf.model, tone: "text", dash: "dashed" },
          ]}
        />
      </Figure>

      {data.web && (
        <Figure
          title="Cosmic web census"
          caption="Voids fill most of the area and hold little of the mass; nodes are the reverse. Matter drains out of the first into the last."
        >
          <div className={styles.census}>
            {(["volume", "mass"] as const).map((row) => (
              <div key={row} className={styles.censusRow}>
                <span className={styles.censusLabel}>{row === "volume" ? "area" : "mass"}</span>
                <div className={styles.censusBar}>
                  {data.web![row].map((f, i) => {
                    const [r, g, b] = lensHue("web", i / 2, accent)
                    return (
                      <span
                        key={i}
                        style={{ flexGrow: Math.max(f, 0.0001), background: `rgb(${r * 255}, ${g * 255}, ${b * 255})` }}
                        title={`${WEB_LABELS[i]}: ${pct(f)}`}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
            <div className={styles.censusLegend}>
              {WEB_LABELS.map((name, i) => (
                <span key={name}>
                  {name} {pct(data.web!.volume[i])} · {pct(data.web!.mass[i])}
                </span>
              ))}
            </div>
          </div>
        </Figure>
      )}
    </>
  )
}

function Isolated({ data }: { data: IsolatedInstruments }) {
  const t = data.t.map((v) => v * ISO_MYR)
  const tMax = Math.max(1, t[t.length - 1] ?? 1)
  const qMax = Math.max(1.5, ...data.virial) * 1.05
  const rMax = Math.max(0.1, ...data.r90) * ISO_KPC * 1.08
  const kpc = (arr: number[]) => arr.map((v) => v * ISO_KPC)
  const rot = data.rotation
  const rotR = kpc(rot.r)
  const rotX = Math.max(1, rotR[rotR.length - 1] ?? 1) * 1.05
  const vMax = Math.max(50, ...rot.vPhi.map((v) => v * ISO_KMS), ...rot.vCirc.map((v) => v * ISO_KMS)) * 1.1
  const q = data.virial[data.virial.length - 1]
  const qText =
    q === undefined ? "" : q < 0.8 ? "falling inward" : q > 1.25 ? "kinetic energy in excess: unbound or rebounding" : "close to equilibrium"

  return (
    <>
      <Figure
        title="Virial ratio Q = 2K ÷ ½GM²"
        caption={`In two dimensions the virial sum is a constant, GM²/2, so equilibrium needs no potential energy at all: just Q = 1. Now ${q?.toFixed(2) ?? "—"}, ${qText}.`}
      >
        <Plot
          label="Virial ratio over time"
          x={{ domain: [0, tMax], ticks: niceTicks(0, tMax, 4), label: "time, Myr" }}
          y={{ domain: [0, qMax], ticks: niceTicks(0, qMax, 3), label: "Q" }}
          series={[{ kind: "line", x: t, y: data.virial, tone: "accent" }]}
          rules={[{ axis: "y", v: 1, label: "equilibrium" }]}
        />
      </Figure>

      <Figure
        title="Lagrangian radii"
        caption="Radii enclosing 10, 50 and 90% of the mass about the density centre. A collapse shows as all three plunging together; a tidal tail as the outer one running away alone."
      >
        <Plot
          label="Radii enclosing ten, fifty and ninety percent of mass over time"
          x={{ domain: [0, tMax], ticks: niceTicks(0, tMax, 4), label: "time, Myr" }}
          y={{ domain: [0, rMax], ticks: niceTicks(0, rMax, 3), label: "kpc" }}
          series={[
            { kind: "line", x: t, y: kpc(data.r10), tone: "faint" },
            { kind: "line", x: t, y: kpc(data.r50), tone: "muted" },
            { kind: "line", x: t, y: kpc(data.r90), tone: "accent" },
          ]}
        />
      </Figure>

      <Figure
        title="Rotation curve"
        caption="Mean orbital speed against √(GM(<r)), the circular speed 2D gravity predicts. It is flat wherever the mass is enclosed: real galaxies need dark matter for the flat curve this world gets for free."
      >
        <Plot
          label="Rotation curve: measured tangential speed and predicted circular speed against radius"
          x={{ domain: [0, rotX], ticks: niceTicks(0, rotX, 4), label: "radius, kpc" }}
          y={{ domain: [0, vMax], ticks: niceTicks(0, vMax, 3), label: "km/s" }}
          series={[
            { kind: "line", x: rotR, y: rot.vCirc.map((v) => v * ISO_KMS), tone: "muted", dash: "dashed" },
            { kind: "line", x: rotR, y: rot.vPhi.map((v) => v * ISO_KMS), tone: "accent" },
            { kind: "points", x: rotR, y: rot.vPhi.map((v) => v * ISO_KMS), tone: "accent" },
          ]}
        />
        <ul className={styles.key}>
          <li data-tone="accent">measured v_φ</li>
          <li data-tone="muted" data-dash="dashed">√(GM(&lt;r))</li>
        </ul>
      </Figure>

      <Figure title="Conservation">
        <dl className={styles.ledger}>
          <dt>angular momentum drift</dt>
          <dd>{data.angularDrift.toExponential(1)}</dd>
          <dt>net momentum</dt>
          <dd>{data.momentumDrift.toExponential(1)}</dd>
        </dl>
        <p className={styles.caption}>
          The multipole far field is not pairwise symmetric, so momentum is conserved only to the expansion order: these are the solver&apos;s honest error bars.
        </p>
      </Figure>
    </>
  )
}

export const InstrumentPanel = memo(function InstrumentPanel({
  data,
  accent,
}: {
  data: Instruments | null
  accent: Rgb
}) {
  if (!data) return <p className={styles.caption}>Taking the first measurements…</p>
  return data.kind === "cosmic" ? <Cosmic data={data} accent={accent} /> : <Isolated data={data} />
})
