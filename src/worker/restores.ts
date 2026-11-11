import type { RouteCtx } from "./types"
import { jsonResponse, nowIso, siteDb } from "./lib"

interface RestoreBody {
  slug?: unknown
}

export function validRestoreSlug(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 240 && /^[a-z0-9][a-z0-9/_-]*$/i.test(value)
}

/**
 * A deliberately tiny cross-shell flag. It does not edit or publish content:
 * it records that one authenticated reader chose to recover one hidden note.
 * POST restores, DELETE puts it back in the Bin, and GET hydrates the garden.
 */
export async function handleRestores({ request, env, auth }: RouteCtx): Promise<Response> {
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
  // Without the site database (a bare local Worker) recovery is a capability
  // state, not a crash: the Recycle Bin still works locally.
  if (!env.DB) {
    return request.method === "GET"
      ? jsonResponse({ restores: [], available: false })
      : jsonResponse({ error: "Cross-surface recovery is not installed on this server" }, 503)
  }
  const db = siteDb(env)

  if (request.method === "GET") {
    const { results } = await db
      .prepare("SELECT slug, restored_at FROM os_restores WHERE user_id = ? ORDER BY restored_at DESC")
      .bind(auth.id).all<{ slug: string; restored_at: string }>()
    return jsonResponse({ restores: results, available: true })
  }

  let body: RestoreBody
  try {
    body = await request.json<RestoreBody>()
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400)
  }
  if (!validRestoreSlug(body.slug)) return jsonResponse({ error: "Invalid file name" }, 400)

  if (request.method === "POST") {
    await db.prepare("INSERT INTO os_restores (user_id, slug, restored_at) VALUES (?, ?, ?) ON CONFLICT (user_id, slug) DO NOTHING")
      .bind(auth.id, body.slug, nowIso()).run()
    return jsonResponse({ restored: true, slug: body.slug })
  }

  if (request.method === "DELETE") {
    await db.prepare("DELETE FROM os_restores WHERE user_id = ? AND slug = ?").bind(auth.id, body.slug).run()
    return jsonResponse({ restored: false, slug: body.slug })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}
