/**
 * The small strategy games' pure engines: Fronts (Blotto with attrition) and
 * Commons (the shared meadow). Rules by hand, then the opponents must play
 * legally and the stronger one must actually be stronger.
 */
import assert from "node:assert/strict"
import {
  FRONTS, REINFORCE, ROUNDS, START_ARMY, clash, dealValues, newFronts, planFronts, resolve, rngFrom, sum, validAlloc, winner,
} from "../src/lib/fronts"
import { Chess } from "chess.js"
import { pickBotMove } from "../src/lib/chessBot"
import { fromAxial, hashWorld, makeWorld, orient, parseRule, shapeOf, stamp, step, toAxial, type Rule, type World } from "../src/lib/hexlife"
import { HEXLIFE_PRESETS } from "../src/components/ui/games/hexLifePresets"
import {
  BIG, BREAK_EVEN, BREAK_EVEN_CLEAR, ORACLES, SCENARIOS, SMALL, THEORIES, available, counted, decide as decideBox, expected, graphFor, readerPredict, READER_GRUDGE, READER_KNOWN, payoff, readerRecord, rngFrom as rngFromSeed, runBench,
  type Act, type OracleId, type Round, type ScenarioId, type Theory,
} from "../src/lib/newcomb"
import { CASE, CASES, defaults, equilibrium } from "../src/lib/decision-cases"
import { countedOf, handleOf } from "../src/lib/causal"
import { CAPACITY, FENCED_MAX, MAX_GRAZE, SEASONS, SUSTAINABLE, decide, newCommons, regrowth, season, welfare } from "../src/lib/commons"

// ── Fronts: rules ──
assert.deepEqual(clash(5, 3), { won: 0, keep: [2, 0] })
assert.deepEqual(clash(2, 2), { won: null, keep: [0, 0] })
assert.deepEqual(clash(0, 1), { won: 1, keep: [0, 1] })
assert.deepEqual(dealValues(4, 2), dealValues(4, 2), "values are seeded")
assert.ok(dealValues(4, 2).some((v) => v >= 4) && dealValues(4, 2).every((v) => v >= 1 && v <= 5))
assert.ok(!validAlloc([11, 0, 0, 0, 0], 10) && !validAlloc([1, 1, 1, 1], 10) && !validAlloc([1.5, 0, 0, 0, 0], 10) && validAlloc([3, 0, 0, 0, 2], 10))
{
  const s = newFronts(1)
  const v = s.values
  // Blue holds 2 back, wins front 0 by 3 and front 1 by 1; ties front 2; concedes 3 and 4.
  const t = resolve(s, [4, 2, 1, 0, 1], [1, 1, 1, 3, 4])
  assert.deepEqual(t.log[0].won, [0, 0, null, 1, 1])
  assert.deepEqual(t.scores, [v[0] + v[1], v[3] + v[4]])
  // Blue keeps 2 held + 3 + 1 = 6; Red keeps 0 held + 3 + 3 = 6; then reinforcements.
  assert.deepEqual(t.armies, [6 + REINFORCE, 6 + REINFORCE])
  assert.throws(() => resolve(s, [10, 1, 0, 0, 0], [0, 0, 0, 0, 0]), /bad allocation/)
}

// ── Fronts: opponents play legally; Marshal beats Recruit ──
let marshal = 0
const games = 40
for (let g = 0; g < games; g++) {
  const r = rngFrom(100 + g)
  let s = newFronts(g + 1)
  const mSide = (g % 2) as 0 | 1
  while (!s.done) {
    const a = planFronts(s, 0, mSide === 0 ? "marshal" : "recruit", r).alloc
    const b = planFronts(s, 1, mSide === 1 ? "marshal" : "recruit", r).alloc
    assert.ok(validAlloc(a, s.armies[0]) && validAlloc(b, s.armies[1]), "an opponent made an illegal split")
    s = resolve(s, a, b)
  }
  assert.equal(s.log.length, ROUNDS)
  if (winner(s) === mSide) marshal++
}
assert.ok(marshal >= games * 0.65, `Marshal beat Recruit only ${marshal}/${games}`)
assert.equal(FRONTS, 5)
assert.ok(sum([START_ARMY]) === 10)

// ── Commons: the meadow ──
assert.equal(regrowth(0), 0)
assert.equal(regrowth(CAPACITY), 0)
assert.ok(SUSTAINABLE > 9 && SUSTAINABLE < 12, `sustainable yield ${SUSTAINABLE}`)
{
  // Shared out in proportion when short; fencing caps next season and costs a point.
  let s = newCommons(["steward", "mirror"])
  s = { ...s, grass: 6 }
  const t = season(s, [{ graze: 6, fence: 1 }, { graze: 3, fence: null }, { graze: 3, fence: null }])
  assert.deepEqual(t.log[0].eaten, [3, 1.5, 1.5])
  assert.equal(t.caps[1], FENCED_MAX)
  assert.equal(t.herders[0].total, 3 - 1)
  assert.equal(t.grass, 0, "a bare meadow doesn't regrow")
  const u = season(t, [{ graze: 0, fence: null }, { graze: 6, fence: null }, { graze: 0, fence: null }])
  assert.equal(u.log[1].choices[1].graze, FENCED_MAX, "the fence holds")
}
{
  // Everyone greedy ruins it; everyone a steward keeps it.
  const play = (you: (s: ReturnType<typeof newCommons>) => number, a: "steward" | "grazier", b: "steward" | "grazier") => {
    let s = newCommons([a, b])
    const r = rngFrom(7)
    while (!s.done) s = season(s, [{ graze: you(s), fence: null }, decide(s, 1, r), decide(s, 2, r)])
    return s
  }
  const greedy = play(() => MAX_GRAZE, "grazier", "grazier")
  const kind = play((s) => Math.round(regrowth(Math.max(s.grass, 20)) / 3), "steward", "steward")
  assert.ok(greedy.grass < 5, `greed left ${greedy.grass}`)
  assert.ok(kind.grass > 30, `stewardship left ${kind.grass}`)
  const wg = welfare(greedy), wk = welfare(kind)
  assert.ok(wk.got > wg.got, `stewardship ate ${wk.got}, greed ${wg.got}`)
  assert.ok(wk.got <= wk.possible + 1e-6 && wk.possible > 150, `welfare ceiling ${wk.possible}`)
  assert.equal(greedy.log.length, SEASONS)
}
// Every persona's choice is within its cap.
for (const p of ["steward", "mirror", "grazier", "opportunist"] as const) {
  let s = newCommons([p, p])
  const r = rngFrom(3)
  while (!s.done) {
    const cs = [{ graze: s.caps[0], fence: s.season % 3 === 0 ? 1 : null }, decide(s, 1, r), decide(s, 2, r)]
    cs.forEach((c, i) => assert.ok(c.graze >= 0 && c.graze <= s.caps[i], `${p} grazed ${c.graze} over cap ${s.caps[i]}`))
    s = season(s, cs)
  }
}

// ── Chess: Sharp takes a mate in one and doesn't hang its queen. ──
{
  const g = new Chess("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1") // Rd8#
  for (let i = 0; i < 3; i++) assert.equal(pickBotMove(g, "sharp")?.san, "Rd8#", "Sharp missed a back-rank mate")
  // Black queen attacked by a pawn; every sharp move must save it.
  const h = new Chess("4k3/8/8/3q4/4P3/8/8/4K3 b - - 0 1")
  const m = pickBotMove(h, "sharp")!
  h.move(m)
  assert.ok(h.board().flat().some((p) => p?.type === "q" && p.color === "b") && !h.moves({ verbose: true }).some((x) => x.captured === "q"), `Sharp left its queen en prise (${m.san})`)
  // Casual takes the biggest piece on offer.
  assert.equal(pickBotMove(new Chess("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1"), "casual")?.san, "exd5")
}

// ── Hex Life: rule grammar and the catalogue of found objects ──
{
  // the six-neighbour masks fall into 13 shapes under rotation and reflection
  const classes = new Set<string>()
  for (let m = 0; m < 64; m++) { let c = 0; for (let i = 0; i < 6; i++) c += (m >> i) & 1; classes.add(c + shapeOf(m)) }
  assert.equal(classes.size, 13, "hex neighbourhoods: 13 shape classes")
  assert.equal(shapeOf(0b000011), "o"); assert.equal(shapeOf(0b000101), "m"); assert.equal(shapeOf(0b001001), "p")
  assert.equal(shapeOf(0b000111), "o"); assert.equal(shapeOf(0b010101), "p"); assert.equal(shapeOf(0b001011), "m")
  assert.equal(shapeOf(0b111100), "o", "four neighbours: named by the two empty ones")
  for (const t of ["B2/S34", "B2o/S2m34", "B2/S2/C3", "B24/S35", "B2o3/S2mp4"]) {
    const r = parseRule(t) as Rule
    assert.equal(typeof r, "object", t)
    assert.equal((parseRule(r.text) as Rule).text, r.text, `${t} round-trips`)
  }
  assert.equal((parseRule("b2/s34") as Rule).text, "B2/S34")
  assert.equal((parseRule("B2omp/S") as Rule).text, "B2/S", "all three shapes of 2 = plain 2")
  assert.equal(typeof parseRule("B7/S"), "string")
  assert.equal(typeof parseRule("B5o/S"), "string", "five neighbours have one shape")
  // axial <-> offset round trip, and six rotations come home
  for (const [x, y] of [[0, 0], [3, 1], [-2, -3], [5, 4]]) assert.deepEqual(fromAxial(...toAxial(x, y)), [x, y])
  for (const c of [[2, -1], [0, 3]] as [number, number][]) assert.deepEqual(orient(c, 6), c)
  // Every catalogued object does what it says in the page's own (dense,
  // toroidal) engine, in every orientation: recurs after its period, in place
  // for an oscillator, displaced for a ship.
  const snapshot = (w: World) => { const out: [number, number, number][] = []; for (let i = 0; i < w.cells.length; i++) if (w.cells[i]) out.push([...toAxial(i % w.W, Math.floor(i / w.W)), w.cells[i]]); return out }
  const shape = (cells: [number, number, number][]) => { const q0 = Math.min(...cells.map((c) => c[0])), r0 = Math.min(...cells.map((c) => c[1])); return { key: cells.map(([q, r, v]) => `${q - q0},${r - r0},${v}`).sort().join(" "), q0, r0 } }
  let checked = 0
  for (const preset of HEXLIFE_PRESETS) {
    const rule = parseRule(preset.rule) as Rule
    for (const pat of preset.patterns) for (let k = 0; k < 6; k++) {
      const w = makeWorld(64, 64)
      stamp(w, 30, 30, pat.cells, k)
      const [aq, ar] = toAxial(30, 30)
      for (const [q, r, s] of pat.dying ?? []) { const [oq, or] = orient([q, r], k); const [x, y] = fromAxial(aq + oq, ar + or); w.cells[y * 64 + x] = s }
      const start = shape(snapshot(w))
      const h0 = hashWorld(w)
      let back = 0, moved = false
      for (let g = 1; g <= 24 && !back; g++) {
        step(w, rule)
        const now = shape(snapshot(w))
        if (now.key === start.key) { back = g; moved = now.q0 !== start.q0 || now.r0 !== start.r0 }
      }
      const isShip = /glider|comet/.test(pat.name)
      const period = Number(/period (\d+)/.exec(pat.note)?.[1] ?? /^p(\d+)/.exec(pat.name)?.[1])
      assert.ok(back > 0, `${preset.name} ${pat.name} (turn ${k}) never recurred`)
      assert.equal(back, period, `${preset.name} ${pat.name} (turn ${k}): period ${back}, catalogue says ${period}`)
      assert.equal(moved, isShip, `${preset.name} ${pat.name}: ${moved ? "moved" : "stayed put"}`)
      if (!isShip) assert.equal(hashWorld(w), h0, `${preset.name} ${pat.name} returns to the same cells`)
      checked++
    }
  }
  console.log(`hexlife: ok (${checked} catalogue checks)`)
}

// ── Two Boxes: the verdict table ──
{
  const pick = (r: { predicted: Act; why: string }) => ({ predicted: r.predicted, why: r.why })
  const verdict = (sid: ScenarioId, oid: OracleId, p: number, obs?: "full" | "empty") =>
    THEORIES.map((t) => decideBox(t, sid, oid, p, obs).act).join(" ")
  // cdt edt fdt
  assert.equal(verdict("classic", "laplace", 1), "two one one", "classic: the original split")
  assert.equal(verdict("closed", "laplace", 1), "two one one", "seeing the $1,000 changes nothing")
  assert.equal(verdict("clear", "laplace", 1, "full"), "two two one", "clear and full: only FDT leaves the $1,000")
  assert.equal(verdict("clear", "laplace", 1, "empty"), "two two two")
  assert.equal(verdict("classic", "lesion", 0.9), "two one two", "the lesion splits EDT from FDT")
  assert.equal(verdict("classic", "time-traveller", 1), "one one one", "retrocausation converts CDT")
  assert.equal(verdict("classic", "oblivious", 1), "two two two")
  assert.equal(verdict("classic", "simulator", 1), "two one one")
  assert.equal(verdict("classic", "psychologist", 0.5), "two two two", "a coin with a clipboard")
  assert.equal(verdict("classic", "psychologist", BREAK_EVEN + 1e-4), "two one one")
  assert.equal(verdict("classic", "psychologist", BREAK_EVEN - 1e-4), "two two two")
  assert.equal(verdict("clear", "psychologist", BREAK_EVEN_CLEAR + 1e-4, "full"), "two two one")
  assert.equal(verdict("clear", "psychologist", BREAK_EVEN_CLEAR - 1e-4, "full"), "two two two")
  assert.ok(Math.abs(BREAK_EVEN - 0.5005) < 1e-9)
  assert.ok(!available("time-traveller", "clear", "bench") && !available("reader", "classic", "bench") && available("reader", "clear", "play"))

  // Why ain'cha rich: exact expectations.
  const ev = (sid: ScenarioId, oid: OracleId, p: number) => THEORIES.map((t) => expected(t, sid, oid, p))
  assert.deepEqual(ev("classic", "laplace", 1), [SMALL, BIG, BIG])
  assert.deepEqual(ev("clear", "laplace", 1), [SMALL, SMALL, BIG])
  assert.deepEqual(ev("classic", "lesion", 0.9), [BIG / 2 + SMALL, BIG / 2, BIG / 2 + SMALL], "the gene ignores a calculator")
  assert.deepEqual(ev("classic", "time-traveller", 1), [BIG, BIG, BIG])

  // The bench's simulation agrees with the exact numbers.
  for (const [sid, oid, p] of [["classic", "psychologist", 0.9], ["clear", "simulator", 1], ["closed", "lesion", 0.8]] as [ScenarioId, OracleId, number][]) {
    const b = runBench(sid, oid, p, 4000, 3)
    for (const t of THEORIES) assert.ok(Math.abs(b[t].mean - b[t].expected) < 0.03 * BIG, `${sid}/${oid}/${t}: sim ${b[t].mean} vs exact ${b[t].expected}`)
  }

  // Paired rounds: with the lesion the simulated gap is the theories' $1,000, not noise.
  {
    const b = runBench("classic", "lesion", 0.9, 1000, 5)
    assert.equal(b.cdt.mean - b.edt.mean, SMALL)
    assert.equal(b.fdt.mean, b.cdt.mean)
  }

  // The graph: where each theory sees its choice reaching the money.
  const via = (t: Theory, sid: ScenarioId, oid: OracleId) => counted(t, graphFor(sid, oid)).map((e) => `${e.from}>${e.to}`).sort().join(" ")
  assert.equal(via("cdt", "classic", "laplace"), "act>pay")
  assert.equal(via("fdt", "classic", "laplace"), "act>pay alg>act alg>pred box>pay pred>box")
  assert.equal(via("fdt", "classic", "lesion"), "act>pay alg>act", "FDT cuts the gene")
  assert.ok(via("edt", "classic", "lesion").includes("gene>pred"), "EDT counts the common cause")
  assert.ok(via("cdt", "classic", "time-traveller").includes("act>pred"))
  assert.equal(via("edt", "classic", "oblivious"), "act>pay alg>act")
  for (const oid of Object.keys(ORACLES) as OracleId[]) for (const sid of Object.keys(SCENARIOS) as ScenarioId[])
    for (const t of THEORIES) assert.ok(counted(t, graphFor(sid, oid)).some((e) => e.to === "pay"), `${t} reaches the payoff in ${sid}/${oid}`)

  // The Reader: three clauses. Strangers get an empty box; it reads only its own rounds.
  const R = (act: Act, full: boolean, oracle: OracleId = "reader", scenario: ScenarioId = "classic"): Round => ({ scenario, oracle, act, full, ...(oracle === "reader" ? { predicted: full ? "one" : "two" } : {}) })
  assert.equal(readerPredict([]).why, "stranger")
  assert.equal(readerPredict([R("one", false)]).why, "stranger")
  assert.deepEqual(pick(readerPredict([R("one", false), R("one", false)])), { predicted: "one", why: "record" }, "two rounds of B alone and it trusts you")
  assert.equal(readerPredict(Array.from({ length: 10 }, () => R("one", true, "oblivious"))).why, "stranger", "rounds against the coin say nothing to it")
  assert.equal(readerPredict([R("one", false, "reader", "clear"), R("one", false, "reader", "clear")]).predicted, "one", "B alone from a box you can see is empty counts")
  assert.equal(readerPredict([R("two", false, "reader", "clear"), R("two", false, "reader", "clear")]).why, "stranger")
  // A grudge: take both from a full box and it leaves B empty for READER_GRUDGE rounds with it, then lapses.
  {
    const h = [R("one", false), R("one", false), R("one", true), R("two", true)]
    assert.deepEqual(pick(readerPredict(h)), { predicted: "two", why: "grudge" })
    assert.equal(readerPredict(h).grudgeLeft, READER_GRUDGE)
    for (let i = 1; i < READER_GRUDGE; i++) h.push(R("one", false))
    assert.equal(readerPredict(h).grudgeLeft, 1)
    h.push(R("one", false))
    assert.deepEqual(pick(readerPredict(h)), { predicted: "one", why: "record" }, "the grudge lapses")
    assert.equal(readerPredict([R("one", false), R("one", false), R("two", false)]).why, "record", "taking both from an empty box is no offence")
  }

  // Unexploitable, exhaustively: every possible game of up to 16 rounds, from a fresh record (so
  // "forget me" between games is covered too). Nothing beats taking B alone every time by more than
  // the $1,000 of grabbing both on the very last round, and a game restarted every n rounds by
  // forgetting averages less than $1,000,000 a round.
  const best = (sid: ScenarioId, L: number) => {
    const h: Round[] = []
    let max = -1, arg = ""
    const dfs = (total: number, path: string) => {
      if (h.length === L) { if (total > max) { max = total; arg = path } return }
      const { predicted } = readerPredict(h)
      const full = predicted === "one"
      for (const act of ["one", "two"] as Act[]) {
        h.push({ scenario: sid, oracle: "reader", act, full, predicted })
        dfs(total + payoff(act, full), path + (act === "one" ? "1" : "2"))
        h.pop()
      }
    }
    dfs(0, "")
    return { max, arg }
  }
  let games = 0
  for (const sid of ["classic", "clear"] as ScenarioId[]) {
    for (let L = 1; L <= 16; L++) {
      const steady = Math.max(0, L - READER_KNOWN) * BIG
      const { max, arg } = best(sid, L)
      games += 2 ** L
      assert.equal(max, L > READER_KNOWN ? steady + SMALL : L * SMALL, `${sid}, ${L} rounds: best ${max} by ${arg}`)
      if (L > READER_KNOWN) assert.equal(arg, "1".repeat(L - 1) + "2", `${sid}, ${L} rounds: the best line is B alone, then grab on the last round`)
      assert.ok(max < L * BIG, "forgetting and starting over never pays a million a round")
    }
  }

  // Strategies over a long game: nothing beats taking B alone every time.
  const play = (choose: (i: number, h: Round[], r: () => number) => Act, n: number, seed = 1) => {
    const h: Round[] = []
    const r = rngFromSeed(seed)
    let total = 0
    for (let i = 0; i < n; i++) {
      const { predicted } = readerPredict(h)
      const act = choose(i, h, r)
      const full = predicted === "one"
      total += payoff(act, full)
      h.push({ scenario: "classic", oracle: "reader", act, full, predicted })
    }
    return { ...readerRecord(h), mean: total / n }
  }
  const honest = play(() => "one", 200).mean
  const rivals: [string, (i: number, h: Round[], r: () => number) => Act][] = [
    ["always both", () => "two"],
    ["coin flip", (_, __, r) => (r() < 0.5 ? "one" : "two")],
    ["both 5% of the time", (_, __, r) => (r() < 0.05 ? "two" : "one")],
    ["both every 5th round", (i) => (i % 5 === 4 ? "two" : "one")],
    ["both every 50th round", (i) => (i % 50 === 49 ? "two" : "one")],
    ["grab whenever it will fill B", (_, h) => (readerPredict(h).predicted === "one" ? "two" : "one")],
    ["B alone only when it will fill B", (_, h) => readerPredict(h).predicted],
    ["alternate", (i) => (i % 2 ? "two" : "one")],
  ]
  for (const [name, s] of rivals) {
    const m = Math.max(...[1, 2, 3, 4, 5].map((seed) => play(s, 200, seed).mean))
    assert.ok(m < honest, `${name} (${m}) must not beat taking B alone (${honest})`)
  }
  // And it still reads people: a habit and a pattern; a coin-flipper it can't.
  assert.ok(play(() => "one", 40).accuracy > 0.9, "a steady one-boxer is read")
  {
    // An alternator takes both from full boxes, so it spends most rounds under a grudge (the price of
    // being unexploitable); but the record underneath has learned the pattern.
    const alt: Round[] = Array.from({ length: 30 }, (_, i) => R(i % 2 ? "two" : "one", false))
    assert.ok(readerPredict(alt).pOne > 0.7, "after both, it expects B alone")
    assert.ok(readerPredict([...alt, R("one", false)]).pOne < 0.3, "after B alone, it expects both")
  }
  assert.ok(play((_, h) => { const l = h[h.length - 1]; return !l ? "one" : l.full ? l.act : l.act === "one" ? "two" : "one" }, 40).accuracy > 0.75, "win-stay, lose-shift is read")
  const flipper = play((_, __, r) => (r() < 0.5 ? "one" : "two"), 400, 11)
  assert.ok(flipper.accuracy > 0.4 && flipper.accuracy < 0.6, `a coin-flipper can't be read (${flipper.accuracy})`)
  // Clear boxes shown empty can't be scored.
  assert.deepEqual(readerRecord([{ scenario: "clear", oracle: "reader", act: "two", full: false, predicted: "two" }]), { hits: 0, n: 0, accuracy: 0.5 })
  console.log(`newcomb: ok (break-even ${BREAK_EVEN}; Reader unexploitable over ${games.toLocaleString()} exhaustive games, honest play ${honest.toFixed(0)}/round)`)
}

// ── Case files: the verdicts in Levinstein & Soares, "Cheating Death in Damascus" ──
{
  const near = (a: number, b: number, eps = 1e-3, what = "") => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} vs ${b}`)
  const at = (id: keyof typeof CASE, over: Record<string, number> = {}) => CASE[id].verdicts({ ...defaults(CASE[id]), ...over })
  for (const c of CASES) {
    const v = defaults(c)
    const edges = c.edges(v)
    for (const e of edges) assert.ok(c.nodes[e.from] && c.nodes[e.to], `${c.id}: edge ${e.from}>${e.to} has nodes`)
    assert.deepEqual(handleOf("fdt", edges, c.roles), [c.roles.alg], `${c.id}: FDT's hand is on the algorithm`)
    assert.ok(countedOf("cdt", edges, c.roles).length > 0, `${c.id}: CDT sees some path to the payoff`)
    // Deliberation settles in the same place from anywhere.
    if (c.deliberation) {
      const eqs = [0.02, 0.5, 0.98].map((p0) => equilibrium(c.deliberation!({ ...v, p0 })))
      for (const e of eqs) near(e, eqs[0], 2e-3, `${c.id}: equilibrium independent of start`)
    }
  }
  // Death in Damascus: Joyce's equilibrium is 1001/2000; CDT expects $499.50 and dies, a dollar down half the time.
  const dd = at("damascus")
  near(dd.cdt.mixed!, 0.5005, 1e-4, "Damascus equilibrium")
  near(dd.cdt.ev, 499.5, 0.1, "Damascus: CDT expects")
  near(dd.cdt.realised, -0.4995, 1e-3, "Damascus: CDT gets")
  assert.equal(dd.fdt.realised, 0)
  // Random Coin: U(R) = 499 < 500, so CDT won't buy it; EDT and FDT do.
  const rc = at("coin")
  near(rc.cdt.ev, 500, 0.5, "Random Coin: CDT's U(stay)"); assert.equal(rc.cdt.realised, 0)
  assert.equal(rc.fdt.realised, 499); assert.equal(rc.edt.realised, 499)
  // Olympus: the causally dominated option is the best one.
  const ol = at("olympus")
  assert.equal(ol.cdt.realised, 0); assert.equal(ol.fdt.realised, 500); assert.equal(ol.edt.realised, 500)
  // Murder Lesion: CDT shoots 25% and averages −7.5; FDT gains 2 − 2y.
  const ml = at("murder")
  near(ml.cdt.mixed!, 0.25, 1e-3, "Murder Lesion equilibrium"); near(ml.cdt.realised, -7.5, 0.05, "Murder Lesion: CDT gets")
  for (const y of [0, 0.3, 0.9]) near(at("murder", { y }).fdt.ev, 2 - 2 * y, 1e-9, `Murder Lesion: FDT at y=${y}`)
  // Psychopath: Joycean CDT trembles; FDT never presses.
  const ps = at("psychopath")
  assert.ok(ps.cdt.mixed! > 0.05 && ps.cdt.mixed! < 0.15, `psychopath tremble ${ps.cdt.mixed}`); assert.equal(ps.fdt.realised, 0)
  // XOR Blackmail: EDT pays and is worse off by exactly $1,000 × P(no termites); FDT sides with CDT.
  for (const t of [0.01, 0.05, 0.3]) {
    const x = at("xor", { t })
    assert.equal(x.edt.choice, "pays"); assert.equal(x.fdt.choice, "doesn't pay")
    near(x.fdt.realised - x.edt.realised, 1000 * (1 - t), 1e-6, "XOR gap")
  }
  // Twin: with a true copy, cooperation pays above 75% likeness; a shared upbringing splits FDT from EDT.
  assert.equal(at("twin", { s: 0.74, why: 0 }).fdt.choice, "defects")
  assert.equal(at("twin", { s: 0.76, why: 0 }).fdt.choice, "cooperates")
  const up = at("twin", { s: 0.95, why: 1 })
  assert.equal(up.edt.choice, "cooperates"); assert.equal(up.fdt.choice, "defects")
  // Hitchhiker: payers are rescued; welshers mostly aren't.
  const hh = at("hitchhiker"); assert.ok(hh.fdt.realised > 90 * hh.cdt.realised)
  // Mugging: FDT pays whenever ½R > ½·$100.
  assert.equal(at("mugging", { r: 10000 }).fdt.choice, "pays"); assert.equal(at("mugging", { r: 50 }).fdt.choice, "refuses")
  // Bomb: FDT takes Left at a 1-in-10^24 error rate and Right when the predictor is sloppy.
  assert.match(at("bomb", { e: -24 }).fdt.choice, /Left/); assert.match(at("bomb", { e: -1 }).fdt.choice, /Right/)
  console.log(`cases: ok (${CASES.length} case files; Damascus settles at ${dd.cdt.mixed!.toFixed(4)}, Murder Lesion CDT ${ml.cdt.realised.toFixed(2)})`)
}

console.log(`games: ok (Fronts: Marshal ${marshal}/${games} vs Recruit; Commons: sustainable yield ${SUSTAINABLE.toFixed(1)}/season)`)
