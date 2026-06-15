import { Component, type ErrorInfo, type ReactNode } from "react"
import styles from "./ErrorBoundary.module.scss"

interface Props {
  children: ReactNode
  /** Short context shown in the fallback, e.g. "note", "graph". */
  label?: string
  /** Custom fallback overrides the default terminal card. */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** Reset the boundary when any of these values change (e.g. route slug). */
  resetKeys?: unknown[]
}

interface State {
  error: Error | null
}

/**
 * Catches render-time throws so one broken note / failed lazy() chunk can't
 * white-screen the whole shell. Offers retry (re-mount) and reload. Failed
 * dynamic imports after a stale deploy throw "Failed to fetch dynamically
 * imported module" — detected to suggest a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    // Auto-reset when resetKeys change (e.g. navigating to a different note).
    if (this.state.error && prev.resetKeys && this.props.resetKeys) {
      const changed =
        prev.resetKeys.length !== this.props.resetKeys.length ||
        prev.resetKeys.some((k, i) => k !== this.props.resetKeys![i])
      if (changed) this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ""}]`, error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) return this.props.fallback(error, this.reset)

    const isChunkError =
      /dynamically imported module|Failed to fetch|Importing a module script failed|ChunkLoadError/i.test(
        error.message
      )
    const label = this.props.label ?? "view"

    return (
      <div className={styles.container} role="alert">
        <div className={styles.glyph}>[ ! ]</div>
        <h2 className={styles.title}>
          {isChunkError ? "Stale build detected" : `This ${label} hit an error`}
        </h2>
        <p className={styles.message}>
          {isChunkError
            ? "A piece of the app failed to load — likely a new deploy landed while this tab was open."
            : "Something in this view threw while rendering. The rest of the site is fine."}
        </p>
        <div className={styles.actions}>
          {isChunkError ? (
            <button className={styles.button} onClick={() => window.location.reload()}>
              {">"} RELOAD
            </button>
          ) : (
            <button className={styles.button} onClick={this.reset}>
              {">"} RETRY
            </button>
          )}
        </div>
        <pre className={styles.detail}>{error.message}</pre>
      </div>
    )
  }
}
