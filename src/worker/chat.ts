import { Env, ChatMessage, BanProfile } from "./types"
import { verifyAuth, jsonResponse, supabaseRest } from "./lib"
import { processStonkReaction, getStonkConfig } from "./stonks"
import { getContentIndex, chatterImageForUsername, resolveMetaCaseInsensitive } from "./meta"

export async function checkBanStatus(env: Env, userId: string): Promise<{ banned: boolean; reason?: string }> {
  const res = await supabaseRest(env, `profiles?id=eq.${userId}&select=ban_type,ban_expires_at,ban_reason`)
  if (!res.ok) return { banned: false }
  const rows = await res.json<BanProfile[]>()
  const profile = rows[0]
  if (!profile || !profile.ban_type || profile.ban_type === "none") return { banned: false }
  if (profile.ban_type === "temporary" && profile.ban_expires_at) {
    if (new Date(profile.ban_expires_at) <= new Date()) return { banned: false }
  }
  return { banned: true, reason: profile.ban_reason ?? undefined }
}

export async function handleChatRooms(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const auth = await verifyAuth(request, env)
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
    const res = await supabaseRest(env, "rooms?archived=eq.false&select=id,name,slug,created_at,created_by&order=name.asc")
    if (!res.ok) return jsonResponse({ error: "Failed to fetch rooms" }, 500)
    const rooms = await res.json<unknown[]>()
    return jsonResponse({ rooms })
  }

  if (request.method === "POST") {
    const auth = await verifyAuth(request, env)
    if (!auth || auth.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403)

    let body: { name?: string; slug?: string }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    if (!body.name?.trim() || !body.slug?.trim()) return jsonResponse({ error: "name and slug required" }, 400)

    const res = await supabaseRest(env, "rooms", "POST", {
      id: body.slug.trim(),
      name: body.name.trim(),
      slug: body.slug.trim(),
      created_by: auth.id,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to create room" }, 500)
    return jsonResponse(await res.json(), 201)
  }

  if (request.method === "PATCH") {
    const auth = await verifyAuth(request, env)
    if (!auth || auth.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403)

    let body: { archived?: boolean }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }

    // Extract room ID from pathname: /api/chat/rooms/:id
    const parts = new URL(request.url).pathname.split("/")
    const roomId = parts[4]
    if (!roomId) return jsonResponse({ error: "Room ID required" }, 400)

    const res = await supabaseRest(env, `rooms?id=eq.${encodeURIComponent(roomId)}`, "PATCH", {
      archived: body.archived ?? true,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to update room" }, 500)
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}

export async function handleChatMessages(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  // DELETE /api/chat/messages/:id
  if (request.method === "DELETE") {
    const id = url.pathname.split("/").pop()
    if (!id) return jsonResponse({ error: "Message ID required" }, 400)

    const fetchRes = await supabaseRest(env, `messages?id=eq.${id}&select=id,user_id,deleted_at`)
    if (!fetchRes.ok) return jsonResponse({ error: "Failed to fetch message" }, 500)
    const rows = await fetchRes.json<{ id: string; user_id: string; deleted_at: string | null }[]>()
    if (!rows.length) return jsonResponse({ error: "Message not found" }, 404)
    const msg = rows[0]
    if (msg.deleted_at) return jsonResponse({ error: "Already deleted" }, 409)
    if (msg.user_id !== auth.id && auth.role !== "admin") {
      return jsonResponse({ error: "Forbidden" }, 403)
    }

    const delRes = await supabaseRest(env, `messages?id=eq.${id}`, "PATCH", {
      deleted_at: new Date().toISOString(),
      deleted_by: auth.id,
    })
    if (!delRes.ok) return jsonResponse({ error: "Failed to delete message" }, 500)
    return jsonResponse({ ok: true })
  }

  // PATCH /api/chat/messages/:id — edit own message
  if (request.method === "PATCH") {
    const id = url.pathname.split("/").pop()
    if (!id) return jsonResponse({ error: "Message ID required" }, 400)

    let payload: { body?: string }
    try { payload = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    const newBody = payload.body?.trim()
    if (!newBody) return jsonResponse({ error: "body required" }, 400)
    if (newBody.length > 2000) return jsonResponse({ error: "Message too long" }, 400)

    const fetchRes = await supabaseRest(env, `messages?id=eq.${id}&select=id,user_id,deleted_at`)
    if (!fetchRes.ok) return jsonResponse({ error: "Failed to fetch message" }, 500)
    const rows = await fetchRes.json<{ id: string; user_id: string; deleted_at: string | null }[]>()
    if (!rows.length) return jsonResponse({ error: "Message not found" }, 404)
    const msg = rows[0]
    if (msg.deleted_at) return jsonResponse({ error: "Message is deleted" }, 409)
    if (msg.user_id !== auth.id) return jsonResponse({ error: "Forbidden" }, 403)

    const editRes = await supabaseRest(env, `messages?id=eq.${id}`, "PATCH", {
      body: newBody,
      edited_at: new Date().toISOString(),
    })
    if (!editRes.ok) return jsonResponse({ error: "Failed to edit message" }, 500)
    return jsonResponse({ ok: true })
  }

  // POST /api/chat/messages — send a message
  if (request.method === "POST") {
    const ban = await checkBanStatus(env, auth.id)
    if (ban.banned) return jsonResponse({ error: ban.reason ?? "You are banned" }, 403)

    let body: { room_id?: string; body?: string; reply_to?: string | null }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    if (!body.room_id?.trim() || !body.body?.trim()) return jsonResponse({ error: "room_id and body required" }, 400)
    if (body.body.trim().length > 2000) return jsonResponse({ error: "Message too long" }, 400)

    const res = await supabaseRest(env, "messages", "POST", {
      room_id: body.room_id.trim(),
      user_id: auth.id,
      body: body.body.trim(),
      reply_to: body.reply_to ?? null,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to send message" }, 500)
    return jsonResponse({ ok: true }, 201)
  }

  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405)

  const room = url.searchParams.get("room")
  if (!room) return jsonResponse({ error: "room parameter required" }, 400)

  const before = url.searchParams.get("before")
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10)
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100)

  let filter = `room_id=eq.${encodeURIComponent(room)}&deleted_at=is.null`
  if (before) filter += `&created_at=lt.${encodeURIComponent(before)}`
  filter += `&order=created_at.desc&limit=${limit}`

  const res = await supabaseRest(env, `messages?${filter}&select=*,profiles!messages_user_id_fkey(username,avatar_url,name_color)`)
  if (!res.ok) return jsonResponse({ error: "Failed to fetch messages" }, 500)
  const messages = await res.json<ChatMessage[]>()

  // Fetch reply_to snapshots for any messages that reference another
  const replyIds = [...new Set(messages.map(m => m.reply_to).filter((id): id is string => id !== null))]
  let replyMap: Record<string, Pick<ChatMessage, "id" | "body" | "profiles">> = {}
  if (replyIds.length > 0) {
    const idsFilter = replyIds.map(id => encodeURIComponent(id)).join(",")
    const replyRes = await supabaseRest(env, `messages?id=in.(${idsFilter})&select=id,body,profiles!messages_user_id_fkey(username,avatar_url,name_color)`)
    if (replyRes.ok) {
      const replyRows = await replyRes.json<Pick<ChatMessage, "id" | "body" | "profiles">[]>()
      for (const r of replyRows) replyMap[r.id] = r
    }
  }

  // Fetch reactions for all messages in one query
  const msgIds = messages.map(m => m.id)
  let reactionsMap: Record<string, { emote: string; user_id: string }[]> = {}
  if (msgIds.length > 0) {
    const idsFilter = msgIds.map(id => encodeURIComponent(id)).join(",")
    const reactRes = await supabaseRest(env, `reactions?message_id=in.(${idsFilter})&select=message_id,emote,user_id`)
    if (reactRes.ok) {
      const reactRows = await reactRes.json<{ message_id: string; emote: string; user_id: string }[]>()
      for (const r of reactRows) {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = []
        reactionsMap[r.message_id].push({ emote: r.emote, user_id: r.user_id })
      }
    }
  }

  const enriched = messages.map(m => {
    const rawReacts = reactionsMap[m.id] ?? []
    // Group by emote, count, mark if current user reacted
    const byEmote: Record<string, { count: number; reacted: boolean }> = {}
    for (const r of rawReacts) {
      if (!byEmote[r.emote]) byEmote[r.emote] = { count: 0, reacted: false }
      byEmote[r.emote].count++
      if (r.user_id === auth.id) byEmote[r.emote].reacted = true
    }
    const reactions = Object.entries(byEmote).map(([emote, v]) => ({ emote, ...v }))
    return {
      ...m,
      reply_to_message: m.reply_to ? (replyMap[m.reply_to] ?? null) : null,
      reactions,
    }
  })

  return jsonResponse({ messages: enriched, has_more: messages.length === limit })
}

export async function handleChatReactions(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  let body: { message_id?: string; emote?: string }
  try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
  if (!body.message_id?.trim() || !body.emote?.trim()) {
    return jsonResponse({ error: "message_id and emote required" }, 400)
  }

  if (request.method === "POST") {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/reactions`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({ message_id: body.message_id.trim(), user_id: auth.id, emote: body.emote.trim() }),
    })
    if (!res.ok) return jsonResponse({ error: "Failed to add reaction" }, 500)
    // Fire-and-forget stonk processing
    processStonkReaction(env, body.message_id.trim(), body.emote.trim(), auth.id, false).catch((e) => console.error("stonk reaction processing failed:", e))
    return jsonResponse({ ok: true })
  }

  if (request.method === "DELETE") {
    const res = await supabaseRest(
      env,
      `reactions?message_id=eq.${encodeURIComponent(body.message_id.trim())}&user_id=eq.${auth.id}&emote=eq.${encodeURIComponent(body.emote.trim())}`,
      "DELETE",
    )
    if (!res.ok) return jsonResponse({ error: "Failed to remove reaction" }, 500)
    // Fire-and-forget stonk reversal
    processStonkReaction(env, body.message_id.trim(), body.emote.trim(), auth.id, true).catch((e) => console.error("stonk reaction reversal failed:", e))
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}

export async function handleChatSearch(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405)

  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  const q = url.searchParams.get("q")?.trim()
  if (!q) return jsonResponse({ error: "q parameter required" }, 400)

  const room = url.searchParams.get("room")
  const user = url.searchParams.get("user")
  const before = url.searchParams.get("before")
  const after = url.searchParams.get("after")
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10)
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100)

  const parts: string[] = [
    `body=ilike.*${encodeURIComponent(q)}*`,
    "deleted_at=is.null",
    `order=created_at.desc`,
    `limit=${limit}`,
  ]
  if (room) parts.push(`room_id=eq.${encodeURIComponent(room)}`)
  if (before) parts.push(`created_at=lt.${encodeURIComponent(before)}`)
  if (after) parts.push(`created_at=gt.${encodeURIComponent(after)}`)

  let filter = parts.join("&")

  // If filtering by username, we need a different approach: join and filter
  // PostgREST can filter on embedded resources with a special syntax:
  if (user) filter += `&profiles.username=eq.${encodeURIComponent(user)}`

  const res = await supabaseRest(env, `messages?${filter}&select=*,profiles!messages_user_id_fkey(username,avatar_url,name_color)`)
  if (!res.ok) return jsonResponse({ error: "Search failed" }, 500)
  const messages = await res.json<ChatMessage[]>()

  // If user filter was applied, PostgREST doesn't filter by embedded resource natively in all versions,
  // so additionally filter client-side for safety
  const filtered = user
    ? messages.filter(m => m.profiles?.username?.toLowerCase() === user.toLowerCase())
    : messages

  return jsonResponse({ messages: filtered })
}

export async function handleChatPins(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  // GET /api/chat/pins?room=X — list pinned messages for a room
  if (request.method === "GET") {
    const room = url.searchParams.get("room")
    if (!room) return jsonResponse({ error: "room parameter required" }, 400)

    const res = await supabaseRest(
      env,
      `messages?room_id=eq.${encodeURIComponent(room)}&pinned_at=not.is.null&deleted_at=is.null&order=pinned_at.desc&limit=20&select=id,body,pinned_at,pinned_by,profiles!messages_user_id_fkey(username,avatar_url,name_color)`
    )
    if (!res.ok) return jsonResponse({ error: "Failed to fetch pins" }, 500)
    const pins = await res.json()
    return jsonResponse({ pins })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}

export async function handleChatPin(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
  if (auth.role !== "admin") return jsonResponse({ error: "Admin only" }, 403)

  const id = url.pathname.split("/")[4] // /api/chat/messages/:id/pin
  if (!id) return jsonResponse({ error: "Message ID required" }, 400)

  if (request.method === "POST") {
    const res = await supabaseRest(env, `messages?id=eq.${id}`, "PATCH", {
      pinned_at: new Date().toISOString(),
      pinned_by: auth.id,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to pin message" }, 500)
    return jsonResponse({ ok: true })
  }

  if (request.method === "DELETE") {
    const res = await supabaseRest(env, `messages?id=eq.${id}`, "PATCH", {
      pinned_at: null,
      pinned_by: null,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to unpin message" }, 500)
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}

export async function handleChatUserMini(request: Request, env: Env, username: string): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405)

  const res = await supabaseRest(
    env,
    `profiles?username=eq.${encodeURIComponent(username)}&select=id,username,avatar_url,role,bio,created_at,name_color`,
  )
  if (!res.ok) return jsonResponse({ error: "Failed to fetch user" }, 500)
  const rows = await res.json<{ id: string; username: string; avatar_url: string | null; role: string; bio: string | null; created_at: string | null; name_color: string | null }[]>()
  if (!rows.length) return jsonResponse({ error: "User not found" }, 404)
  const row = rows[0]
  if (!row.avatar_url) {
    const index = await getContentIndex(env.ASSETS)
    row.avatar_url = chatterImageForUsername(index, username)
  }

  // Stonk balance
  const config = await getStonkConfig(env)
  let stonk_balance: number | null = null
  if (config.stonks_enabled) {
    const balRes = await supabaseRest(env, `stonk_balance?user_id=eq.${row.id}&select=balance`)
    if (balRes.ok) {
      const balRows = await balRes.json<{ balance: number }[]>()
      stonk_balance = balRows.length > 0 ? balRows[0].balance : 0
    }
  }

  const { id: _id, ...rest } = row
  return jsonResponse({ ...rest, stonk_balance })
}

export async function handleChatClaim(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405)

  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
  if (!auth.username) return jsonResponse({ error: "Username required" }, 400)

  let body: { wiki_slug?: string }
  try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
  if (!body.wiki_slug?.trim()) return jsonResponse({ error: "wiki_slug required" }, 400)

  const slug = body.wiki_slug.trim()

  // Verify the wiki page has matching username frontmatter
  const index = await getContentIndex(env.ASSETS)
  const meta = resolveMetaCaseInsensitive(index, slug)
  if (!meta) return jsonResponse({ error: "Wiki page not found" }, 404)
  if (!meta.username || meta.username.toLowerCase() !== auth.username.toLowerCase()) {
    return jsonResponse({ error: "Username does not match wiki page" }, 403)
  }

  // Check if already claimed by someone else
  const existing = await supabaseRest(env, `chatter_claims?wiki_slug=eq.${encodeURIComponent(slug)}&select=user_id`)
  if (existing.ok) {
    const rows = await existing.json<{ user_id: string }[]>()
    if (rows.length > 0 && rows[0].user_id !== auth.id) {
      return jsonResponse({ error: "Page already claimed by another user" }, 409)
    }
    if (rows.length > 0 && rows[0].user_id === auth.id) {
      return jsonResponse({ ok: true, already_claimed: true })
    }
  }

  // Insert claim
  const res = await supabaseRest(env, "chatter_claims", "POST", {
    user_id: auth.id,
    wiki_slug: slug,
  })
  if (!res.ok) return jsonResponse({ error: "Failed to create claim" }, 500)
  return jsonResponse({ ok: true }, 201)
}

export async function handleUserClaim(env: Env, username: string): Promise<Response> {
  // Look up user_id from username
  const userRes = await supabaseRest(env, `profiles?username=eq.${encodeURIComponent(username)}&select=id`)
  if (!userRes.ok) return jsonResponse({ error: "Failed to fetch user" }, 500)
  const users = await userRes.json<{ id: string }[]>()
  if (!users.length) return jsonResponse({ error: "User not found" }, 404)

  const claimRes = await supabaseRest(env, `chatter_claims?user_id=eq.${users[0].id}&select=wiki_slug,claimed_at`)
  if (!claimRes.ok) return jsonResponse({ error: "Failed to fetch claim" }, 500)
  const claims = await claimRes.json<{ wiki_slug: string; claimed_at: string }[]>()

  return jsonResponse({ claim: claims.length > 0 ? claims[0] : null })
}

export async function handleClaimBySlug(env: Env, slug: string): Promise<Response> {
  const claimRes = await supabaseRest(env, `chatter_claims?wiki_slug=eq.${encodeURIComponent(slug)}&select=user_id`)
  if (!claimRes.ok) return jsonResponse({ error: "Failed to fetch claim" }, 500)
  const claims = await claimRes.json<{ user_id: string }[]>()

  if (!claims.length) return jsonResponse({ claim: null })

  // Get the user's profile
  const profileRes = await supabaseRest(env, `profiles?id=eq.${claims[0].user_id}&select=username,avatar_url`)
  if (!profileRes.ok) return jsonResponse({ claim: null })
  const profiles = await profileRes.json<{ username: string; avatar_url: string | null }[]>()

  return jsonResponse({
    claim: profiles.length > 0
      ? { username: profiles[0].username, avatar_url: profiles[0].avatar_url }
      : null
  })
}

export async function handleChatBan(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405)

  const auth = await verifyAuth(request, env)
  if (!auth || auth.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403)

  const url = new URL(request.url)
  const isBan = url.pathname === "/api/chat/ban"

  let body: { user_id?: string; type?: string; duration_hours?: number; reason?: string }
  try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
  if (!body.user_id?.trim()) return jsonResponse({ error: "user_id required" }, 400)

  if (isBan) {
    if (!body.type || (body.type !== "temporary" && body.type !== "permanent")) {
      return jsonResponse({ error: "type must be 'temporary' or 'permanent'" }, 400)
    }
    const ban_expires_at = body.type === "temporary" && body.duration_hours
      ? new Date(Date.now() + body.duration_hours * 3600000).toISOString()
      : null
    const targetId = body.user_id.trim()
    const res = await supabaseRest(env, `profiles?id=eq.${targetId}`, "PATCH", {
      ban_type: body.type,
      ban_expires_at,
      ban_reason: body.reason ?? null,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to ban user" }, 500)

    // Permanent ban: hard-delete messages + anonymise profile
    if (body.type === "permanent") {
      await supabaseRest(env, `messages?user_id=eq.${targetId}`, "DELETE")
      await supabaseRest(env, `reactions?user_id=eq.${targetId}`, "DELETE")
      await supabaseRest(env, `profiles?id=eq.${targetId}`, "PATCH", {
        username: "[deleted]",
        avatar_url: null,
        bio: null,
        name_color: null,
      })
    }

    return jsonResponse({ ok: true })
  }

  // unban
  const res = await supabaseRest(env, `profiles?id=eq.${body.user_id.trim()}`, "PATCH", {
    ban_type: "none",
    ban_expires_at: null,
    ban_reason: null,
  })
  if (!res.ok) return jsonResponse({ error: "Failed to unban user" }, 500)
  return jsonResponse({ ok: true })
}

export async function handleChessGif(request: Request): Promise<Response> {
  const pgn = await request.text()
  if (!pgn.trim()) return jsonResponse({ error: "Empty PGN" }, 400)

  const upstream = await fetch("https://lichess1.org/game/export/gif", {
    method: "POST",
    headers: { "Content-Type": "application/x-chess-pgn" },
    body: pgn,
  })

  if (!upstream.ok) {
    return jsonResponse({ error: `Lichess GIF export failed: ${upstream.status}` }, 502)
  }

  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  })
  headers.set("Content-Type", "image/gif")
  return new Response(upstream.body, { status: 200, headers })
}

export async function handleGifSearch(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.KLIPY_API_KEY) {
    return jsonResponse({ error: "GIF search not configured" }, 503)
  }
  const q = url.searchParams.get("q") || "trending"
  const klipyUrl = `https://api.klipy.co/api/v1/gifs/search?q=${encodeURIComponent(q)}&limit=20`
  try {
    const res = await fetch(klipyUrl, {
      headers: { Authorization: `Bearer ${env.KLIPY_API_KEY}` },
    })
    if (!res.ok) return jsonResponse({ error: "GIF search failed" }, 502)
    const data = await res.json<{ data?: Array<{ id: string; url: string; preview_url?: string; title?: string }> }>()
    const results = (data.data ?? []).map((g) => ({
      url: g.url,
      preview: g.preview_url ?? g.url,
      title: g.title ?? "",
    }))
    return jsonResponse({ results }, 200)
  } catch {
    return jsonResponse({ error: "GIF search unavailable" }, 502)
  }
}
