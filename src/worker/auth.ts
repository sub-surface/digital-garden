import { Env } from "./types"
import { verifyAuth, jsonResponse, supabaseRest } from "./lib"
import { getContentIndex, chatterImageForUsername } from "./meta"
import { getStonkConfig } from "./stonks"

export async function handleAuthMe(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  // Chatter image fallback: if no avatar_url set, check for a wiki chatter page
  let avatar_url = auth.avatar_url
  if (!avatar_url && auth.username) {
    const index = await getContentIndex(env.ASSETS)
    avatar_url = chatterImageForUsername(index, auth.username)
  }

  // Stonk balance
  const config = await getStonkConfig(env)
  let stonk_balance: number | null = null
  if (config.stonks_enabled) {
    const balRes = await supabaseRest(env, `stonk_balance?user_id=eq.${auth.id}&select=balance`)
    if (balRes.ok) {
      const balRows = await balRes.json<{ balance: number }[]>()
      stonk_balance = balRows.length > 0 ? balRows[0].balance : 0
    }
  }

  // Wiki claim
  let claimed_slug: string | null = null
  const claimRes = await supabaseRest(env, `chatter_claims?user_id=eq.${auth.id}&select=wiki_slug`)
  if (claimRes.ok) {
    const claims = await claimRes.json<{ wiki_slug: string }[]>()
    if (claims.length > 0) claimed_slug = claims[0].wiki_slug
  }

  return jsonResponse({
    role: auth.role,
    email: auth.email,
    username: auth.username,
    bio: auth.bio,
    avatar_url,
    created_at: auth.created_at,
    name_color: auth.name_color,
    stonk_balance,
    claimed_slug,
  })
}

export async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  let body: Record<string, any>
  try { body = await request.json() } catch {
    return jsonResponse({ error: "Invalid request body" }, 400)
  }

  const updates: Record<string, string> = {}
  if (typeof body.username === "string") {
    const username = body.username.trim()
    if (username && !/^[a-zA-Z0-9-]{3,30}$/.test(username)) {
      return jsonResponse({ error: "Username must be 3-30 chars, alphanumeric and hyphens only" }, 400)
    }
    if (username) {
      // Check uniqueness
      const checkRes = await supabaseRest(env, `profiles?username=eq.${encodeURIComponent(username)}&id=neq.${auth.id}&select=id`)
      if (checkRes.ok) {
        const existing = await checkRes.json<{ id: string }[]>()
        if (existing.length > 0) return jsonResponse({ error: "Username already taken" }, 409)
      }
      updates.username = username
    }
  }
  if (typeof body.bio === "string") updates.bio = body.bio.slice(0, 500)
  if (typeof body.avatar_url === "string") updates.avatar_url = body.avatar_url.slice(0, 500)
  if (body.name_color !== undefined) {
    if (body.name_color === null || body.name_color === "") {
      updates.name_color = null as any
    } else if (typeof body.name_color === "string") {
      const color = body.name_color.trim()
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        return jsonResponse({ error: "name_color must be a valid hex color (#RRGGBB)" }, 400)
      }
      updates.name_color = color
    }
  }

  if (Object.keys(updates).length === 0) return jsonResponse({ error: "No fields to update" }, 400)

  const res = await supabaseRest(env, `profiles?id=eq.${auth.id}`, "PATCH", updates)
  if (!res.ok) return jsonResponse({ error: "Failed to update profile" }, 500)

  return jsonResponse({ ok: true, ...updates })
}

export async function handleAvatarUpload(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  const contentType = request.headers.get("Content-Type") ?? ""
  if (!contentType.startsWith("image/")) {
    return jsonResponse({ error: "File must be an image" }, 400)
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  const mimeType = contentType.split(";")[0].trim()
  if (!allowed.includes(mimeType)) {
    return jsonResponse({ error: "Allowed types: JPEG, PNG, WebP, GIF" }, 400)
  }

  const body = await request.arrayBuffer()
  if (body.byteLength > 2 * 1024 * 1024) {
    return jsonResponse({ error: "File too large — maximum 2 MB" }, 413)
  }

  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "gif"
  const path = `${auth.id}.${ext}`

  // Upload to Supabase Storage (upsert — replaces any previous avatar)
  const uploadRes = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/avatars/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        apikey: env.SUPABASE_SERVICE_KEY,
        "Content-Type": mimeType,
        "x-upsert": "true",
      },
      body,
    }
  )
  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    console.error("Avatar upload error:", err)
    return jsonResponse({ error: "Failed to upload image" }, 500)
  }

  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/avatars/${path}`

  // Persist URL to profile
  const patchRes = await supabaseRest(env, `profiles?id=eq.${auth.id}`, "PATCH", { avatar_url: publicUrl })
  if (!patchRes.ok) return jsonResponse({ error: "Failed to save avatar URL" }, 500)

  return jsonResponse({ ok: true, avatar_url: publicUrl })
}

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  let body: Record<string, any>
  try { body = await request.json() } catch {
    return jsonResponse({ error: "Invalid request body" }, 400)
  }

  const email = (body.email as string)?.trim()
  const username = (body.username as string)?.trim()

  if (!email) return jsonResponse({ error: "Email is required" }, 400)
  if (!username || !/^[a-zA-Z0-9-]{3,30}$/.test(username)) {
    return jsonResponse({ error: "Username must be 3-30 chars, alphanumeric and hyphens only" }, 400)
  }

  // Check username uniqueness
  const checkRes = await supabaseRest(env, `profiles?username=eq.${encodeURIComponent(username)}&select=id`)
  if (checkRes.ok) {
    const existing = await checkRes.json<{ id: string }[]>()
    if (existing.length > 0) return jsonResponse({ error: "Username already taken" }, 409)
  }

  // Return success — client will trigger magic link and store username in localStorage
  // On first /api/auth/me call after login, the profile is auto-created.
  // The username will be set via /api/auth/profile after the magic link confirms.
  return jsonResponse({ ok: true })
}
