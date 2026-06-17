import { useNavigate } from "@tanstack/react-router"
import styles from "./BackToArcade.module.scss"

/**
 * Shared "back to arcade" button shown on every arcade game page (injected once
 * in NoteRenderer's game-layout). Fixed top-right so it survives fullscreen games.
 * External arcade entries like StarWeft are separate projects and never render a
 * game-layout here, so they are excluded automatically. The graph/constellation
 * views also use the game layout but are reached from the main nav, not the
 * arcade, so they opt out explicitly.
 */
const NON_ARCADE_GAMES = new Set(["graph", "constellation"])

export function BackToArcade({ slug }: { slug: string }) {
  const navigate = useNavigate()
  if (NON_ARCADE_GAMES.has(slug.toLowerCase())) return null
  return (
    <button
      className={styles.backBtn}
      onClick={() => navigate({ to: "/$", params: { _splat: "arcade" } as any })}
      title="Back to the arcade"
      aria-label="Back to the arcade"
    >
      ‹ Arcade
    </button>
  )
}
