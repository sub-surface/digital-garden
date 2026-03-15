export interface ChatReaction {
  emote: string
  count: number
  reacted: boolean  // current user has reacted with this emote
}

export interface ChatMessage {
  id: string
  room_id: string
  user_id: string
  body: string
  reply_to: string | null
  created_at: string
  deleted_at: string | null
  profiles: { username: string; avatar_url: string | null; name_color?: string | null } | null
  reply_to_message?: { id: string; body: string; profiles: { username: string } | null } | null
  reactions?: ChatReaction[]
}

export interface ChatRoom {
  id: string
  name: string
  slug: string
  archived: boolean
}
