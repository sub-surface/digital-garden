-- The site's own records, moved off Supabase (docs/backend.md, phase 1).
-- User ids stay Supabase auth uuids (TEXT); identity itself is still Supabase's.
-- Timestamps are ISO-8601 TEXT throughout, as the desk's are.

-- Admin page locks on the wiki. Matched case-insensitively.
CREATE TABLE IF NOT EXISTS page_locks (
  slug      TEXT PRIMARY KEY COLLATE NOCASE,
  reason    TEXT,
  locked_by TEXT,
  locked_at TEXT NOT NULL
);

-- One row per wiki edit PR opened through the site.
CREATE TABLE IF NOT EXISTS edit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL,
  user_id      TEXT,
  pr_url       TEXT,
  edit_summary TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS edit_log_created ON edit_log (created_at DESC);

-- A chatter's wiki page, claimed by the user whose username it carries.
CREATE TABLE IF NOT EXISTS chatter_claims (
  wiki_slug  TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chatter_claims_user ON chatter_claims (user_id);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id  TEXT NOT NULL,
  slug     TEXT NOT NULL,
  title    TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slug)
);

-- API keys: only the SHA-256 of the key is kept; the key itself is shown once.
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS api_keys_user ON api_keys (user_id);

-- Notes a reader recovered from the OS Recycle Bin.
CREATE TABLE IF NOT EXISTS os_restores (
  user_id     TEXT NOT NULL,
  slug        TEXT NOT NULL,
  restored_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slug)
);
