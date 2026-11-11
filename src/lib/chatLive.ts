/**
 * The chat's live connection: one WebSocket per room, shared by everything on
 * the page that listens to that room (the message list, the typing line).
 * Served by a Durable Object per room (src/worker/chatLive.ts); replaces
 * Supabase Realtime. Reconnects with backoff, and tells listeners when it has
 * reconnected so they can fetch what they missed.
 *
 * The access token rides in the sub-protocol list: a browser WebSocket can't
 * set an Authorization header, and a token in the URL would end up in logs.
 */
import { supabaseNow } from "@/lib/supabase"
import type { ChatMessage } from "@/types/chat"

export type LiveEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "edit"; id: string; body: string; edited_at: string }
  | { type: "delete"; id: string }
  | { type: "reaction"; message_id: string; emote: string; user_id: string; op: "add" | "remove" }
  | { type: "typing"; user_id: string; username: string | null; typing: boolean }
  | { type: "reconnected" }

type Listener = (e: LiveEvent) => void

interface Conn {
  ws: WebSocket | null
  listeners: Set<Listener>
  retry: number
  timer: ReturnType<typeof setTimeout> | null
  ping: ReturnType<typeof setInterval> | null
  everOpen: boolean
  closed: boolean
}

const conns = new Map<string, Conn>()

async function accessToken(): Promise<string | null> {
  const supabase = supabaseNow()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function connect(room: string, c: Conn) {
  if (c.closed) return
  void accessToken().then((token) => {
    if (c.closed) return
    if (!token) { schedule(room, c); return }
    const proto = location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${proto}//${location.host}/api/chat/live?room=${encodeURIComponent(room)}`, ["subsurfaces.chat", token])
    c.ws = ws
    ws.onopen = () => {
      c.retry = 0
      if (c.everOpen) c.listeners.forEach((l) => l({ type: "reconnected" }))
      c.everOpen = true
      // Keep idle proxies from dropping the socket.
      c.ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}') }, 30_000)
    }
    ws.onmessage = (m) => {
      let e: LiveEvent | { type: "pong" }
      try { e = JSON.parse(String(m.data)) } catch { return }
      if (e.type === "pong") return
      c.listeners.forEach((l) => l(e as LiveEvent))
    }
    ws.onclose = () => {
      if (c.ping) clearInterval(c.ping)
      c.ping = null
      c.ws = null
      schedule(room, c)
    }
  })
}

function schedule(room: string, c: Conn) {
  if (c.closed || c.timer) return
  const wait = Math.min(30_000, 1000 * 2 ** c.retry++)
  c.timer = setTimeout(() => { c.timer = null; connect(room, c) }, wait)
}

/** Listen to a room; the returned function stops listening (and closes the socket with the last listener). */
export function subscribeRoom(room: string, listener: Listener): () => void {
  let c = conns.get(room)
  if (!c) {
    c = { ws: null, listeners: new Set(), retry: 0, timer: null, ping: null, everOpen: false, closed: false }
    conns.set(room, c)
    connect(room, c)
  }
  c.listeners.add(listener)
  const conn = c
  return () => {
    conn.listeners.delete(listener)
    if (conn.listeners.size) return
    conn.closed = true
    if (conn.timer) clearTimeout(conn.timer)
    if (conn.ping) clearInterval(conn.ping)
    conn.ws?.close(1000, "done")
    conns.delete(room)
  }
}

/** Tell the room whether we're typing. Dropped silently when not connected. */
export function sendTyping(room: string, typing: boolean) {
  const ws = conns.get(room)?.ws
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "typing", typing }))
}
