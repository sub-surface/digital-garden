-- The /write desk (src/worker/write.ts): drafts of daily notes and their history.
-- Cloudflare D1, binding DESK_DB. Apply with:
--   npx wrangler d1 migrations apply subsurfaces-desk --remote
-- (and --local for `npm run dev`). Images live in the R2 bucket bound as DESK_MEDIA.

CREATE TABLE IF NOT EXISTS daily_drafts (
  iso           TEXT PRIMARY KEY,               -- YYYY-MM-DD
  source        TEXT NOT NULL DEFAULT '',       -- the whole file, frontmatter included
  base_sha      TEXT,                           -- blob sha on master this draft began from (NULL: no file yet)
  media         TEXT NOT NULL DEFAULT '[]',     -- JSON array of image names waiting in R2 (<iso>/<name>)
  updated_at    TEXT NOT NULL,                  -- ISO timestamps throughout
  committed_at  TEXT,
  committed_sha TEXT
);

CREATE TABLE IF NOT EXISTS daily_revisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  iso        TEXT NOT NULL,
  source     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS daily_revisions_iso_created ON daily_revisions (iso, created_at DESC);
