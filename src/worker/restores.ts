import type { RouteCtx } from "./types"
import { jsonResponse, supabaseRest, upstreamError } from "./lib"

interface RestoreBody {
  slug?: unknown
}

async function restoreTableMissing(response: Response): Promise<boolean> {
  if (response.status !== 400 && response.status !== 404) return false
  try {
    const detail = await response.clone().text()
    return /PGRST205|42P01|relation[^\n]*os_restores[^\n]*does not exist|could not find[^\n]*os_restores/i.test(detail)
  } catch {
    return false
  }
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

  if (request.method === "GET") {
    const result = await supabaseRest(
      env,
      `os_restores?user_id=eq.${auth.id}&select=slug,restored_at&order=restored_at.desc`,
    )
    // The OS can ship before its optional cross-shell migration is installed.
    // A missing table is a capability state, not an internal server crash: the
    // Recycle Bin still works locally and the browser console stays clean.
    if (!result.ok && await restoreTableMissing(result)) {
      return jsonResponse({ restores: [], available: false })
    }
    if (!result.ok) return upstreamError("OS restores", result, "Recovered files are unavailable")
    return jsonResponse({ restores: await result.json<{ slug: string; restored_at: string }[]>(), available: true })
  }

  let body: RestoreBody
  try {
    body = await request.json<RestoreBody>()
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400)
  }
  if (!validRestoreSlug(body.slug)) return jsonResponse({ error: "Invalid file name" }, 400)

  if (request.method === "POST") {
    const result = await supabaseRest(
      env,
      "os_restores?on_conflict=user_id,slug",
      "POST",
      { user_id: auth.id, slug: body.slug },
      "resolution=merge-duplicates,return=representation",
    )
    if (!result.ok && await restoreTableMissing(result)) {
      return jsonResponse({ error: "Cross-surface recovery is not installed on this server" }, 503)
    }
    if (!result.ok) return upstreamError("restore OS file", result, "The file could not be restored")
    return jsonResponse({ restored: true, slug: body.slug })
  }

  if (request.method === "DELETE") {
    const result = await supabaseRest(
      env,
      `os_restores?user_id=eq.${auth.id}&slug=eq.${encodeURIComponent(body.slug)}`,
      "DELETE",
    )
    if (!result.ok && await restoreTableMissing(result)) {
      return jsonResponse({ error: "Cross-surface recovery is not installed on this server" }, 503)
    }
    if (!result.ok) return upstreamError("undo OS restore", result, "The file could not be returned to the Bin")
    return jsonResponse({ restored: false, slug: body.slug })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}
