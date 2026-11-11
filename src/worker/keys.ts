import { RouteCtx } from "./types"
import { jsonResponse, readJson, invalidateAuthCache, siteDb, nowIso } from "./lib"

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
    const body = await readJson<{ name: string }>(request)
    if (body instanceof Response) return body
    const name = (typeof body.name === "string" ? body.name.trim().slice(0, 80) : "") || "API Key"
    const rawBytes = crypto.getRandomValues(new Uint8Array(32))
    const rawKey = Array.from(rawBytes).map(b => b.toString(16).padStart(2, "0")).join("")
    const keyHash = await hashApiKey(rawKey)
    await siteDb(env).prepare("INSERT INTO api_keys (id, user_id, key_hash, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), auth!.id, keyHash, name, nowIso()).run()
    // Raw key returned once — never stored in DB
    return jsonResponse({ key: "sk_" + rawKey, name })
  }

  // GET /api/keys — list own keys (key_hash never returned)
  if (isKeyCollection && request.method === "GET") {
    const { results } = await siteDb(env)
      .prepare("SELECT id, name, created_at, last_used_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC")
      .bind(auth!.id).all()
    return jsonResponse(results)
  }

  // DELETE /api/keys/:id — soft revoke
  if (keyId && request.method === "DELETE") {
    await siteDb(env).prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
      .bind(nowIso(), decodeURIComponent(keyId), auth!.id).run()
    // The auth cache is keyed by bearer token; without this a revoked key kept
    // authenticating in this isolate for up to the cache TTL.
    invalidateAuthCache(auth!.id)
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Not found" }, 404)
}
