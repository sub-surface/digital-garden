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

console.log(`games: ok (Fronts: Marshal ${marshal}/${games} vs Recruit; Commons: sustainable yield ${SUSTAINABLE.toFixed(1)}/season)`)
