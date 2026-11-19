import { useEffect, useMemo, useRef, useState } from "react"
import { THEORIES, deliberate, type Theory } from "@/lib/causal"
import { CASE, CASES, GROUPS, defaults, equilibrium, formatValue, type CaseId, type DecisionCase, type Deliberation, type Param, type Values } from "@/lib/decision-cases"
import { THEORY_META } from "@/lib/newcomb"
import { TheoryGraph } from "./TwoBoxesGraph"
import { useTween } from "./useTween"
import styles from "./TwoBoxesPage.module.scss"

const reduceMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

function paramText(p: Param, v: number): string {
  if (p.kind === "choice") return p.options[v]
  if (p.unit === "p") return `${+(v * 100).toFixed(1)}%`
  if (p.unit === "$") return "$" + v.toLocaleString("en-US")
  if (p.unit === "x") return `1 in 10^${-v}`
  return String(v)
}

export function CaseFiles({ id, onPick }: { id: CaseId; onPick: (id: CaseId) => void }) {
  const c = CASE[id]
  return (
    <div className={styles.cases}>
      <nav className={styles.rail} aria-label="Case files">
        {GROUPS.map((g) => (
          <div key={g.id} className={styles.railGroup}>
            <h3>{g.title}</h3>
            <ul>
              {CASES.filter((x) => x.group === g.id).map((x) => (
                <li key={x.id}>
                  <button data-active={x.id === id || undefined} onClick={() => onPick(x.id)} aria-current={x.id === id || undefined}>
                    <span>{x.title}</span>
                    <small data-t={x.against}>against {x.against.toUpperCase()}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {/* Remount per case so its parameters start from the case's own defaults. */}
      <CaseView key={c.id} c={c} />
    </div>
  )
}

function CaseView({ c }: { c: DecisionCase }) {
  const [vals, setVals] = useState<Values>(() => defaults(c))
  const [theory, setTheory] = useState<Theory>("fdt")
  const verdicts = useMemo(() => c.verdicts(vals), [c, vals])
  const delib = useMemo(() => c.deliberation?.(vals), [c, vals])
  const group = GROUPS.find((g) => g.id === c.group)!
  const set = (k: string, v: number) => setVals((o) => ({ ...o, [k]: v }))
  const best = Math.max(...THEORIES.map((t) => verdicts[t].realised))
  const dial = c.params.find((p) => p.key === "s")
  const rest = c.params.filter((p) => p !== dial && p.key !== "p0")
  const p0 = c.params.find((p) => p.key === "p0")

  return (
    <article className={styles.case}>
      <header className={styles.caseHead}>
        <p className={styles.kicker}>{group.title} <span data-t={c.against}>· a case against {c.against.toUpperCase()}</span></p>
        <h2>{c.title}</h2>
        <p className={styles.dek}>{c.dek}</p>
      </header>

      <div className={styles.caseIntro}>
        <div className={styles.story}>
          {c.story.map((s, i) => <p key={i}>{s}</p>)}
          <p className={styles.source}>{c.source}</p>
        </div>
        <table className={styles.payoffs}>
          <thead><tr>{c.table.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
          <tbody>{c.table.rows.map((r, i) => <tr key={i}>{r.map((x, j) => (j === 0 ? <th key={j} scope="row">{x}</th> : <td key={j}>{x}</td>))}</tr>)}</tbody>
        </table>
      </div>

      {(dial || rest.length > 0) && (
        <div className={styles.knobs}>
          {dial && dial.kind === "range" && <SimilarityDial value={vals.s} onChange={(v) => set("s", v)} min={dial.min} max={dial.max} step={dial.step} />}
          {rest.map((p) => <Knob key={p.key} p={p} value={vals[p.key]} onChange={(v) => set(p.key, v)} />)}
        </div>
      )}

      <section aria-label="Verdicts">
        <h3 className={styles.sectionHead}><span>Three verdicts</span><em>what each theory expects, and what agents who reason that way walk away with</em></h3>
        <Verdicts c={c} verdicts={verdicts} best={best} theory={theory} onPick={setTheory} />
      </section>

      <section className={styles.reading} data-t={theory} aria-label="The causal picture">
        <div className={styles.readingGraph}>
          <div className={styles.theoryTabs} role="tablist" aria-label="Decision theory">
            {THEORIES.map((t) => (
              <button key={t} role="tab" aria-selected={theory === t} data-t={t} data-active={theory === t || undefined} onClick={() => setTheory(t)}>{THEORY_META[t].short}</button>
            ))}
          </div>
          <TheoryGraph nodes={c.nodes} edges={c.edges(vals)} roles={c.roles} theory={theory} />
          <p className={styles.legendLine}><i data-k="live" /> carries the choice <i data-k="cut" /> severed by do( ) <i data-k="same" /> same function</p>
        </div>
        <div className={styles.readingText}>
          <p className={styles.does}><b>{THEORY_META[theory].name}</b> decision theory {THEORY_META[theory].does}</p>
          <ol>{verdicts[theory].working.map((w, i) => <li key={i}>{w}</li>)}</ol>
        </div>
      </section>

      {delib && p0 && p0.kind === "range" && (
        <Deliberating d={delib} p0={p0} onP0={(v) => set("p0", v)} />
      )}

      <blockquote className={styles.takeaway}>{c.takeaway}</blockquote>
    </article>
  )
}

// ── Verdict cards ────────────────────────────────────────────────────────────

function Verdicts({ c, verdicts, best, theory, onPick }: { c: DecisionCase; verdicts: ReturnType<DecisionCase["verdicts"]>; best: number; theory: Theory; onPick: (t: Theory) => void }) {
  const all = THEORIES.flatMap((t) => [verdicts[t].ev, verdicts[t].realised])
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all)
  const span = hi - lo || 1
  const at = (x: number) => ((x - lo) / span) * 100
  return (
    <div className={styles.verdicts}>
      {THEORIES.map((t) => {
        const v = verdicts[t]
        const gap = Math.abs(v.ev - v.realised) > Math.max(1e-9, Math.abs(span) * 0.01)
        return (
          <button key={t} className={styles.verdict} data-t={t} data-active={theory === t || undefined} onClick={() => onPick(t)} aria-pressed={theory === t}>
            <span className={styles.vTheory}>{THEORY_META[t].short} <small>{THEORY_META[t].name}</small></span>
            <span className={styles.vChoice}>{v.choice}</span>
            <Figure label="expects" value={v.ev} c={c} />
            <Figure label="walks away with" value={v.realised} c={c} strong />
            <span className={styles.vBars} aria-hidden>
              <span className={styles.zero} style={{ left: `${at(0)}%` }} />
              <span className={styles.vEv} style={{ left: `${Math.min(at(0), at(v.ev))}%`, width: `${Math.abs(at(v.ev) - at(0))}%` }} />
              <span className={styles.vReal} style={{ left: `${Math.min(at(0), at(v.realised))}%`, width: `${Math.abs(at(v.realised) - at(0))}%` }} />
            </span>
            <span className={styles.vTags}>
              {v.realised === best && <em className={styles.richest}>richest</em>}
              {gap && <em className={styles.gapTag}>{v.realised < v.ev ? "gets less than it expects" : "gets more than it expects"}</em>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Figure({ label, value, c, strong }: { label: string; value: number; c: DecisionCase; strong?: boolean }) {
  const shown = useTween(value, 500)
  return (
    <span className={styles.figure} data-strong={strong || undefined}>
      <small>{label}</small>
      <b>{formatValue(c, shown)}</b>
    </span>
  )
}

// ── Knobs ────────────────────────────────────────────────────────────────────

function Knob({ p, value, onChange }: { p: Param; value: number; onChange: (v: number) => void }) {
  if (p.kind === "choice") {
    return (
      <div className={styles.knob}>
        <span className={styles.knobLabel}>{p.label}</span>
        <div className={styles.segmented} role="radiogroup" aria-label={p.label}>
          {p.options.map((o, i) => <button key={o} role="radio" aria-checked={value === i} data-active={value === i || undefined} onClick={() => onChange(i)}>{o}</button>)}
        </div>
      </div>
    )
  }
  return (
    <label className={styles.knob}>
      <span className={styles.knobLabel}>{p.label} <b>{paramText(p, value)}</b></span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

/** The twin's likeness as a gauge: FDT's open problem, made a knob. */
function SimilarityDial({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  const R = 78, cx = 100, cy = 96
  const ang = (v: number) => Math.PI * (1 - (v - min) / (max - min))
  const pt = (v: number, r = R) => [cx + r * Math.cos(ang(v)), cy - r * Math.sin(ang(v))]
  const arc = (a: number, b: number) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}` }
  const [nx, ny] = pt(value, R - 14)
  const [tx, ty] = pt(0.75, R + 12)
  const coop = value > 0.75
  return (
    <label className={styles.dial}>
      <svg viewBox="0 0 200 112" aria-hidden>
        <path d={arc(min, 0.75)} className={styles.dialTrack} />
        <path d={arc(0.75, max)} className={styles.dialTrack} data-good />
        <path d={arc(min, value)} className={styles.dialFill} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} className={styles.dialNeedle} />
        <circle cx={cx} cy={cy} r={4} className={styles.dialHub} />
        <text x={tx} y={ty} textAnchor="middle" className={styles.dialTick}>75%</text>
      </svg>
      <span className={styles.dialValue}>{Math.round(value * 100)}<small>%</small></span>
      <span className={styles.knobLabel}>how alike you are · {coop ? "cooperation pays" : "too loose to lean on"}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} aria-label="How alike you and your twin are" />
    </label>
  )
}

// ── Deliberation ─────────────────────────────────────────────────────────────

const fmtU = (x: number) => (Math.abs(x) >= 100 ? (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US") : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(1))

/** Joyce's ratification, animated: CDT revising its credence in what it'll do until it can't tell its options apart. */
function Deliberating({ d, p0, onP0 }: { d: Deliberation; p0: Extract<Param, { kind: "range" }>; onP0: (v: number) => void }) {
  const run = useMemo(() => deliberate(d.u, d.p0, d.k, d.steps), [d])
  const eq = useMemo(() => equilibrium(d), [d])
  const [i, setI] = useState(run.length - 1)
  const raf = useRef(0)
  const play = () => {
    cancelAnimationFrame(raf.current)
    if (reduceMotion()) { setI(run.length - 1); return }
    const t0 = performance.now(), ms = 3200
    const tick = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms)) // rAF's timestamp can precede t0
      setI(Math.round((1 - (1 - k) ** 2) * (run.length - 1)))
      if (k < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  // Replay whenever the starting credence changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { play(); return () => cancelAnimationFrame(raf.current) }, [run])

  const W = 640, H = 220, L = 44, R = 16, T = 16, B = 30
  const x = (s: number) => L + (s / (run.length - 1)) * (W - L - R)
  const y = (p: number) => T + (1 - p) * (H - T - B)
  const path = run.slice(0, i + 1).map((r, s) => `${s ? "L" : "M"}${x(s).toFixed(1)},${y(r.p).toFixed(1)}`).join("")
  const now = run[Math.max(0, Math.min(run.length - 1, i))]
  const lean = Math.abs(now.ua - now.ub) <= 0.01 * Math.max(1, Math.abs(now.ua), Math.abs(now.ub)) ? "balanced" : now.ua > now.ub ? d.acts[0] : d.acts[1]
  const uMax = Math.max(...run.flatMap((r) => [Math.abs(r.ua), Math.abs(r.ub)]), 1e-9)
  return (
    <section className={styles.delib} aria-label="CDT deliberating">
      <h3 className={styles.sectionHead}><span>Watch CDT deliberate</span><em>Skyrms's dynamics, as Joyce uses them: credence drifts toward whichever act looks better, until neither does</em></h3>
      <div className={styles.delibBody}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.delibChart} role="img" aria-label={`Credence in ${d.acts[0]} over deliberation, settling at ${(eq * 100).toFixed(2)}%`}>
          {[0, 0.5, 1].map((p) => (
            <g key={p}>
              <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} className={styles.grid} />
              <text x={L - 8} y={y(p) + 4} textAnchor="end" className={styles.axis}>{p * 100}%</text>
            </g>
          ))}
          <line x1={L} x2={W - R} y1={y(eq)} y2={y(eq)} className={styles.eqLine} />
          <text x={W - R} y={y(eq) - 7} textAnchor="end" className={styles.eqText}>settles at {+(eq * 100).toFixed(2)}% {d.acts[0]}</text>
          <path d={path} className={styles.delibPath} />
          <circle cx={x(i)} cy={y(now.p)} r={5} className={styles.delibDot} />
          <text x={L} y={H - 8} className={styles.axis}>step 0</text>
          <text x={W - R} y={H - 8} textAnchor="end" className={styles.axis}>step {run.length - 1} →</text>
        </svg>
        <div className={styles.delibSide}>
          <p className={styles.delibStep}>step {i}</p>
          <p className={styles.delibCred}><b>{(now.p * 100).toFixed(1)}%</b> sure I'll {d.acts[0]}</p>
          {[0, 1].map((k) => {
            const u = k ? now.ub : now.ua
            return (
              <div key={k} className={styles.uRow} data-lead={(k ? now.ub > now.ua : now.ua > now.ub) || undefined}>
                <span>U({d.acts[k]})</span>
                <span className={styles.uBar}><span style={{ width: `${(Math.abs(u) / uMax) * 100}%` }} /></span>
                <b>{fmtU(u)}</b>
              </div>
            )
          })}
          <p className={styles.delibLean}>{lean === "balanced" ? "Indifferent: ratified. Toss the weighted coin." : `Leaning toward ${lean}, which makes ${lean} look worse.`}</p>
          <label className={styles.knob}>
            <span className={styles.knobLabel}>{p0.label} <b>{paramText(p0, d.p0)} {d.acts[0]}</b></span>
            <input type="range" min={p0.min} max={p0.max} step={p0.step} value={d.p0} onChange={(e) => onP0(+e.target.value)} />
          </label>
          <button className={styles.ghost} onClick={play}>replay</button>
        </div>
      </div>
    </section>
  )
}
