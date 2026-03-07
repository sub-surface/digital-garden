import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import type { Session } from "@supabase/supabase-js"

export type UserRole = "pending" | "editor" | "admin" | null

interface AuthState {
  session: Session | null
  role: UserRole
  loading: boolean
}

export function useAuth(): AuthState & {
  signIn: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
} {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    // onAuthStateChange fires for both initial session detection (from localStorage
    // or URL hash fragments) and subsequent changes. It's the primary mechanism.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[auth]", event, session?.user?.email ?? "no session")
      setSession(session)
      if (session) fetchRole(session.access_token)
      else {
        setRole(null)
        setLoading(false)
      }
    })

    // Also check for existing session (covers page refresh with valid localStorage token)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session)
        fetchRole(session.access_token)
      } else {
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchRole(accessToken: string) {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        const data = await res.json() as { role: string }
        setRole(data.role as UserRole)
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
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
    setRole(null)
  }

  return { session, role, loading, signIn, signOut }
}
