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

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchRole(session.access_token)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRole(session.access_token)
      else {
        setRole(null)
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
    const { error } = await supabase.auth.signInWithOtp({ email })
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
