import { Env } from "./types"
import { verifyAuth, jsonResponse, supabaseRest } from "./lib"

export async function handleAdmin(request: Request, env: Env, pathname: string): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth || auth.role !== "admin") {
    return jsonResponse({ error: "Admin access required" }, 403)
  }

  // GET /api/admin/users
  if (pathname === "/api/admin/users" && request.method === "GET") {
    const res = await supabaseRest(env, "profiles?select=id,email,username,role,created_at&order=created_at.desc")
    if (!res.ok) return jsonResponse({ error: "Failed to fetch users" }, 500)
    return jsonResponse(await res.json())
  }

  // POST /api/admin/approve
  if (pathname === "/api/admin/approve" && request.method === "POST") {
    const body = await request.json<{ userId: string; role?: string }>()
    const role = body.role || "editor"
    const res = await supabaseRest(env, `profiles?id=eq.${body.userId}`, "PATCH", { role })
    if (!res.ok) return jsonResponse({ error: "Failed to update role" }, 500)
    return jsonResponse({ ok: true })
  }

  // POST /api/admin/revoke
  if (pathname === "/api/admin/revoke" && request.method === "POST") {
    const body = await request.json<{ userId: string }>()
    const res = await supabaseRest(env, `profiles?id=eq.${body.userId}`, "PATCH", { role: "none" })
    if (!res.ok) return jsonResponse({ error: "Failed to revoke" }, 500)
    return jsonResponse({ ok: true })
  }

  // GET /api/admin/log
  if (pathname === "/api/admin/log" && request.method === "GET") {
    const res = await supabaseRest(env, "edit_log?select=id,slug,pr_url,created_at,user_id&order=created_at.desc&limit=50")
    if (!res.ok) return jsonResponse({ error: "Failed to fetch log" }, 500)
    return jsonResponse(await res.json())
  }

  // GET /api/admin/locks
  if (pathname === "/api/admin/locks" && request.method === "GET") {
    const res = await supabaseRest(env, "page_locks?select=slug,reason,locked_at,locked_by&order=locked_at.desc")
    if (!res.ok) return jsonResponse({ error: "Failed to fetch locks" }, 500)
    return jsonResponse(await res.json())
  }

  // POST /api/admin/lock
  if (pathname === "/api/admin/lock" && request.method === "POST") {
    const body = await request.json<{ slug: string; reason?: string }>()
    if (!body.slug?.trim()) return jsonResponse({ error: "Slug required" }, 400)
    const res = await supabaseRest(env, "page_locks", "POST", {
      slug: body.slug.trim(),
      reason: body.reason || null,
      locked_by: auth.id,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to lock page" }, 500)
    return jsonResponse({ ok: true })
  }

  // DELETE /api/admin/lock
  if (pathname === "/api/admin/lock" && request.method === "DELETE") {
    const body = await request.json<{ slug: string }>()
    if (!body.slug?.trim()) return jsonResponse({ error: "Slug required" }, 400)
    const res = await supabaseRest(env, `page_locks?slug=eq.${encodeURIComponent(body.slug.trim())}`, "DELETE")
    if (!res.ok) return jsonResponse({ error: "Failed to unlock page" }, 500)
    return jsonResponse({ ok: true })
  }

  // GET /api/admin/stonk-config
  if (pathname === "/api/admin/stonk-config" && request.method === "GET") {
    const res = await supabaseRest(env, "stonk_config?select=key,value&order=key.asc")
    if (!res.ok) return jsonResponse({ error: "Failed to fetch stonk config" }, 500)
    return jsonResponse(await res.json())
  }

  // PUT /api/admin/stonk-config
  if (pathname === "/api/admin/stonk-config" && request.method === "PUT") {
    const body = await request.json<{ key: string; value: number }>()
    if (!body.key?.trim() || typeof body.value !== "number") {
      return jsonResponse({ error: "key and numeric value required" }, 400)
    }
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/stonk_config?key=eq.${encodeURIComponent(body.key.trim())}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ value: body.value }),
    })
    if (!res.ok) return jsonResponse({ error: "Failed to update stonk config" }, 500)
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Not found" }, 404)
}
