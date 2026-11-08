import { useCallback, useEffect, useRef, useState } from "react"
import { loadTurnstile } from "@/lib/turnstile"

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

function turnstileApi(): TurnstileApi | undefined {
  return (window as typeof window & { turnstile?: TurnstileApi }).turnstile
}

/**
 * One owner for a Turnstile widget's lifecycle: render into the container
 * once it mounts, hold the token, reset after a submit, remove on unmount.
 *
 * Replaces three copy-pasted effects that each (a) never reset the widget, so
 * a failed submit left a spent single-use token and every retry failed with
 * "Captcha validation failed", and (b) never removed the widget, which in the
 * OS (forms opening and closing as windows) leaked one per open.
 */
export function useTurnstile(enabled: boolean) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [token, setToken] = useState("")
  const widgetId = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !container) return
    let cancelled = false
    loadTurnstile()
      .then(() => {
        const api = turnstileApi()
        if (cancelled || !api) return
        widgetId.current = api.render(container, {
          sitekey: SITE_KEY,
          callback: (next: string) => setToken(next),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        })
      })
      .catch((err) => console.warn("Turnstile script failed to load:", err))
    return () => {
      cancelled = true
      if (widgetId.current) turnstileApi()?.remove(widgetId.current)
      widgetId.current = null
      setToken("")
    }
  }, [enabled, container])

  /** Tokens are single-use: call after any submit that didn't end the form. */
  const reset = useCallback(() => {
    setToken("")
    if (widgetId.current) turnstileApi()?.reset(widgetId.current)
  }, [])

  return { containerRef: setContainer, token, reset }
}
