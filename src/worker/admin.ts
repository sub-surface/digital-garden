import { RouteCtx } from "./types"
import { jsonResponse, supabaseRest, upstreamError } from "./lib"

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
    const body = await request.json<{ userId: string; role?: string }>()
    const role = body.role || "editor"
    const res = await supabaseRest(env, `profiles?id=eq.${body.userId}`, "PATCH", { role })
    if (!res.ok) return upstreamError("admin approve", res, "Failed to update role")
    return jsonResponse({ ok: true })
  }

  // POST /api/admin/revoke
  if (pathname === "/api/admin/revoke" && request.method === "POST") {
    const body = await request.json<{ userId: string }>()
    const res = await supabaseRest(env, `profiles?id=eq.${body.userId}`, "PATCH", { role: "none" })
    if (!res.ok) return upstreamError("admin revoke", res, "Failed to revoke")
    return jsonResponse({ ok: true })
  }

  // GET /api/admin/log
  if (pathname === "/api/admin/log" && request.method === "GET") {
    const res = await supabaseRest(env, "edit_log?select=id,slug,pr_url,created_at,user_id&order=created_at.desc&limit=50")
    if (!res.ok) return upstreamError("admin log", res, "Failed to fetch log")
    return jsonResponse(await res.json())
  }

  // GET /api/admin/locks
  if (pathname === "/api/admin/locks" && request.method === "GET") {
    const res = await supabaseRest(env, "page_locks?select=slug,reason,locked_at,locked_by&order=locked_at.desc")
    if (!res.ok) return upstreamError("admin locks", res, "Failed to fetch locks")
    return jsonResponse(await res.json())
  }

  // POST /api/admin/lock
  if (pathname === "/api/admin/lock" && request.method === "POST") {
    const body = await request.json<{ slug: string; reason?: string }>()
    if (!body.slug?.trim()) return jsonResponse({ error: "Slug required" }, 400)
    const res = await supabaseRest(env, "page_locks", "POST", {
      slug: body.slug.trim(),
      reason: body.reason || null,
      locked_by: auth!.id,
    })
    if (!res.ok) return upstreamError("admin lock", res, "Failed to lock page")
    return jsonResponse({ ok: true })
  }

  // DELETE /api/admin/lock
  if (pathname === "/api/admin/lock" && request.method === "DELETE") {
    const body = await request.json<{ slug: string }>()
    if (!body.slug?.trim()) return jsonResponse({ error: "Slug required" }, 400)
    const res = await supabaseRest(env, `page_locks?slug=eq.${encodeURIComponent(body.slug.trim())}`, "DELETE")
    if (!res.ok) return upstreamError("admin unlock", res, "Failed to unlock page")
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Not found" }, 404)
}
