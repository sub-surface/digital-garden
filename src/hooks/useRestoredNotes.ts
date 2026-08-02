import { useEffect } from "react"
import { create } from "zustand"
import { apiDelete, apiGet, apiPost, apiErrorMessage } from "@/lib/api"
import { useAuth } from "./useAuth"

interface RestoreRow {
  slug: string
  restored_at: string
}

interface RestoreState {
  userId: string | null
  slugs: string[]
  available: boolean
  loading: boolean
  error: string | null
  load: (userId: string, token: string, force?: boolean) => Promise<void>
  clear: () => void
  setRestored: (token: string, slug: string, restored: boolean) => Promise<void>
}

const useRestoreStore = create<RestoreState>((set, get) => ({
  userId: null,
  slugs: [],
  available: true,
  loading: false,
  error: null,
  load: async (userId, token, force = false) => {
    if (!force && (get().userId === userId || get().loading)) return
    set({ userId, loading: true, error: null })
    try {
      const data = await apiGet<{ restores: RestoreRow[]; available?: boolean }>("/api/os/restores", { token })
      if (get().userId !== userId) return
      set({ slugs: data.restores.map((row) => row.slug), available: data.available !== false, loading: false })
    } catch (error) {
      if (get().userId !== userId) return
      set({ loading: false, error: apiErrorMessage(error, "Recovered files are unavailable.") })
    }
  },
  clear: () => set({ userId: null, slugs: [], available: true, loading: false, error: null }),
  setRestored: async (token, slug, restored) => {
    if (!get().available) {
      const error = "Cross-surface recovery is not installed on this server."
      set({ error })
      throw new Error(error)
    }
    const before = get().slugs
    const next = restored
      ? [...new Set([...before, slug])]
      : before.filter((candidate) => candidate !== slug)
    set({ slugs: next, error: null })
    try {
      if (restored) await apiPost("/api/os/restores", { slug }, { token })
      else await apiDelete("/api/os/restores", { slug }, { token })
    } catch (error) {
      set({ slugs: before, error: apiErrorMessage(error, "The restore operation failed.") })
      throw error
    }
  },
}))

export function useRestoredNotes() {
  const auth = useAuth()
  const userId = useRestoreStore((state) => state.userId)
  const slugs = useRestoreStore((state) => state.slugs)
  const available = useRestoreStore((state) => state.available)
  const loading = useRestoreStore((state) => state.loading)
  const error = useRestoreStore((state) => state.error)
  const load = useRestoreStore((state) => state.load)
  const clear = useRestoreStore((state) => state.clear)
  const persistRestore = useRestoreStore((state) => state.setRestored)

  useEffect(() => {
    const sessionUserId = auth.session?.user.id
    const token = auth.session?.access_token
    if (sessionUserId && token) void load(sessionUserId, token)
    else clear()
  }, [auth.session?.access_token, auth.session?.user.id, load, clear])

  return {
    userId,
    slugs,
    available,
    loading,
    error,
    session: auth.session,
    authenticated: Boolean(auth.session),
    setRestored: (slug: string, restored: boolean) => {
      const token = auth.session?.access_token
      if (!token) return Promise.reject(new Error("Log on to restore files."))
      return persistRestore(token, slug, restored)
    },
  }
}
