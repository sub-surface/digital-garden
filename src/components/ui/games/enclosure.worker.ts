/**
 * Enclosure's opponent, off the main thread: a Warden turn on the standard
 * board can take a second or two, and the board should stay live meanwhile.
 * State crosses by structured clone (Maps and Sets survive it).
 */
import { planTurn, rng, type BotLevel } from "@/lib/enclosure-bot"
import type { State } from "@/lib/enclosure"

export interface BotRequest { id: number; state: State; level: BotLevel; seed: number }

self.onmessage = (e: MessageEvent<BotRequest>) => {
  const { id, state, level, seed } = e.data
  self.postMessage({ id, plan: planTurn(state, level, rng(seed)) })
}
