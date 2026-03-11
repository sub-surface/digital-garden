export interface ChatMessage {
  id: string
  room_id: string
  user_id: string
  body: string
  reply_to: string | null
  created_at: string
  deleted_at: string | null
  profiles: { username: string; avatar_url: string | null } | null
  reply_to_message?: { id: string; body: string; profiles: { username: string } | null } | null
}

export interface ChatRoom {
  id: string
  name: string
  slug: string
  archived: boolean
}
