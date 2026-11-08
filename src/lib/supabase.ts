import type { SupabaseClient } from "@supabase/supabase-js"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ""
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ""
const COOKIE_DOMAIN = import.meta.env.VITE_COOKIE_DOMAIN as string | undefined

// Cross-subdomain cookie storage adapter.
// Supabase's default localStorage is origin-scoped — sessions don't cross
// subdomains. This adapter writes to document.cookie with domain=.subsurfaces.net
// so the same session is visible on wiki.*, chat.*, and subsurfaces.net.
// Falls back to localStorage when VITE_COOKIE_DOMAIN is unset (local dev).
function makeCookieStorage(domain?: string) {
  if (!domain || typeof document === "undefined") return undefined
  // Respect cookie consent — rejected = localStorage-only (single domain sessions)
  if (typeof localStorage !== "undefined" && localStorage.getItem("cookie-consent") === "rejected") return undefined

  const MAX_AGE = 60 * 60 * 24 * 365 // 1 year

  function getCookie(name: string): string | null {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(name + "="))
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null
  }

  function setCookie(name: string, value: string) {
    document.cookie = [
      `${name}=${encodeURIComponent(value)}`,
      `domain=${domain}`,
      `path=/`,
      `max-age=${MAX_AGE}`,
      `SameSite=Lax`,
      `Secure`,
    ].join("; ")
  }

  function deleteCookie(name: string) {
    document.cookie = [
      `${name}=`,
      `domain=${domain}`,
      `path=/`,
      `max-age=0`,
      `SameSite=Lax`,
      `Secure`,
    ].join("; ")
  }

  return {
    getItem: (key: string) => getCookie(key),
    setItem: (key: string, value: string) => { setCookie(key, value) },
    removeItem: (key: string) => { deleteCookie(key) },
  }
}

/**
 * The client is loaded on demand. supabase-js is ~170 KB, and an anonymous
 * reader of the garden never needs it: it wakes for the wiki and the OS, for
 * a visitor with a stored session (`authHint`), or when someone logs in.
 * It used to be created at import, so every page paid for it up front.
 */
export const authConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

let client: SupabaseClient | null = null
let loading: Promise<SupabaseClient | null> | null = null
const waiting = new Set<(client: SupabaseClient) => void>()

export function loadSupabase(): Promise<SupabaseClient | null> {
  if (!authConfigured) return Promise.resolve(null)
  if (client) return Promise.resolve(client)
  loading ??= import("@supabase/supabase-js").then(({ createClient }) => {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        detectSessionInUrl: true,
        flowType: "pkce",
        storage: makeCookieStorage(COOKIE_DOMAIN) ?? undefined,
        // Disable Web Locks API — causes orphaned lock warnings in React Strict Mode
        // (double-mount unmounts the lock holder before release). Safe in browser SPA.
        lock: (_name, _acquireTimeout, fn) => fn(),
      },
    })
    for (const cb of waiting) cb(client)
    waiting.clear()
    return client
  })
  return loading
}

/** The client if it's already loaded (realtime code runs only once signed in). */
export function supabaseNow(): SupabaseClient | null {
  return client
}

/** Run `cb` once the client exists (now, if it already does). Returns a cancel. */
export function whenSupabase(cb: (client: SupabaseClient) => void): () => void {
  if (client) {
    cb(client)
    return () => {}
  }
  waiting.add(cb)
  return () => waiting.delete(cb)
}

/** Any sign of a session worth waking auth for: a stored token, or an auth redirect. */
export function authHint(): boolean {
  if (typeof window === "undefined") return false
  const looksLikeToken = (key: string) => key.startsWith("sb-") && key.includes("auth-token")
  if (document.cookie.split("; ").some((row) => looksLikeToken(row.split("=")[0]))) return true
  try {
    for (let i = 0; i < localStorage.length; i++) if (looksLikeToken(localStorage.key(i) ?? "")) return true
  } catch {
    // storage blocked: no stored session we can see
  }
  const { search, hash } = window.location
  return /[?&]code=/.test(search) || hash.includes("access_token=")
}
