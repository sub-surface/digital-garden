import { useStore } from "@/store"
import styles from "./ContentIndexErrorBanner.module.scss"

/**
 * Surfaces a failed content-index load — without it, search/graph/random/the
 * command palette silently return nothing forever (the project's "make failure
 * visible" law). Offers a retry that re-runs the fetch from AppShell.
 */
export function ContentIndexErrorBanner() {
  const failed = useStore((s) => s.contentIndexError)
  const setError = useStore((s) => s.setContentIndexError)
  const setContentIndex = useStore((s) => s.setContentIndex)

  if (!failed) return null

  const retry = async () => {
    try {
      const r = await fetch(`/content-index.json?retry=${Date.now()}`)
      const ct = r.headers.get("content-type") ?? ""
      if (!r.ok || !ct.includes("json")) throw new Error(`content-index ${r.status}`)
      setContentIndex(await r.json())
      setError(false)
    } catch (err) {
      console.warn("Content index retry failed:", err)
      // Leave the banner up; the flag is already true.
    }
  }

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.dot} aria-hidden="true">●</span>
      <span className={styles.text}>
        Site index failed to load — search, graph and random-note are unavailable.
      </span>
      <button className={styles.retry} onClick={retry}>Retry</button>
    </div>
  )
}
