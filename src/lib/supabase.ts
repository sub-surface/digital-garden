import { createClient } from "@supabase/supabase-js"

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

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        detectSessionInUrl: true,
        flowType: "pkce",
        storage: makeCookieStorage(COOKIE_DOMAIN) ?? undefined,
        // Disable Web Locks API — causes orphaned lock warnings in React Strict Mode
        // (double-mount unmounts the lock holder before release). Safe in browser SPA.
        lock: (_name, _acquireTimeout, fn) => fn(),
      },
    })
  : null
