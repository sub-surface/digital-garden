-- Chat, moved off Supabase (docs/backend.md, phase 2). Live delivery is a
-- Durable Object per room (src/worker/chatLive.ts); these tables are the record.
-- Author identity is denormalised onto each message (written at send time,
-- rewritten on profile change), so reads never join profiles.

CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  archived   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  body       TEXT NOT NULL,
  reply_to   TEXT,
  created_at TEXT NOT NULL,
  edited_at  TEXT,
  deleted_at TEXT,
  deleted_by TEXT,
  pinned_at  TEXT,
  pinned_by  TEXT,
  username   TEXT,
  name_color TEXT,
  avatar_url TEXT
);
CREATE INDEX IF NOT EXISTS messages_room_time ON messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_user ON messages (user_id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  emote      TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emote)
);
CREATE INDEX IF NOT EXISTS reactions_user ON reactions (user_id);
