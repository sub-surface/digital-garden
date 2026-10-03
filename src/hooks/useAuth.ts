import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
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

export interface AuthState extends ProfileFields {
  session: Session | null
  role: UserRole
  loading: boolean
  claimed_slug: string | null
}

export type AuthContextValue = AuthState & {
  signIn: (email: string) => Promise<{ error: string | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, username: string, password: string, redirectOrigin?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updateProfile: (data: Partial<Pick<ProfileFields, "username" | "bio" | "avatar_url" | "name_color">>) => Promise<{ error: string | null }>
  changePassword: (newPassword: string) => Promise<{ error: string | null }>
  resetPassword: (email: string, redirectOrigin?: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Owns the one Supabase session subscription and profile cache shared by every
 * shell. Keeping this lifecycle at the application root prevents each caller
 * of useAuth() from opening another listener and repeating the same bootstrap.
 */
const EMPTY_PROFILE: ProfileFields & { role: UserRole; claimed_slug: string | null } = {
  role: null, username: null, bio: null, avatar_url: null, created_at: null, name_color: null, claimed_slug: null,
}
type Profile = typeof EMPTY_PROFILE

function useAuthController(): AuthContextValue {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  // Profile is per USER, not per token: TOKEN_REFRESHED (hourly) and the
  // getSession/onAuthStateChange double-fire at boot used to refetch
  // /api/auth/me each time. `profileFor` remembers whose profile is loaded;
  // `requestSeq` drops responses that resolve after a newer request or sign-out.
  const profileFor = useRef<string | null>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    function applySession(next: Session | null) {
      setSession(next)
      if (!next) {
        profileFor.current = null
        requestSeq.current++
        setProfile(EMPTY_PROFILE)
        setLoading(false)
        return
      }
      if (profileFor.current !== next.user.id) {
        profileFor.current = next.user.id
        fetchProfile(next.access_token)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      applySession(next)
      // Recovery flow — redirect to profile so user can set a new password
      if (next && event === "PASSWORD_RECOVERY") window.location.replace("/profile")
    })

    supabase.auth.getSession().then(({ data: { session: initial } }) => applySession(initial))

    // Fallback: detect recovery tokens in URL hash (implicit flow from email links)
    // PKCE's detectSessionInUrl only checks query params, not hash fragments,
    // so we must manually parse and exchange hash tokens via setSession().
    const hash = window.location.hash
    if (hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get("access_token")
      const refreshToken = params.get("refresh_token")
      // Scrub the tokens from the address bar and history immediately, success
      // or not — a failed exchange used to leave them sitting in the URL.
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).then(({ data: { session: newSession }, error }) => {
          if (error || !newSession) {
            console.error("[auth] could not exchange link tokens:", error?.message ?? "no session")
            return
          }
          // Recovery flow — redirect to profile for password reset
          if (params.get("type") === "recovery") {
            window.location.replace("/profile")
          }
        })
      }
    }

    return () => subscription.unsubscribe()
    // fetchProfile only touches setters and refs; the subscription is set up once.
     
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
    const seq = ++requestSeq.current
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
      if (seq !== requestSeq.current) return
      setProfile({
        role: data.role as UserRole,
        username: data.username,
        bio: data.bio,
        avatar_url: data.avatar_url,
        created_at: data.created_at,
        name_color: data.name_color,
        claimed_slug: data.claimed_slug ?? null,
      })

      // If we have a pending username from signup, set it now
      const pendingUsername = localStorage.getItem("wiki_pending_username")
      if (pendingUsername && !data.username) {
        localStorage.removeItem("wiki_pending_username")
        try {
          await apiPut("/api/auth/profile", { username: pendingUsername }, { token: accessToken })
          if (seq === requestSeq.current) setProfile((p) => ({ ...p, username: pendingUsername }))
        } catch (e) {
          console.error("[auth] could not apply pending username:", apiErrorMessage(e, "unknown error"))
        }
      }
    } catch (e) {
      if (seq !== requestSeq.current) return
      // A failed profile fetch is our outage, not a demotion. Only fall back to
      // "pending" (the least-privileged signed-in state) when nothing is known yet;
      // an already-loaded editor/admin keeps their role.
      console.error("[auth] /api/auth/me failed:", apiErrorMessage(e, "unknown error"))
      profileFor.current = null // let the next auth event retry
      setProfile((p) => (p.role ? p : { ...p, role: "pending" }))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
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

  async function signUp(email: string, usernameVal: string, password: string, redirectOrigin = window.location.origin) {
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
      options: { emailRedirectTo: `${redirectOrigin}/profile` },
    })
    // Never leave a stale pending username for the next account to inherit.
    if (error) localStorage.removeItem("wiki_pending_username")
    return { error: error?.message ?? null }
  }

  async function resetPassword(email: string, redirectOrigin = window.location.origin) {
    if (!supabase) return { error: "Auth not configured" }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectOrigin}/profile`,
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
    // The SIGNED_OUT auth event resets session + profile (applySession).
    await supabase.auth.signOut()
  }

  const updateProfile = useCallback(async (data: Partial<Pick<ProfileFields, "username" | "bio" | "avatar_url" | "name_color">>) => {
    if (!session) return { error: "Not authenticated" }
    try {
      await apiPut("/api/auth/profile", data, { token: session.access_token })
    } catch (e) {
      return { error: apiErrorMessage(e, "Update failed") }
    }
    // Update local state
    setProfile((p) => {
      const next = { ...p }
      for (const [k, v] of Object.entries(data)) if (v !== undefined) (next as Record<string, unknown>)[k] = v
      return next
    })
    return { error: null }
  }, [session])

  // The other actions close over setters and refs only, so memoising on state
  // stops every consumer re-rendering whenever the provider's parent renders.
  return useMemo(
    () => ({ session, loading, ...profile, signIn, signInWithPassword, signUp, signOut, updateProfile, changePassword, resetPassword }),
     
    [session, loading, profile, updateProfile],
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthController()
  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used within AuthProvider")
  return value
}
