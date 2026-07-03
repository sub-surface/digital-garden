import { Env, ChatMessage, BanProfile, RouteCtx, AuthUser } from "./types"
import { jsonResponse, supabaseRest, upstreamError } from "./lib"
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

/** Author identity for a message, from the denormalized columns (written at
 * POST time, backfilled by the 2026-07 migration). The profiles embed was
 * dropped from all message reads once the backfill was confirmed — identity
 * lives on the row itself; a null here means a pre-deploy race row and the
 * client renders it anonymous until the next backfill sweep. */
function authorProfile(m: ChatMessage): ChatMessage["profiles"] {
  if (m.username) return { username: m.username, avatar_url: m.avatar_url ?? null, name_color: m.name_color ?? null }
  return m.profiles ?? null
}

export async function handleChatRooms({ request, env, url, auth }: RouteCtx): Promise<Response> {
  if (request.method === "GET") {
    const res = await supabaseRest(env, "rooms?archived=eq.false&select=id,name,slug,created_at,created_by&order=name.asc")
    if (!res.ok) return upstreamError("rooms list", res, "Failed to fetch rooms")
    return jsonResponse({ rooms: await res.json<unknown[]>() })
  }

  if (request.method === "POST") {
    let body: { name?: string; slug?: string }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    if (!body.name?.trim() || !body.slug?.trim()) return jsonResponse({ error: "name and slug required" }, 400)

    const res = await supabaseRest(env, "rooms", "POST", {
      id: body.slug.trim(),
      name: body.name.trim(),
      slug: body.slug.trim(),
      created_by: auth!.id,
    })
    if (!res.ok) return upstreamError("room create", res, "Failed to create room")
    return jsonResponse(await res.json(), 201)
  }

  // PATCH /api/chat/rooms/:id — archive/unarchive
  let body: { archived?: boolean }
  try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }

  const roomId = url.pathname.split("/")[4]
  if (!roomId) return jsonResponse({ error: "Room ID required" }, 400)

  const res = await supabaseRest(env, `rooms?id=eq.${encodeURIComponent(roomId)}`, "PATCH", {
    archived: body.archived ?? true,
  })
  if (!res.ok) return upstreamError("room archive", res, "Failed to update room")
  return jsonResponse({ ok: true })
}

/** GET /api/chat/messages/:id — single enriched message. Used by the realtime
 * client as a targeted fallback when the broadcast payload lacks identity
 * (pre-migration rows), replacing a list re-fetch per broadcast per client. */
export async function handleChatMessageById({ env, match, auth }: RouteCtx): Promise<Response> {
  const id = match[1]
  const res = await supabaseRest(env, `messages?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=*`)
  if (!res.ok) return upstreamError("message by id", res, "Failed to fetch message")
  const rows = await res.json<ChatMessage[]>()
  if (!rows.length) return jsonResponse({ error: "Message not found" }, 404)
  const m = rows[0]

  const reactRes = await supabaseRest(env, `reactions?message_id=eq.${encodeURIComponent(id)}&select=emote,user_id`)
  const reactRows = reactRes.ok ? await reactRes.json<{ emote: string; user_id: string }[]>() : []
  return jsonResponse({ message: { ...m, profiles: authorProfile(m), reactions: groupReactions(reactRows, auth!.id) } })
}

function groupReactions(rows: { emote: string; user_id: string }[], currentUserId: string) {
  const byEmote: Record<string, { count: number; reacted: boolean }> = {}
  for (const r of rows) {
    if (!byEmote[r.emote]) byEmote[r.emote] = { count: 0, reacted: false }
    byEmote[r.emote].count++
    if (r.user_id === currentUserId) byEmote[r.emote].reacted = true
  }
  return Object.entries(byEmote).map(([emote, v]) => ({ emote, ...v }))
}

export async function handleChatMessages(ctx: RouteCtx): Promise<Response> {
  const { request, env, url, auth } = ctx

  // DELETE /api/chat/messages/:id
  if (request.method === "DELETE") {
    const id = url.pathname.split("/").pop()
    if (!id) return jsonResponse({ error: "Message ID required" }, 400)

    const fetchRes = await supabaseRest(env, `messages?id=eq.${encodeURIComponent(id)}&select=id,user_id,deleted_at`)
    if (!fetchRes.ok) return upstreamError("message fetch (delete)", fetchRes, "Failed to fetch message")
    const rows = await fetchRes.json<{ id: string; user_id: string; deleted_at: string | null }[]>()
    if (!rows.length) return jsonResponse({ error: "Message not found" }, 404)
    const msg = rows[0]
    if (msg.deleted_at) return jsonResponse({ error: "Already deleted" }, 409)
    if (msg.user_id !== auth!.id && auth!.role !== "admin") {
      return jsonResponse({ error: "Forbidden" }, 403)
    }

    const delRes = await supabaseRest(env, `messages?id=eq.${encodeURIComponent(id)}`, "PATCH", {
      deleted_at: new Date().toISOString(),
      deleted_by: auth!.id,
    })
    if (!delRes.ok) return upstreamError("message delete", delRes, "Failed to delete message")
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

    const fetchRes = await supabaseRest(env, `messages?id=eq.${encodeURIComponent(id)}&select=id,user_id,deleted_at`)
    if (!fetchRes.ok) return upstreamError("message fetch (edit)", fetchRes, "Failed to fetch message")
    const rows = await fetchRes.json<{ id: string; user_id: string; deleted_at: string | null }[]>()
    if (!rows.length) return jsonResponse({ error: "Message not found" }, 404)
    const msg = rows[0]
    if (msg.deleted_at) return jsonResponse({ error: "Message is deleted" }, 409)
    if (msg.user_id !== auth!.id) return jsonResponse({ error: "Forbidden" }, 403)

    const editRes = await supabaseRest(env, `messages?id=eq.${encodeURIComponent(id)}`, "PATCH", {
      body: newBody,
      edited_at: new Date().toISOString(),
    })
    if (!editRes.ok) return upstreamError("message edit", editRes, "Failed to edit message")
    return jsonResponse({ ok: true })
  }

  // POST /api/chat/messages — send a message
  if (request.method === "POST") {
    const ban = await checkBanStatus(env, auth!.id)
    if (ban.banned) return jsonResponse({ error: ban.reason ?? "You are banned" }, 403)

    let body: { room_id?: string; body?: string; reply_to?: string | null }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    if (!body.room_id?.trim() || !body.body?.trim()) return jsonResponse({ error: "room_id and body required" }, 400)
    if (body.body.trim().length > 2000) return jsonResponse({ error: "Message too long" }, 400)

    const row = {
      room_id: body.room_id.trim(),
      user_id: auth!.id,
      body: body.body.trim(),
      reply_to: body.reply_to ?? null,
    }
    // Denormalized author identity: makes the realtime broadcast self-describing
    // (no enrichment fetch per client) and pre-migration rows joinable. If the
    // columns don't exist yet (migration not applied), retry the bare insert.
    const denorm = { username: auth!.username, name_color: auth!.name_color, avatar_url: auth!.avatar_url }
    let res = await supabaseRest(env, "messages", "POST", { ...row, ...denorm })
    if (!res.ok && (res.status === 400 || res.status === 404)) {
      console.error(`[chat] denormalized insert rejected (${res.status}) — run docs/migrations/2026-07-chat-denormalize.sql; falling back`)
      res = await supabaseRest(env, "messages", "POST", row)
    }
    if (!res.ok) return upstreamError("message send", res, "Failed to send message")
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

  const res = await supabaseRest(env, `messages?${filter}&select=*`)
  if (!res.ok) return upstreamError("messages list", res, "Failed to fetch messages")
  const messages = await res.json<ChatMessage[]>()

  // Reply snapshots + reactions are independent — fetch them concurrently.
  const replyIds = [...new Set(messages.map(m => m.reply_to).filter((id): id is string => id !== null))]
  const msgIds = messages.map(m => m.id)

  const [replyRows, reactRows] = await Promise.all([
    replyIds.length > 0
      ? supabaseRest(env, `messages?id=in.(${replyIds.map(encodeURIComponent).join(",")})&select=id,body,username,name_color,avatar_url`)
          .then((r) => (r.ok ? r.json<ChatMessage[]>() : []))
          .catch(() => [] as ChatMessage[])
      : Promise.resolve([] as ChatMessage[]),
    msgIds.length > 0
      ? supabaseRest(env, `reactions?message_id=in.(${msgIds.map(encodeURIComponent).join(",")})&select=message_id,emote,user_id`)
          .then((r) => (r.ok ? r.json<{ message_id: string; emote: string; user_id: string }[]>() : []))
          .catch(() => [] as { message_id: string; emote: string; user_id: string }[])
      : Promise.resolve([] as { message_id: string; emote: string; user_id: string }[]),
  ])

  const replyMap: Record<string, { id: string; body: string; profiles: ChatMessage["profiles"] }> = {}
  for (const r of replyRows) replyMap[r.id] = { id: r.id, body: r.body, profiles: authorProfile(r) }

  const reactionsMap: Record<string, { emote: string; user_id: string }[]> = {}
  for (const r of reactRows) (reactionsMap[r.message_id] ??= []).push({ emote: r.emote, user_id: r.user_id })

  const enriched = messages.map(m => ({
    ...m,
    profiles: authorProfile(m),
    reply_to_message: m.reply_to ? (replyMap[m.reply_to] ?? null) : null,
    reactions: groupReactions(reactionsMap[m.id] ?? [], auth!.id),
  }))

  return jsonResponse({ messages: enriched, has_more: messages.length === limit })
}

export async function handleChatReactions({ request, env, auth }: RouteCtx): Promise<Response> {
  let body: { message_id?: string; emote?: string }
  try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
  if (!body.message_id?.trim() || !body.emote?.trim()) {
    return jsonResponse({ error: "message_id and emote required" }, 400)
  }

  if (request.method === "POST") {
    const res = await supabaseRest(env, "reactions", "POST", {
      message_id: body.message_id.trim(),
      user_id: auth!.id,
      emote: body.emote.trim(),
    }, "resolution=merge-duplicates,return=representation")
    if (!res.ok) return upstreamError("reaction add", res, "Failed to add reaction")
    return jsonResponse({ ok: true })
  }

  if (request.method === "DELETE") {
    const res = await supabaseRest(
      env,
      `reactions?message_id=eq.${encodeURIComponent(body.message_id.trim())}&user_id=eq.${auth!.id}&emote=eq.${encodeURIComponent(body.emote.trim())}`,
      "DELETE",
    )
    if (!res.ok) return upstreamError("reaction remove", res, "Failed to remove reaction")
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}

export async function handleChatSearch({ env, url }: RouteCtx): Promise<Response> {
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

  // Author filter hits the denormalized username column directly — no join.
  if (user) parts.push(`username=eq.${encodeURIComponent(user)}`)

  const res = await supabaseRest(env, `messages?${parts.join("&")}&select=*`)
  if (!res.ok) return upstreamError("chat search", res, "Search failed")
  const messages = await res.json<ChatMessage[]>()

  return jsonResponse({ messages: messages.map(m => ({ ...m, profiles: authorProfile(m) })) })
}

export async function handleChatPins({ env, url }: RouteCtx): Promise<Response> {
  const room = url.searchParams.get("room")
  if (!room) return jsonResponse({ error: "room parameter required" }, 400)

  const res = await supabaseRest(
    env,
    `messages?room_id=eq.${encodeURIComponent(room)}&pinned_at=not.is.null&deleted_at=is.null&order=pinned_at.desc&limit=20&select=id,body,pinned_at,pinned_by,username,name_color,avatar_url`
  )
  if (!res.ok) return upstreamError("pins list", res, "Failed to fetch pins")
  const pins = await res.json<ChatMessage[]>()
  return jsonResponse({ pins: pins.map(p => ({ ...p, profiles: authorProfile(p) })) })
}

export async function handleChatPin({ request, env, url, auth }: RouteCtx): Promise<Response> {
  const id = url.pathname.split("/")[4] // /api/chat/messages/:id/pin
  if (!id) return jsonResponse({ error: "Message ID required" }, 400)

  if (request.method === "POST") {
    const res = await supabaseRest(env, `messages?id=eq.${encodeURIComponent(id)}`, "PATCH", {
      pinned_at: new Date().toISOString(),
      pinned_by: auth!.id,
    })
    if (!res.ok) return upstreamError("pin", res, "Failed to pin message")
    return jsonResponse({ ok: true })
  }

  if (request.method === "DELETE") {
    const res = await supabaseRest(env, `messages?id=eq.${encodeURIComponent(id)}`, "PATCH", {
      pinned_at: null,
      pinned_by: null,
    })
    if (!res.ok) return upstreamError("unpin", res, "Failed to unpin message")
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}

export async function handleChatUserMini({ env, match }: RouteCtx): Promise<Response> {
  const username = decodeURIComponent(match[1])
  const res = await supabaseRest(
    env,
    `profiles?username=eq.${encodeURIComponent(username)}&select=id,username,avatar_url,role,bio,created_at,name_color`,
  )
  if (!res.ok) return upstreamError("user mini", res, "Failed to fetch user")
  const rows = await res.json<{ id: string; username: string; avatar_url: string | null; role: string; bio: string | null; created_at: string | null; name_color: string | null }[]>()
  if (!rows.length) return jsonResponse({ error: "User not found" }, 404)
  const row = rows[0]
  if (!row.avatar_url) {
    const index = await getContentIndex(env.ASSETS)
    row.avatar_url = chatterImageForUsername(index, username)
  }

  const { id: _id, ...rest } = row
  return jsonResponse(rest)
}

export async function handleChatClaim({ request, env, auth }: RouteCtx): Promise<Response> {
  if (!auth!.username) return jsonResponse({ error: "Username required" }, 400)

  let body: { wiki_slug?: string }
  try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
  if (!body.wiki_slug?.trim()) return jsonResponse({ error: "wiki_slug required" }, 400)

  const slug = body.wiki_slug.trim()

  // Verify the wiki page has matching username frontmatter
  const index = await getContentIndex(env.ASSETS)
  const meta = resolveMetaCaseInsensitive(index, slug)
  if (!meta) return jsonResponse({ error: "Wiki page not found" }, 404)
  if (!meta.username || meta.username.toLowerCase() !== auth!.username.toLowerCase()) {
    return jsonResponse({ error: "Username does not match wiki page" }, 403)
  }

  // Check if already claimed by someone else
  const existing = await supabaseRest(env, `chatter_claims?wiki_slug=eq.${encodeURIComponent(slug)}&select=user_id`)
  if (existing.ok) {
    const rows = await existing.json<{ user_id: string }[]>()
    if (rows.length > 0 && rows[0].user_id !== auth!.id) {
      return jsonResponse({ error: "Page already claimed by another user" }, 409)
    }
    if (rows.length > 0 && rows[0].user_id === auth!.id) {
      return jsonResponse({ ok: true, already_claimed: true })
    }
  }

  const res = await supabaseRest(env, "chatter_claims", "POST", {
    user_id: auth!.id,
    wiki_slug: slug,
  })
  if (!res.ok) return upstreamError("claim create", res, "Failed to create claim")
  return jsonResponse({ ok: true }, 201)
}

export async function handleUserClaim({ env, match }: RouteCtx): Promise<Response> {
  const username = decodeURIComponent(match[1])
  const userRes = await supabaseRest(env, `profiles?username=eq.${encodeURIComponent(username)}&select=id`)
  if (!userRes.ok) return upstreamError("claim user lookup", userRes, "Failed to fetch user")
  const users = await userRes.json<{ id: string }[]>()
  if (!users.length) return jsonResponse({ error: "User not found" }, 404)

  const claimRes = await supabaseRest(env, `chatter_claims?user_id=eq.${users[0].id}&select=wiki_slug,claimed_at`)
  if (!claimRes.ok) return upstreamError("claim fetch", claimRes, "Failed to fetch claim")
  const claims = await claimRes.json<{ wiki_slug: string; claimed_at: string }[]>()

  return jsonResponse({ claim: claims.length > 0 ? claims[0] : null })
}

export async function handleClaimBySlug({ env, match }: RouteCtx): Promise<Response> {
  const slug = decodeURIComponent(match[1])
  const claimRes = await supabaseRest(env, `chatter_claims?wiki_slug=eq.${encodeURIComponent(slug)}&select=user_id`)
  if (!claimRes.ok) return upstreamError("claim by slug", claimRes, "Failed to fetch claim")
  const claims = await claimRes.json<{ user_id: string }[]>()

  if (!claims.length) return jsonResponse({ claim: null })

  const profileRes = await supabaseRest(env, `profiles?id=eq.${claims[0].user_id}&select=username,avatar_url`)
  if (!profileRes.ok) return jsonResponse({ claim: null })
  const profiles = await profileRes.json<{ username: string; avatar_url: string | null }[]>()

  return jsonResponse({
    claim: profiles.length > 0
      ? { username: profiles[0].username, avatar_url: profiles[0].avatar_url }
      : null
  })
}

export async function handleChatBan({ request, env, url }: RouteCtx): Promise<Response> {
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
    if (!res.ok) return upstreamError("ban", res, "Failed to ban user")

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
  if (!res.ok) return upstreamError("unban", res, "Failed to unban user")
  return jsonResponse({ ok: true })
}

export async function handleChessGif({ request }: RouteCtx): Promise<Response> {
  const pgn = await request.text()
  if (!pgn.trim()) return jsonResponse({ error: "Empty PGN" }, 400)
  // Real games are a few KB — cap prevents the endpoint being used as a relay.
  if (pgn.length > 16_384) return jsonResponse({ error: "PGN too large" }, 413)

  const upstream = await fetch("https://lichess1.org/game/export/gif", {
    method: "POST",
    headers: { "Content-Type": "application/x-chess-pgn" },
    body: pgn,
  })

  if (!upstream.ok) {
    return jsonResponse({ error: `Lichess GIF export failed: ${upstream.status}` }, 502)
  }

  return new Response(upstream.body, { status: 200, headers: { "Content-Type": "image/gif" } })
}

export async function handleGifSearch({ env, url }: RouteCtx): Promise<Response> {
  if (!env.KLIPY_API_KEY) {
    return jsonResponse({ error: "GIF search not configured" }, 503)
  }
  const q = url.searchParams.get("q") || "trending"
  const klipyUrl = `https://api.klipy.co/api/v1/gifs/search?q=${encodeURIComponent(q)}&limit=20`
  try {
    const res = await fetch(klipyUrl, {
      headers: { Authorization: `Bearer ${env.KLIPY_API_KEY}` },
    })
    if (!res.ok) return upstreamError("klipy", res, "GIF search failed", 502)
    const data = await res.json<{ data?: Array<{ id: string; url: string; preview_url?: string; title?: string }> }>()
    const results = (data.data ?? []).map((g) => ({
      url: g.url,
      preview: g.preview_url ?? g.url,
      title: g.title ?? "",
    }))
    return jsonResponse({ results }, 200)
  } catch (e) {
    console.error("[upstream] klipy unreachable:", e)
    return jsonResponse({ error: "GIF search unavailable" }, 502)
  }
}

/** Propagate a profile identity change onto denormalized message rows.
 * Failure is logged, never fatal (pre-migration the columns don't exist). */
export async function propagateIdentityChange(env: Env, auth: AuthUser, updates: { username?: string; name_color?: string | null; avatar_url?: string | null }) {
  const denorm: Record<string, string | null> = {}
  if (updates.username !== undefined) denorm.username = updates.username
  if (updates.name_color !== undefined) denorm.name_color = updates.name_color
  if (updates.avatar_url !== undefined) denorm.avatar_url = updates.avatar_url
  if (Object.keys(denorm).length === 0) return
  const res = await supabaseRest(env, `messages?user_id=eq.${auth.id}`, "PATCH", denorm)
  if (!res.ok) console.error(`[chat] identity propagation failed (${res.status}) — pre-migration? see docs/migrations/`)
}
