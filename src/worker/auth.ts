import { RouteCtx } from "./types"
import { jsonResponse, supabaseRest, upstreamError, invalidateAuthCache, siteDb } from "./lib"
import { getContentIndex, chatterImageForUsername } from "./meta"
import { propagateIdentityChange } from "./chat"

export async function handleAuthMe({ env, auth }: RouteCtx): Promise<Response> {
  // Chatter image fallback + wiki claim are independent — resolve concurrently.
  const [avatar_url, claimed_slug] = await Promise.all([
    (async () => {
      if (auth!.avatar_url || !auth!.username) return auth!.avatar_url
      const index = await getContentIndex(env.ASSETS)
      return chatterImageForUsername(index, auth!.username)
    })(),
    (async () => {
      const claim = await siteDb(env).prepare("SELECT wiki_slug FROM chatter_claims WHERE user_id = ? LIMIT 1")
        .bind(auth!.id).first<{ wiki_slug: string }>()
      return claim?.wiki_slug ?? null
    })(),
  ])

  return jsonResponse({
    role: auth!.role,
    email: auth!.email,
    username: auth!.username,
    bio: auth!.bio,
    avatar_url,
    created_at: auth!.created_at,
    name_color: auth!.name_color,
    claimed_slug,
  })
}

export async function handleUpdateProfile({ request, env, auth, waitUntil }: RouteCtx): Promise<Response> {
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
      const checkRes = await supabaseRest(env, `profiles?username=eq.${encodeURIComponent(username)}&id=neq.${auth!.id}&select=id`)
      if (checkRes.ok) {
        const existing = await checkRes.json<{ id: string }[]>()
        if (existing.length > 0) return jsonResponse({ error: "Username already taken" }, 409)
      }
      updates.username = username
    }
  }
  if (typeof body.bio === "string") updates.bio = body.bio.slice(0, 500)
  if (typeof body.avatar_url === "string") {
    // Only our own storage bucket (written by handleAvatarUpload) or empty. An
    // arbitrary URL here is copied onto every chat message, making every reader's
    // browser fetch an attacker-chosen host.
    const avatar = body.avatar_url.trim()
    if (avatar && !isAvatarUrl(avatar)) {
      return jsonResponse({ error: "avatar_url must be an uploaded avatar" }, 400)
    }
    updates.avatar_url = avatar ? avatar.slice(0, 500) : (null as any)
  }
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

  const res = await supabaseRest(env, `profiles?id=eq.${auth!.id}`, "PATCH", updates)
  if (!res.ok) return upstreamError("profile update", res, "Failed to update profile")

  // Keep cached auth + denormalized message identity consistent with the change.
  invalidateAuthCache(auth!.id)
  waitUntil(propagateIdentityChange(env, auth!, updates))

  return jsonResponse({ ok: true, ...updates })
}

export async function handleAvatarUpload({ request, env, auth, waitUntil }: RouteCtx): Promise<Response> {
  const contentType = request.headers.get("Content-Type") ?? ""
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  const mimeType = contentType.split(";")[0].trim()
  if (!allowed.includes(mimeType)) {
    return jsonResponse({ error: "Allowed types: JPEG, PNG, WebP, GIF" }, 400)
  }

  const body = await request.arrayBuffer()
  if (body.byteLength > 2 * 1024 * 1024) {
    return jsonResponse({ error: "File too large — maximum 2 MB" }, 413)
  }

  // Verify the claimed type against magic bytes — the public storage bucket
  // serves whatever we accept, so don't trust the header alone.
  const head = new Uint8Array(body.slice(0, 12))
  const magicOk =
    (mimeType === "image/jpeg" && head[0] === 0xff && head[1] === 0xd8) ||
    (mimeType === "image/png" && head[0] === 0x89 && head[1] === 0x50) ||
    (mimeType === "image/gif" && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) ||
    (mimeType === "image/webp" && head[0] === 0x52 && head[1] === 0x49 && head[8] === 0x57 && head[9] === 0x45)
  if (!magicOk) return jsonResponse({ error: "File content does not match its image type" }, 400)

  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "gif"
  const path = `${auth!.id}.${ext}`

  // Into the private media bucket; served by handleAvatar. One avatar per user:
  // drop any earlier one in another format.
  const media = env.MEDIA
  if (!media) return jsonResponse({ error: "Avatar storage is not configured" }, 503)
  await media.put(`avatars/${path}`, body, { httpMetadata: { contentType: mimeType } })
  await Promise.all(AVATAR_EXTS.filter((e) => e !== ext).map((e) => media.delete(`avatars/${auth!.id}.${e}`)))

  // Versioned, so the long cache on the image never shows a stale face.
  const publicUrl = `/api/avatar/${path}?v=${Date.now().toString(36)}`

  const patchRes = await supabaseRest(env, `profiles?id=eq.${auth!.id}`, "PATCH", { avatar_url: publicUrl })
  if (!patchRes.ok) return upstreamError("avatar persist", patchRes, "Failed to save avatar URL")

  invalidateAuthCache(auth!.id)
  waitUntil(propagateIdentityChange(env, auth!, { avatar_url: publicUrl }))

  return jsonResponse({ ok: true, avatar_url: publicUrl })
}

const AVATAR_EXTS = ["jpg", "png", "webp", "gif"]
const AVATAR_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }
const AVATAR_PATH = /^\/api\/avatar\/([0-9a-f-]{36})\.(jpg|png|webp|gif)(\?v=[0-9a-z]{1,12})?$/

/** Only avatars this site stored, so a profile can't point every reader's browser at another host. */
export function isAvatarUrl(url: string): boolean {
  return AVATAR_PATH.test(url)
}

/** GET /api/avatar/<user-id>.<ext>: public, immutable per ?v=, never sniffed into anything but an image. */
export async function handleAvatar({ env, match }: RouteCtx): Promise<Response> {
  const [, id, ext] = match
  const obj = await env.MEDIA?.get(`avatars/${id}.${ext}`)
  if (!obj) return new Response("Not found", { status: 404 })
  return new Response(obj.body, {
    headers: {
      "Content-Type": AVATAR_TYPES[ext],
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      ETag: obj.httpEtag,
    },
  })
}

export async function handleRegister({ request, env }: RouteCtx): Promise<Response> {
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

  // Best-effort early uniqueness check (authoritative check happens when the
  // username is actually set via /api/auth/profile after the magic link).
  const checkRes = await supabaseRest(env, `profiles?username=eq.${encodeURIComponent(username)}&select=id`)
  if (checkRes.ok) {
    const existing = await checkRes.json<{ id: string }[]>()
    if (existing.length > 0) return jsonResponse({ error: "Username already taken" }, 409)
  }

  return jsonResponse({ ok: true })
}
