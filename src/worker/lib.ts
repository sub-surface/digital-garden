import { Env, AuthUser, ProfileData } from "./types"
import { hashApiKey } from "./keys"

// ─── CORS ────────────────────────────────────────────────────────────────────
// Auth is Bearer-header based (no cookies), so CORS is about not handing API
// responses to arbitrary origins — reflect only our own hosts + local dev.
const ALLOWED_ORIGINS = new Set([
  "https://subsurfaces.net",
  "https://www.subsurfaces.net",
  "https://wiki.subsurfaces.net",
  "https://chat.subsurfaces.net",
  "https://os.subsurfaces.net",
  "http://localhost:5173",
  "http://localhost:8787",
])

export function corsHeaders(origin?: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://subsurfaces.net"
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  }
}

/** Applied by the dispatcher to every /api response (handlers don't set CORS). */
export function applyApiHeaders(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
  headers.set("X-Content-Type-Options", "nosniff")
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store")
  return new Response(response.body, { status: response.status, headers })
}

export function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status })
}

/** Log an upstream (Supabase/GitHub/…) failure with enough detail to debug it,
 * then return a client-safe error. Failure must be visible — design law. */
export async function upstreamError(label: string, res: Response, clientMessage: string, status = 500) {
  let detail = ""
  try { detail = (await res.text()).slice(0, 300) } catch { /* body already consumed / unreadable */ }
  console.error(`[upstream] ${label}: ${res.status} ${detail}`)
  return jsonResponse({ error: clientMessage }, status)
}

// ─── External API helpers ────────────────────────────────────────────────────
export function ghApi(env: Env) {
  return (path: string, method: string, payload?: unknown) =>
    fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "digital-garden-wiki-edit/1.0",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    })
}

export function supabaseRest(env: Env, path: string, method = "GET", body?: unknown, prefer?: string) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer ?? (method === "POST" ? "return=representation" : "return=minimal"),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ─── Auth (with in-isolate caching) ─────────────────────────────────────────
// Every authenticated request used to pay 2 serial Supabase round trips
// (auth/v1/user + profiles). Cache the resolved AuthUser per bearer token for
// a short TTL: chat polls hit this constantly. Role/ban changes propagate
// within TTL_MS; ban checks on message POST still hit the DB live.
const AUTH_TTL_MS = 60_000
const AUTH_CACHE_MAX = 500
const authCache = new Map<string, { user: AuthUser; expires: number }>()

function cacheGet(token: string): AuthUser | null {
  const hit = authCache.get(token)
  if (hit && hit.expires > Date.now()) return hit.user
  if (hit) authCache.delete(token)
  return null
}

function cacheSet(token: string, user: AuthUser) {
  if (authCache.size >= AUTH_CACHE_MAX) authCache.clear() // crude but bounded
  authCache.set(token, { user, expires: Date.now() + AUTH_TTL_MS })
}

/** Invalidate cached auth for a user (call after profile updates). */
export function invalidateAuthCache(userId: string) {
  for (const [token, entry] of authCache) {
    if (entry.user.id === userId) authCache.delete(token)
  }
}

export async function buildAuthUser(env: Env, userId: string, email: string | null): Promise<AuthUser | null> {
  const profileRes = await supabaseRest(env, `profiles?id=eq.${userId}&select=role,username,bio,avatar_url,created_at,name_color`)
  if (!profileRes.ok) {
    console.error(`[auth] profile fetch failed for ${userId}: ${profileRes.status}`)
    return null
  }
  const profiles = await profileRes.json<ProfileData[]>()
  const profile = profiles?.[0]

  // Auto-create profile if none exists (first login after magic link)
  if (!profile) {
    if (!email) return null  // API key path — no profile means invalid key user
    await supabaseRest(env, "profiles", "POST", { id: userId, email, role: "pending" })
    return { id: userId, role: "pending", email, username: null, bio: null, avatar_url: null, created_at: null, name_color: null }
  }

  return {
    id: userId,
    role: profile.role ?? "pending",
    email: email ?? "",
    username: profile.username,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    created_at: profile.created_at,
    name_color: profile.name_color ?? null,
  }
}

export async function verifyAuth(
  request: Request,
  env: Env,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<AuthUser | null> {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ") || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null

  const token = authHeader.slice(7)
  const cached = cacheGet(token)
  if (cached) return cached

  // Fast path: API keys start with sk_ — skip JWT attempt
  if (!token.startsWith("sk_")) {
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_KEY },
    })
    if (userRes.ok) {
      const user = await userRes.json<{ id: string; email: string }>()
      const authUser = await buildAuthUser(env, user.id, user.email)
      if (authUser) cacheSet(token, authUser)
      return authUser
    }
  }

  // Try as API key — strip sk_ prefix if present
  const apiKeyRaw = token.startsWith("sk_") ? token.slice(3) : token
  const keyHash = await hashApiKey(apiKeyRaw)
  const keyRes = await supabaseRest(env, `api_keys?key_hash=eq.${encodeURIComponent(keyHash)}&revoked_at=is.null&select=user_id`)
  if (!keyRes.ok) return null
  const keyRows = await keyRes.json<{ user_id: string }[]>()
  if (!keyRows[0]) return null

  // last_used_at bookkeeping — background work, must be registered with
  // waitUntil or the runtime may cancel it after the response is sent.
  const touch = supabaseRest(env, `api_keys?key_hash=eq.${encodeURIComponent(keyHash)}`, "PATCH", {
    last_used_at: new Date().toISOString(),
  }).catch((e) => console.error("[auth] api-key last_used_at update failed:", e))
  if (waitUntil) waitUntil(touch)

  const authUser = await buildAuthUser(env, keyRows[0].user_id, null)
  if (authUser) cacheSet(token, authUser)
  return authUser
}
