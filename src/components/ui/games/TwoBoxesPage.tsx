import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BIG, BREAK_EVEN, BREAK_EVEN_CLEAR, NEWCOMB_ROLES, NODE_LABEL, ORACLES, SCENARIOS, SMALL, THEORIES, THEORY_META,
  READER_GRUDGE, READER_KNOWN, available, decide, expected, graphFor, money, payoff, readerPredict, readerRecord, runBench,
  type Act, type Mode, type NodeId, type OracleId, type ReaderRead, type Round, type ScenarioId, type Theory,
} from "@/lib/newcomb"
import { CASE, type CaseId } from "@/lib/decision-cases"
import { CaseFiles } from "./TwoBoxesCases"
import { TheoryGraph, type GraphNodeSpec } from "./TwoBoxesGraph"
import { writeStored } from "./gameUtils"
import { useTween } from "./useTween"
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

type View = Mode | "cases"

const VIEWS: { id: View; n: string; name: string; dek: string }[] = [
  { id: "play", n: "01", name: "The table", dek: "Sit down against an oracle that learns you" },
  { id: "bench", n: "02", name: "The bench", dek: "Three theories, seven oracles, a thousand rounds" },
  { id: "cases", n: "03", name: "Case files", dek: "Ten problems that pull the theories apart" },
]

const INK: Record<Theory, string> = { cdt: "do(act)", edt: "given act", fdt: "do(algorithm)" }
const SLOGAN: Record<Theory, string> = {
  cdt: "What would my taking this cause?",
  edt: "What would my taking this tell me?",
  fdt: "What if my decision function output this, everywhere it's computed?",
}

/** Route state lives in the hash so a note can link straight to a case: /two-boxes#bomb. */
function readHash(): { view: View; caseId: CaseId } {
  const h = typeof location !== "undefined" ? location.hash.slice(1) : ""
  if (h in CASE) return { view: "cases", caseId: h as CaseId }
  if (h === "bench" || h === "cases") return { view: h, caseId: "damascus" }
  return { view: "play", caseId: "damascus" }
}

const NEWCOMB_NODES: Record<string, GraphNodeSpec> = Object.fromEntries(
  (Object.entries({ alg: [90, 36], act: [255, 36], pay: [375, 108], pred: [165, 168], box: [305, 168], gene: [44, 102], coin: [44, 168] }) as [NodeId, [number, number]][])
    .map(([n, [x, y]]) => [n, { label: NODE_LABEL[n], x, y }]),
)

export function TwoBoxesPage() {
  const [{ view, caseId }, setRoute] = useState(readHash)
  const [sid, setSid] = useState<ScenarioId>("classic")
  const [want, setWant] = useState<OracleId>("reader")
  const [p, setP] = useState(0.9)
  const [theory, setTheory] = useState<Theory>("fdt")
  const [history, setHistory] = useState<Round[]>(readRecord)
  const [seed, setSeed] = useState(1)

  const go = useCallback((v: View, c: CaseId = caseId) => {
    setRoute({ view: v, caseId: c })
    try { replaceHash(v === "play" ? "" : v === "cases" ? `#${c}` : "#bench") } catch { /* sandboxed frames */ }
  }, [caseId])

  // Follow hash-only navigation too (a link to /two-boxes#bomb from this page).
  useEffect(() => {
    const on = () => setRoute(readHash())
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])

  const mode: Mode = view === "bench" ? "bench" : "play"
  const oracles = ORACLE_ORDER.filter((o) => available(o, sid, mode))
  const oid = oracles.includes(want) ? want : oracles[0]
  const oracle = ORACLES[oid]
  const sc = SCENARIOS[sid]

  const [table, setTableState] = useState<Table>(() => setTable(sid, oid, history))
  const [seal, setSeal] = useState("")
  useEffect(() => {
    if (view !== "play") return
    setTableState((t) => (t.sid === sid && t.oid === oid && !t.taken ? t : setTable(sid, oid, history)))
    // history is read only to seed the reader's guess for the new table
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, oid, view])
  useEffect(() => {
    let live = true
    if (table.predicted) sha256(`${table.predicted}:${table.nonce}`).then((h) => live && setSeal(h))
    else setSeal("")
    return () => { live = false }
  }, [table.predicted, table.nonce])

  const record = readerRecord(history)
  const total = history.reduce((s, r) => s + payoff(r.act, r.full), 0)
  const beliefP = oid === "reader" ? record.accuracy : p

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
    if (view !== "play") return
    const onKey = (e: KeyboardEvent) => {
      // Typing, browser chords, and keys a focused control already handles (Enter/Space on a button) are not ours.
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(e.target.tagName))) return
      if (e.key === "1") take("one")
      else if (e.key === "2") take("two")
      else if ((e.key === "Enter" || e.key === " ") && table.taken) { e.preventDefault(); again() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [view, take, again, table.taken])

  const bench = useMemo(() => (view === "bench" ? runBench(sid, oid, p, BENCH_N, seed) : null), [view, sid, oid, p, seed])

  // With clear boxes, the theories decide on what you can see (or, on the bench, on seeing B full).
  const obs = sc.transparent ? (view === "play" && table.full === false ? "empty" : "full") : undefined
  const verdicts = THEORIES.map((t) => ({ t, d: decide(t, sid, oid, beliefP, obs) }))
  const shown = verdicts.find((v) => v.t === theory)!.d

  const roomPicker = (
    <div className={styles.roomPicker}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>The boxes</span>
        <div className={styles.segmented} role="radiogroup" aria-label="Boxes">
          {(Object.keys(SCENARIOS) as ScenarioId[]).map((s) => (
            <button key={s} role="radio" aria-checked={sid === s} data-active={sid === s || undefined} onClick={() => setSid(s)} title={SCENARIOS[s].about}>{SCENARIOS[s].name}</button>
          ))}
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>The oracle</span>
        <div className={styles.oracles} role="radiogroup" aria-label="Oracle">
          {oracles.map((o) => (
            <button key={o} role="radio" aria-checked={oid === o} data-active={oid === o || undefined} onClick={() => setWant(o)}>
              <span>{ORACLES[o].name}</span>
              <small>{LINK_WORD[ORACLES[o].link]}</small>
            </button>
          ))}
        </div>
      </div>
      {oracle.usesP && (
        <label className={styles.knob}>
          <span className={styles.knobLabel}>{oid === "lesion" ? "the gene goes with one-boxing" : "accuracy, p"} <b>{(p * 100).toFixed(1)}%</b></span>
          <input type="range" min={0.3} max={1} step={0.005} value={p} onChange={(e) => setP(+e.target.value)} aria-label="Oracle accuracy" />
        </label>
      )}
      <p className={styles.about}>{oracle.about}{sid !== "classic" && <> {sc.about}</>}</p>
    </div>
  )

  return (
    // data-fullbleed lifts the game stage's 960px cap; .page sets its own measure.
    <div data-fullbleed className={styles.shell}><div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.kicker}>Arcade · decision theory</p>
          <h1>Two Boxes</h1>
          <p className={styles.lede}>
            Box A holds <b>$1,000</b>. Box B holds <b>$1,000,000</b> if an oracle predicted you'd take B alone, and
            nothing if it predicted you'd take both. Every theory agrees on the payoffs. They disagree about one arrow:
            the one from you to the prediction.
          </p>
        </div>
        <ul className={styles.inks}>
          {THEORIES.map((t) => (
            <li key={t} data-t={t}>
              <span className={styles.inkName}>{THEORY_META[t].short}<small>{THEORY_META[t].name}</small></span>
              <code>{INK[t]}</code>
              <span className={styles.inkSlogan}>{SLOGAN[t]}</span>
            </li>
          ))}
        </ul>
      </header>

      <nav className={styles.views} aria-label="Two Boxes">
        {VIEWS.map((v) => (
          <button key={v.id} data-active={view === v.id || undefined} aria-current={view === v.id || undefined} onClick={() => go(v.id)}>
            <span className={styles.viewN}>{v.n}</span>
            <span className={styles.viewName}>{v.name}</span>
            <span className={styles.viewDek}>{v.dek}</span>
          </button>
        ))}
      </nav>

      {view === "cases" ? (
        <CaseFiles id={caseId} onPick={(c) => go("cases", c)} />
      ) : (
        <>
          <div className={styles.stageGrid}>
            <section className={styles.stage} aria-label={view === "play" ? "The table" : "The bench"}>
              {view === "play" ? (
                <PlayTable table={table} sc={sc} seal={seal} take={take} again={again} />
              ) : (
                bench && <Bench sid={sid} oid={oid} p={p} rows={bench} onRerun={() => setSeed((s) => s + 1)} />
              )}
            </section>
            <aside className={styles.side}>
              {roomPicker}
              {view === "play" && (
                <Ledger rounds={history.length} total={total} record={record} clear={sc.transparent} onForget={history.length ? forget : undefined} />
              )}
            </aside>
          </div>

          <section className={styles.reading} data-t={theory} aria-label="How each theory reads this room">
            <h3 className={styles.sectionHead}><span>How each theory reads this room</span><em>{sc.transparent ? `on seeing B ${obs}` : "the same payoffs, three different arrows"}</em></h3>
            <div className={styles.verdictTabs} role="tablist" aria-label="Decision theory">
              {verdicts.map(({ t, d }) => (
                <button key={t} role="tab" aria-selected={theory === t} data-t={t} data-active={theory === t || undefined} onClick={() => setTheory(t)}>
                  <span className={styles.vtName}>{THEORY_META[t].short}</span>
                  <span className={styles.vtAct}>takes {actWord(d.act)}</span>
                  <span className={styles.vtEv}>{money(d.ev[d.act])} expected</span>
                </button>
              ))}
            </div>
            <div className={styles.readingBody}>
              <div className={styles.readingGraph}>
                <TheoryGraph nodes={NEWCOMB_NODES} edges={graphFor(sid, oid)} roles={NEWCOMB_ROLES} theory={theory} />
                <p className={styles.legendLine}><i data-k="live" /> carries the choice <i data-k="cut" /> severed by do( ) <i data-k="same" /> same function</p>
              </div>
              <div className={styles.readingText}>
                <p className={styles.does}><b>{THEORY_META[theory].name}</b> decision theory {THEORY_META[theory].does}</p>
                <ol>{shown.working.map((w, i) => <li key={i}>{w}</li>)}</ol>
                {oid === "reader" && <p className={styles.note}>Using the Reader's record against you so far: {(record.accuracy * 100).toFixed(0)}%.</p>}
              </div>
            </div>
          </section>
        </>
      )}

      <footer className={styles.notes}>
        <div>
          <h3>How it works</h3>
          <p>
            The animated arrows are the ones a theory counts as carrying its choice to its winnings. Causal decision
            theory puts its hand on the act and cuts whatever flows into it; evidential decision theory conditions on
            the act, so everything upstream comes along; functional decision theory puts its hand on the algorithm,
            which includes every copy of it, such as the one the oracle consulted.
          </p>
          <p>
            At the table only honest oracles play: a web page can't be Laplace's demon. The Reader seals its guess (a
            SHA-256 of the guess and a random nonce, shown before you choose and opened after) and keeps your record in
            this browser. Like Nozick's predictor, which leaves B empty for anyone it expects to randomise, it fills B
            only for someone it expects to take B alone: never for a stranger (it wants to have seen you take B
            alone {READER_KNOWN === 2 ? "twice" : `${READER_KNOWN} times`}), and not for {READER_GRUDGE} rounds after you
            take both from a box it filled. Each round worth more than $1,000,000 buys {READER_GRUDGE} rounds worth at
            most $1,000, so it can't be played; it is deterministic in your record, so you can compute it exactly, and
            taking B alone still pays best.
          </p>
          <p>
            In the case files, "expects" is a theory's own expected value and "walks away with" is the average for
            agents who reason that way, across everyone who faces the case. The gap is the argument.
          </p>
        </div>
        <div>
          <h3>Reading</h3>
          <ul className={styles.refs}>
            <li>Nozick, "Newcomb's Problem and Two Principles of Choice" (1969)</li>
            <li>Gibbard &amp; Harper, "Counterfactuals and Two Kinds of Expected Utility" (1978)</li>
            <li>Lewis, "Why Ain'cha Rich?" (1981)</li>
            <li>Egan, "Some Counterexamples to Causal Decision Theory" (2007)</li>
            <li>Joyce, "Regret and Instability in Causal Decision Theory" (2012)</li>
            <li>Ahmed, "Dicing With Death" (2014)</li>
            <li>Yudkowsky &amp; Soares, "Functional Decision Theory" (2017)</li>
            <li>MacAskill, "A Critique of Functional Decision Theory" (2019)</li>
            <li>Levinstein &amp; Soares, <a href="https://intelligence.org/files/DeathInDamascus.pdf" target="_blank" rel="noreferrer" data-panel-ignore>"Cheating Death in Damascus"</a> (2020)</li>
            <li>MacDermott et al., "Characterising Decision Theories with Mechanised Causal Graphs" (2023)</li>
          </ul>
        </div>
      </footer>
    </div></div>
  )
}

function replaceHash(hash: string) {
  window.history.replaceState(window.history.state, "", location.pathname + location.search + hash)
}

const LINK_WORD: Record<string, string> = { subjunctive: "runs your reasoning", correlational: "a common cause", causal: "fills it afterwards", none: "a coin" }

// ── The table ───────────────────────────────────────────────────────────────

function PlayTable({ table, sc, seal, take, again }: { table: Table; sc: (typeof SCENARIOS)[ScenarioId]; seal: string; take: (a: Act) => void; again: () => void }) {
  const bVisible = sc.transparent || table.taken !== null
  const won = table.taken ? payoff(table.taken, !!table.full) : 0
  const shown = useTween(won, 700)
  return (
    <div className={styles.table}>
      <Boxes aVisible={sc.aVisible} bVisible={bVisible} bFull={table.full} taken={table.taken} clear={sc.transparent} />

      <p className={styles.seal}>
        {table.predicted
          ? table.taken
            ? <>It predicted <b>{actWord(table.predicted)}</b>{sc.transparent ? " (on seeing B full)" : ""}. Sealed as <code>sha256("{table.predicted}:{table.nonce}")</code> = <code>{seal.slice(0, 16)}…</code></>
            : <>{table.oid === "reader" ? "Its prediction, sealed before you chose" : "The box was filled before you sat down"} <code>{seal ? `${seal.slice(0, 16)}…` : "sealing…"}</code></>
          : <>Nothing is sealed. It will see what you take, then go back and fill the box.</>}
      </p>

      {!table.taken ? (
        <div className={styles.choose}>
          <button className={styles.action} data-act="one" onClick={() => take("one")}>
            <span className={styles.actionVerb}>Take B alone</span>
            <span className={styles.actionSub}>{sc.transparent ? (table.full ? "$1,000,000, leaving the $1,000" : "an empty box, on principle") : "$1,000,000 or nothing"}</span>
            <kbd>1</kbd>
          </button>
          <button className={styles.action} data-act="two" onClick={() => take("two")}>
            <span className={styles.actionVerb}>Take both</span>
            <span className={styles.actionSub}>{sc.transparent ? (table.full ? "$1,001,000, if it's still there" : "the $1,000 that's left") : "$1,000 more, whatever B holds"}</span>
            <kbd>2</kbd>
          </button>
        </div>
      ) : (
        <div className={styles.result} data-big={won >= BIG || undefined}>
          <p className={styles.won}>{money(shown)}</p>
          <p className={styles.resultLine}>
            B was {table.full ? "full" : "empty"}.{" "}
            {table.oid === "time-traveller"
              ? table.taken === "one" ? "You took B, so it was filled." : "You took both, so it was left empty."
              : sc.transparent
                ? table.full
                  ? table.taken === "one" ? "You left the $1,000 where it was." : "You took the $1,000 as well."
                  : table.taken === "one" ? "You took B alone from a box you could see was empty: $0, and the Reader saw you do it." : "With B empty, the $1,000 is all there is."
                : `Had you taken ${table.taken === "one" ? "both" : "B alone"}: ${money(payoff(table.taken === "one" ? "two" : "one", !!table.full))}${table.oid === "reader" ? ", if it had still guessed the same" : ""}.`}
          </p>
          {table.read && <p className={styles.why}>{readerWhy(table.read)}</p>}
          <button className={styles.ghost} onClick={again}>another round <kbd>↵</kbd></button>
        </div>
      )}
    </div>
  )
}

function Ledger({ rounds, total, record, clear, onForget }: { rounds: number; total: number; record: ReturnType<typeof readerRecord>; clear: boolean; onForget?: () => void }) {
  const be = clear ? BREAK_EVEN_CLEAR : BREAK_EVEN
  const tTotal = useTween(total, 700)
  return (
    <div className={styles.ledger}>
      <div className={styles.stats}>
        <div><small>rounds</small><b>{rounds}</b></div>
        <div><small>winnings</small><b>{money(tTotal)}</b></div>
        <div><small>a round</small><b>{money(rounds ? total / rounds : 0)}</b></div>
      </div>
      {record.n > 0 && (
        <div className={styles.meter}>
          <small>the Reader has read you right {record.hits} of {record.n}</small>
          <span className={styles.meterBar}>
            <span style={{ width: `${record.accuracy * 100}%` }} />
            <i style={{ left: `${be * 100}%` }} title="break-even" />
          </span>
          <p>{record.accuracy > be ? "Above break-even: against it, one-boxers average more." : "No better than a coin: against it, take both."}</p>
        </div>
      )}
      {onForget && <button className={styles.ghost} onClick={onForget} title="The Reader remembers you between visits; this clears its record">forget me</button>}
    </div>
  )
}

// ── The boxes ───────────────────────────────────────────────────────────────

function Bills({ x, y, n, cols }: { x: number; y: number; n: number; cols: number }) {
  return (
    <g className={styles.bills}>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x + (i % cols) * 22} y={y - Math.floor(i / cols) * 5} width={20} height={10} rx={1.5} className={styles.bill} style={{ animationDelay: `${i * 12}ms` }} />
      ))}
    </g>
  )
}

function Boxes({ aVisible, bVisible, bFull, taken, clear }: { aVisible: boolean; bVisible: boolean; bFull: boolean | null; taken: Act | null; clear: boolean }) {
  const aTaken = taken === "two"
  const bTaken = taken !== null
  const label = `Box A ${aVisible ? "shows $1,000" : "is closed"}; box B ${bVisible ? (bFull ? "holds $1,000,000" : "is empty") : "is closed"}.`
  return (
    <svg className={styles.boxes} viewBox="0 0 600 230" role="img" aria-label={label}>
      <ellipse cx={175} cy={205} rx={95} ry={8} className={styles.shadow} />
      <ellipse cx={425} cy={205} rx={95} ry={8} className={styles.shadow} />
      <g transform="translate(90,50)"><g data-taken={aTaken || undefined} className={styles.box}>
        <rect width={170} height={140} rx={6} className={aVisible ? styles.glass : styles.card} />
        {(aVisible || taken) && <Bills x={52} y={108} n={4} cols={3} />}
        {!aVisible && !taken && <text x={85} y={80} textAnchor="middle" className={styles.q}>?</text>}
        <text x={0} y={-12} className={styles.boxLabel}>A</text>
        <text x={170} y={-12} textAnchor="end" className={styles.boxSub}>$1,000</text>
      </g></g>
      <g transform="translate(340,50)"><g data-taken={bTaken || undefined} className={styles.box}>
        <rect width={170} height={140} rx={6} className={bVisible ? styles.glass : styles.card} />
        {bVisible && bFull && <Bills x={18} y={120} n={42} cols={6} />}
        {bVisible && bFull === false && <text x={85} y={80} textAnchor="middle" className={styles.empty}>empty</text>}
        {!bVisible && <text x={85} y={80} textAnchor="middle" className={styles.q}>?</text>}
        <text x={0} y={-12} className={styles.boxLabel}>B</text>
        <text x={170} y={-12} textAnchor="end" className={styles.boxSub}>{clear || bVisible ? (bFull ? "$1,000,000" : bFull === false ? "nothing" : "?") : "$1,000,000 or nothing"}</text>
      </g></g>
    </svg>
  )
}

// ── The bench ───────────────────────────────────────────────────────────────

function BenchFigure({ value }: { value: number }) {
  return <>{money(useTween(value, 600))}</>
}

function Bench({ sid, oid, p, rows, onRerun }: { sid: ScenarioId; oid: OracleId; p: number; rows: ReturnType<typeof runBench>; onRerun: () => void }) {
  const clear = SCENARIOS[sid].transparent
  const top = BIG + SMALL
  const best = Math.max(...THEORIES.map((t) => rows[t].mean))
  return (
    <div className={styles.bench}>
      <div className={styles.benchCards}>
        {THEORIES.map((t) => {
          const r = rows[t]
          const d = clear ? decide(t, sid, oid, p, "full") : decide(t, sid, oid, p)
          return (
            <div key={t} className={styles.benchCard} data-t={t} data-best={r.mean === best || undefined}>
              <span className={styles.vTheory}>{THEORY_META[t].short} <small>{THEORY_META[t].name}</small></span>
              <span className={styles.benchAct}>{clear ? `on seeing B full, takes ${actWord(d.act)}` : `takes ${actWord(d.act)}`}</span>
              <span className={styles.benchMoney}><BenchFigure value={r.mean} /></span>
              <span className={styles.benchSub}>a round · B full {(r.fullShare * 100).toFixed(0)}% of the time</span>
              <span className={styles.bar} title={`expected ${money(r.expected)}`}>
                <span style={{ width: `${(r.mean / top) * 100}%` }} />
                <i style={{ left: `${(r.expected / top) * 100}%` }} />
              </span>
            </div>
          )
        })}
      </div>
      <div className={styles.benchFoot}>
        <span>Average over {BENCH_N.toLocaleString()} rounds, the same coin tosses for all three; the tick is the exact expectation.</span>
        <button className={styles.ghost} onClick={onRerun}>run again</button>
      </div>
      {ORACLES[oid].usesP && <Sweep sid={sid} oid={oid} p={p} />}
    </div>
  )
}

function Sweep({ sid, oid, p }: { sid: ScenarioId; oid: OracleId; p: number }) {
  const W = 640, H = 230, L = 54, R = 64, T = 14, B = 30
  const lo = 0.3, hi = 1
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R)
  const y = (v: number) => T + (1 - v / (BIG + SMALL)) * (H - T - B)
  const steps = 140
  const line = (t: Theory) => Array.from({ length: steps + 1 }, (_, i) => {
    const v = lo + ((hi - lo) * i) / steps
    return `${i ? "L" : "M"}${x(v).toFixed(1)},${y(expected(t, sid, oid, v)).toFixed(1)}`
  }).join("")
  const be = SCENARIOS[sid].transparent ? BREAK_EVEN_CLEAR : BREAK_EVEN
  // End labels, nudged apart when two curves finish together.
  const ends = THEORIES.map((t) => ({ t, y: y(expected(t, sid, oid, hi)) })).sort((a, b) => a.y - b.y)
  ends.forEach((e, i) => { if (i && e.y - ends[i - 1].y < 13) e.y = ends[i - 1].y + 13 })
  return (
    <figure className={styles.sweepFig}>
      <figcaption>Expected winnings as the oracle's accuracy varies</figcaption>
      <svg className={styles.sweep} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Expected winnings for each theory as the oracle's accuracy varies">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(f * BIG)} y2={y(f * BIG)} className={styles.grid} />
            <text x={L - 8} y={y(f * BIG) + 4} textAnchor="end" className={styles.axis}>{f === 0 ? "$0" : f === 0.5 ? "$500k" : "$1M"}</text>
          </g>
        ))}
        {[0.3, 0.5, 0.7, 0.9, 1].map((v) => <text key={v} x={x(v)} y={H - 8} textAnchor="middle" className={styles.axis}>{v}</text>)}
        {oid !== "lesion" && (
          <g>
            <line x1={x(be)} x2={x(be)} y1={T} y2={H - B} className={styles.breakEven} />
            <text x={x(be) + 6} y={T + 10} className={styles.axis}>break-even {be.toFixed(4)}</text>
          </g>
        )}
        <line x1={x(p)} x2={x(p)} y1={T} y2={H - B} className={styles.now} />
        {THEORIES.map((t) => <path key={t} d={line(t)} className={styles.curve} data-t={t} />)}
        {ends.map((e) => <text key={e.t} x={W - R + 8} y={e.y + 4} className={styles.curveLabel} data-t={e.t}>{e.t.toUpperCase()}</text>)}
      </svg>
    </figure>
  )
}
