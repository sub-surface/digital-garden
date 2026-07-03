export interface Env {
  ASSETS?: Fetcher
  TURNSTILE_SECRET_KEY: string
  GITHUB_TOKEN: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  KLIPY_API_KEY?: string
  EMAIL?: { send: (msg: any) => Promise<any> }
  /** Cloudflare rate-limit binding (wrangler.toml [[unsafe.bindings]]). Optional
   * so local dev / older deploys degrade to no limiting rather than erroring. */
  WRITE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> }
}

export interface NoteMeta {
  title?: string
  description?: string
  excerpt?: string
  image?: string
  cover?: string
  poster?: string
  username?: string  // chatter pages carry the chat username
}

export interface ProfileData {
  role: string
  username: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string | null
  name_color: string | null
}

export interface AuthUser {
  id: string
  role: string
  email: string
  username: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string | null
  name_color: string | null
}

export interface ChatMessage {
  id: string
  room_id: string
  user_id: string
  body: string
  reply_to: string | null
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
  // Denormalized author identity, written at POST time (see docs/migrations/).
  // Older rows may have these null — the profiles embed is the fallback.
  username?: string | null
  name_color?: string | null
  avatar_url?: string | null
  profiles: { username: string | null; avatar_url: string | null; name_color?: string | null } | null
}

export interface BanProfile {
  ban_type: string | null
  ban_expires_at: string | null
  ban_reason: string | null
}

/** Per-request context threaded to handlers by the dispatcher. */
export interface RouteCtx {
  request: Request
  env: Env
  url: URL
  match: RegExpMatchArray
  /** Resolved auth user — non-null when the route declared auth: "user" | "admin". */
  auth: AuthUser | null
  /** Register background work that must survive the response (ctx.waitUntil). */
  waitUntil: (p: Promise<unknown>) => void
}
