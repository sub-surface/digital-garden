import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { Session } from "@supabase/supabase-js"
import { apiGet, apiPost, apiPut, apiErrorMessage } from "@/lib/api"

export type UserRole = "pending" | "editor" | "admin" | null

interface ProfileFields {
  username: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string | null
  name_color: string | null
}

interface AuthState extends ProfileFields {
  session: Session | null
  role: UserRole
  loading: boolean
  claimed_slug: string | null
}

export function useAuth(): AuthState & {
  signIn: (email: string) => Promise<{ error: string | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, username: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updateProfile: (data: Partial<Pick<ProfileFields, "username" | "bio" | "avatar_url" | "name_color">>) => Promise<{ error: string | null }>
  changePassword: (newPassword: string) => Promise<{ error: string | null }>
  resetPassword: (email: string) => Promise<{ error: string | null }>
} {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole>(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)
  const [bio, setBio] = useState<string | null>(null)
  const [avatar_url, setAvatarUrl] = useState<string | null>(null)
  const [created_at, setCreatedAt] = useState<string | null>(null)
  const [name_color, setNameColor] = useState<string | null>(null)
  const [claimed_slug, setClaimedSlug] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session) {
        fetchProfile(session.access_token)

        // Recovery flow — redirect to profile so user can set a new password
        if (event === "PASSWORD_RECOVERY") {
          window.location.replace("/profile")
          return
        }
      } else {
        setRole(null)
        setUsername(null)
        setBio(null)
        setAvatarUrl(null)
        setCreatedAt(null)
        setNameColor(null)
        setClaimedSlug(null)
        setLoading(false)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session)
        fetchProfile(session.access_token)
      } else {
        setLoading(false)
      }
    })

    // Fallback: detect recovery tokens in URL hash (implicit flow from email links)
    // PKCE's detectSessionInUrl only checks query params, not hash fragments,
    // so we must manually parse and exchange hash tokens via setSession().
    const hash = window.location.hash
    if (hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get("access_token")
      const refreshToken = params.get("refresh_token")
      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).then(({ data: { session: newSession }, error }) => {
          if (error || !newSession) return
          // Clean hash from URL
          window.history.replaceState(null, "", window.location.pathname)
          // Recovery flow — redirect to profile for password reset
          if (params.get("type") === "recovery") {
            window.location.replace("/profile")
          }
        })
      }
    }

    return () => subscription.unsubscribe()
  }, [])

  // Dev auto-login — only in development, only when VITE_DEV_AUTH_EMAIL + VITE_DEV_AUTH_PASSWORD set
  useEffect(() => {
    if (!supabase) return
    if (import.meta.env.PROD) return
    const email = import.meta.env.VITE_DEV_AUTH_EMAIL as string | undefined
    const password = import.meta.env.VITE_DEV_AUTH_PASSWORD as string | undefined
    if (!email || !password) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) return // already logged in
      supabase!.auth.signInWithPassword({ email, password }).catch(() => {
        // Silently fail — dev convenience only
      })
    })
  }, [])

  async function fetchProfile(accessToken: string) {
    try {
      const data = await apiGet<{
        role: string
        username: string | null
        bio: string | null
        avatar_url: string | null
        created_at: string | null
        name_color: string | null
        claimed_slug?: string | null
      }>("/api/auth/me", { token: accessToken })
      setRole(data.role as UserRole)
      setUsername(data.username)
      setBio(data.bio)
      setAvatarUrl(data.avatar_url)
      setCreatedAt(data.created_at)
      setNameColor(data.name_color)
      setClaimedSlug(data.claimed_slug ?? null)

      // If we have a pending username from signup, set it now
      const pendingUsername = localStorage.getItem("wiki_pending_username")
      if (pendingUsername && !data.username) {
        localStorage.removeItem("wiki_pending_username")
        try {
          await apiPut("/api/auth/profile", { username: pendingUsername }, { token: accessToken })
          setUsername(pendingUsername)
        } catch {
          // Previously: `if (updateRes.ok) setUsername(...)` with no error
          // handling on failure — preserve that silent skip.
        }
      }
    } catch {
      setRole("pending")
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email: string) {
    if (!supabase) return { error: "Auth not configured" }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    return { error: error?.message ?? null }
  }

  async function signInWithPassword(email: string, password: string) {
    if (!supabase) return { error: "Auth not configured" }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signUp(email: string, usernameVal: string, password: string) {
    if (!supabase) return { error: "Auth not configured" }

    // Validate & check uniqueness server-side
    try {
      await apiPost("/api/auth/register", { email, username: usernameVal })
    } catch (e) {
      return { error: apiErrorMessage(e, "Registration failed") }
    }

    // Store username for post-signup profile setup
    localStorage.setItem("wiki_pending_username", usernameVal)

    // Sign up with email + password directly — no magic link round-trip
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/profile` },
    })
    return { error: error?.message ?? null }
  }

  async function resetPassword(email: string) {
    if (!supabase) return { error: "Auth not configured" }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/profile`,
    })
    return { error: error?.message ?? null }
  }

  async function changePassword(newPassword: string) {
    if (!supabase) return { error: "Auth not configured" }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
    setRole(null)
    setUsername(null)
    setBio(null)
    setAvatarUrl(null)
    setCreatedAt(null)
    setNameColor(null)
    setClaimedSlug(null)
  }

  const updateProfile = useCallback(async (data: Partial<Pick<ProfileFields, "username" | "bio" | "avatar_url" | "name_color">>) => {
    if (!session) return { error: "Not authenticated" }
    try {
      await apiPut("/api/auth/profile", data, { token: session.access_token })
    } catch (e) {
      return { error: apiErrorMessage(e, "Update failed") }
    }
    // Update local state
    if (data.username !== undefined) setUsername(data.username)
    if (data.bio !== undefined) setBio(data.bio)
    if (data.avatar_url !== undefined) setAvatarUrl(data.avatar_url)
    if (data.name_color !== undefined) setNameColor(data.name_color)
    return { error: null }
  }, [session])

  return { session, role, loading, username, bio, avatar_url, created_at, name_color, claimed_slug, signIn, signInWithPassword, signUp, signOut, updateProfile, changePassword, resetPassword }
}
