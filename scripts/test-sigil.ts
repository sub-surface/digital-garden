/**
 * SIGIL generator invariants — every plate must be solvable by construction.
 * Runs the generator over many seeds and board sizes and checks:
 *  - the snake partition tiles the entire grid (plateLength === n²)
 *  - terminals are in-bounds, distinct, non-degenerate
 *  - generation is deterministic per seed
 */
import { generateBoard, validateBoard } from "../src/lib/sigil"

let failures = 0
const SIZES = [5, 6, 7, 8]
const SEEDS_PER_SIZE = 200

for (const n of SIZES) {
  for (let s = 0; s < SEEDS_PER_SIZE; s++) {
    const seed = `test-${n}-${s}`
    const board = generateBoard(n, seed)
    const err = validateBoard(board)
    if (err) {
      console.error(`FAIL n=${n} seed=${seed}: ${err}`)
      failures++
    }
  }
  // determinism: same seed → identical pairs
  const a = generateBoard(n, "det-check")
  const b = generateBoard(n, "det-check")
  if (JSON.stringify(a.pairs) !== JSON.stringify(b.pairs)) {
    console.error(`FAIL n=${n}: generator is not deterministic per seed`)
    failures++
  }
}

// daily seed shape
const daily = generateBoard(7, "2026-07-03")
if (validateBoard(daily)) { console.error("FAIL: daily seed board invalid"); failures++ }

if (failures > 0) {
  console.error(`${failures} sigil generator failure(s)`)
  process.exit(1)
}
console.log(`SIGIL generator: ${SIZES.length * SEEDS_PER_SIZE} plates across n=${SIZES.join(",")} — all solvable, deterministic.`)
