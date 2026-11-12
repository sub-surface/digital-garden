import { Env, ChatMessage, BanProfile, RouteCtx, AuthUser } from "./types"
import { jsonResponse, supabaseRest, upstreamError, isUuid, invalidateAuthCache, readJson, siteDb, nowIso } from "./lib"
import { broadcastToRoom } from "./chatLive"
import { getContentIndex, chatterImageForUsername, resolveMetaCaseInsensitive } from "./meta"

/** Fails CLOSED: if the ban state can't be read, the caller's write is refused
 * (thrown → dispatcher 500 with requestId) rather than silently allowed. */
export async function checkBanStatus(env: Env, userId: string): Promise<{ banned: boolean; reason?: string }> {
  const res = await supabaseRest(env, `profiles?id=eq.${userId}&select=ban_type,ban_expires_at,ban_reason`)
  if (!res.ok) throw new Error(`ban status lookup failed: ${res.status}`)
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
  const db = siteDb(env)
  if (request.method === "GET") {
    const { results } = await db
      .prepare("SELECT id, name, slug, created_at, created_by FROM rooms WHERE archived = 0 ORDER BY name ASC").all()
    return jsonResponse({ rooms: results })
  }

  if (request.method === "POST") {
    let body: { name?: string; slug?: string }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    const name = body.name?.trim().slice(0, 80), slug = body.slug?.trim().toLowerCase()
    if (!name || !slug) return jsonResponse({ error: "name and slug required" }, 400)
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) return jsonResponse({ error: "slug: letters, digits, - and _" }, 400)
    const room = { id: slug, name, slug, created_by: auth!.id, created_at: nowIso(), archived: false }
    const res = await db.prepare("INSERT INTO rooms (id, name, slug, created_by, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
      .bind(room.id, room.name, room.slug, room.created_by, room.created_at).run()
    if (!res.meta.changes) return jsonResponse({ error: "A room with that slug exists" }, 409)
    return jsonResponse([room], 201)
  }

  // PATCH /api/chat/rooms/:id — archive/unarchive
  let body: { archived?: boolean }
  try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
  const roomId = decodeURIComponent(url.pathname.split("/")[4] ?? "")
  if (!roomId) return jsonResponse({ error: "Room ID required" }, 400)
  await db.prepare("UPDATE rooms SET archived = ? WHERE id = ?").bind(body.archived === false ? 0 : 1, roomId).run()
  return jsonResponse({ ok: true })
}

type Row = ChatMessage & { edited_at?: string | null; pinned_at?: string | null; pinned_by?: string | null }

/** GET /api/chat/messages/:id — one message, with reactions. */
export async function handleChatMessageById({ env, match, auth }: RouteCtx): Promise<Response> {
  const id = decodeURIComponent(match[1])
  const db = siteDb(env)
  const m = await db.prepare("SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL").bind(id).first<Row>()
  if (!m) return jsonResponse({ error: "Message not found" }, 404)
  const { results } = await db.prepare("SELECT emote, user_id FROM reactions WHERE message_id = ?").bind(id).all<{ emote: string; user_id: string }>()
  return jsonResponse({ message: { ...m, profiles: authorProfile(m), reactions: groupReactions(results, auth!.id) } })
}

function clampLimit(raw: string | null): number {
  const n = parseInt(raw ?? "50", 10)
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 100) : 50
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

const marks = (n: number) => new Array(n).fill("?").join(",")

/** The quoted message a reply shows, for a set of ids. Only live messages in
 * the same room: a reply must never surface a deleted message or another room's. */
async function replySnapshots(db: D1Database, roomId: string, ids: string[]) {
  const map: Record<string, { id: string; body: string; profiles: ChatMessage["profiles"] }> = {}
  if (!ids.length) return map
  const { results } = await db.prepare(`SELECT id, body, username, name_color, avatar_url FROM messages WHERE room_id = ? AND deleted_at IS NULL AND id IN (${marks(ids.length)})`)
    .bind(roomId, ...ids).all<Row>()
  for (const r of results) map[r.id] = { id: r.id, body: r.body, profiles: authorProfile(r) }
  return map
}

export async function handleChatMessages(ctx: RouteCtx): Promise<Response> {
  const { request, env, url, auth, waitUntil } = ctx
  const db = siteDb(env)

  // DELETE /api/chat/messages/:id
  if (request.method === "DELETE") {
    const id = decodeURIComponent(url.pathname.split("/").pop() ?? "")
    if (!id) return jsonResponse({ error: "Message ID required" }, 400)
    const msg = await db.prepare("SELECT room_id, user_id, deleted_at FROM messages WHERE id = ?").bind(id).first<Row>()
    if (!msg) return jsonResponse({ error: "Message not found" }, 404)
    if (msg.deleted_at) return jsonResponse({ error: "Already deleted" }, 409)
    if (msg.user_id !== auth!.id && auth!.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403)
    await db.prepare("UPDATE messages SET deleted_at = ?, deleted_by = ? WHERE id = ?").bind(nowIso(), auth!.id, id).run()
    waitUntil(broadcastToRoom(env, msg.room_id, { type: "delete", id }))
    return jsonResponse({ ok: true })
  }

  // PATCH /api/chat/messages/:id — edit own message
  if (request.method === "PATCH") {
    const id = decodeURIComponent(url.pathname.split("/").pop() ?? "")
    if (!id) return jsonResponse({ error: "Message ID required" }, 400)
    let payload: { body?: string }
    try { payload = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    const newBody = payload.body?.trim()
    if (!newBody) return jsonResponse({ error: "body required" }, 400)
    if (newBody.length > 2000) return jsonResponse({ error: "Message too long" }, 400)

    const msg = await db.prepare("SELECT room_id, user_id, deleted_at FROM messages WHERE id = ?").bind(id).first<Row>()
    if (!msg) return jsonResponse({ error: "Message not found" }, 404)
    if (msg.deleted_at) return jsonResponse({ error: "Message is deleted" }, 409)
    if (msg.user_id !== auth!.id) return jsonResponse({ error: "Forbidden" }, 403)
    const edited_at = nowIso()
    await db.prepare("UPDATE messages SET body = ?, edited_at = ? WHERE id = ?").bind(newBody, edited_at, id).run()
    waitUntil(broadcastToRoom(env, msg.room_id, { type: "edit", id, body: newBody, edited_at }))
    return jsonResponse({ ok: true })
  }

  // POST /api/chat/messages — send a message
  if (request.method === "POST") {
    // Ban check: enforced for every authed write by the dispatcher.
    let body: { room_id?: string; body?: string; reply_to?: string | null }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    if (!body.room_id?.trim() || !body.body?.trim()) return jsonResponse({ error: "room_id and body required" }, 400)
    if (body.body.trim().length > 2000) return jsonResponse({ error: "Message too long" }, 400)
    const roomId = body.room_id.trim()
    if (!(await db.prepare("SELECT 1 FROM rooms WHERE id = ? AND archived = 0").bind(roomId).first())) {
      return jsonResponse({ error: "No such room" }, 404)
    }
    const replyTo = typeof body.reply_to === "string" && body.reply_to ? body.reply_to : null
    if (replyTo && !(await db.prepare("SELECT 1 FROM messages WHERE id = ? AND room_id = ? AND deleted_at IS NULL").bind(replyTo, roomId).first())) {
      return jsonResponse({ error: "The message you replied to is gone" }, 400)
    }
    const message = await insertMessage(env, {
      room_id: roomId, user_id: auth!.id, body: body.body.trim(), reply_to: replyTo,
      username: auth!.username, name_color: auth!.name_color, avatar_url: auth!.avatar_url,
    })
    waitUntil(broadcastMessage(env, message))
    return jsonResponse({ ok: true, id: message.id }, 201)
  }

  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405)

  const room = url.searchParams.get("room")
  if (!room) return jsonResponse({ error: "room parameter required" }, 400)
  const before = url.searchParams.get("before")
  const limit = clampLimit(url.searchParams.get("limit"))

  const { results: messages } = await db.prepare(
    "SELECT * FROM messages WHERE room_id = ? AND deleted_at IS NULL" +
    (before ? " AND created_at < ?" : "") + " ORDER BY created_at DESC LIMIT ?",
  ).bind(...(before ? [room, before, limit] : [room, limit])).all<Row>()

  const replyIds = [...new Set(messages.map((m) => m.reply_to).filter((id): id is string => !!id))]
  const msgIds = messages.map((m) => m.id)
  const [replyMap, reactRows] = await Promise.all([
    replySnapshots(db, room, replyIds),
    msgIds.length
      ? db.prepare(`SELECT message_id, emote, user_id FROM reactions WHERE message_id IN (${marks(msgIds.length)})`)
          .bind(...msgIds).all<{ message_id: string; emote: string; user_id: string }>().then((r) => r.results)
      : Promise.resolve([] as { message_id: string; emote: string; user_id: string }[]),
  ])

  const reactionsMap: Record<string, { emote: string; user_id: string }[]> = {}
  for (const r of reactRows) (reactionsMap[r.message_id] ??= []).push({ emote: r.emote, user_id: r.user_id })

  const enriched = messages.map((m) => ({
    ...m,
    profiles: authorProfile(m),
    reply_to_message: m.reply_to ? (replyMap[m.reply_to] ?? null) : null,
    reactions: groupReactions(reactionsMap[m.id] ?? [], auth!.id),
  }))
  return jsonResponse({ messages: enriched, has_more: messages.length === limit })
}

interface NewMessage {
  room_id: string; user_id: string; body: string; reply_to: string | null
  username: string | null; name_color: string | null; avatar_url: string | null
}

/** Write a message (people and bot personas alike); returns the full row. */
export async function insertMessage(env: Env, m: NewMessage): Promise<Row> {
  const row = { id: crypto.randomUUID(), created_at: nowIso(), ...m }
  await siteDb(env).prepare(
    "INSERT INTO messages (id, room_id, user_id, body, reply_to, created_at, username, name_color, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(row.id, row.room_id, row.user_id, row.body, row.reply_to, row.created_at, row.username, row.name_color, row.avatar_url).run()
  return { ...row, deleted_at: null, deleted_by: null, profiles: null }
}

/** Send a new message to the room's live sockets, shaped as the list endpoint shapes it. */
export async function broadcastMessage(env: Env, m: Row): Promise<void> {
  const replies = m.reply_to ? await replySnapshots(siteDb(env), m.room_id, [m.reply_to]) : {}
  await broadcastToRoom(env, m.room_id, {
    type: "message",
    message: { ...m, profiles: authorProfile(m), reply_to_message: m.reply_to ? (replies[m.reply_to] ?? null) : null, reactions: [] },
  })
}

export async function handleChatReactions({ request, env, auth, waitUntil }: RouteCtx): Promise<Response> {
  let body: { message_id?: string; emote?: string }
  try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
  const messageId = body.message_id?.trim(), emote = body.emote?.trim()
  if (!messageId || !emote) return jsonResponse({ error: "message_id and emote required" }, 400)
  if (emote.length > 64) return jsonResponse({ error: "Invalid emote" }, 400)
  const db = siteDb(env)
  const msg = await db.prepare("SELECT room_id FROM messages WHERE id = ? AND deleted_at IS NULL").bind(messageId).first<{ room_id: string }>()
  if (!msg) return jsonResponse({ error: "Message not found" }, 404)

  if (request.method === "POST") {
    const res = await db.prepare("INSERT INTO reactions (message_id, user_id, emote) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
      .bind(messageId, auth!.id, emote).run()
    if (res.meta.changes) waitUntil(broadcastToRoom(env, msg.room_id, { type: "reaction", message_id: messageId, emote, user_id: auth!.id, op: "add" }))
    return jsonResponse({ ok: true })
  }
  if (request.method === "DELETE") {
    const res = await db.prepare("DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emote = ?").bind(messageId, auth!.id, emote).run()
    if (res.meta.changes) waitUntil(broadcastToRoom(env, msg.room_id, { type: "reaction", message_id: messageId, emote, user_id: auth!.id, op: "remove" }))
    return jsonResponse({ ok: true })
  }
  return jsonResponse({ error: "Method not allowed" }, 405)
}

export async function handleChatSearch({ env, url }: RouteCtx): Promise<Response> {
  const q = url.searchParams.get("q")?.trim()
  if (!q) return jsonResponse({ error: "q parameter required" }, 400)
  const where = ["deleted_at IS NULL", "body LIKE ? ESCAPE '\\'"]
  const args: (string | number)[] = [`%${q.slice(0, 200).replace(/[\\%_]/g, (c) => `\\${c}`)}%`]
  const room = url.searchParams.get("room"), user = url.searchParams.get("user")
  const before = url.searchParams.get("before"), after = url.searchParams.get("after")
  if (room) { where.push("room_id = ?"); args.push(room) }
  if (before) { where.push("created_at < ?"); args.push(before) }
  if (after) { where.push("created_at > ?"); args.push(after) }
  // Author filter hits the denormalized username column directly — no join.
  if (user) { where.push("username = ? COLLATE NOCASE"); args.push(user) }
  args.push(clampLimit(url.searchParams.get("limit")))
  const { results } = await siteDb(env).prepare(`SELECT * FROM messages WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`)
    .bind(...args).all<Row>()
  return jsonResponse({ messages: results.map((m) => ({ ...m, profiles: authorProfile(m) })) })
}

export async function handleChatPins({ env, url }: RouteCtx): Promise<Response> {
  const room = url.searchParams.get("room")
  if (!room) return jsonResponse({ error: "room parameter required" }, 400)
  const { results } = await siteDb(env).prepare(
    "SELECT id, body, pinned_at, pinned_by, username, name_color, avatar_url FROM messages " +
    "WHERE room_id = ? AND pinned_at IS NOT NULL AND deleted_at IS NULL ORDER BY pinned_at DESC LIMIT 20",
  ).bind(room).all<Row>()
  return jsonResponse({ pins: results.map((p) => ({ ...p, profiles: authorProfile(p) })) })
}

export async function handleChatPin({ request, env, url, auth }: RouteCtx): Promise<Response> {
  const id = decodeURIComponent(url.pathname.split("/")[4] ?? "") // /api/chat/messages/:id/pin
  if (!id) return jsonResponse({ error: "Message ID required" }, 400)
  const db = siteDb(env)
  if (request.method === "POST") {
    await db.prepare("UPDATE messages SET pinned_at = ?, pinned_by = ? WHERE id = ?").bind(nowIso(), auth!.id, id).run()
    return jsonResponse({ ok: true })
  }
  if (request.method === "DELETE") {
    await db.prepare("UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = ?").bind(id).run()
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
  const db = siteDb(env)
  const existing = await db.prepare("SELECT user_id FROM chatter_claims WHERE wiki_slug = ?").bind(slug).first<{ user_id: string }>()
  if (existing && existing.user_id !== auth!.id) return jsonResponse({ error: "Page already claimed by another user" }, 409)
  if (existing) return jsonResponse({ ok: true, already_claimed: true })

  // The primary key settles a race between two claimants.
  const res = await db.prepare("INSERT INTO chatter_claims (wiki_slug, user_id, claimed_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
    .bind(slug, auth!.id, nowIso()).run()
  if (!res.meta.changes) return jsonResponse({ error: "Page already claimed by another user" }, 409)
  return jsonResponse({ ok: true }, 201)
}

export async function handleUserClaim({ env, match }: RouteCtx): Promise<Response> {
  const username = decodeURIComponent(match[1])
  const userRes = await supabaseRest(env, `profiles?username=eq.${encodeURIComponent(username)}&select=id`)
  if (!userRes.ok) return upstreamError("claim user lookup", userRes, "Failed to fetch user")
  const users = await userRes.json<{ id: string }[]>()
  if (!users.length) return jsonResponse({ error: "User not found" }, 404)

  const claim = await siteDb(env).prepare("SELECT wiki_slug, claimed_at FROM chatter_claims WHERE user_id = ? LIMIT 1")
    .bind(users[0].id).first<{ wiki_slug: string; claimed_at: string }>()
  return jsonResponse({ claim: claim ?? null })
}

export async function handleClaimBySlug({ env, match }: RouteCtx): Promise<Response> {
  const slug = decodeURIComponent(match[1])
  const found = await siteDb(env).prepare("SELECT user_id FROM chatter_claims WHERE wiki_slug = ?").bind(slug).first<{ user_id: string }>()
  if (!found) return jsonResponse({ claim: null })
  const claims = [found]

  const profileRes = await supabaseRest(env, `profiles?id=eq.${claims[0].user_id}&select=username,avatar_url`)
  if (!profileRes.ok) return jsonResponse({ claim: null })
  const profiles = await profileRes.json<{ username: string; avatar_url: string | null }[]>()

  return jsonResponse({
    claim: profiles.length > 0
      ? { username: profiles[0].username, avatar_url: profiles[0].avatar_url }
      : null
  })
}

export async function handleChatBan({ request, env, url, auth }: RouteCtx): Promise<Response> {
  const isBan = url.pathname === "/api/chat/ban"

  const body = await readJson<{ user_id: string; type: string; duration_hours: number; reason: string }>(request)
  if (body instanceof Response) return body
  const targetId = body.user_id?.trim()
  if (!isUuid(targetId)) return jsonResponse({ error: "user_id must be a user UUID" }, 400)

  if (isBan) {
    if (body.type !== "temporary" && body.type !== "permanent") {
      return jsonResponse({ error: "type must be 'temporary' or 'permanent'" }, 400)
    }
    if (targetId === auth!.id) return jsonResponse({ error: "You can't ban yourself" }, 400)
    // A temporary ban without a valid duration used to store ban_expires_at=null,
    // which checkBanStatus reads as a ban that never expires.
    const hours = Number(body.duration_hours)
    if (body.type === "temporary" && !(Number.isFinite(hours) && hours > 0 && hours <= 24 * 365)) {
      return jsonResponse({ error: "duration_hours must be between 0 and 8760 for a temporary ban" }, 400)
    }

    const targetRes = await supabaseRest(env, `profiles?id=eq.${targetId}&select=role`)
    if (!targetRes.ok) return upstreamError("ban target lookup", targetRes, "Failed to look up user")
    const [target] = await targetRes.json<{ role: string }[]>()
    if (!target) return jsonResponse({ error: "User not found" }, 404)
    if (target.role === "admin") return jsonResponse({ error: "Admins can't be banned — demote first" }, 403)

    const ban_expires_at = body.type === "temporary" ? new Date(Date.now() + hours * 3600000).toISOString() : null
    const res = await supabaseRest(env, `profiles?id=eq.${targetId}`, "PATCH", {
      ban_type: body.type,
      ban_expires_at,
      ban_reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null,
    })
    if (!res.ok) return upstreamError("ban", res, "Failed to ban user")
    invalidateAuthCache(targetId)

    // Permanent ban: hard-delete messages + anonymise profile. Each step is
    // checked — a half-applied purge must be visible, not reported as ok.
    if (body.type === "permanent") {
      const db = siteDb(env)
      await db.batch([
        db.prepare("DELETE FROM reactions WHERE user_id = ?").bind(targetId),
        db.prepare("DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE user_id = ?)").bind(targetId),
        db.prepare("DELETE FROM messages WHERE user_id = ?").bind(targetId),
      ])
      const r = await supabaseRest(env, `profiles?id=eq.${targetId}`, "PATCH", { username: null, avatar_url: null, bio: null, name_color: null })
      if (!r.ok) return upstreamError("permanent ban: anonymise profile", r, "User banned and purged, but anonymising the profile failed — retry")
    }

    return jsonResponse({ ok: true })
  }

  // unban
  const res = await supabaseRest(env, `profiles?id=eq.${targetId}`, "PATCH", {
    ban_type: "none",
    ban_expires_at: null,
    ban_reason: null,
  })
  if (!res.ok) return upstreamError("unban", res, "Failed to unban user")
  invalidateAuthCache(targetId)
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

/** Propagate a profile identity change onto denormalized message rows. Logged, never fatal.
 * The column names come from the fixed set above, never from the request. */
export async function propagateIdentityChange(env: Env, auth: AuthUser, updates: { username?: string; name_color?: string | null; avatar_url?: string | null }) {
  const denorm: Record<string, string | null> = {}
  if (updates.username !== undefined) denorm.username = updates.username
  if (updates.name_color !== undefined) denorm.name_color = updates.name_color
  if (updates.avatar_url !== undefined) denorm.avatar_url = updates.avatar_url
  if (Object.keys(denorm).length === 0) return
  const cols = Object.keys(denorm)
  try {
    await siteDb(env).prepare(`UPDATE messages SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE user_id = ?`)
      .bind(...cols.map((c) => denorm[c]), auth.id).run()
  } catch (e) {
    console.error("[chat] identity propagation failed:", e)
  }
}
