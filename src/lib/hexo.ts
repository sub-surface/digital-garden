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
