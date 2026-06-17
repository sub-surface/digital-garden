import { Env, AuthUser, ProfileData } from "./types"
import { hashApiKey } from "./keys"

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders() })
}

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

export function supabaseRest(env: Env, path: string, method = "GET", body?: unknown) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function buildAuthUser(env: Env, userId: string, email: string | null): Promise<AuthUser | null> {
  // Fetch profile from profiles table
  const profileRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role,username,bio,avatar_url,created_at,name_color`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  if (!profileRes.ok) return null
  const profiles = await profileRes.json<ProfileData[]>()
  const profile = profiles?.[0]

  // Auto-create profile if none exists (first login after magic link)
  if (!profile) {
    if (!email) return null  // API key path — no profile means invalid key user
    await supabaseRest(env, "profiles", "POST", {
      id: userId, email: email, role: "pending",
    })
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

export async function verifyAuth(request: Request, env: Env): Promise<AuthUser | null> {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ") || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null

  const token = authHeader.slice(7)

  // Fast path: API keys start with sk_ — skip JWT attempt
  if (!token.startsWith("sk_")) {
    // 1. Verify the JWT by calling Supabase auth
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_KEY },
    })
    if (userRes.ok) {
      const user = await userRes.json<{ id: string; email: string }>()
      return buildAuthUser(env, user.id, user.email)
    }
  }

  // 2. Try as API key — strip sk_ prefix if present
  const apiKeyRaw = token.startsWith("sk_") ? token.slice(3) : token
  const keyHash = await hashApiKey(apiKeyRaw)
  const keyRes = await fetch(
    env.SUPABASE_URL + "/rest/v1/api_keys?key_hash=eq." + encodeURIComponent(keyHash) + "&revoked_at=is.null&select=user_id",
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY } }
  )
  if (!keyRes.ok) return null
  const keyRows = await keyRes.json<{ user_id: string }[]>()
  if (!keyRows[0]) return null

  // Update last_used_at — fire and forget, failure never blocks request
  fetch(env.SUPABASE_URL + "/rest/v1/api_keys?key_hash=eq." + encodeURIComponent(keyHash), {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  }).catch((e) => console.error("api-key last_used_at update failed:", e))

  return buildAuthUser(env, keyRows[0].user_id, null)
}
