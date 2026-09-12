/**
 * Lazy Cloudflare Turnstile script loader.
 *
 * Dynamically injects the Turnstile script only when an edit or submission form
 * mounts, keeping reader and wiki pages 100% free of third-party cookies
 * and extraneous main-thread execution.
 */
let turnstileLoadPromise: Promise<void> | null = null

export function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if ((window as any).turnstile) return Promise.resolve()
  if (turnstileLoadPromise) return turnstileLoadPromise

  turnstileLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src*="turnstile"]')
    if (existing) {
      if ((window as any).turnstile) {
        resolve()
      } else {
        existing.addEventListener("load", () => resolve())
        existing.addEventListener("error", (e) => reject(e))
      }
      return
    }

    const script = document.createElement("script")
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = (err) => {
      turnstileLoadPromise = null
      reject(err)
    }
    document.head.appendChild(script)
  })

  return turnstileLoadPromise
}
