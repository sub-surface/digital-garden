/**
 * The chess bot, off the main thread: a Sharp search can take a few hundred
 * milliseconds in a busy middlegame, and the board's animations (and any
 * premoves being queued) should not stutter meanwhile. The game crosses as PGN.
 */
import { Chess } from "chess.js"
import { pickBotMove, type BotFlavour } from "@/lib/chessBot"

export interface ChessBotRequest { id: number; pgn: string; flavour: BotFlavour }
export interface ChessBotReply { id: number; move: { from: string; to: string; promotion?: string } | null }

self.onmessage = (e: MessageEvent<ChessBotRequest>) => {
  const { id, pgn, flavour } = e.data
  const g = new Chess()
  g.loadPgn(pgn)
  const m = pickBotMove(g, flavour)
  self.postMessage({ id, move: m ? { from: m.from, to: m.to, promotion: m.promotion } : null } satisfies ChessBotReply)
}
