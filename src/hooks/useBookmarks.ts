import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"

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

async function apiFetch(path: string, method = "GET", body?: unknown): Promise<Response> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  return fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loggedIn, setLoggedIn] = useState(false)
  const migrated = useRef(false)

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
  }, [])

  // Sync localStorage changes across tabs (logged-out only)
  useEffect(() => {
    if (loggedIn) return
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setBookmarks(localLoad())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [loggedIn])

  async function loadFromServer() {
    try {
      const res = await apiFetch("/api/bookmarks")
      if (res.ok) {
        const data = await res.json() as { slug: string; title: string; added_at: string }[]
        setBookmarks(data.map((b) => ({ slug: b.slug, title: b.title, addedAt: b.added_at })))
      }
    } catch {}
  }

  async function migrateLocal(local: Bookmark[]) {
    try {
      await apiFetch("/api/bookmarks/migrate", "POST", { bookmarks: local })
      await loadFromServer()
    } catch {}
  }

  const isBookmarked = useCallback((slug: string) =>
    bookmarks.some((b) => b.slug === slug), [bookmarks])

  const toggleBookmark = useCallback(async (slug: string, title: string) => {
    const exists = bookmarks.some((b) => b.slug === slug)

    if (loggedIn) {
      if (exists) {
        // Optimistic remove
        setBookmarks((prev) => prev.filter((b) => b.slug !== slug))
        await apiFetch(`/api/bookmarks/${encodeURIComponent(slug)}`, "DELETE")
      } else {
        // Optimistic add
        const newBm: Bookmark = { slug, title, addedAt: new Date().toISOString() }
        setBookmarks((prev) => [newBm, ...prev])
        await apiFetch("/api/bookmarks", "POST", { slug, title })
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
      await apiFetch(`/api/bookmarks/${encodeURIComponent(slug)}`, "DELETE")
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
