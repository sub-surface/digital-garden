import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { apiGet, apiPost, apiDelete } from "@/lib/api"

const STORAGE_KEY = "wiki_bookmarks"

export interface Bookmark {
  slug: string
  title: string
  addedAt: string
}

// ── localStorage helpers (logged-out fallback) ──

function localLoad(): Bookmark[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
  } catch {
    return []
  }
}

function localSave(bookmarks: Bookmark[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks))
}

function localClear() {
  localStorage.removeItem(STORAGE_KEY)
}

// ── API helpers ──

async function getToken(): Promise<string | null> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  return session?.access_token ?? null
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loggedIn, setLoggedIn] = useState(false)
  const migrated = useRef(false)

  const loadFromServer = useCallback(async () => {
    try {
      const token = await getToken()
      // apiGet throws on a non-2xx status AND on a non-JSON body — the latter
      // covers what the old content-type guard was for: when the Worker isn't
      // in front of the assets (e.g. a `vite preview` build, or a misroute),
      // `/api/bookmarks` resolves to the SPA fallback HTML with a 200, and
      // apiGet's JSON.parse failure surfaces that as a thrown ApiError instead
      // of a raw "Unexpected token '<'". Either way lands in the catch below.
      const data = await apiGet<{ slug: string; title: string; added_at: string }[]>("/api/bookmarks", { token })
      setBookmarks(data.map((b) => ({ slug: b.slug, title: b.title, addedAt: b.added_at })))
    } catch (e) {
      console.warn("useBookmarks: server load failed:", e)
    }
  }, [])

  const migrateLocal = useCallback(async (local: Bookmark[]) => {
    try {
      const token = await getToken()
      await apiPost("/api/bookmarks/migrate", { bookmarks: local }, { token })
      await loadFromServer()
    } catch (e) {
      console.warn("useBookmarks: local migration failed:", e)
    }
  }, [loadFromServer])

  // Detect auth state and load bookmarks accordingly
  useEffect(() => {
    async function init() {
      if (!supabase) {
        setBookmarks(localLoad())
        return
      }

      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        setLoggedIn(true)
        await loadFromServer()
        // Migrate any local bookmarks on first sign-in
        if (!migrated.current) {
          migrated.current = true
          const local = localLoad()
          if (local.length > 0) {
            await migrateLocal(local)
            localClear()
          }
        }
      } else {
        setLoggedIn(false)
        setBookmarks(localLoad())
      }
    }

    init()

    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        setLoggedIn(true)
        await loadFromServer()
        if (!migrated.current) {
          migrated.current = true
          const local = localLoad()
          if (local.length > 0) {
            await migrateLocal(local)
            localClear()
          }
        }
      } else {
        setLoggedIn(false)
        setBookmarks(localLoad())
      }
    })
    return () => subscription.unsubscribe()
  }, [loadFromServer, migrateLocal])

  // Sync localStorage changes across tabs (logged-out only)
  useEffect(() => {
    if (loggedIn) return
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setBookmarks(localLoad())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [loggedIn])

  const isBookmarked = useCallback((slug: string) =>
    bookmarks.some((b) => b.slug === slug), [bookmarks])

  const toggleBookmark = useCallback(async (slug: string, title: string) => {
    const exists = bookmarks.some((b) => b.slug === slug)

    if (loggedIn) {
      const token = await getToken()
      if (exists) {
        // Optimistic remove
        setBookmarks((prev) => prev.filter((b) => b.slug !== slug))
        try {
          await apiDelete(`/api/bookmarks/${encodeURIComponent(slug)}`, undefined, { token })
        } catch (e) {
          // Previously fire-and-forget (response was never checked) — preserve
          // that behaviour: keep the optimistic update, just log the failure.
          console.warn("useBookmarks: remove failed:", e)
        }
      } else {
        // Optimistic add
        const newBm: Bookmark = { slug, title, addedAt: new Date().toISOString() }
        setBookmarks((prev) => [newBm, ...prev])
        try {
          await apiPost("/api/bookmarks", { slug, title }, { token })
        } catch (e) {
          console.warn("useBookmarks: add failed:", e)
        }
      }
    } else {
      setBookmarks((prev) => {
        const next = exists
          ? prev.filter((b) => b.slug !== slug)
          : [{ slug, title, addedAt: new Date().toISOString() }, ...prev]
        localSave(next)
        return next
      })
    }
  }, [bookmarks, loggedIn])

  const removeBookmark = useCallback(async (slug: string) => {
    if (loggedIn) {
      setBookmarks((prev) => prev.filter((b) => b.slug !== slug))
      try {
        const token = await getToken()
        await apiDelete(`/api/bookmarks/${encodeURIComponent(slug)}`, undefined, { token })
      } catch (e) {
        // Previously fire-and-forget — preserve that: keep the optimistic
        // removal, just log the failure.
        console.warn("useBookmarks: remove failed:", e)
      }
    } else {
      setBookmarks((prev) => {
        const next = prev.filter((b) => b.slug !== slug)
        localSave(next)
        return next
      })
    }
  }, [loggedIn])

  return { bookmarks, isBookmarked, toggleBookmark, removeBookmark }
}
