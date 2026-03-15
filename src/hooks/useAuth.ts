import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { Session } from "@supabase/supabase-js"

export type UserRole = "pending" | "editor" | "admin" | null

interface ProfileFields {
  username: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string | null
}

interface AuthState extends ProfileFields {
  session: Session | null
  role: UserRole
  loading: boolean
}

export function useAuth(): AuthState & {
  signIn: (email: string) => Promise<{ error: string | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, username: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updateProfile: (data: Partial<Pick<ProfileFields, "username" | "bio" | "avatar_url">>) => Promise<{ error: string | null }>
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
    // PKCE's detectSessionInUrl only checks query params, not hash fragments
    const hash = window.location.hash
    if (hash.includes("type=recovery") && hash.includes("access_token=")) {
      // Supabase client will pick up the hash tokens via detectSessionInUrl,
      // but we need to ensure redirect happens even if onAuthStateChange
      // fires before this effect. Schedule a check after auth resolves.
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          window.history.replaceState(null, "", "/profile")
          window.location.replace("/profile")
        }
      })
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchProfile(accessToken: string) {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        const data = await res.json() as {
          role: string
          username: string | null
          bio: string | null
          avatar_url: string | null
          created_at: string | null
        }
        setRole(data.role as UserRole)
        setUsername(data.username)
        setBio(data.bio)
        setAvatarUrl(data.avatar_url)
        setCreatedAt(data.created_at)

        // If we have a pending username from signup, set it now
        const pendingUsername = localStorage.getItem("wiki_pending_username")
        if (pendingUsername && !data.username) {
          localStorage.removeItem("wiki_pending_username")
          const updateRes = await fetch("/api/auth/profile", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ username: pendingUsername }),
          })
          if (updateRes.ok) setUsername(pendingUsername)
        }
      } else {
        setRole("pending")
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
    const regRes = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username: usernameVal }),
    })
    if (!regRes.ok) {
      const data = await regRes.json() as { error?: string }
      return { error: data.error ?? "Registration failed" }
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
  }

  const updateProfile = useCallback(async (data: Partial<Pick<ProfileFields, "username" | "bio" | "avatar_url">>) => {
    if (!session) return { error: "Not authenticated" }
    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json() as { error?: string }
      return { error: body.error ?? "Update failed" }
    }
    // Update local state
    if (data.username !== undefined) setUsername(data.username)
    if (data.bio !== undefined) setBio(data.bio)
    if (data.avatar_url !== undefined) setAvatarUrl(data.avatar_url)
    return { error: null }
  }, [session])

  return { session, role, loading, username, bio, avatar_url, created_at, signIn, signInWithPassword, signUp, signOut, updateProfile, changePassword, resetPassword }
}
