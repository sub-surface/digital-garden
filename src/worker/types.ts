export interface Env {
  ASSETS?: Fetcher
  TURNSTILE_SECRET_KEY: string
  GITHUB_TOKEN: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  KLIPY_API_KEY?: string
  EMAIL?: { send: (msg: any) => Promise<any> }
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
  profiles: { username: string | null; avatar_url: string | null; name_color?: string | null } | null
}

export interface BanProfile {
  ban_type: string | null
  ban_expires_at: string | null
  ban_reason: string | null
}
