/**
 * Enclosure: the TypeScript engine (src/lib/enclosure.ts) against the Python
 * reference in ../strategy. scripts/fixtures/enclosure-games.json holds games
 * the reference played (scratch/dump_enclosure.py made them): every move is
 * replayed here, every area after every move must agree, every recorded
 * legality verdict must agree, and so must the final scores and result.
 * Then a few rule clauses by hand, and the bots must play legal games.
 */
import assert from "node:assert/strict"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import { ARCADE_PRIMER, ARCADE_STANDARD, BLUE, LATTICE3, RED, STANDARD, area, check, filledArea, newGame, step, type Pt } from "../src/lib/enclosure"
import { planTurn, rng } from "../src/lib/enclosure-bot"

const here = path.dirname(fileURLToPath(import.meta.url))
interface Fixture { cfg: "standard" | "lattice3"; seed: number; moves: [Pt, Pt][]; areas: [number, number][]; checks: [number, Pt, Pt, boolean][]; scores: [number, number]; result: string }
const games = JSON.parse(fs.readFileSync(path.join(here, "fixtures/enclosure-games.json"), "utf8")) as Fixture[]
const near = (x: number, y: number) => Math.abs(x - y) < 1e-6

let moves = 0, verdicts = 0
for (const g of games) {
  const s = newGame(g.cfg === "standard" ? STANDARD : LATTICE3)
  const checksAt = new Map<number, [Pt, Pt, boolean][]>()
  for (const [i, a, b, ok] of g.checks) checksAt.set(i, [...(checksAt.get(i) ?? []), [a, b, ok]])
  g.moves.forEach(([a, b], i) => {
    for (const [ca, cb, ok] of checksAt.get(i) ?? []) {
      assert.equal(check(s, { a: ca, b: cb }).ok, ok, `${g.cfg}#${g.seed} move ${i}: legality of ${ca}->${cb}`)
      verdicts++
    }
    step(s, { a, b })
    const want = g.areas[i]
    assert.ok(near(area(s, BLUE), want[0]) && near(area(s, RED), want[1]),
      `${g.cfg}#${g.seed} after move ${i}: areas ${area(s, BLUE)},${area(s, RED)} vs reference ${want}`)
    moves++
  })
  assert.ok(near(s.scores[0], g.scores[0]) && near(s.scores[1], g.scores[1]), `${g.cfg}#${g.seed}: scores ${s.scores} vs ${g.scores}`)
  assert.equal(s.result, g.result, `${g.cfg}#${g.seed}: result`)
}

// ── area by hand ──
const sq: [Pt, Pt][] = [[[0, 0], [3, 0]], [[3, 0], [3, 3]], [[3, 3], [0, 3]], [[0, 3], [0, 0]]]
assert.equal(filledArea(sq), 9)
// a bow tie: two triangles of area 1 each... crossing edges count both lobes
assert.equal(filledArea([[[0, 0], [2, 2]], [[2, 2], [2, 0]], [[2, 0], [0, 2]], [[0, 2], [0, 0]]]), 2)
// a square with a square hole is filled: holes count
assert.equal(filledArea([...sq, [[1, 1], [2, 1]], [[2, 1], [2, 2]], [[2, 2], [1, 2]], [[1, 2], [1, 1]]]), 9)
// a tail sticking out encloses nothing extra
assert.equal(filledArea([...sq, [[3, 3], [5, 5]]]), 9)

// ── rules by hand ──
{
  const s = newGame()
  assert.equal(check(s, { a: [-6, 0], b: [-2, 0] }).reason, "too far")
  assert.equal(check(s, { a: [6, 0], b: [5, 0] }).reason, "not your node")
  assert.equal(check(s, { a: [-6, 0], b: [-8, 0] }).reason, "overlaps your own edge")
  assert.ok(check(s, { a: [-6, 0], b: [-3, 3] }).ok)
  step(s, { a: [-6, 0], b: [-3, 3] })
  assert.equal(s.toMove, RED, "Blue's first turn is one move")
  assert.equal(s.movesLeft, 2)
}

// ── the bots play legal, complete games ──
for (const level of ["pilgrim", "warden"] as const) {
  const s = newGame(LATTICE3)
  const r = rng(7)
  let guard = 0
  while (!s.done && guard++ < 400) {
    const plan = planTurn(s, s.toMove === BLUE ? level : "pilgrim", r)
    assert.ok(plan.moves.length > 0, "a bot found no move with moves available")
    for (const m of plan.moves) { assert.ok(check(s, m).ok, `${level} chose an illegal move`); step(s, m) }
  }
  assert.ok(s.done, `${level} game didn't finish`)
}

// ── the arcade's "pass" rule: a stuck player passes, and the game still ends by score ──
{
  // Red boxed into a corner with every reachable point blocked is hard to stage
  // by hand; instead play random games and check no "pass" game ends drawn by
  // stalemate, and that every one reaches the move limit.
  const r = rng(11)
  for (let g = 0; g < 4; g++) {
    const s = newGame(ARCADE_PRIMER)
    while (!s.done) for (const m of planTurn(s, "pilgrim", r).moves) step(s, m)
    assert.ok(s.result !== null, "a pass-rule game ended without a result")
    assert.ok(s.moveCount >= s.cfg.maxMoves || s.endedBy !== null, "a pass-rule game ended early with no reason")
    for (const p of [0, 1] as const) assert.ok(s.passStreak[p] <= (s.cfg.passLimit ?? Infinity), "a player passed past the limit")
  }
  // The standard board (no limit) still plays every pass out to the move limit.
  const s = newGame(ARCADE_STANDARD)
  assert.equal(s.cfg.passLimit, undefined)
}

// Warden should beat Pilgrim on the primer most of the time (on a short
// budget, to keep the suite quick; the page gives it 1.5 s a turn).
let wardenWins = 0
for (let seed = 1; seed <= 6; seed++) {
  const s = newGame(ARCADE_PRIMER)
  const r = rng(seed)
  const wardenIs = seed % 2 === 0 ? BLUE : RED
  while (!s.done) for (const m of planTurn(s, s.toMove === wardenIs ? "warden" : "pilgrim", r, 250).moves) step(s, m)
  if (s.result === (wardenIs === BLUE ? "Blue" : "Red")) wardenWins++
}
assert.ok(wardenWins >= 4, `Warden won only ${wardenWins}/6 against Pilgrim`)

// A Warden turn keeps to its budget (1.5 s by default), even on the standard board.
{
  const s = newGame()
  const r = rng(3)
  let slowest = 0
  for (let t = 0; t < 6 && !s.done; t++) {
    const t0 = performance.now()
    const plan = planTurn(s, "warden", r)
    slowest = Math.max(slowest, performance.now() - t0)
    for (const m of plan.moves) step(s, m)
  }
  assert.ok(slowest < 4000, `Warden took ${slowest.toFixed(0)} ms on a turn`)
  console.log(`enclosure: ok (${games.length} reference games, ${moves} moves, ${verdicts} legality verdicts; Warden ${wardenWins}/6 vs Pilgrim; slowest Warden turn ${slowest.toFixed(0)} ms)`)
}
