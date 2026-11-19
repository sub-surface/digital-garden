/**
 * Two Boxes: Newcomb's problem as a bench. Box A holds $1,000; box B holds
 * $1,000,000 if the oracle predicted you'd take B alone, otherwise nothing.
 * Take B, or take both.
 *
 * Three decision theories, each one function of the same inputs:
 *   CDT  intervenes on the act: the boxes are already filled, so B depends on
 *        the act only if the act causes the prediction (a time traveller).
 *   EDT  conditions on the act: B depends on the act whenever the act is
 *        evidence about the prediction (any oracle but a coin).
 *   FDT  intervenes on the algorithm: B depends on the act when the oracle's
 *        prediction is an output of the same function (or caused by the act),
 *        not when it merely correlates through a common cause (the lesion).
 * After Nozick 1969, Gibbard & Harper 1978, Lewis 1981, Yudkowsky & Soares
 * 2017, Levinstein & Soares 2020.
 *
 * What makes the bench worth having is that **how the oracle predicts** picks
 * the winner, so oracles carry a `link`. The simulator literally runs the
 * agent's own `decide` (subjunctive dependence made concrete); the reader is
 * the only oracle that can honestly predict a person, from their record.
 *
 * Pure; tested by scripts/test-games.ts.
 */
export const SMALL = 1_000
export const BIG = 1_000_000
/** The simulator's copy of you is this faithful (a little noise in the copy). */
export const SIM_FIDELITY = 0.99
/** Opaque B: one-boxing has the higher expectation when p·BIG > (1−p)·BIG + SMALL. */
export const BREAK_EVEN = (BIG + SMALL) / (2 * BIG)
/** Clear B: the policy "take B alone when it's full" pays when p(BIG − SMALL) > (1−p)·BIG. */
export const BREAK_EVEN_CLEAR = BIG / (2 * BIG - SMALL)

export type Act = "one" | "two"
export type Obs = "full" | "empty"
import { THEORIES, countedOf, handleOf, type Edge as CausalEdge, type EdgeKind, type Roles, type Theory } from "./causal"
export { THEORIES }
export type { Theory }
export type ScenarioId = "classic" | "closed" | "clear"
export type OracleId = "reader" | "laplace" | "psychologist" | "simulator" | "lesion" | "time-traveller" | "oblivious"
export type Link = "subjunctive" | "correlational" | "causal" | "none"
export type Mode = "play" | "bench"


export const THEORY_META: Record<Theory, { name: string; short: string; does: string }> = {
  cdt: { name: "Causal", short: "CDT", does: "intervenes on the act: what would my taking this cause?" },
  edt: { name: "Evidential", short: "EDT", does: "conditions on the act: what would my taking this tell me?" },
  fdt: { name: "Functional", short: "FDT", does: "intervenes on its own algorithm: what if my decision function output this, everywhere it's computed?" },
}

export interface Scenario { id: ScenarioId; name: string; about: string; transparent: boolean; aVisible: boolean }

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  classic: { id: "classic", name: "Classic", about: "Nozick's setup: A is clear and shows $1,000, B is closed.", transparent: false, aVisible: true },
  closed: { id: "closed", name: "Both closed", about: "Neither box shows its contents. A control: seeing the $1,000 changes nothing.", transparent: false, aVisible: false },
  clear: { id: "clear", name: "Both clear", about: "You can see whether B is full before you choose. The oracle fills B if it predicts you'd take B alone on seeing it full.", transparent: true, aVisible: true },
}

export interface Oracle {
  id: OracleId
  name: string
  about: string
  link: Link
  /** Its accuracy is the slider, p. */
  usesP: boolean
  modes: Mode[]
  /** Can run with both boxes clear (the time traveller can't: a causal loop). */
  clear: boolean
}

export const ORACLES: Record<OracleId, Oracle> = {
  reader: {
    id: "reader", name: "The Reader", link: "subjunctive", usesP: false, modes: ["play"], clear: true,
    about: "Predicts you from your record with it: what you take, and what you take after a full or an empty box. It doesn't fill B for strangers, and if you take both from a box it filled it won't fill another for twenty rounds. It seals its guess before you choose, and it remembers you between visits.",
  },
  laplace: {
    id: "laplace", name: "Laplace's demon", link: "subjunctive", usesP: false, modes: ["bench"], clear: true,
    about: "Knows the state of the world and the laws. Never wrong. The classic thought experiment.",
  },
  psychologist: {
    id: "psychologist", name: "The psychologist", link: "subjunctive", usesP: true, modes: ["bench"], clear: true,
    about: "Reads your disposition and is right with probability p. At p = 0.5 it is a coin with a clipboard.",
  },
  simulator: {
    id: "simulator", name: "The simulator", link: "subjunctive", usesP: false, modes: ["bench"], clear: true,
    about: "Runs a copy of your decision procedure and fills the box by its output (with 1% noise in the copy). Yudkowsky's framing: the prediction is your decision, computed early.",
  },
  lesion: {
    id: "lesion", name: "The lesion", link: "correlational", usesP: true, modes: ["play", "bench"], clear: true,
    about: "Reads a gene that, across the population, goes with one-boxing p of the time. The gene fills the box; it doesn't touch an agent who decides by calculation. (EDT's defenders answer with the tickle defence: once you know your own reasons, the gene tells you nothing more, and EDT takes both too. The bench shows naive EDT.)",
  },
  "time-traveller": {
    id: "time-traveller", name: "The time traveller", link: "causal", usesP: false, modes: ["play", "bench"], clear: false,
    about: "Watches what you take, then goes back and fills the box. Here your choice really does cause the contents. (With both boxes clear it would be a causal loop, so it sits that one out.)",
  },
  oblivious: {
    id: "oblivious", name: "The coin", link: "none", usesP: false, modes: ["play", "bench"], clear: true,
    about: "Fills B on a coin toss. Nothing you do or are has anything to do with it.",
  },
}

export function available(oid: OracleId, sid: ScenarioId, mode: Mode): boolean {
  const o = ORACLES[oid]
  return o.modes.includes(mode) && (o.clear || !SCENARIOS[sid].transparent)
}

/** The accuracy an agent attributes to the oracle. `p` is the slider (or the reader's record). */
export function belief(oid: OracleId, p: number): number {
  switch (oid) {
    case "laplace":
    case "time-traveller": return 1
    case "simulator": return SIM_FIDELITY
    case "oblivious": return 0.5
    default: return p
  }
}

/** Does this theory treat B's contents as depending on its choice, given how the oracle predicts? */
export function tracks(theory: Theory, link: Link): boolean {
  if (theory === "cdt") return link === "causal"
  if (theory === "edt") return link !== "none"
  return link === "subjunctive" || link === "causal"
}

export function money(x: number): string {
  return "$" + Math.round(x).toLocaleString("en-US")
}

const pct = (q: number) => `${+(q * 100).toFixed(2)}%`

export interface Decision { act: Act; ev: Record<Act, number>; working: string[] }

/**
 * What a theory takes, with its expected values and its reasoning in words.
 * Clear boxes need `obs` (what the agent sees in B).
 */
export function decide(theory: Theory, sid: ScenarioId, oid: OracleId, p: number, obs?: Obs): Decision {
  const sc = SCENARIOS[sid]
  const o = ORACLES[oid]
  const q = belief(oid, p)
  const dep = tracks(theory, o.link)
  const pick = (ev: Record<Act, number>): Act => (ev.one > ev.two ? "one" : "two")

  if (sc.transparent) {
    if (!obs) throw new Error("clear boxes: decide needs what the agent sees")
    if (theory === "fdt" && dep) {
      // FDT chooses a policy before looking: what to do on seeing B full. The
      // oracle fills B exactly when it predicts that policy says "one".
      const keep = q * BIG + (1 - q) * SMALL // right → full, take B; wrong → empty, take both
      const grab = q * SMALL + (1 - q) * (BIG + SMALL) // right → empty, take both; wrong → full, take both
      const policy: Act = keep > grab ? "one" : "two"
      const working = [
        `I choose a policy, not an act: what my function outputs on seeing B full, wherever it's computed, including inside the oracle's prediction.`,
        `"Take B alone when it's full": the oracle is right ${pct(q)} of the time, so ${money(keep)}.`,
        `"Take both when it's full": ${money(grab)}.`,
      ]
      if (obs === "full") return { act: policy, ev: { one: keep, two: grab }, working: [...working, policy === "one" ? "So I take B alone, though I can see the $1,000 I'm leaving." : "The oracle isn't reliable enough to be worth it. Both."] }
      const empty = policy === "one"
        ? `B is empty, so the oracle got my policy wrong (${q === 1 ? "a perfect one never would: for me this branch can't happen" : `it does, ${pct(1 - q)} of the time`}). What I do here feeds no prediction of me on seeing B full, so: both.`
        : "B is empty, as my policy expected. Both."
      return { act: "two", ev: { one: 0, two: SMALL }, working: [...working, empty] }
    }
    const b = obs === "full" ? BIG : 0
    const why = theory === "cdt"
      ? "The box's contents are fixed and in front of me; nothing I do now changes them."
      : theory === "edt"
        ? "I can see what's in B, so my choice carries no further news about it."
        : "The oracle's guess doesn't run through my decision function, so it's just a fact about the room."
    return { act: "two", ev: { one: b, two: b + SMALL }, working: [why, `B alone: ${money(b)}. Both: ${money(b + SMALL)}. Both.`] }
  }

  if (dep) {
    const ev = { one: q * BIG, two: (1 - q) * BIG + SMALL }
    const act = pick(ev)
    const lead = theory === "cdt"
      ? "The oracle fills B after it sees my choice, so my choice causes what's in B."
      : theory === "edt"
        ? `Taking B alone is evidence the oracle predicted it: P(full | B alone) = ${pct(q)}, P(full | both) = ${pct(1 - q)}.`
        : o.link === "causal"
          ? "My choice causes the contents, so whatever my function outputs is what B was filled for."
          : `The prediction is computed from my decision function, so whatever I output, it output too (${pct(q)} of the time).`
    return { act, ev, working: [lead, `B alone: ${money(ev.one)}. Both: ${money(ev.two)}.`, act === "one" ? "So B alone." : "So both: the link is too weak to be worth $1,000."] }
  }

  // B is independent of the act: dominance. Whatever B holds, both is $1,000 more.
  const ev = { one: 0.5 * BIG, two: 0.5 * BIG + SMALL }
  const lead = theory === "cdt"
    ? "The boxes are already filled; nothing I do now reaches back to change them."
    : theory === "edt"
      ? "The coin settled B; my choice tells me nothing about it."
      : o.link === "correlational"
        ? "The gene fills the box, not my function: intervening on my algorithm leaves the gene, and B, where they were."
        : "Nothing about my function went into filling B."
  return { act: "two", ev, working: [lead, "Whatever B holds, both boxes hold $1,000 more. Both."] }
}

// ── Running the oracle ──────────────────────────────────────────────────────

export function flip(a: Act): Act {
  return a === "one" ? "two" : "one"
}

/** Seeded PRNG (mulberry32). */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The oracle's possible predictions with their probabilities, given what the agent's function outputs. */
export function predictions(oid: OracleId, target: Act, p: number): [Act, number][] {
  switch (oid) {
    case "laplace":
    case "time-traveller": return [[target, 1]]
    case "psychologist": return [[target, p], [flip(target), 1 - p]]
    case "simulator": return [[target, SIM_FIDELITY], [flip(target), 1 - SIM_FIDELITY]]
    case "lesion":
    case "oblivious": return [["one", 0.5], ["two", 0.5]]
    case "reader": throw new Error("the reader predicts people, not theories: use readerPredict")
  }
}

export function payoff(act: Act, full: boolean): number {
  return (full ? BIG : 0) + (act === "two" ? SMALL : 0)
}

export interface Trial { predicted: Act; full: boolean; act: Act; payoff: number }

/** The agent's function, as the oracle and the room both see it. */
function agent(theory: Theory, sid: ScenarioId, oid: OracleId, p: number) {
  const clear = SCENARIOS[sid].transparent
  return {
    /** What the oracle predicts: the act (or, with clear boxes, the act on seeing B full). */
    target: clear ? decide(theory, sid, oid, p, "full").act : decide(theory, sid, oid, p).act,
    act: (full: boolean) => (clear ? decide(theory, sid, oid, p, full ? "full" : "empty").act : decide(theory, sid, oid, p).act),
  }
}

export function runTrial(theory: Theory, sid: ScenarioId, oid: OracleId, p: number, rng: () => number): Trial {
  const a = agent(theory, sid, oid, p)
  let r = rng()
  let predicted: Act = "two"
  for (const [guess, w] of predictions(oid, a.target, p)) {
    predicted = guess
    if ((r -= w) < 0) break
  }
  const full = predicted === "one"
  const act = a.act(full)
  return { predicted, full, act, payoff: payoff(act, full) }
}

/** Exact expected winnings per round (enumerating the oracle's branches). */
export function expected(theory: Theory, sid: ScenarioId, oid: OracleId, p: number): number {
  const a = agent(theory, sid, oid, p)
  return predictions(oid, a.target, p).reduce((s, [guess, w]) => {
    const full = guess === "one"
    return s + w * payoff(a.act(full), full)
  }, 0)
}

export interface BenchRow { mean: number; expected: number; oneShare: number; hits: number; n: number; fullShare: number }

export function runBench(sid: ScenarioId, oid: OracleId, p: number, n: number, seed: number): Record<Theory, BenchRow> {
  const out = {} as Record<Theory, BenchRow>
  // Paired rounds: every theory meets the same coin tosses, so the gap between
  // them is the theories' doing, not sampling noise (with the lesion it is
  // exactly $1,000, far inside the noise of 1,000 independent rounds).
  THEORIES.forEach((t) => {
    const rng = rngFrom(seed)
    let total = 0, ones = 0, hits = 0, fulls = 0
    for (let i = 0; i < n; i++) {
      const tr = runTrial(t, sid, oid, p, rng)
      total += tr.payoff
      if (tr.act === "one") ones++
      if (tr.full) fulls++
      // With clear boxes the oracle predicts the act on seeing B full.
      const target = SCENARIOS[sid].transparent ? decide(t, sid, oid, p, "full").act : tr.act
      if (tr.predicted === target) hits++
    }
    out[t] = { mean: total / n, expected: expected(t, sid, oid, p), oneShare: ones / n, hits, n, fullShare: fulls / n }
  })
  return out
}

// ── The reader: an oracle for a person ──────────────────────────────────────

export interface Round {
  scenario: ScenarioId
  oracle: OracleId
  act: Act
  full: boolean
  /** The reader's guess (when it was the oracle). */
  predicted?: Act
}

const DECAY = 0.85
const PRIOR = 2
/** Rounds of B alone the Reader must see before it fills B for you. */
export const READER_KNOWN = 2
/** Rounds the Reader leaves B empty after you take both from a box it filled. */
export const READER_GRUDGE = 20

export type ReaderWhy = "stranger" | "grudge" | "record"

export interface ReaderRead {
  predicted: Act
  /** The record's estimate that you take B alone. */
  pOne: number
  why: ReaderWhy
  /** Times it has seen you take B alone. */
  known: number
  /** Rounds with it still to go before a grudge lapses (for "grudge"). */
  grudgeLeft: number
}

/**
 * Whether a round says anything about you. With clear boxes showing B empty,
 * taking both is what everyone does, so it says nothing; taking B alone from
 * a box you can see is empty says a great deal (you gave up $1,000 to be the
 * kind of agent who takes B alone).
 */
function informative(r: Round): boolean {
  return !(SCENARIOS[r.scenario].transparent && !r.full && r.act === "two")
}

/**
 * The Reader predicts a person, and fills B only for someone it expects to
 * take B alone. It reads only the rounds it played (against the coin or the
 * lesion, taking both is right for everyone, so those rounds say nothing).
 * Three clauses, after Nozick's predictor, which leaves B empty for anyone it
 * expects to randomise:
 *
 *   1. Strangers get an empty box: it has to have seen you take B alone
 *      READER_KNOWN times (forgetting you makes you a stranger again).
 *   2. A grudge: if in your last READER_GRUDGE rounds with it you took both
 *      from a box it had filled, it expects you to again.
 *   3. Otherwise it goes by your record (see readRecord).
 *
 * Clause 2 is what makes it unexploitable. The only round worth more than
 * $1,000,000 is taking both from a full box (+$1,000), and each one buys
 * READER_GRUDGE rounds worth at most $1,000. So no way of playing it averages
 * more than taking B alone every time, however well you can predict it (it
 * is deterministic, and its whole input, your record, is yours to read).
 * scripts/test-games.ts checks this exhaustively over short games.
 */
export function readerPredict(history: Round[]): ReaderRead {
  const mine = history.filter((r) => r.oracle === "reader")
  const pOne = readRecord(mine.filter(informative))
  const known = mine.filter((r) => r.act === "one").length
  const read = (predicted: Act, why: ReaderWhy, grudgeLeft = 0): ReaderRead => ({ predicted, pOne, why, known, grudgeLeft })
  if (known < READER_KNOWN) return read("two", "stranger")
  const recent = mine.slice(-READER_GRUDGE)
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].full && recent[i].act === "two") return read("two", "grudge", READER_GRUDGE - (recent.length - 1 - i))
  }
  return read(pOne >= 0.5 ? "one" : "two", "record")
}

/**
 * The record's estimate that you take B alone. Two ingredients, blended: how
 * often you take B alone (recent rounds count more), and what you did after
 * the same situation as last round (your last act, and whether B was full).
 */
function readRecord(rounds: Round[]): number {
  let w = 1, one = 0, all = 0
  for (let i = rounds.length - 1; i >= 0; i--, w *= DECAY) {
    all += w
    if (rounds[i].act === "one") one += w
  }
  const base = (one + 0.5 * PRIOR) / (all + PRIOR)
  const last = rounds[rounds.length - 1]
  if (!last) return 0.5
  let cOne = 0, cAll = 0
  for (let i = 1; i < rounds.length; i++) {
    const prev = rounds[i - 1]
    if (prev.act === last.act && prev.full === last.full) {
      cAll++
      if (rounds[i].act === "one") cOne++
    }
  }
  return (cOne + base * PRIOR) / (cAll + PRIOR)
}

/** The reader's track record, as a belief: (hits + 1) / (n + 2). */
export function readerRecord(history: Round[]): { hits: number; n: number; accuracy: number } {
  // With clear boxes it predicts what you'd do on seeing B full, so a round
  // that showed B empty can't be scored: you never faced the full box.
  const scored = history.filter((r) => r.oracle === "reader" && r.predicted && !(SCENARIOS[r.scenario].transparent && !r.full))
  const hits = scored.filter((r) => r.predicted === r.act).length
  return { hits, n: scored.length, accuracy: (hits + 1) / (scored.length + 2) }
}

// ── The causal picture ──────────────────────────────────────────────────────

export type NodeId = "alg" | "act" | "pred" | "box" | "pay" | "gene" | "coin"
export type Edge = CausalEdge<NodeId>
export type { EdgeKind }

export const NODE_LABEL: Record<NodeId, string> = {
  alg: "your algorithm",
  act: "what you take",
  pred: "the prediction",
  box: "box B",
  pay: "your winnings",
  gene: "the gene",
  coin: "a coin",
}

export const NEWCOMB_ROLES: Roles<NodeId> = { act: "act", alg: "alg", pay: "pay" }

/** The scenario as a graph: how the prediction connects to you, and what you can see. */
export function graphFor(sid: ScenarioId, oid: OracleId): Edge[] {
  const e: Edge[] = [
    { from: "alg", to: "act", kind: "cause" },
    { from: "act", to: "pay", kind: "cause" },
    { from: "pred", to: "box", kind: "cause" },
    { from: "box", to: "pay", kind: "cause" },
  ]
  const link = ORACLES[oid].link
  if (link === "subjunctive") e.push({ from: "alg", to: "pred", kind: "same" })
  if (link === "causal") e.push({ from: "act", to: "pred", kind: "retro" })
  if (link === "correlational") e.push({ from: "gene", to: "pred", kind: "cause" }, { from: "gene", to: "alg", kind: "inclines" })
  if (link === "none") e.push({ from: "coin", to: "pred", kind: "cause" })
  if (SCENARIOS[sid].transparent) e.push({ from: "box", to: "act", kind: "see" })
  return e
}

/** Where the theory puts its hand on the graph. */
export function handle(theory: Theory, edges: Edge[]): NodeId[] {
  return handleOf(theory, edges, NEWCOMB_ROLES)
}

/** The edges a theory counts as carrying its choice to its winnings (see causal.ts). */
export function counted(theory: Theory, edges: Edge[]): Edge[] {
  return countedOf(theory, edges, NEWCOMB_ROLES)
}
