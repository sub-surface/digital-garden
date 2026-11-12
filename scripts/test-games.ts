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

console.log(`games: ok (Fronts: Marshal ${marshal}/${games} vs Recruit; Commons: sustainable yield ${SUSTAINABLE.toFixed(1)}/season)`)
