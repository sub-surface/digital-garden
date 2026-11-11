import { RouteCtx } from "./types"
import { jsonResponse, supabaseRest, upstreamError, readJson, isUuid, invalidateAuthCache, siteDb, nowIso } from "./lib"

const ROLES = new Set(["pending", "editor", "admin", "none"])

// Dispatcher guarantees auth.role === "admin" for every /api/admin/ route.
export async function handleAdmin({ request, env, url, auth }: RouteCtx): Promise<Response> {
  const pathname = url.pathname

  // GET /api/admin/users
  if (pathname === "/api/admin/users" && request.method === "GET") {
    const res = await supabaseRest(env, "profiles?select=id,email,username,role,created_at&order=created_at.desc")
    if (!res.ok) return upstreamError("admin users", res, "Failed to fetch users")
    return jsonResponse(await res.json())
  }

  // POST /api/admin/approve
  if (pathname === "/api/admin/approve" && request.method === "POST") {
    const body = await readJson<{ userId: string; role: string }>(request)
    if (body instanceof Response) return body
    if (!isUuid(body.userId)) return jsonResponse({ error: "userId must be a user UUID" }, 400)
    const role = body.role || "editor"
    if (!ROLES.has(role)) return jsonResponse({ error: `role must be one of ${[...ROLES].join(", ")}` }, 400)
    const res = await supabaseRest(env, `profiles?id=eq.${body.userId}`, "PATCH", { role })
    if (!res.ok) return upstreamError("admin approve", res, "Failed to update role")
    invalidateAuthCache(body.userId)
    return jsonResponse({ ok: true })
  }

  // POST /api/admin/revoke
  if (pathname === "/api/admin/revoke" && request.method === "POST") {
    const body = await readJson<{ userId: string }>(request)
    if (body instanceof Response) return body
    if (!isUuid(body.userId)) return jsonResponse({ error: "userId must be a user UUID" }, 400)
    if (body.userId === auth!.id) return jsonResponse({ error: "You can't revoke your own role" }, 400)
    const res = await supabaseRest(env, `profiles?id=eq.${body.userId}`, "PATCH", { role: "none" })
    if (!res.ok) return upstreamError("admin revoke", res, "Failed to revoke")
    invalidateAuthCache(body.userId)
    return jsonResponse({ ok: true })
  }

  // GET /api/admin/log
  if (pathname === "/api/admin/log" && request.method === "GET") {
    const { results: entries } = await siteDb(env)
      .prepare("SELECT id, slug, pr_url, created_at, user_id FROM edit_log ORDER BY created_at DESC LIMIT 50")
      .all<{ id: number; slug: string; pr_url: string | null; created_at: string; user_id: string | null }>()
    // edit_log stores only user_id; the dashboard's "who" column needs the
    // editor's email, which used to render as "—" for every row.
    const ids = [...new Set(entries.map((e) => e.user_id).filter((id): id is string => !!id && isUuid(id)))]
    let emails = new Map<string, string>()
    if (ids.length) {
      const people = await supabaseRest(env, `profiles?id=in.(${ids.join(",")})&select=id,email`)
      if (!people.ok) return upstreamError("admin log editors", people, "Failed to fetch log editors")
      emails = new Map((await people.json<{ id: string; email: string }[]>()).map((p) => [p.id, p.email]))
    }
    return jsonResponse(entries.map((e) => ({ ...e, email: e.user_id ? emails.get(e.user_id) ?? null : null })))
  }

  // GET /api/admin/locks
  if (pathname === "/api/admin/locks" && request.method === "GET") {
    const { results } = await siteDb(env)
      .prepare("SELECT slug, reason, locked_at, locked_by FROM page_locks ORDER BY locked_at DESC").all()
    return jsonResponse(results)
  }

  // POST /api/admin/lock
  if (pathname === "/api/admin/lock" && request.method === "POST") {
    const body = await readJson<{ slug: string; reason: string }>(request)
    if (body instanceof Response) return body
    if (typeof body.slug !== "string" || !body.slug.trim()) return jsonResponse({ error: "Slug required" }, 400)
    await siteDb(env).prepare(
      "INSERT INTO page_locks (slug, reason, locked_by, locked_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (slug) DO UPDATE SET reason = excluded.reason, locked_by = excluded.locked_by, locked_at = excluded.locked_at",
    ).bind(body.slug.trim().slice(0, 300), typeof body.reason === "string" ? body.reason.slice(0, 500) : null, auth!.id, nowIso()).run()
    return jsonResponse({ ok: true })
  }

  // DELETE /api/admin/lock
  if (pathname === "/api/admin/lock" && request.method === "DELETE") {
    const body = await readJson<{ slug: string }>(request)
    if (body instanceof Response) return body
    if (typeof body.slug !== "string" || !body.slug.trim()) return jsonResponse({ error: "Slug required" }, 400)
    await siteDb(env).prepare("DELETE FROM page_locks WHERE slug = ?").bind(body.slug.trim()).run()
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Not found" }, 404)
}
