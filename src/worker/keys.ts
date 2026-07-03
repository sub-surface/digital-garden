import { RouteCtx } from "./types"
import { jsonResponse, supabaseRest, upstreamError } from "./lib"

export async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function handleApiKeys({ request, env, url, auth }: RouteCtx): Promise<Response> {
  const pathname = url.pathname
  const isKeyCollection = pathname === "/api/keys" || pathname === "/api/admin/api-keys"
  const keyId =
    pathname.match(/^\/api\/keys\/([^/]+)$/)?.[1] ??
    pathname.match(/^\/api\/admin\/api-keys\/([^/]+)$/)?.[1]

  // POST /api/keys — generate new key
  if (isKeyCollection && request.method === "POST") {
    const body = await request.json<{ name?: string }>()
    const name = (body.name ?? "").trim() || "API Key"
    const rawBytes = crypto.getRandomValues(new Uint8Array(32))
    const rawKey = Array.from(rawBytes).map(b => b.toString(16).padStart(2, "0")).join("")
    const keyHash = await hashApiKey(rawKey)
    const insertRes = await supabaseRest(env, "api_keys", "POST", {
      user_id: auth!.id, key_hash: keyHash, name,
    }, "return=minimal")
    if (!insertRes.ok) return upstreamError("api-key create", insertRes, "Failed to create key")
    // Raw key returned once — never stored in DB
    return jsonResponse({ key: "sk_" + rawKey, name })
  }

  // GET /api/keys — list own keys (key_hash never returned)
  if (isKeyCollection && request.method === "GET") {
    const res = await supabaseRest(env, `api_keys?user_id=eq.${auth!.id}&select=id,name,created_at,last_used_at,revoked_at&order=created_at.desc`)
    if (!res.ok) return upstreamError("api-key list", res, "Failed to fetch keys")
    return jsonResponse(await res.json())
  }

  // DELETE /api/keys/:id — soft revoke
  if (keyId && request.method === "DELETE") {
    const res = await supabaseRest(
      env,
      `api_keys?id=eq.${encodeURIComponent(keyId)}&user_id=eq.${auth!.id}`,
      "PATCH",
      { revoked_at: new Date().toISOString() },
    )
    if (!res.ok) return upstreamError("api-key revoke", res, "Failed to revoke key")
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Not found" }, 404)
}
