/**
 * Live chat without Supabase Realtime: one Durable Object per room holds the
 * room's WebSockets (hibernating, so an idle room costs nothing) and fans out
 * what the Worker tells it. It stores nothing: messages live in D1, written by
 * chat.ts, which then calls broadcastToRoom(). Typing indicators are the only
 * thing clients send over the socket, relayed to everyone else in the room.
 *
 * The socket is opened at /api/chat/live?room=<id> with the sub-protocols
 * ["subsurfaces.chat", <access token>]: a browser WebSocket can't set an
 * Authorization header, and a token in the URL would land in logs.
 */
import { DurableObject } from "cloudflare:workers"
import type { Env } from "./types"
import { ALLOWED_ORIGINS, jsonResponse, siteDb, verifyAuth } from "./lib"

const PROTOCOL = "subsurfaces.chat"

interface Who { id: string; username: string | null }

export type LiveEvent =
  | { type: "message"; message: unknown }
  | { type: "edit"; id: string; body: string; edited_at: string }
  | { type: "delete"; id: string }
  | { type: "reaction"; message_id: string; emote: string; user_id: string; op: "add" | "remove" }
  | { type: "typing"; user_id: string; username: string | null; typing: boolean }

export class ChatRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected a websocket", { status: 426 })
    const who = JSON.parse(request.headers.get("X-Chat-User") ?? "null") as Who | null
    if (!who?.id) return new Response("no user", { status: 400 })
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(who)
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": PROTOCOL } })
  }

  /** RPC from the Worker: send one event to everyone in the room. */
  async broadcast(event: string): Promise<number> {
    return this.send(event)
  }

  private send(text: string, except?: WebSocket): number {
    let n = 0
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue
      try { ws.send(text); n++ } catch { /* closing; the runtime will reap it */ }
    }
    return n
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw.length > 200) return
    let data: { type?: string; typing?: unknown }
    try { data = JSON.parse(raw) } catch { return }
    if (data.type === "ping") { ws.send('{"type":"pong"}'); return }
    if (data.type === "typing") {
      const who = ws.deserializeAttachment() as Who
      const event: LiveEvent = { type: "typing", user_id: who.id, username: who.username, typing: data.typing === true }
      this.send(JSON.stringify(event), ws)
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const who = ws.deserializeAttachment() as Who | null
    // Whoever was typing has stopped.
    if (who) this.send(JSON.stringify({ type: "typing", user_id: who.id, username: who.username, typing: false } satisfies LiveEvent), ws)
    try { ws.close(code === 1005 ? 1000 : code, "closing") } catch { /* already closed */ }
  }
}

/** Tell a room's sockets about a change. Best effort: the record is in D1 either way. */
export async function broadcastToRoom(env: Env, roomId: string, event: LiveEvent): Promise<void> {
  if (!env.CHAT_ROOMS) return
  try {
    const stub = env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(roomId))
    await stub.broadcast(JSON.stringify(event))
  } catch (e) {
    console.error(`[chat] broadcast to ${roomId} failed:`, e)
  }
}

/** GET /api/chat/live?room=<id>, as a WebSocket upgrade. Routed before the dispatcher (a 101 can't be re-wrapped). */
export async function handleChatLive(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return jsonResponse({ error: "Expected a WebSocket upgrade" }, 426)
  if (!env.CHAT_ROOMS) return jsonResponse({ error: "Live chat is not configured" }, 503)
  // A WebSocket ignores CORS, so check the page that opened it.
  const origin = request.headers.get("Origin")
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return jsonResponse({ error: "Forbidden origin" }, 403)

  const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map((p) => p.trim())
  const token = protocols.find((p) => p && p !== PROTOCOL)
  if (!protocols.includes(PROTOCOL) || !token) return jsonResponse({ error: "Unauthorized" }, 401)
  const auth = await verifyAuth(new Request(url.toString(), { headers: { Authorization: `Bearer ${token}` } }), env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  const room = url.searchParams.get("room") ?? ""
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(room)) return jsonResponse({ error: "Bad room" }, 400)
  const known = await siteDb(env).prepare("SELECT 1 FROM rooms WHERE id = ? AND archived = 0").bind(room).first()
  if (!known) return jsonResponse({ error: "No such room" }, 404)

  const stub = env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(room))
  return stub.fetch("https://chat-room/connect", {
    headers: { Upgrade: "websocket", "X-Chat-User": JSON.stringify({ id: auth.id, username: auth.username } satisfies Who) },
  })
}
