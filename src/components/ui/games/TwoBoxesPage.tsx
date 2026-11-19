import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BIG, BREAK_EVEN, BREAK_EVEN_CLEAR, NODE_LABEL, ORACLES, SCENARIOS, SMALL, THEORIES, THEORY_META,
  READER_GRUDGE, READER_KNOWN, available, counted, decide, expected, graphFor, handle, money, payoff, readerPredict, readerRecord, runBench,
  type Act, type Edge, type Mode, type NodeId, type OracleId, type ReaderRead, type Round, type ScenarioId, type Theory,
} from "@/lib/newcomb"
import { GameCabinet } from "./GameCabinet"
import { writeStored } from "./gameUtils"
import styles from "./TwoBoxesPage.module.scss"

const RECORD_KEY = "two-boxes-record"
/** Tables the coin and the lesion have already filled, per room, so leaving and coming back can't re-roll them. */
const PENDING_KEY = "two-boxes-pending"
const RECORD_MAX = 300
const BENCH_N = 1000
const ORACLE_ORDER: OracleId[] = ["reader", "laplace", "psychologist", "simulator", "lesion", "time-traveller", "oblivious"]

function readRecord(): Round[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECORD_KEY) ?? "[]")
    return Array.isArray(v) ? v.filter((r) => r && (r.act === "one" || r.act === "two") && r.scenario in SCENARIOS && r.oracle in ORACLES) : []
  } catch {
    return []
  }
}

type Pending = Record<string, { predicted: Act; nonce: string }>

function readPending(): Pending {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "{}")
    return v && typeof v === "object" && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

function writePending(update: (p: Pending) => void) {
  const p = readPending()
  update(p)
  writeStored(PENDING_KEY, JSON.stringify(p))
}

const room = (sid: ScenarioId, oid: OracleId) => `${sid}/${oid}`

/** A round as it stands: the box is filled (or, for the time traveller, will be) before you choose. */
interface Table {
  sid: ScenarioId
  oid: OracleId
  /** What the oracle predicted; null when it fills after you choose. */
  predicted: Act | null
  /** Contents of B; null until settled (time traveller). */
  full: boolean | null
  nonce: string
  taken: Act | null
  /** Why the Reader guessed as it did; shown only after you choose (before, it would give the box away). */
  read: ReaderRead | null
}

function setTable(sid: ScenarioId, oid: OracleId, history: Round[]): Table {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("")
  if (oid === "time-traveller") return { sid, oid, predicted: null, full: null, nonce, taken: null, read: null }
  if (oid === "reader") {
    // Deterministic in your record, so a fresh table can't come out differently.
    const read = readerPredict(history)
    return { sid, oid, predicted: read.predicted, full: read.predicted === "one", nonce, taken: null, read }
  }
  // The coin and the lesion: fill once per room and keep it until you've chosen.
  const kept = readPending()[room(sid, oid)]
  if (kept && (kept.predicted === "one" || kept.predicted === "two") && typeof kept.nonce === "string") {
    return { sid, oid, predicted: kept.predicted, full: kept.predicted === "one", nonce: kept.nonce, taken: null, read: null }
  }
  const predicted: Act = Math.random() < 0.5 ? "one" : "two"
  writePending((p) => { p[room(sid, oid)] = { predicted, nonce } })
  return { sid, oid, predicted, full: predicted === "one", nonce, taken: null, read: null }
}

/** What the Reader was thinking, for after the reveal. */
function readerWhy(r: ReaderRead): string {
  if (r.why === "stranger") return `It doesn't fill B for strangers: it had seen you take B alone ${r.known === 0 ? "no times" : r.known === 1 ? "once" : `${r.known} times`}, and it wants to see it ${READER_KNOWN === 2 ? "twice" : `${READER_KNOWN} times`}.`
  if (r.why === "grudge") return `It was holding a grudge: you took both from a box it had filled, and it won't fill another for ${r.grudgeLeft} more ${r.grudgeLeft === 1 ? "round" : "rounds"} with it.`
  return `Your record put you at ${(r.pOne * 100).toFixed(0)}% for B alone, so it ${r.predicted === "one" ? "filled" : "didn't fill"} B.`
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("")
}

const actWord = (a: Act) => (a === "one" ? "B alone" : "both")

export function TwoBoxesPage() {
  const [mode, setMode] = useState<Mode>("play")
  const [sid, setSid] = useState<ScenarioId>("classic")
  const [want, setWant] = useState<OracleId>("reader")
  const [p, setP] = useState(0.9)
  const [theory, setTheory] = useState<Theory>("fdt")
  const [history, setHistory] = useState<Round[]>(readRecord)
  const [seed, setSeed] = useState(1)

  const oracles = ORACLE_ORDER.filter((o) => available(o, sid, mode))
  const oid = oracles.includes(want) ? want : oracles[0]
  const oracle = ORACLES[oid]
  const sc = SCENARIOS[sid]

  const [table, setTableState] = useState<Table>(() => setTable(sid, oid, history))
  const [seal, setSeal] = useState("")
  // A fresh table whenever the room changes.
  useEffect(() => {
    if (mode !== "play") return
    setTableState((t) => (t.sid === sid && t.oid === oid && !t.taken ? t : setTable(sid, oid, history)))
    // history is read only to seed the reader's guess for the new table
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, oid, mode])
  useEffect(() => {
    let live = true
    if (table.predicted) sha256(`${table.predicted}:${table.nonce}`).then((h) => live && setSeal(h))
    else setSeal("")
    return () => { live = false }
  }, [table.predicted, table.nonce])

  const record = readerRecord(history)
  const mine = history.filter((r) => r.scenario === sid)
  const total = history.reduce((s, r) => s + payoff(r.act, r.full), 0)
  const beliefP = oid === "reader" ? record.accuracy : p
  const showP = oracle.usesP

  const take = useCallback((act: Act) => {
    if (table.taken) return
    const full = table.full ?? act === "one" // the time traveller fills B for what you took
    const round: Round = { scenario: table.sid, oracle: table.oid, act, full, ...(table.predicted ? { predicted: table.predicted } : {}) }
    setTableState({ ...table, full, taken: act })
    if (table.oid === "oblivious" || table.oid === "lesion") writePending((p) => { delete p[room(table.sid, table.oid)] })
    setHistory((h) => {
      const next = [...h, round].slice(-RECORD_MAX)
      writeStored(RECORD_KEY, JSON.stringify(next))
      return next
    })
  }, [table])

  const again = useCallback(() => setTableState(setTable(sid, oid, history)), [sid, oid, history])
  const forget = useCallback(() => {
    setHistory([])
    writeStored(RECORD_KEY, "[]")
    writeStored(PENDING_KEY, "{}")
    setTableState(setTable(sid, oid, []))
  }, [sid, oid])

  useEffect(() => {
    if (mode !== "play") return
    const onKey = (e: KeyboardEvent) => {
      // Typing, browser chords, and keys a focused control already handles (Enter/Space on a button) are not ours.
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(e.target.tagName))) return
      if (e.key === "1") take("one")
      else if (e.key === "2") take("two")
      else if ((e.key === "Enter" || e.key === " ") && table.taken) { e.preventDefault(); again() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mode, take, again, table.taken])

  const bench = useMemo(() => (mode === "bench" ? runBench(sid, oid, p, BENCH_N, seed) : null), [mode, sid, oid, p, seed])

  // What the theories would do in this room. With clear boxes, on what you can see (or, on the bench, on seeing B full).
  const obs = sc.transparent ? (mode === "play" && table.full === false ? "empty" : "full") : undefined
  const verdicts = THEORIES.map((t) => ({ t, d: decide(t, sid, oid, beliefP, obs) }))
  const shown = verdicts.find((v) => v.t === theory)!.d

  const bVisible = sc.transparent || table.taken !== null
  const bFull = table.full

  return (
    <GameCabinet
      title="Two Boxes"
      blurb="Newcomb's problem. Box A holds $1,000. Box B holds $1,000,000 if the oracle predicted you'd take B alone. Take B, or take both."
      status="playing"
      veil={false}
      controls={
        <>
          <div className={styles.seg}>
            {(["play", "bench"] as Mode[]).map((m) => (
              <button key={m} data-active={mode === m || undefined} onClick={() => setMode(m)}>{m === "play" ? "sit down" : "bench"}</button>
            ))}
          </div>
          {mode === "play" && history.length > 0 && <div className={styles.seg}><button onClick={forget} title="The Reader remembers you between visits; this clears its record">forget me</button></div>}
        </>
      }
    >
      <div className={styles.wrap}>
        <div className={styles.pick}>
          <div className={styles.row} role="group" aria-label="Boxes">
            <span>boxes</span>
            {(Object.keys(SCENARIOS) as ScenarioId[]).map((s) => (
              <button key={s} data-active={sid === s || undefined} onClick={() => setSid(s)} title={SCENARIOS[s].about}>{SCENARIOS[s].name}</button>
            ))}
          </div>
          <div className={styles.row} role="group" aria-label="Oracle">
            <span>oracle</span>
            {oracles.map((o) => (
              <button key={o} data-active={oid === o || undefined} onClick={() => setWant(o)}>{ORACLES[o].name}</button>
            ))}
          </div>
          {showP && (
            <label className={styles.row}>
              <span>p</span>
              <input type="range" min={0.3} max={1} step={0.005} value={p} onChange={(e) => setP(+e.target.value)} aria-label="Oracle accuracy" />
              <em>{oid === "lesion" ? `the gene goes with one-boxing ${(p * 100).toFixed(1)}% of the time` : `right ${(p * 100).toFixed(1)}% of the time`}</em>
            </label>
          )}
          <p className={styles.about}>{oracle.about} {sid !== "classic" && <span>{sc.about}</span>}</p>
        </div>

        {mode === "play" ? (
          <>
            <Boxes aVisible={sc.aVisible} bVisible={bVisible} bFull={bFull} taken={table.taken} clear={sc.transparent} />

            <div className={styles.seal}>
              {table.predicted
                ? table.taken
                  ? <>It predicted <strong>{actWord(table.predicted)}</strong>{sc.transparent ? " (on seeing B full)" : ""}. Sealed as <code>sha256("{table.predicted}:{table.nonce}")</code> = <code>{seal.slice(0, 16)}…</code></>
                  : <>{oid === "reader" ? "Its prediction, made and sealed before you chose:" : "The box was filled before you sat down:"} <code>{seal ? `${seal.slice(0, 16)}…` : "sealing…"}</code></>
                : <>Nothing is sealed. It will see what you take, then go back and fill the box.</>}
            </div>

            {!table.taken ? (
              <div className={styles.choose}>
                <button className={styles.go} onClick={() => take("one")}>take B alone <kbd>1</kbd></button>
                <button className={styles.go} onClick={() => take("two")}>take both <kbd>2</kbd></button>
              </div>
            ) : (
              <div className={styles.result}>
                <p>
                  <strong>{money(payoff(table.taken, !!table.full))}.</strong>{" "}
                  B was {table.full ? "full" : "empty"}.{" "}
                  {table.oid === "time-traveller"
                    ? table.taken === "one" ? "You took B, so it was filled." : "You took both, so it was left empty."
                    : sc.transparent
                      ? table.full
                        ? table.taken === "one" ? "You left the $1,000 where it was." : "You took the $1,000 as well."
                        : table.taken === "one" ? "You took B alone from a box you could see was empty: $0, and the Reader saw you do it." : "With B empty, the $1,000 is all there is."
                      : `Had you taken ${table.taken === "one" ? "both" : "B alone"}, ${money(payoff(table.taken === "one" ? "two" : "one", !!table.full))}${table.oid === "reader" ? ", if it had still guessed the same" : ""}.`}
                </p>
                {table.read && <p className={styles.why}>{readerWhy(table.read)}</p>}
                <button className={styles.go} onClick={again}>another round <kbd>↵</kbd></button>
              </div>
            )}

            <div className={styles.ledger}>
              <span><b>{history.length}</b> {history.length === 1 ? "round" : "rounds"} · <b>{money(total)}</b> · {money(history.length ? total / history.length : 0)} a round</span>
              {record.n > 0 && (
                <span>
                  The Reader has read you right in <b>{record.hits}</b> of <b>{record.n}</b> {record.n === 1 ? "round" : "rounds"} it could score.{" "}
                  {record.accuracy > (sc.transparent ? BREAK_EVEN_CLEAR : BREAK_EVEN)
                    ? "That's above break-even: against it, one-boxers average more."
                    : "That's no better than a coin: against it, take both."}
                </span>
              )}
              {mine.length > 0 && <span>Here you've taken B alone {mine.filter((r) => r.act === "one").length} of {mine.length} times.</span>}
            </div>
          </>
        ) : (
          bench && <Bench sid={sid} oid={oid} p={p} rows={bench} onRerun={() => setSeed((s) => s + 1)} />
        )}

        <div className={styles.working}>
          <div className={styles.tabs} role="tablist" aria-label="Decision theory">
            {verdicts.map(({ t, d }) => (
              <button key={t} role="tab" aria-selected={theory === t} data-t={t} data-active={theory === t || undefined} onClick={() => setTheory(t)}>
                {THEORY_META[t].short} <em>takes {actWord(d.act)}</em>
              </button>
            ))}
          </div>
          <div className={styles.workBody} data-t={theory}>
            <CausalGraph edges={graphFor(sid, oid)} theory={theory} />
            <div className={styles.reasoning}>
              <p className={styles.does}>{THEORY_META[theory].name} decision theory {THEORY_META[theory].does}</p>
              {sc.transparent && <p className={styles.obs}>Seeing B {obs}:</p>}
              <ol>{shown.working.map((w, i) => <li key={i}>{w}</li>)}</ol>
              {oid === "reader" && <p className={styles.obs}>Using the Reader's record against you so far: {(record.accuracy * 100).toFixed(0)}%.</p>}
            </div>
          </div>
        </div>

        <details className={styles.rules}>
          <summary>How it works</summary>
          <p>
            The coloured arrows are the ones a theory counts as carrying its choice to its winnings. Causal decision
            theory puts its hand on the act and cuts what flows into it; evidential decision theory conditions on the
            act, so everything upstream of it comes along; functional decision theory puts its hand on the algorithm,
            which includes the copy of it the oracle consulted. Every argument about the problem is an argument about
            the arrow from you to the prediction. Swap oracles and watch the winners change.
          </p>
          <p>
            Sitting down, only honest oracles play: a page can't be Laplace's demon. The Reader seals its guess (a
            SHA-256 of the guess and a random nonce, shown before you choose and opened after) and keeps your record in
            this browser. It reads only the rounds you play against it: what you take, and what you take after a full or
            an empty box. Like Nozick's predictor, which leaves B empty for anyone it expects to randomise, it fills B
            only for someone it expects to take B alone: never for a stranger (it wants to have seen you take B alone
            {READER_KNOWN === 2 ? " twice" : ` ${READER_KNOWN} times`}), and not for {READER_GRUDGE} rounds after you take both from a box it filled.
            That last rule is why it can't be played: the only round worth more than $1,000,000 is taking both from a
            full box, and each one buys {READER_GRUDGE} rounds worth $1,000 at most. It is deterministic and its whole
            input is your record, so you can predict it exactly; it still pays best to take B alone.
          </p>
          <p>
            The time traveller fills the box after you choose, which is the only way a machine can be perfectly right
            about you. The coin and the lesion fill each table once, so leaving and coming back doesn't re-roll it.
          </p>
          <p>
            Reading: Nozick, "Newcomb's Problem and Two Principles of Choice" (1969); Gibbard &amp; Harper,
            "Counterfactuals and Two Kinds of Expected Utility" (1978); Lewis, "Why Ain'cha Rich?" (1981); Joyce, <i>The
            Foundations of Causal Decision Theory</i> (1999); Ahmed, <i>Evidence, Decision and Causality</i> (2014);
            Yudkowsky &amp; Soares, "Functional Decision Theory" (2017); Levinstein &amp; Soares, "Cheating Death in
            Damascus" (2020). The causal pictures follow MacDermott et al., "Characterising Decision Theories with
            Mechanised Causal Graphs" (2023). For a predictor that has your actual record, see <a href="https://omega.subsurfaces.net" target="_blank" rel="noreferrer" data-panel-ignore>The Predictor</a>, floor five.
          </p>
        </details>
      </div>
    </GameCabinet>
  )
}

// ── The boxes ───────────────────────────────────────────────────────────────

function Bills({ x, y, n, cols }: { x: number; y: number; n: number; cols: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x + (i % cols) * 22} y={y - Math.floor(i / cols) * 5} width={20} height={10} rx={1.5} className={styles.bill} />
      ))}
    </g>
  )
}

function Boxes({ aVisible, bVisible, bFull, taken, clear }: { aVisible: boolean; bVisible: boolean; bFull: boolean | null; taken: Act | null; clear: boolean }) {
  const aTaken = taken === "two"
  const bTaken = taken !== null
  const label = `Box A ${aVisible ? "shows $1,000" : "is closed"}; box B ${bVisible ? (bFull ? "holds $1,000,000" : "is empty") : "is closed"}.`
  return (
    <svg className={styles.boxes} viewBox="0 0 600 220" role="img" aria-label={label}>
      <g transform="translate(90,40)"><g data-taken={aTaken || undefined} className={styles.box}>
        <rect width={170} height={130} rx={4} className={aVisible ? styles.glass : styles.card} />
        {(aVisible || taken) && <Bills x={52} y={98} n={4} cols={3} />}
        {!aVisible && !taken && <text x={85} y={72} textAnchor="middle" className={styles.q}>?</text>}
        <text x={85} y={155} textAnchor="middle" className={styles.boxLabel}>A · $1,000</text>
      </g></g>
      <g transform="translate(340,40)"><g data-taken={bTaken || undefined} className={styles.box}>
        <rect width={170} height={130} rx={4} className={bVisible ? styles.glass : styles.card} />
        {bVisible && bFull && <Bills x={18} y={110} n={42} cols={6} />}
        {bVisible && bFull === false && <text x={85} y={72} textAnchor="middle" className={styles.empty}>empty</text>}
        {!bVisible && <text x={85} y={72} textAnchor="middle" className={styles.q}>?</text>}
        <text x={85} y={155} textAnchor="middle" className={styles.boxLabel}>B · {clear || bVisible ? (bFull ? "$1,000,000" : bFull === false ? "nothing" : "?") : "$1,000,000 or nothing"}</text>
      </g></g>
    </svg>
  )
}

// ── The bench ───────────────────────────────────────────────────────────────

function Bench({ sid, oid, p, rows, onRerun }: { sid: ScenarioId; oid: OracleId; p: number; rows: ReturnType<typeof runBench>; onRerun: () => void }) {
  const clear = SCENARIOS[sid].transparent
  const top = BIG + SMALL
  return (
    <div className={styles.bench}>
      {THEORIES.map((t) => {
        const r = rows[t]
        const d = clear ? decide(t, sid, oid, p, "full") : decide(t, sid, oid, p)
        return (
          <div key={t} className={styles.benchRow} data-t={t}>
            <span className={styles.benchName}>{THEORY_META[t].short}</span>
            <span className={styles.benchAct}>{clear ? `on full: ${actWord(d.act)}` : actWord(d.act)}</span>
            <span className={styles.bar} title={`expected ${money(r.expected)}`}>
              <span style={{ width: `${(r.mean / top) * 100}%` }} />
              <i style={{ left: `${(r.expected / top) * 100}%` }} />
            </span>
            <span className={styles.benchMoney}>{money(r.mean)}</span>
            <span className={styles.benchHits}>B full {(r.fullShare * 100).toFixed(0)}%</span>
          </div>
        )
      })}
      <div className={styles.benchFoot}>
        <span>Average winnings over {BENCH_N.toLocaleString()} rounds, the same coin tosses for all three; the tick is the exact expectation.</span>
        <button onClick={onRerun}>run again</button>
      </div>
      {ORACLES[oid].usesP && <Sweep sid={sid} oid={oid} p={p} />}
    </div>
  )
}

function Sweep({ sid, oid, p }: { sid: ScenarioId; oid: OracleId; p: number }) {
  const W = 560, H = 180, L = 46, R = 10, T = 10, B = 26
  const lo = 0.3, hi = 1
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R)
  const y = (v: number) => T + (1 - v / (BIG + SMALL)) * (H - T - B)
  const steps = 140
  const line = (t: Theory) => Array.from({ length: steps + 1 }, (_, i) => {
    const v = lo + ((hi - lo) * i) / steps
    return `${i ? "L" : "M"}${x(v).toFixed(1)},${y(expected(t, sid, oid, v)).toFixed(1)}`
  }).join("")
  const be = SCENARIOS[sid].transparent ? BREAK_EVEN_CLEAR : BREAK_EVEN
  return (
    <svg className={styles.sweep} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Expected winnings for each theory as the oracle's accuracy varies">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(f * BIG)} y2={y(f * BIG)} className={styles.grid} />
          <text x={L - 6} y={y(f * BIG) + 3} textAnchor="end" className={styles.axis}>{f === 0 ? "$0" : f === 0.5 ? "$500k" : "$1M"}</text>
        </g>
      ))}
      {[0.3, 0.5, 0.7, 0.9, 1].map((v) => <text key={v} x={x(v)} y={H - 8} textAnchor="middle" className={styles.axis}>{v}</text>)}
      {oid !== "lesion" && (
        <g>
          <line x1={x(be)} x2={x(be)} y1={T} y2={H - B} className={styles.breakEven} />
          <text x={x(be) + 4} y={T + 10} className={styles.axis}>break-even {be.toFixed(4)}</text>
        </g>
      )}
      <line x1={x(p)} x2={x(p)} y1={T} y2={H - B} className={styles.now} />
      {THEORIES.map((t) => <path key={t} d={line(t)} className={styles.curve} data-t={t} />)}
      <text x={W - R} y={H - 8} textAnchor="end" className={styles.axis}>p →</text>
    </svg>
  )
}

// ── The causal picture ──────────────────────────────────────────────────────

const POS: Record<NodeId, [number, number]> = {
  alg: [90, 34], act: [250, 34], pay: [380, 104], pred: [170, 166], box: [310, 166], gene: [44, 100], coin: [44, 166],
}
const EDGE_NOTE: Partial<Record<Edge["kind"], string>> = { same: "same function", retro: "after", inclines: "inclines", see: "you see" }

function size(n: NodeId): [number, number] {
  return [NODE_LABEL[n].length * 6.2 + 16, 22]
}

/** Where the segment from a's centre to b's centre leaves a's box. */
function clip(a: [number, number], b: [number, number], [w, h]: [number, number]): [number, number] {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity)
  return [a[0] + dx * t, a[1] + dy * t]
}

function CausalGraph({ edges, theory }: { edges: Edge[]; theory: Theory }) {
  const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))]
  const live = new Set(counted(theory, edges).map((e) => `${e.from}>${e.to}`))
  const hands = new Set(handle(theory, edges))
  const cut = theory === "edt" ? new Set<string>() : new Set(edges.filter((e) => hands.has(e.to)).map((e) => `${e.from}>${e.to}`))
  return (
    <svg className={styles.graph} viewBox="0 0 430 190" role="img" aria-label={`The causal picture, as ${THEORY_META[theory].name.toLowerCase()} decision theory reads it`}>
      {edges.map((e) => {
        const id = `${e.from}>${e.to}`
        const a = clip(POS[e.from], POS[e.to], size(e.from))
        const b = clip(POS[e.to], POS[e.from], size(e.to))
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
        const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
        return (
          <g key={id} className={styles.edge} data-live={live.has(id) || undefined} data-cut={cut.has(id) || undefined} data-kind={e.kind}>
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
            <path d="M0,0 L-7,-3.5 L-7,3.5 z" transform={`translate(${b[0]},${b[1]}) rotate(${deg})`} />
            {EDGE_NOTE[e.kind] && <text x={mx + 4} y={my - 4}>{cut.has(id) ? "cut" : EDGE_NOTE[e.kind]}</text>}
          </g>
        )
      })}
      {nodes.map((n) => {
        const [w, h] = size(n)
        const [cx, cy] = POS[n]
        const hand = theory === "edt" ? n === "act" : hands.has(n)
        return (
          <g key={n} className={styles.node} data-hand={hand || undefined}>
            <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={11} />
            <text x={cx} y={cy + 4} textAnchor="middle">{NODE_LABEL[n]}</text>
            {hand && <text x={cx} y={cy - h / 2 - 4} textAnchor="middle" className={styles.handText}>{theory === "edt" ? "given" : "do( )"}</text>}
          </g>
        )
      })}
    </svg>
  )
}
