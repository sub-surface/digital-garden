/**
 * Fronts: Colonel Blotto with attrition. Each round both sides secretly split
 * their army across five fronts, each worth a few points this round. Reveal:
 * the larger force takes the front and its points, but pays for it: the
 * winner keeps only its margin, the loser loses everything sent there. A tie
 * destroys both. Troops held back are safe. Both sides get reinforcements
 * between rounds. After the last round the higher score wins.
 *
 * So there is no best split, only a best split *against what they'll do*:
 * a front won by one costs nearly everything sent, a front conceded costs
 * nothing, and an army spent now is an army missing later.
 *
 * Pure. Tested by scripts/test-games.ts.
 */
export const FRONTS = 5
export const ROUNDS = 8
export const START_ARMY = 10
export const REINFORCE = 4

export type Side = 0 | 1
export type Alloc = number[]

export interface RoundLog {
  values: number[]
  alloc: [Alloc, Alloc]
  /** Who took each front (null: nobody, a tie or both empty). */
  won: (Side | null)[]
  gained: [number, number]
  lost: [number, number]
}

export interface FrontsState {
  seed: number
  round: number // 0-based; === ROUNDS when done
  values: number[]
  armies: [number, number]
  scores: [number, number]
  log: RoundLog[]
  done: boolean
}

/** mulberry32 */
export function rngFrom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** This round's front values: 1–5, re-dealt each round from the seed, one front always worth 4+. */
export function dealValues(seed: number, round: number): number[] {
  const r = rngFrom(seed * 7919 + round * 104729 + 1)
  const v = Array.from({ length: FRONTS }, () => 1 + Math.floor(r() * 4))
  v[Math.floor(r() * FRONTS)] = 4 + Math.floor(r() * 2)
  return v
}

export function newFronts(seed: number): FrontsState {
  return { seed, round: 0, values: dealValues(seed, 0), armies: [START_ARMY, START_ARMY], scores: [0, 0], log: [], done: false }
}

export function validAlloc(a: Alloc, army: number): boolean {
  return a.length === FRONTS && a.every((x) => Number.isInteger(x) && x >= 0) && a.reduce((s, x) => s + x, 0) <= army
}

/** One front's outcome. */
export function clash(x: number, y: number): { won: Side | null; keep: [number, number] } {
  if (x > y) return { won: 0, keep: [x - y, 0] }
  if (y > x) return { won: 1, keep: [0, y - x] }
  return { won: null, keep: [0, 0] }
}

export function resolve(s: FrontsState, a0: Alloc, a1: Alloc): FrontsState {
  if (s.done) throw new Error("game over")
  if (!validAlloc(a0, s.armies[0]) || !validAlloc(a1, s.armies[1])) throw new Error("bad allocation")
  const won: (Side | null)[] = []
  const gained: [number, number] = [0, 0]
  const kept: [number, number] = [s.armies[0] - sum(a0), s.armies[1] - sum(a1)]
  for (let i = 0; i < FRONTS; i++) {
    const c = clash(a0[i], a1[i])
    won.push(c.won)
    if (c.won !== null) gained[c.won] += s.values[i]
    kept[0] += c.keep[0]
    kept[1] += c.keep[1]
  }
  const lost: [number, number] = [s.armies[0] - kept[0], s.armies[1] - kept[1]]
  const round = s.round + 1
  const done = round >= ROUNDS
  return {
    seed: s.seed,
    round,
    values: done ? s.values : dealValues(s.seed, round),
    armies: done ? kept : [kept[0] + REINFORCE, kept[1] + REINFORCE],
    scores: [s.scores[0] + gained[0], s.scores[1] + gained[1]],
    log: [...s.log, { values: s.values, alloc: [[...a0], [...a1]], won, gained, lost }],
    done,
  }
}

export const sum = (a: readonly number[]) => a.reduce((s, x) => s + x, 0)

export function winner(s: FrontsState): Side | null {
  if (!s.done || s.scores[0] === s.scores[1]) return null
  return s.scores[0] > s.scores[1] ? 0 : 1
}

// ── opponents ──

export type FrontsLevel = "recruit" | "marshal"

/** A random split of `n` troops over the fronts, with a held-back reserve. */
function randomAlloc(n: number, r: () => number, focus = 1): Alloc {
  const w = Array.from({ length: FRONTS }, () => Math.pow(r(), focus * 2))
  const send = Math.round(n * (0.55 + 0.45 * r()))
  const tot = sum(w) || 1
  const a = w.map((x) => Math.floor((x / tot) * send))
  let left = send - sum(a)
  while (left-- > 0) a[Math.floor(r() * FRONTS)]++
  return a
}

/** A split that only contests the k most valuable fronts. */
function focusedAlloc(n: number, values: number[], k: number, r: () => number): Alloc {
  const order = values.map((v, i) => [v + r() * 0.5, i] as const).sort((x, y) => y[0] - x[0]).map((x) => x[1])
  const a = new Array(FRONTS).fill(0)
  const send = Math.round(n * (0.6 + 0.4 * r()))
  for (let t = 0; t < send; t++) a[order[t % k]]++
  return a
}

/**
 * How `side`'s opponent has tended to play: their share of the army sent to
 * each front, ranked by that front's value. Used to imagine their next split.
 */
function habit(s: FrontsState, them: Side): { byRank: number[] } | null {
  if (!s.log.length) return null
  const byRank = new Array(FRONTS).fill(0)
  let rounds = 0
  for (const [i, l] of s.log.entries()) {
    const army = sum(l.alloc[them]) // shares are of what was sent
    if (!army) continue
    const w = 0.5 + i / s.log.length // recent rounds count more
    const ranks = l.values.map((v, j) => [v, j] as const).sort((x, y) => y[0] - x[0]).map((x) => x[1])
    ranks.forEach((front, rank) => { byRank[rank] += (w * l.alloc[them][front]) / army })
    rounds += w
  }
  if (!rounds) return null
  return { byRank: byRank.map((x) => x / rounds) }
}

function imagine(s: FrontsState, them: Side, r: () => number): Alloc {
  const n = s.armies[them]
  const h = habit(s, them)
  if (!h || r() < 0.35) return r() < 0.5 ? randomAlloc(n, r, 1 + r() * 2) : focusedAlloc(n, s.values, 1 + Math.floor(r() * 3), r)
  const ranks = s.values.map((v, j) => [v + r() * 0.01, j] as const).sort((x, y) => y[0] - x[0]).map((x) => x[1])
  const total = Math.min(n, Math.round(n * (0.5 + r() * 0.5)))
  const a = new Array(FRONTS).fill(0)
  ranks.forEach((front, rank) => { a[front] = Math.floor(h.byRank[rank] * total * (0.7 + r() * 0.6)) })
  while (sum(a) > n) a[a.indexOf(Math.max(...a))]--
  return a
}

export interface FrontsPlan { alloc: Alloc; read: string }

/**
 * Recruit: plays a plausible split, a little too evenly.
 * Marshal: imagines a few hundred splits you might make (from your habits so
 * far, and from plain guesses), then plays the candidate that does best
 * against them on average, counting points won and the troops it keeps
 * (troops are worth less as the war nears its end).
 */
export function planFronts(s: FrontsState, side: Side, level: FrontsLevel, r: () => number = Math.random): FrontsPlan {
  const n = s.armies[side]
  const them = (side ^ 1) as Side
  if (level === "recruit") {
    const a = r() < 0.5 ? randomAlloc(n, r, 0.5) : focusedAlloc(n, s.values, 3, r)
    return { alloc: a, read: "spread thin" }
  }
  const roundsLeft = ROUNDS - s.round - 1
  const troopWorth = roundsLeft > 0 ? (sum(s.values) / (START_ARMY + REINFORCE * 2)) * Math.min(1, roundsLeft / 3) * 0.8 : 0
  const theirs = Array.from({ length: 160 }, () => imagine(s, them, r))
  const mine: Alloc[] = []
  for (let i = 0; i < 260; i++) mine.push(i % 3 === 0 ? focusedAlloc(n, s.values, 1 + (i % 4), r) : randomAlloc(n, r, 0.5 + r() * 2.5))
  // Best responses to a few imagined splits, nudged by one.
  for (const t of theirs.slice(0, 40)) {
    const a = new Array(FRONTS).fill(0)
    const order = s.values.map((v, j) => [v / (t[j] + 1), j] as const).sort((x, y) => y[0] - x[0])
    let left = n
    for (const [, j] of order) { const need = t[j] + 1; if (need <= left) { a[j] = need; left -= need } }
    mine.push(a)
  }
  let best = mine[0], bestU = -Infinity
  for (const a of mine) {
    let u = 0
    for (const t of theirs) {
      let pts = 0, keepMe = n - sum(a), keepThem = s.armies[them] - sum(t)
      for (let j = 0; j < FRONTS; j++) {
        const c = clash(a[j], t[j])
        if (c.won === 0) pts += s.values[j]
        else if (c.won === 1) pts -= s.values[j]
        keepMe += c.keep[0]
        keepThem += c.keep[1]
      }
      u += pts + troopWorth * (keepMe - keepThem)
    }
    u = u / theirs.length + r() * 0.05
    if (u > bestU) { bestU = u; best = a }
  }
  const h = habit(s, them)
  const read = !h ? "probing" : h.byRank[0] > 0.45 ? "you go heavy on the big front" : h.byRank[0] < 0.22 ? "you spread wide" : "you play the middle"
  return { alloc: best, read }
}
