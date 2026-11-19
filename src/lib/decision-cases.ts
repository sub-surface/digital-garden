/**
 * Case files: the decision problems that separate CDT, EDT and FDT, each as a
 * small causal model with its payoffs. Mostly after Levinstein & Soares,
 * "Cheating Death in Damascus" (J. Phil. 2020), plus the cases FDT's critics
 * press back with (MacAskill's Bomb; Nesov's counterfactual mugging).
 *
 * Every verdict reports two numbers:
 *   ev        what the theory expects, by its own lights;
 *   realised  what agents who reason that way actually walk away with, on
 *             average, across everyone who faces the case.
 * The gap between them is the whole argument. Pure; tested by
 * scripts/test-games.ts against the paper's own numbers.
 */
import { deliberate, type Edge, type Roles, type Theory } from "./causal"

export type CaseId = "twin" | "xor" | "damascus" | "coin" | "olympus" | "psychopath" | "murder" | "hitchhiker" | "mugging" | "bomb"
export type Group = "death" | "promises" | "critics"

export const GROUPS: { id: Group; title: string; dek: string }[] = [
  { id: "death", title: "Death and its cousins", dek: "Unstable problems: the more sure you are what you'll do, the worse it looks. The paper's case against CDT." },
  { id: "promises", title: "Copies, letters and lifts", dek: "When someone else runs a copy of your reasoning, a promise, a threat or a twin is a fact about your algorithm." },
  { id: "critics", title: "The critics' cases", dek: "Where FDT's answer is the strange one. Choosing a policy before looking means honouring it after looking." },
]

export interface GraphNode { label: string; x: number; y: number }

export type Param =
  | { kind: "range"; key: string; label: string; min: number; max: number; step: number; value: number; log?: boolean; unit?: "p" | "$" | "x" }
  | { kind: "choice"; key: string; label: string; options: string[]; value: number }

export interface Verdict {
  /** A short verb phrase: "stays", "pays", "cooperates". */
  choice: string
  /** Probability of the case's first act, when the theory randomises. */
  mixed?: number
  ev: number
  realised: number
  working: string[]
}

export interface Deliberation {
  acts: [string, string]
  p0: number
  k: number
  steps: number
  u: (p: number) => [number, number]
}

export interface DecisionCase {
  id: CaseId
  group: Group
  title: string
  /** One line under the title. */
  dek: string
  source: string
  /** Whose counterexample it is. */
  against: Theory
  story: string[]
  /** Payoff table: column heads, then rows of [row label, ...cells]. */
  table: { head: string[]; rows: string[][] }
  nodes: Record<string, GraphNode>
  edges: (v: Values) => Edge[]
  roles: Roles
  params: Param[]
  verdicts: (v: Values) => Record<Theory, Verdict>
  deliberation?: (v: Values) => Deliberation
  /** Units for ev/realised. */
  unit: "$" | "$M" | "utils"
  takeaway: string
}

export type Values = Record<string, number>

export function defaults(c: DecisionCase): Values {
  return Object.fromEntries(c.params.map((p) => [p.key, p.value]))
}

const $ = (x: number) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US")
const pc = (q: number, d = 1) => `${+(q * 100).toFixed(d)}%`

/** Where Joyce's deliberation settles (run well past the animated steps). */
export function equilibrium(d: Deliberation): number {
  const run = deliberate(d.u, d.p0, d.k, 4000)
  return run[run.length - 1].p
}

// ── Death and its cousins ───────────────────────────────────────────────────

const LIFE = 1000

const damascusU = (p: number): [number, number] => [LIFE * (1 - p), LIFE * p - 1]

const deathNodes: Record<string, GraphNode> = {
  alg: { label: "your algorithm", x: 80, y: 40 },
  act: { label: "where you go", x: 250, y: 40 },
  death: { label: "Death's city", x: 165, y: 160 },
  pay: { label: "you live?", x: 370, y: 110 },
}
const deathEdges = (): Edge[] => [
  { from: "alg", to: "act", kind: "cause" },
  { from: "alg", to: "death", kind: "same" },
  { from: "act", to: "pay", kind: "cause" },
  { from: "death", to: "pay", kind: "cause" },
]
const ROLES: Roles = { act: "act", alg: "alg", pay: "pay" }

const damascus: DecisionCase = {
  id: "damascus", group: "death", against: "cdt", unit: "$",
  title: "Death in Damascus",
  dek: "Death has already written down where you'll be. Fleeing costs a dollar.",
  source: "Gibbard & Harper 1978; asymmetric version in Levinstein & Soares 2020",
  story: [
    "Death knocks: I am coming for you tomorrow. He made his prediction yesterday, he never misses, and he can't change it now. You value your life at $1,000. You can stay in Damascus, or pay $1 to flee to Aleppo.",
    "Whatever you settle on, he is already there. The question is what a theory does with that.",
  ],
  table: { head: ["", "Death in Damascus", "Death in Aleppo"], rows: [["stay", "die: $0", "live: $1,000"], ["flee (−$1)", "live: $999", "die: −$1"]] },
  nodes: deathNodes, edges: deathEdges, roles: ROLES,
  params: [{ kind: "range", key: "p0", label: "CDT starts out", min: 0.02, max: 0.98, step: 0.01, value: 0.9, unit: "p" }],
  deliberation: (v) => ({ acts: ["stay", "flee"], p0: v.p0, k: 0.00012, steps: 80, u: damascusU }),
  verdicts: (v) => {
    const p = equilibrium(damascus.deliberation!(v))
    const [us] = damascusU(p)
    return {
      cdt: {
        choice: `stays ${pc(p, 2)} of the time`, mixed: p, ev: us, realised: -(1 - p),
        working: [
          "Death's city is fixed; where I go can't move him. So whichever city I think I'll pick, the other looks better.",
          `Deliberation settles where the two balance: stay with probability ${pc(p, 2)}, flee otherwise, each worth ${$(us)} by my lights.`,
          "And then I die, wherever the coin sends me, a dollar poorer half the time.",
        ],
      },
      edt: { choice: "stays", ev: 0, realised: 0, working: ["If I stay, Death is in Damascus; if I flee, he's in Aleppo. I die either way.", "Staying is free. Stay."] },
      fdt: { choice: "stays", ev: 0, realised: 0, working: ["Death's prediction is my algorithm's output, computed early. Whatever I output, he is there.", "Dying for free beats dying for $1. Stay."] },
    }
  },
  takeaway: "CDT expects $499.50 and gets −$0.50. Its counterfactual (\"had I gone the other way, I'd have lived\") is true every time and never helps.",
}

const coinU = (p: number): [number, number] => [LIFE * (1 - p), LIFE * p]
const coin: DecisionCase = {
  id: "coin", group: "death", against: "cdt", unit: "$",
  title: "Random Coin",
  dek: "Fleeing is free now, and a stranger sells a truly random coin for $1.",
  source: "Ahmed 2014, \"Dicing With Death\"",
  story: [
    "As before, Death has predicted your city and can't change it. This time fleeing to Aleppo is free, and Rhinehart offers you a genuinely indeterministic coin for $1. Death can predict whether you buy it, but not how it lands.",
    "Without the coin you die for certain. With it, you live half the time.",
  ],
  table: { head: ["", "Death guessed right", "Death guessed wrong"], rows: [["stay or flee", "die: $0", "never happens"], ["buy the coin (−$1)", "die: −$1 (half)", "live: $999 (half)"]] },
  nodes: { ...deathNodes, coin: { label: "the coin", x: 330, y: 172 } },
  edges: () => [...deathEdges(), { from: "coin", to: "act", kind: "cause" }],
  roles: ROLES,
  params: [{ kind: "range", key: "p0", label: "CDT starts out", min: 0.02, max: 0.98, step: 0.01, value: 0.8, unit: "p" }],
  deliberation: (v) => ({ acts: ["stay", "flee"], p0: v.p0, k: 0.00012, steps: 80, u: coinU }),
  verdicts: (v) => {
    const p = equilibrium(coin.deliberation!(v))
    const [u] = coinU(p)
    const buy = 0.5 * LIFE - 1
    return {
      cdt: {
        choice: "won't buy the coin", ev: u, realised: 0,
        working: [
          `Where I go can't move Death, so staying and fleeing are each worth about ${$(u)} at equilibrium.`,
          `The coin costs $1 and changes nothing Death has done: ${$(buy)}. Don't buy it.`,
          "Then die, for certain.",
        ],
      },
      edt: { choice: "buys the coin", ev: buy, realised: buy, working: ["Without the coin, my choice tells me where Death is: I die.", `With it, half the time I'm somewhere he isn't: ${$(buy)}. Buy.`] },
      fdt: { choice: "buys the coin", ev: buy, realised: buy, working: ["Without the coin, Death's guess is my output. Unpredictability is the only thing my algorithm can buy.", `${$(buy)} beats certain death. Buy.`] },
    }
  },
  takeaway: "Every CDT agent dies; everyone else lives half the time. Making yourself opaque to a predictor has value CDT's graph can't see.",
}

const olympus: DecisionCase = {
  id: "olympus", group: "death", against: "cdt", unit: "$",
  title: "Death on Olympus",
  dek: "A third option, worse than both others in every world CDT can imagine.",
  source: "Levinstein & Soares 2020",
  story: [
    "Three options now: stay in Damascus, go to Aleppo (free), or pay $1,001 to climb Mount Olympus. Immortality is worth $1,000 to you. But if you die on Olympus, you get to talk with the gods, and that's worth $1,501.",
    "So dying on the mountain nets $500, and surviving up there costs you $1.",
  ],
  table: { head: ["", "Death in Damascus", "in Aleppo", "on Olympus"], rows: [["Damascus", "$0", "$1,000", "$1,000"], ["Aleppo", "$1,000", "$0", "$1,000"], ["Olympus", "−$1", "−$1", "$500"]] },
  nodes: deathNodes, edges: deathEdges, roles: ROLES,
  params: [{ kind: "range", key: "p0", label: "CDT starts out", min: 0.02, max: 0.98, step: 0.01, value: 0.7, unit: "p" }],
  deliberation: (v) => ({ acts: ["Damascus", "Aleppo"], p0: v.p0, k: 0.00012, steps: 80, u: coinU }),
  verdicts: () => ({
    cdt: {
      choice: "Damascus or Aleppo", mixed: 0.5, ev: 500, realised: 0,
      working: ["Wherever Death is, staying or fleeing beats the climb: Olympus is causally dominated, so it's out.", "Between the cities, deliberation settles at a coin toss.", "Death is in whichever I pick. $0."],
    },
    edt: { choice: "climbs Olympus", ev: 500, realised: 500, working: ["Choosing a city is evidence Death is there: $0.", "Choosing Olympus is evidence he's on Olympus: $500. Climb."] },
    fdt: { choice: "climbs Olympus", ev: 500, realised: 500, working: ["Death runs my algorithm. Whatever I output, he goes there.", "So the only question is where I'd rather die. Olympus: $500."] },
  }),
  takeaway: "The best option is one CDT is committed to calling dominated. No version of standard CDT escapes this one.",
}

const psychopathU = (p: number): [number, number] => {
  const psycho = 0.01 + 0.9 * p
  return [10 - 110 * psycho, 0]
}
const psychopath: DecisionCase = {
  id: "psychopath", group: "death", against: "cdt", unit: "utils",
  title: "Psychopath Button",
  dek: "Pressing kills every psychopath. Only a psychopath would press.",
  source: "Egan 2007",
  story: [
    "You could press a button that kills all psychopaths, and you think the world would be better without them. But you're fairly sure only a psychopath would press it, and you'd much rather live in a world with psychopaths than die.",
  ],
  table: { head: ["", "you're a psychopath", "you're not"], rows: [["press", "you die: −100", "a better world: +10"], ["don't", "0", "0"]] },
  nodes: {
    alg: { label: "your algorithm", x: 80, y: 40 },
    act: { label: "press?", x: 250, y: 40 },
    psy: { label: "being a psychopath", x: 175, y: 160 },
    pay: { label: "outcome", x: 375, y: 110 },
  },
  edges: () => [
    { from: "alg", to: "act", kind: "cause" },
    { from: "alg", to: "psy", kind: "same" },
    { from: "psy", to: "act", kind: "inclines" },
    { from: "act", to: "pay", kind: "cause" },
    { from: "psy", to: "pay", kind: "cause" },
  ],
  roles: ROLES,
  params: [{ kind: "range", key: "p0", label: "CDT starts out", min: 0.02, max: 0.98, step: 0.01, value: 0.5, unit: "p" }],
  deliberation: (v) => ({ acts: ["press", "don't"], p0: v.p0, k: 0.05, steps: 60, u: psychopathU }),
  verdicts: (v) => {
    const p = equilibrium(psychopath.deliberation!(v))
    return {
      cdt: {
        choice: `presses ${pc(p)} of the time`, mixed: p, ev: 0, realised: -100 * p,
        working: [
          "Whether I'm a psychopath is fixed; pressing can't change it. But the surer I am that I'll press, the surer I am that I am one.",
          `Deliberation balances at pressing ${pc(p)} of the time, where pressing and not are both worth 0 to me.`,
          "If pressing is what makes you a psychopath, that's a death sentence nine times in a hundred.",
        ],
      },
      edt: { choice: "doesn't press", ev: 0, realised: 0, working: ["Pressing would be strong evidence I'm a psychopath: about −100.", "Don't."] },
      fdt: { choice: "doesn't press", ev: 0, realised: 0, working: ["Being a psychopath just is being disposed to act like this. If my algorithm pressed, I'd be one.", "So pressing kills me. Don't. No ratification needed."] },
    }
  },
  takeaway: "Egan's case against CDT. A Joycean CDT gets close, by trembling; FDT gets there by noticing that a disposition isn't a fact outside your choice.",
}

const murderU = (p: number): [number, number] => [10 - 40 * p, 0]
const murder: DecisionCase = {
  id: "murder", group: "death", against: "fdt", unit: "utils",
  title: "Murder Lesion",
  dek: "A lesion steadies your nerve and shakes your hand. Shoot the despot?",
  source: "Joyce 2012; FDT's reply in Levinstein & Soares 2020 §5.3",
  story: [
    "Your country would be better off if you shot the despot. One person in five has a lesion that both makes them willing to shoot and makes their hands tremble: they always miss, and a miss makes things much worse. People without it rarely shoot, but never miss.",
    "It looks like a counterexample to FDT: if the lesion sits upstream of your algorithm, intervening on the algorithm should look just like CDT. The paper's reply: the lesion can't change the output of a fixed function. It can only take over the trigger finger some of the time, and when it does, nothing you decide matters.",
  ],
  table: { head: ["", "lesion (20%)", "no lesion"], rows: [["shoot", "miss: −30", "hit: +10"], ["don't", "0", "0"]] },
  nodes: {
    lesion: { label: "the lesion", x: 60, y: 150 },
    alg: { label: "FDT's verdict", x: 70, y: 36 },
    used: { label: "who's in charge", x: 210, y: 70 },
    act: { label: "shoot?", x: 330, y: 36 },
    shaky: { label: "shaky hands", x: 225, y: 170 },
    pay: { label: "the country", x: 370, y: 125 },
  },
  edges: () => [
    { from: "alg", to: "used", kind: "cause" },
    { from: "lesion", to: "used", kind: "inclines" },
    { from: "used", to: "act", kind: "cause" },
    { from: "lesion", to: "shaky", kind: "cause" },
    { from: "shaky", to: "pay", kind: "cause" },
    { from: "act", to: "pay", kind: "cause" },
  ],
  roles: { act: "act", alg: "alg", pay: "pay" },
  params: [
    { kind: "range", key: "y", label: "how often the lesion overrides deliberation", min: 0, max: 0.95, step: 0.05, value: 0.3, unit: "p" },
    { kind: "range", key: "p0", label: "CDT starts out", min: 0.02, max: 0.98, step: 0.01, value: 0.6, unit: "p" },
  ],
  deliberation: (v) => ({ acts: ["shoot", "don't"], p0: v.p0, k: 0.05, steps: 60, u: murderU }),
  verdicts: (v) => {
    const p = equilibrium(murder.deliberation!(v))
    const pL = 0.2
    const pLgivenS = (pL * 0.8) / (pL * 0.8 + (1 - pL) * 0.1)
    const fdtGain = (1 - v.y) * (pL * -30 + (1 - pL) * 10)
    return {
      cdt: {
        choice: `shoots ${pc(p)} of the time`, mixed: p, ev: 0, realised: -30 * p,
        working: [
          "The lesion is fixed. But the surer I am I'll shoot, the surer I am I have it, so shooting looks worse.",
          `Deliberation balances at shooting ${pc(p)} of the time.`,
          "If shooting near-perfectly signals the lesion, those shots all miss: −7.5 on average, against 0 for never shooting.",
        ],
      },
      edt: { choice: "doesn't shoot", ev: 0, realised: 0, working: [`Shooters mostly have the lesion: P(lesion | shoot) = ${pc(pLgivenS)}.`, `Shooting is worth ${(pLgivenS * -30 + (1 - pLgivenS) * 10).toFixed(1)}. Don't.`] },
      fdt: {
        choice: "shoots, where it's in charge", ev: fdtGain, realised: fdtGain,
        working: [
          `The lesion can't change what a fixed function outputs; it can only grab the trigger, ${pc(v.y, 0)} of the time.`,
          "Where my verdict decides, I'm a random member of the population: 20% lesion. Shooting is worth +2 there.",
          `So shoot: +${fdtGain.toFixed(2)} a decision, and nothing I could say would change the rest.`,
        ],
      },
    }
  },
  takeaway: "Offered against FDT; the paper argues it dissolves once you say how a lesion could touch an algorithm at all. Whether that's an answer or a change of subject is still argued.",
}

// ── Copies, letters and lifts ───────────────────────────────────────────────

const twin: DecisionCase = {
  id: "twin", group: "promises", against: "cdt", unit: "$M",
  title: "Twin Prisoner's Dilemma",
  dek: "Your psychological twin, in another room, faces the same choice.",
  source: "Lewis 1979; Levinstein & Soares 2020 §1",
  story: [
    "You and a psychological twin are each asked, separately, to cooperate or defect. You both rank the outcomes the same way: I defect and she cooperates, then we both cooperate, then we both defect, then I cooperate and she defects.",
    "How alike are you, and why? The dial is the open problem in FDT: it needs a theory of when two algorithms are similar enough to move together, and no one has one yet.",
  ],
  table: { head: ["", "she cooperates", "she defects"], rows: [["you cooperate", "$2M each", "you $0, her $3M"], ["you defect", "you $3M, her $0", "$1M each"]] },
  nodes: {
    alg: { label: "your algorithm", x: 75, y: 40 },
    act: { label: "you", x: 250, y: 40 },
    twin: { label: "her algorithm", x: 75, y: 160 },
    tact: { label: "her", x: 250, y: 160 },
    up: { label: "upbringing", x: 30, y: 100 },
    pay: { label: "your take", x: 375, y: 100 },
  },
  edges: (v) => [
    { from: "alg", to: "act", kind: "cause" },
    { from: "twin", to: "tact", kind: "cause" },
    { from: "act", to: "pay", kind: "cause" },
    { from: "tact", to: "pay", kind: "cause" },
    ...(v.why === 0
      ? [{ from: "alg", to: "twin", kind: "same" } as Edge]
      : [{ from: "up", to: "alg", kind: "inclines" } as Edge, { from: "up", to: "twin", kind: "inclines" } as Edge]),
  ],
  roles: ROLES,
  params: [
    { kind: "range", key: "s", label: "how alike you are", min: 0.5, max: 1, step: 0.01, value: 0.95, unit: "p" },
    { kind: "choice", key: "why", label: "why you're alike", options: ["same algorithm", "same upbringing"], value: 0 },
  ],
  verdicts: (v) => {
    const s = v.s
    const evC = 2 * s, evD = 3 - 2 * s
    const coop = evC > evD
    const same = v.why === 0
    // Realised: a copy of your algorithm matches you with probability s; a twin who merely shares your upbringing doesn't track your calculation at all.
    const real = (c: boolean) => (same ? (c ? evC : evD) : c ? 1 : 2)
    return {
      cdt: { choice: "defects", ev: 2, realised: real(false), working: ["Nothing I do reaches the other room. Whatever she does, defecting pays $1M more.", "Defect."] },
      edt: {
        choice: coop ? "cooperates" : "defects", ev: Math.max(evC, evD), realised: real(coop),
        working: [`She does what I do ${pc(s, 0)} of the time, so my choice is news about hers.`, `Cooperate: $${evC.toFixed(2)}M. Defect: $${evD.toFixed(2)}M.`, coop ? "Cooperate." : "Not alike enough. Defect."],
      },
      fdt: same
        ? { choice: coop ? "cooperates" : "defects", ev: Math.max(evC, evD), realised: real(coop), working: ["She runs (nearly) my algorithm. If mine outputs cooperate, so does hers.", `Cooperate: $${evC.toFixed(2)}M. Defect: $${evD.toFixed(2)}M.`, coop ? "Cooperate." : "The copy is too loose to lean on. Defect."] }
        : { choice: "defects", ev: 2, realised: real(false), working: ["We're alike because of how we were raised, not because she runs my function. My verdict now doesn't reach her.", "That's a common cause, like the lesion. Defect."] },
    }
  },
  takeaway: "With a true copy, cooperation pays once you're more than 75% alike, and FDT and EDT agree. Make the likeness a shared upbringing and they split: EDT cooperates on the correlation, FDT defects, and the calculator's twin doesn't track the calculation.",
}

const xor: DecisionCase = {
  id: "xor", group: "promises", against: "edt", unit: "$",
  title: "XOR Blackmail",
  dek: "An honest predictor writes only if exactly one thing is true.",
  source: "Soares & Fallenstein 2015; Levinstein & Soares 2020 §2",
  story: [
    "There's a rumour your house has termites: $1,000,000 of damage. An honest, accurate predictor knows the truth, and sends you a letter iff exactly one of these holds: there are no termites and you'll pay $1,000 on reading this, or there are termites and you won't.",
    "The letter has arrived. Paying is excellent news. It also does nothing at all to the termites.",
  ],
  table: { head: ["", "termites", "no termites"], rows: [["pay", "−$1,001,000", "−$1,000"], ["don't", "−$1,000,000", "$0"]] },
  nodes: {
    alg: { label: "your algorithm", x: 70, y: 40 },
    letter: { label: "the letter", x: 200, y: 110 },
    act: { label: "pay?", x: 290, y: 40 },
    term: { label: "termites", x: 85, y: 170 },
    pay: { label: "your money", x: 370, y: 140 },
  },
  edges: () => [
    { from: "alg", to: "act", kind: "cause" },
    { from: "alg", to: "letter", kind: "same" },
    { from: "term", to: "letter", kind: "cause" },
    { from: "letter", to: "act", kind: "see" },
    { from: "act", to: "pay", kind: "cause" },
    { from: "term", to: "pay", kind: "cause" },
  ],
  roles: ROLES,
  params: [{ kind: "range", key: "t", label: "chance the rumour is true", min: 0.001, max: 0.5, step: 0.001, value: 0.05, unit: "p" }],
  verdicts: (v) => {
    const t = v.t
    const payer = -1_000_000 * t - 1000 * (1 - t), refuser = -1_000_000 * t
    return {
      cdt: { choice: "doesn't pay", ev: refuser, realised: refuser, working: ["Paying can't touch the termites. Whatever's true, paying is $1,000 worse.", "Don't."] },
      edt: { choice: "pays", ev: -1000, realised: payer, working: ["Given the letter: if I pay, there are no termites (−$1,000); if I don't, there are (−$1,000,000).", "Paying is wonderful news. Pay."] },
      fdt: { choice: "doesn't pay", ev: refuser, realised: refuser, working: ["My algorithm decides whether the letter is sent. It doesn't decide whether there are termites.", `Policy "pay": ${$(payer)}. Policy "don't": ${$(refuser)}. Don't.`] },
    }
  },
  takeaway: "EDT's counterexample: it pays to manage the news. FDT agrees with CDT here, which is what makes it a third theory rather than EDT with better manners.",
}

const hitchhiker: DecisionCase = {
  id: "hitchhiker", group: "promises", against: "cdt", unit: "$",
  title: "Parfit's Hitchhiker",
  dek: "Stranded in the desert. The driver can read faces.",
  source: "Parfit 1984",
  story: [
    "You're dying of thirst in the desert. A driver stops, and will take you to town if he believes you'll pay him $1,000 when you get there. He's very good at telling.",
    "In town, you're already saved. Do you pay?",
  ],
  table: { head: ["", "he drives you", "he leaves you"], rows: [["pay in town", "−$1,000, alive", "dead"], ["don't", "alive, $1,000 richer", "dead"]] },
  nodes: {
    alg: { label: "your algorithm", x: 70, y: 40 },
    read: { label: "his read of you", x: 90, y: 160 },
    lift: { label: "the lift", x: 220, y: 160 },
    act: { label: "pay in town?", x: 250, y: 40 },
    pay: { label: "you", x: 380, y: 100 },
  },
  edges: () => [
    { from: "alg", to: "act", kind: "cause" },
    { from: "alg", to: "read", kind: "same" },
    { from: "read", to: "lift", kind: "cause" },
    { from: "lift", to: "act", kind: "see" },
    { from: "lift", to: "pay", kind: "cause" },
    { from: "act", to: "pay", kind: "cause" },
  ],
  roles: ROLES,
  params: [{ kind: "range", key: "a", label: "how well he reads people", min: 0.5, max: 1, step: 0.01, value: 0.99, unit: "p" }],
  verdicts: (v) => {
    const LIFEV = 1_000_000
    const payer = v.a * (LIFEV - 1000), welsher = (1 - v.a) * LIFEV
    const no = ["I'm in town. Nothing I do now un-rescues me.", "Keep the $1,000."]
    return {
      cdt: { choice: "doesn't pay", ev: LIFEV, realised: welsher, working: no },
      edt: { choice: "doesn't pay", ev: LIFEV, realised: welsher, working: ["I already know I was rescued; paying is no further news.", "Keep the $1,000."] },
      fdt: { choice: "pays", ev: LIFEV - 1000, realised: payer, working: ["His read was a run of my algorithm. The version of me that welshes in town is the version he left in the desert.", "Pay."] },
    }
  },
  takeaway: "With life valued at $1M, payers are rescued 99% of the time, welshers 1%. A promise is only worth making if you're the kind of agent who keeps it when it no longer helps.",
}

// ── The critics' cases ──────────────────────────────────────────────────────

const mugging: DecisionCase = {
  id: "mugging", group: "critics", against: "fdt", unit: "$",
  title: "Counterfactual Mugging",
  dek: "The coin came up tails. Omega asks for $100.",
  source: "Nesov 2009",
  story: [
    "Omega, a perfect predictor, flipped a fair coin. Had it landed heads, Omega would have paid you $10,000, but only if it predicted that you'd pay $100 on tails. It landed tails. Omega asks for the $100.",
    "There is no future reward. The heads world never happened. Do you pay?",
  ],
  table: { head: ["", "heads (didn't happen)", "tails (here)"], rows: [["pay on tails", "+$10,000", "−$100"], ["refuse", "$0", "$0"]] },
  nodes: {
    coin: { label: "the coin", x: 40, y: 150 },
    alg: { label: "your algorithm", x: 75, y: 40 },
    omega: { label: "Omega's read", x: 190, y: 110 },
    prize: { label: "the $10,000", x: 300, y: 170 },
    act: { label: "pay $100?", x: 260, y: 40 },
    pay: { label: "your money", x: 380, y: 100 },
  },
  edges: () => [
    { from: "alg", to: "act", kind: "cause" },
    { from: "alg", to: "omega", kind: "same" },
    { from: "omega", to: "prize", kind: "cause" },
    { from: "coin", to: "prize", kind: "cause" },
    { from: "coin", to: "act", kind: "see" },
    { from: "prize", to: "pay", kind: "cause" },
    { from: "act", to: "pay", kind: "cause" },
  ],
  roles: ROLES,
  params: [{ kind: "range", key: "r", label: "the heads prize", min: 0, max: 20000, step: 100, value: 10000, unit: "$" }],
  verdicts: (v) => {
    const policy = 0.5 * v.r - 0.5 * 100
    const pays = policy > 0
    return {
      cdt: { choice: "refuses", ev: 0, realised: 0, working: ["It's tails. Paying costs $100 and causes nothing.", "Refuse."] },
      edt: { choice: "refuses", ev: 0, realised: 0, working: ["I know it's tails; paying tells me nothing good.", "Refuse."] },
      fdt: {
        choice: pays ? "pays" : "refuses", ev: pays ? policy : 0, realised: pays ? policy : 0,
        working: [`Before the flip, the policy "pay on tails" is worth ½ × ${$(v.r)} − ½ × $100 = ${$(policy)}.`, "Omega's prediction is my policy. Honour it now that I'm looking at tails.", pays ? "Pay the $100, into a world where it buys nothing." : "The prize isn't worth it. Refuse."],
      },
    }
  },
  takeaway: "Updatelessness at its most naked: FDT pays $100 here for a reward in a world that didn't happen. Agents like that average $4,950 a coin flip; this particular payment buys nothing at all.",
}

const bomb: DecisionCase = {
  id: "bomb", group: "critics", against: "fdt", unit: "$",
  title: "Bomb",
  dek: "You can see the bomb. The predictor is almost never wrong.",
  source: "MacAskill 2019, \"A Critique of Functional Decision Theory\"",
  story: [
    "Two boxes; you must take one. Taking Right costs $100. If the predictor predicted you'd take Right, she put a live bomb in Left. If she predicted Left, Left is empty and free. She's wrong about one time in a trillion trillion.",
    "You open your eyes: there is a bomb in Left, and a note saying she predicted Right. Which box?",
  ],
  table: { head: ["", "bomb in Left", "Left empty"], rows: [["take Left", "you burn", "free"], ["take Right", "−$100", "−$100"]] },
  nodes: {
    alg: { label: "your algorithm", x: 70, y: 40 },
    pred: { label: "her prediction", x: 85, y: 160 },
    bomb: { label: "bomb in Left?", x: 215, y: 160 },
    act: { label: "which box", x: 255, y: 40 },
    pay: { label: "you", x: 380, y: 100 },
  },
  edges: () => [
    { from: "alg", to: "act", kind: "cause" },
    { from: "alg", to: "pred", kind: "same" },
    { from: "pred", to: "bomb", kind: "cause" },
    { from: "bomb", to: "act", kind: "see" },
    { from: "bomb", to: "pay", kind: "cause" },
    { from: "act", to: "pay", kind: "cause" },
  ],
  roles: ROLES,
  params: [
    { kind: "range", key: "e", label: "her error rate", min: -24, max: -1, step: 1, value: -24, log: true, unit: "x" },
    { kind: "range", key: "life", label: "what your life is worth", min: 100_000, max: 100_000_000, step: 100_000, value: 10_000_000, unit: "$" },
  ],
  verdicts: (v) => {
    const eps = 10 ** v.e
    const left = -eps * v.life, right = -100
    const fdtLeft = left > right
    return {
      cdt: { choice: "takes Right", ev: -100, realised: -100, working: ["The bomb is there. Taking Left kills me; Right costs $100.", "Right."] },
      edt: { choice: "takes Right", ev: -100, realised: -100, working: ["I can see the bomb; nothing about my choice is news any more.", "Right."] },
      fdt: {
        choice: fdtLeft ? "takes Left, and burns" : "takes Right", ev: fdtLeft ? left : right, realised: fdtLeft ? left : right,
        working: [
          `Policy "always Left": she almost always predicts it, Left is almost always empty: ${eps < 1e-6 ? "about $0" : $(left)}.`,
          `Policy "always Right": −$100 every time.`,
          fdtLeft ? "I'm in the one-in-a-trillion-trillion world where she erred. Policy is policy: Left." : "She errs too often for the policy to be worth it. Right.",
        ],
      },
    }
  },
  takeaway: "FDT agents are richer on average and one of them, here, walks into a fire. MacAskill's point: a theory that recommends that, with the bomb in plain view, has lost touch with what it's for.",
}

export const CASES: DecisionCase[] = [damascus, coin, olympus, psychopath, murder, twin, xor, hitchhiker, mugging, bomb]
export const CASE: Record<CaseId, DecisionCase> = Object.fromEntries(CASES.map((c) => [c.id, c])) as Record<CaseId, DecisionCase>

export function formatValue(c: DecisionCase, x: number): string {
  if (c.unit === "$M") return `$${x.toFixed(2)}M`
  if (c.unit === "utils") return (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(Math.abs(x) < 10 && x % 1 ? 2 : 0)
  if (x !== 0 && Math.abs(x) < 0.005) return "≈ $0"
  if (Math.abs(x) < 10_000 && Math.abs(x - Math.round(x)) > 0.004) return (x < 0 ? "−$" : "$") + Math.abs(x).toFixed(2)
  return Math.abs(x) < 1 && x !== 0 ? (x < 0 ? "−" : "") + "$" + Math.abs(x).toFixed(2) : $(x)
}
