export type Player = 1 | 2

export interface HexoState {
  stones: Map<string, Player>   // key "q,r" → player
  turn: Player
  placedThisTurn: number
  stonesPerTurn: number         // 1 on first turn, 2 after
  moveNumber: number
  winner: Player | null
  winningLine: string[] | null
  lastPlaced: string[]          // cells placed in the current/most-recent turn (for last-move ring)
}

export function key(q: number, r: number): string {
  return `${q},${r}`
}

export function initialState(): HexoState {
  return {
    stones: new Map(),
    turn: 1,
    placedThisTurn: 0,
    stonesPerTurn: 1,
    moveNumber: 1,
    winner: null,
    winningLine: null,
    lastPlaced: [],
  }
}

// The 3 hex axes as direction pairs (axial coords, pointy-top).
const AXES: Array<[[number, number], [number, number]]> = [
  [[1, 0], [-1, 0]],
  [[0, 1], [0, -1]],
  [[1, -1], [-1, 1]],
]

/** From the just-placed cell, return the keys of a ≥6 same-player line, else null. */
export function checkWin(
  stones: Map<string, Player>,
  q: number,
  r: number,
  player: Player,
): string[] | null {
  for (const [dirA, dirB] of AXES) {
    const line: string[] = [key(q, r)]
    // extend in dirA
    let cq = q + dirA[0], cr = r + dirA[1]
    while (stones.get(key(cq, cr)) === player) { line.push(key(cq, cr)); cq += dirA[0]; cr += dirA[1] }
    // extend in dirB
    cq = q + dirB[0]; cr = r + dirB[1]
    while (stones.get(key(cq, cr)) === player) { line.unshift(key(cq, cr)); cq += dirB[0]; cr += dirB[1] }
    if (line.length >= 6) return line
  }
  return null
}

/** Pure: place a stone for the current turn's player. Illegal moves return state unchanged. */
export function placeStone(state: HexoState, q: number, r: number): HexoState {
  if (state.winner !== null) return state
  const k = key(q, r)
  if (state.stones.has(k)) return state

  const stones = new Map(state.stones)
  stones.set(k, state.turn)

  // lastPlaced accumulates within a turn: reset on the turn's first stone, else append.
  const lastPlaced = state.placedThisTurn === 0 ? [k] : [...state.lastPlaced, k]

  const winningLine = checkWin(stones, q, r, state.turn)
  if (winningLine) {
    return { ...state, stones, placedThisTurn: state.placedThisTurn + 1, winner: state.turn, winningLine, lastPlaced }
  }

  const placedThisTurn = state.placedThisTurn + 1
  if (placedThisTurn >= state.stonesPerTurn) {
    // turn complete
    return {
      ...state,
      stones,
      turn: state.turn === 1 ? 2 : 1,
      placedThisTurn: 0,
      stonesPerTurn: 2,
      moveNumber: state.moveNumber + 1,
      lastPlaced,
    }
  }
  return { ...state, stones, placedThisTurn, lastPlaced }
}

/** Stones remaining to place this turn. */
export function stonesLeft(state: HexoState): number {
  return state.stonesPerTurn - state.placedThisTurn
}

// ─────────────────────────────────────────────────────────────────────────────
// Bot opponent
//
// A handmade heuristic player — no search tree, no network. It scores every
// candidate cell by how much it helps the bot and how much it denies the human,
// using the same "live line" idea as the theory repo's Erdős–Selfridge potential:
// a length-6 window is only worth anything while it contains no opponent stone,
// and its value grows steeply with how many of your own stones already sit in it.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_DIRS: Array<[number, number]> = [
  [1, 0], [0, 1], [1, -1],
]

function other(p: Player): Player {
  return p === 1 ? 2 : 1
}

/** Candidate cells = all empty cells within 1 hex of any stone (plus origin on an empty board). */
function candidates(stones: Map<string, Player>): Array<[number, number]> {
  if (stones.size === 0) return [[0, 0]]
  const seen = new Set<string>()
  const out: Array<[number, number]> = []
  const ring: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
  ]
  for (const k of stones.keys()) {
    const [q, r] = k.split(",").map(Number)
    for (const [dq, dr] of ring) {
      const nq = q + dq, nr = r + dr
      const nk = key(nq, nr)
      if (stones.has(nk) || seen.has(nk)) continue
      seen.add(nk)
      out.push([nq, nr])
    }
  }
  return out
}

/**
 * Heuristic value of placing `player` at (q,r): summed over every length-6 window
 * through the cell, along all three axes. A window contributes only if the
 * opponent has no stone in it; its weight rises sharply with the count of
 * `player` stones already inside (4^own), so completing/extending threats and
 * blocking the opponent both fall out of one number when we score for both sides.
 */
function cellScore(stones: Map<string, Player>, q: number, r: number, player: Player): number {
  const opp = other(player)
  let score = 0
  for (const [dq, dr] of ALL_DIRS) {
    // slide a 6-window so that (q,r) is each of its 6 positions
    for (let offset = -5; offset <= 0; offset++) {
      let own = 0, blocked = false
      for (let i = 0; i < 6; i++) {
        const cq = q + dq * (offset + i)
        const cr = r + dr * (offset + i)
        if (cq === q && cr === r) continue // the cell we're hypothetically filling
        const occ = stones.get(key(cq, cr))
        if (occ === opp) { blocked = true; break }
        if (occ === player) own++
      }
      if (blocked) continue
      score += Math.pow(4, own)
    }
  }
  return score
}

/**
 * Pick the bot's move for the current player. Pure: depends only on `state`.
 * Strategy, in priority order:
 *   1. take an immediate win,
 *   2. block the opponent's immediate win,
 *   3. otherwise place where (my offence + a share of their offence-denied) is largest.
 * Deterministic given the state (ties broken by scan order) — easy to test and
 * to swap out later for a champion bred in the competition harness.
 */
export function botMove(state: HexoState): { q: number; r: number } | null {
  if (state.winner !== null) return null
  const me = state.turn
  const opp = other(me)
  const cells = candidates(state.stones)
  if (cells.length === 0) return null

  let best: [number, number] | null = null
  let bestScore = -Infinity

  for (const [q, r] of cells) {
    // 1. immediate win?
    const mineNext = new Map(state.stones)
    mineNext.set(key(q, r), me)
    if (checkWin(mineNext, q, r, me)) return { q, r }

    // 2/3. combined offence + defence score.
    const offence = cellScore(state.stones, q, r, me)
    const defence = cellScore(state.stones, q, r, opp)
    // Weight defence slightly above raw offence so the bot reliably blocks a
    // five-in-a-row even when it has an equal-looking build of its own.
    const score = offence + defence * 1.1
    if (score > bestScore) {
      bestScore = score
      best = [q, r]
    }
  }

  // 2 (hard guarantee): if the opponent has an immediate win anywhere in the
  // candidate set, block it outright even if the blended score chose elsewhere.
  for (const [q, r] of cells) {
    const oppNext = new Map(state.stones)
    oppNext.set(key(q, r), opp)
    if (checkWin(oppNext, q, r, opp)) return { q, r }
  }

  return best ? { q: best[0], r: best[1] } : null
}
