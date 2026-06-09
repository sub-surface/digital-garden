import { Chess, type Move } from "chess.js"

export type BotFlavour = "drunk" | "casual" | "sharp"

// Centipawn piece values, keyed by chess.js piece letter.
const PIECE_VALUE: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
}

// A single piece-square table (white's perspective, a8=index 0 → h1=index 63),
// applied to all non-king pieces for light positional sense. Encourages centre
// control and development without per-piece tables.
const PST = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10,   0,   5,   5,   5,   5,   0, -10,
  -10,   5,  10,  15,  15,  10,   5, -10,
  -10,   5,  15,  20,  20,  15,   5, -10,
  -10,   5,  15,  20,  20,  15,   5, -10,
  -10,   5,  10,  15,  15,  10,   5, -10,
  -10,   0,   5,   5,   5,   5,   0, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
]

function squareToIndex(square: string): number {
  const file = square.charCodeAt(0) - 97 // a..h → 0..7
  const rank = 8 - parseInt(square[1], 10) // 8..1 → 0..7
  return rank * 8 + file
}

/** Static evaluation from the side-to-move's perspective (negamax convention). */
function evaluate(game: Chess): number {
  if (game.isCheckmate()) return -100000 // side to move is mated
  if (game.isDraw() || game.isStalemate()) return 0

  let score = 0
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue
      const val = PIECE_VALUE[piece.type]
      const idx = squareToIndex(piece.square)
      const pst = piece.type === "k" ? 0 : PST[piece.color === "w" ? idx : 63 - idx]
      const signed = (val + pst) * (piece.color === "w" ? 1 : -1)
      score += signed
    }
  }
  // Return from the perspective of the side to move.
  return game.turn() === "w" ? score : -score
}

/** Order moves captures-first to improve alpha-beta pruning. */
function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const av = a.captured ? PIECE_VALUE[a.captured] : 0
    const bv = b.captured ? PIECE_VALUE[b.captured] : 0
    return bv - av
  })
}

function negamax(game: Chess, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || game.isGameOver()) return evaluate(game)
  let best = -Infinity
  for (const move of orderMoves(game.moves({ verbose: true }) as Move[])) {
    game.move(move)
    const score = -negamax(game, depth - 1, -beta, -alpha)
    game.undo()
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** One-ply greedy: prefer best immediate capture (+ small bonus for checks). */
function greedyMove(moves: Move[]): Move {
  let best = moves[0]
  let bestScore = -Infinity
  for (const m of moves) {
    let s = m.captured ? PIECE_VALUE[m.captured] : 0
    if (m.san.includes("+")) s += 30
    if (m.san.includes("#")) s += 100000
    // jitter so equal-value moves vary between games
    s += Math.random() * 5
    if (s > bestScore) { bestScore = s; best = m }
  }
  return best
}

/**
 * Pick a move for the given flavour. Returns null only if no legal moves
 * (caller should already guard game-over). Operates on a clone, so the passed
 * game is never mutated.
 */
export function pickBotMove(game: Chess, flavour: BotFlavour): Move | null {
  const clone = new Chess()
  clone.loadPgn(game.pgn())
  const moves = clone.moves({ verbose: true }) as Move[]
  if (moves.length === 0) return null

  if (flavour === "drunk") {
    return Math.random() < 0.8 ? randomOf(moves) : greedyMove(moves)
  }
  if (flavour === "casual") {
    return greedyMove(moves)
  }

  // sharp: negamax depth 3 with alpha-beta
  let best = moves[0]
  let bestScore = -Infinity
  for (const move of orderMoves(moves)) {
    clone.move(move)
    const score = -negamax(clone, 2, -Infinity, Infinity)
    clone.undo()
    if (score > bestScore) { bestScore = score; best = move }
  }
  return best
}

export const BOT_FLAVOURS: { value: BotFlavour; label: string }[] = [
  { value: "drunk", label: "Drunk" },
  { value: "casual", label: "Casual" },
  { value: "sharp", label: "Sharp" },
]
