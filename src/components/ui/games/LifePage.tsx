import { GameOfLife } from "@/components/mdx/GameOfLife"
import { GameCabinet } from "./GameCabinet"

/**
 * Arcade "Life" — square Conway's Game of Life. Reuses the shared
 * `<GameOfLife>` engine (the same one the machine-god article and the index
 * embed), wrapped in the arcade cabinet for a consistent frame + zen mode.
 *
 * Distinct from "Hex Life" (`HexLifePage`), which is a *hexagonal* 6-neighbour
 * automaton with B/S rule presets — a different beast kept as its own toy.
 */
export function LifePage() {
  return (
    <GameCabinet
      title="Life"
      blurb="Conway's Game of Life — B3/S23 on a wrapping grid. Click to seed; watch it think."
      status="playing"
      zen
    >
      <div style={{ padding: "var(--space-4)" }}>
        <GameOfLife cols={80} rows={56} cellPx={6} caption={null} />
      </div>
    </GameCabinet>
  )
}
