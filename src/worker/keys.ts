import { Env } from "./types"
import { verifyAuth, jsonResponse } from "./lib"

export async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function handleApiKeys(request: Request, env: Env, url: URL): Promise<Response> {
  const pathname = url.pathname
  const isKeyCollection = pathname === "/api/keys" || pathname === "/api/admin/api-keys"
  const keyId =
    pathname.match(/^\/api\/keys\/([^/]+)$/)?.[1] ??
    pathname.match(/^\/api\/admin\/api-keys\/([^/]+)$/)?.[1]

  // POST /api/keys — generate new key
  if (isKeyCollection && request.method === "POST") {
    const authUser = await verifyAuth(request, env)
    if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401)
    const body = await request.json<{ name?: string }>()
    const name = (body.name ?? "").trim() || "API Key"
    const rawBytes = crypto.getRandomValues(new Uint8Array(32))
    const rawKey = Array.from(rawBytes).map(b => b.toString(16).padStart(2, "0")).join("")
    const keyHash = await hashApiKey(rawKey)
    const insertRes = await fetch(env.SUPABASE_URL + "/rest/v1/api_keys", {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ user_id: authUser.id, key_hash: keyHash, name }),
    })
    if (!insertRes.ok) return jsonResponse({ error: "Failed to create key" }, 500)
    // Raw key returned once — never stored in DB
    return jsonResponse({ key: "sk_" + rawKey, name })
  }

  // GET /api/keys — list own keys (key_hash never returned)
  if (isKeyCollection && request.method === "GET") {
    const authUser = await verifyAuth(request, env)
    if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401)
    const res = await fetch(
      env.SUPABASE_URL + "/rest/v1/api_keys?user_id=eq." + authUser.id + "&select=id,name,created_at,last_used_at,revoked_at&order=created_at.desc",
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY } }
    )
    if (!res.ok) return jsonResponse({ error: "Failed to fetch keys" }, 500)
    return jsonResponse(await res.json())
  }

  // DELETE /api/keys/:id — soft revoke
  if (keyId && request.method === "DELETE") {
    const authUser = await verifyAuth(request, env)
    if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401)
    const res = await fetch(
      env.SUPABASE_URL + "/rest/v1/api_keys?id=eq." + encodeURIComponent(keyId) + "&user_id=eq." + authUser.id,
      {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      }
    )
    if (!res.ok) return jsonResponse({ error: "Failed to revoke key" }, 500)
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Not found" }, 404)
}
