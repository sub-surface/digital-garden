# Chat — chat.subsurfaces.net

## Chatter Community Platform

Three interlocking systems: **Chat** (Phase 1), **Stonks** (Phase 2), **Identity & Avatar** (Phase 3). All share the existing Supabase auth and `profiles` table.

**Phase order is strict — do not skip ahead:**
`shared cookie auth` → `chat` → `stonks` → `identity`. Stonks UI must not be built before chat reactions exist to feed it.

**Strict layering — dependencies flow one way only:**
```
subsurfaces.net        (no Supabase dependency — must load if Supabase is down)
       ↓
wiki.subsurfaces.net   (Supabase auth + GitHub API)
       ↓
chat.subsurfaces.net   (Supabase Realtime + stonks ledger)
```
Nothing flows upward. A chat outage must not affect the wiki. A wiki outage must not affect the garden.

**`src/worker.ts` domain routing** — one Worker serves all three domains intentionally. Keep a clear partition comment at the top of the routing block:
```
// garden:  subsurfaces.net        → static assets + OG meta injection
// wiki:    wiki.subsurfaces.net   → auth, editing, profiles, bookmarks
// chat:    chat.subsurfaces.net   → realtime, stonks, bans, GIF search
```

---

## Phase 1: Chat

### Infrastructure

- [x] **Shared cookie auth first** — cookie-based `storage` adapter in `src/lib/supabase.ts` writes session to `document.cookie` with `domain=.subsurfaces.net`; falls back to default (localStorage) when `VITE_COOKIE_DOMAIN` unset. Deploy + verify test matrix before building chat UI: login on `wiki.*` → navigate to `chat.*` → still logged in; logout on `chat.*` → `wiki.*` also logged out
- [x] Add `VITE_COOKIE_DOMAIN` env var (`.subsurfaces.net` in `.env`, unset in `.env.local` for localhost dev)
- [x] Add `chat.subsurfaces.net` as a custom domain in `wrangler.toml` (CF dashboard custom domain already added by user)
- [x] `useShell()` hook returning `"main" | "wiki" | "chat"` in `src/hooks/useShell.ts`; `useIsWiki()` and `useIsChat()` are thin wrappers; `src/hooks/useIsWiki.ts` re-exports from `useShell`
- [x] Create `ChatShell.tsx` — lean skeleton shell (no BgCanvas, no panels, no music); `ChatUserMenu` with auth modal; `TerminalTitle context="chat"`
- [x] Add chat shell detection in `AppShell.tsx` — `if (shell === "chat") return <ChatShell />`; content-index fetch shared across all shells
- [x] **Cross-subdomain auth (shared cookie)**: cookie `storage` adapter in `src/lib/supabase.ts` — `VITE_COOKIE_DOMAIN` controls domain scope; `cookieOptions` field on browser client doesn't work (SSR-only), so custom `storage` adapter used instead
- [x] `VITE_CHAT_MODE=true` env var support in `useShell()`; commented out in `.env.local` with instructions
- [x] `usePanelClick` updated: `isWiki` bail-out replaced with `shell !== "main"` — also bails on chat
- [x] **Supabase: add `chat.subsurfaces.net` to Auth redirect URLs** — Authentication → URL Configuration → Redirect URLs
- [x] **Verify shared cookie auth in production** — login on wiki → navigate to chat → still logged in; confirmed working

### Supabase Schema

- [x] `rooms` table created + seeded (`general`, `philosophy`)
- [x] `messages` table created with FTS index + `(room_id, created_at DESC)` index
- [x] `reactions` table with composite PK `(message_id, user_id, emote)`
- [x] Ban fields added to `profiles`: `ban_type`, `ban_expires_at`, `ban_reason`
- [x] RLS policies on `messages`, `reactions`, `rooms` (authenticated read; own insert; own delete for reactions)
- [x] Supabase Realtime enabled on `messages` and `reactions` tables — Dashboard path: **Database → Publications → supabase_realtime → toggle table**. Alternatively via SQL: `alter publication supabase_realtime add table messages; alter publication supabase_realtime add table reactions;`
- [x] Enable Supabase Realtime **Presence** channel per room (for typing indicators — Phase 1 future)

### Worker API Endpoints (`src/worker.ts`)

- [x] `GET /api/chat/rooms` — non-archived rooms ordered by name
- [x] `POST /api/chat/rooms` — admin only: create room
- [x] `GET /api/chat/messages?room=&before=&limit=` — paginated history with `profiles` embed + reply_to snapshots
- [x] `DELETE /api/chat/messages/:id` — soft delete (own or admin)
- [x] `POST /api/chat/reactions` — upsert reaction
- [x] `DELETE /api/chat/reactions` — remove own reaction
- [x] `GET /api/chat/search?q=&room=&user=&before=&after=&limit=` — ilike full-text search
- [x] `GET /api/chat/users/:username/mini` — public mini profile
- [x] `POST /api/chat/ban` + `POST /api/chat/unban` — admin only
- [x] `checkBanStatus()` helper — checked on all authenticated chat writes

### Admin: Bans

- [x] `ban_type`, `ban_expires_at`, `ban_reason` on `profiles`
- [x] Ban check in worker on all authenticated chat writes (messages, reactions)
- [x] `POST /api/chat/ban` / `POST /api/chat/unban` endpoints (admin only)
- [ ] On permanent ban: hard-delete all message rows + anonymise profile (deferred)

### Frontend — ChatShell & UI

- [x] `ChatShell.tsx` + `ChatShell.module.scss` — IRC-aesthetic shell, auth menu, TerminalTitle "Philchat"
- [x] `ChatPage.tsx` — two-column layout (sidebar + main), room list, login prompt, auto-selects first room
- [x] `ChatRoom.tsx` — Supabase Realtime subscription, pagination, scroll-to-bottom, send handler
- [x] `MessageList.tsx` — grouped consecutive messages, forwardRef scroll, compact rows
- [x] `MessageInput.tsx` — Enter-to-send, char limit, reply preview banner
- [x] `MessageRow.tsx` — avatar, username, timestamp, reply-to bar, deleted state, hover reply button
- [x] `parseMessageBody.ts` — tokeniser: text/emote/image/youtube/url tokens, one-embed guard
- [x] `MessageBodyRenderer` in `MessageRow` — renders tokens: inline images, YouTube click-to-load, links, emotes
- [x] `src/types/chat.ts` — shared `ChatMessage` + `ChatRoom` types
- [x] Router: catch-all `noteRoute` returns `<ChatPage />` when `shell === "chat"`
- [x] `MiniProfilePopup.tsx` — fixed-position popup on username click; avatar, role badge, bio, joined date, stonk placeholder, link to wiki profile
- [x] `TypingIndicator.tsx` — Supabase Presence per room; shared channel via module-level Map; `useTypingBroadcast()` hook for MessageInput integration
- [x] `EmotePicker.tsx` — fetches `/emotes/index.json`, falls back to 8 hardcoded names; filterable grid; inserts `:name:` into input
- [x] `GifPicker.tsx` — debounced search via `GET /api/chat/gif-search`; 2-column preview grid; inserts `![](url)` on select
- [x] `ChatSearch.tsx` — right-panel overlay; query/room/date/media-only filters; calls `GET /api/chat/search`; result list with room+author+body+timestamp
- [x] **Chat UI overhaul**: `Chat.module.scss` full rewrite — `justify-content: flex-end` on `.messageList` to anchor messages at bottom; floating pill `.msgActions`; refined spacing/borders; sidebar slimmed to 180px
- [x] **Inline sidebar search**: replaced `ChatSearch` overlay + sidebar button with debounced input in sidebar; results render below channel list using `.sidebarSearch*` CSS classes; 300ms debounce, 20-result limit
- [x] **Emote-only messages**: `isEmoteOnly()` in `MessageRow.tsx` detects single `:emote:` body; applies `messageBodyEmoteOnly` class for large emote rendering (`height: 2.8em`)
- [x] Reaction strip on `MessageRow` — emote+count buttons, own-highlighted, calls `onReact`
- [x] Delete button on own messages in `MessageRow` — hover-reveal, calls `onDelete`
- [x] `GET /api/chat/gif-search` worker endpoint — proxies KLIPY API (requires `KLIPY_API_KEY` CF secret)
- [x] Commit initial emote set to `public/emotes/` + create `public/emotes/index.json` (55 emotes: 28 GIF + 27 PNG; `{name,ext}[]` format)
- [x] Wire `onReact` / `onDelete` callbacks in `ChatRoom` — optimistic toggle (POST/DELETE), reactions embedded in messages response from worker
- [x] Add `KLIPY_API_KEY` as CF Worker secret in dashboard (test mode — production pending KLIPY activation)

### Rich Media Rendering (`MessageRow.tsx` + `parseMessageBody.ts`)

All message body rendering goes through a shared `parseMessageBody(text)` utility that splits the body into typed tokens before render. No `dangerouslySetInnerHTML` — tokens map to React components.

**Token types and render rules:**

| Token | Detection | Renders as |
|---|---|---|
| `![](url)` | Markdown image syntax (inserted by GIF picker) | `<img>` inline, `max-height: 300px` |
| Image URL | Bare URL ending in `.jpg .jpeg .png .gif .webp` or from known image CDNs (`i.imgur.com`, `pbs.twimg.com`, etc.) | `<img>` inline, `max-height: 300px` |
| YouTube URL | `youtube.com/watch?v=` or `youtu.be/` | Lazy `<iframe>` embed (click-to-load thumbnail first to avoid autoload) |
| Twitter/X URL | `twitter.com/` or `x.com/` + `/status/` | `<blockquote>` placeholder + link; optionally lazy-load Twitter embed script |
| Plain URL | Any other `https?://` URL | `<a target="_blank" rel="noopener noreferrer">` with URL as label |
| `:emote-name:` | Colon-wrapped token matching a known emote name | `<img src="/emotes/{name}.gif" class="emote">` |
| Plain text | Everything else | Text node |

**Rules:**
- [x] Create `src/lib/parseMessageBody.ts` — tokeniser returning typed token array
- [x] GIF picker inserts `![](url)` syntax (not bare URL) — unambiguous signal, no extension sniffing needed for GIFs
- [x] Image embeds are ephemeral by design — raw user-provided links, no proxying, no caching; broken images show nothing (`onError` handler hides them)
- [x] YouTube: render a static thumbnail (`https://img.youtube.com/vi/{id}/0.jpg`) with a play button overlay; clicking loads the actual `<iframe>` — avoids autoplaying iframes on load
- [ ] Twitter/X: render as a styled link card (username + tweet text if extractable) — avoid loading Twitter's JS embed script by default; optional "load embed" button
- [x] Max one embed per message to prevent spam walls of iframes
- [ ] All embeds lazy — nothing loads until the message is in the viewport (`IntersectionObserver`)
- [x] `onError` on all `<img>` tags — hide broken images silently, never show broken image icon in chat

### Admin Room Management UI

- [ ] Admin-only "+" button in room sidebar → inline form: room name + slug → `POST /api/chat/rooms`
- [ ] Admin can archive a room (removes from sidebar, preserves history)

---

## Phase 2: Stonks

### Supabase Schema

- [ ] Create `stonk_ledger` table: `id UUID PRIMARY KEY, user_id UUID REFERENCES profiles, amount INTEGER NOT NULL, reason TEXT NOT NULL, source_type TEXT NOT NULL` (e.g. `reaction_received`, `reaction_given`, `profile_created`, `wiki_edit`, `nahh_given`), `source_id TEXT, created_at TIMESTAMPTZ NOT NULL`
  - Index: `(user_id, created_at DESC)`
  - Balance = `SUM(amount) WHERE user_id = ?` — pure ledger, no cached balance needed at current scale (~500k rows before performance consideration, years away at community scale)
  - Add `created_at` index at schema creation time — enables clean range-based archiving later without schema changes: `CREATE INDEX idx_stonk_ledger_created ON stonk_ledger(created_at)`
- [ ] `stonk_balance` Postgres view: `SELECT user_id, SUM(amount) AS balance FROM stonk_ledger GROUP BY user_id`
- [ ] Add `stonk_balance` to `GET /api/auth/me` and `GET /api/users/:username/mini` responses (query the view)
- [ ] Add `chat_launched: false` to `stonk_config` as a feature flag — stonks display components check this flag and render nothing (not zero) until chat is live; flip to `true` when Phase 1 ships to avoid misleading zeroes on wiki profiles before the economy exists

### Point Events (all instant, all write to `stonk_ledger`)

- [ ] Profile created: +50
- [ ] Wiki edit submitted (PR merged): +10
- [ ] Wiki page created: +25
- [ ] Received a kek reaction: +5
- [ ] Received a nahh reaction: -3 (floor: 0 — clamp in Worker before insert)
- [ ] Gave a nahh reaction: -1 to giver (configurable, default -1 — cost disincentivises spam)
- [ ] Gave a kek: +0 (giving keks is free, costs nothing)
- [ ] Other reaction emotes: configurable per-emote value (default 0, admins can set per emote)
- [ ] All values admin-configurable via a `stonk_config` table: `key TEXT PRIMARY KEY, value INTEGER`

### `stonk_config` table

- [ ] Seed default values for all point events above
- [ ] `GET /api/admin/stonk-config` — returns all config rows
- [ ] `PUT /api/admin/stonk-config` — body `{ key, value }`: update a config value; admin only

### Frontend — Stonks Display

- [ ] Stonk balance + sparkline on `WikiProfilePage` (own profile) and public `/user/:username` page
- [ ] Stonk balance + small number on `MiniProfilePopup`
- [ ] Sparkline chart: lightweight SVG (uPlot or hand-rolled with D3 — D3 already in bundle) showing balance over time from `stonk_ledger` grouped by day
- [ ] `GET /api/users/:username/stonk-history` — returns daily balance snapshots (aggregate ledger by day) for charting
- [ ] Easter egg reactions: configurable per-emote `effect` field in `stonk_config` (e.g. `confetti`) — client reads effect from emote config and triggers animation; confetti via `canvas-confetti` (tiny, ~3KB)

> **Future note:** Secondary stonks market (users investing in other users' stonks, prediction-market style) — deliberately deferred. The ledger schema supports it without changes.

---

## Phase 3: Identity & Avatar

### Wiki Profile Claiming (Supabase-backed)

- [ ] Create `chatter_claims` table: `user_id UUID REFERENCES profiles PRIMARY KEY, wiki_slug TEXT NOT NULL UNIQUE, claimed_at TIMESTAMPTZ`
- [ ] `POST /api/chat/claim` — body `{ wiki_slug }`: verifies `username` frontmatter on the markdown file matches the authenticated user's username (fetch from `content-index.json`); inserts into `chatter_claims`; returns claim record
- [ ] `GET /api/users/:username/claim` — returns claimed wiki slug if exists
- [ ] On `WikiProfilePage` and public profile: show linked chatter wiki page if claim exists; show "Claim this wiki page" button if a matching `username` frontmatter exists but no claim yet
- [ ] On chatter wiki profile pages (`type: chatter`): show linked user account if claim exists; show "Is this you? Claim this page" button otherwise
- [ ] Logged-in users without a claim and without a matching wiki profile: show "Create your chatter profile" button → opens submit form (`/submit`) pre-filled with their username; submission still creates a PR (GitHub App token deferred)

### Avatar Customisation

- [x] Avatar upload on `WikiProfilePage` — 72px circle, `↑` overlay button, hidden file input; max 2MB JPEG/PNG/WebP/GIF; `POST /api/profile/avatar` in worker uploads to Supabase Storage bucket `avatars` (public), stores URL in `profiles.avatar_url`
- [x] Chatter wiki page image fallback — if `avatar_url` null, worker looks up chatter page by `username` frontmatter in content-index and returns its `image` field; applied in `/api/auth/me`, `/api/user/:username`, `/api/chat/users/:username/mini`
- [x] Avatar displayed in: chat `MessageRow`, `MiniProfilePopup`, `WikiProfilePage`
- [ ] Avatar displayed in: wiki profile infobox (if claimed), `WikiShell` auth header

#### Idle Game (deferred — design note)
> Cookie-clicker / Universal Paperclips style idle mechanic. Idle rate scales with stonk level. Points calculated on login from `last_login` delta, capped at 24h accumulation. Avatar "collects" while away — client-side presentation of the delta. Full design TBD.

---

## Bug Fixes (Session 2026-03-11)

- [x] **Query component broken on wiki**: `contentIndex` never populated on wiki shell — `AppShell` was guarding the `content-index.json` fetch behind `shell === "main"`. Removed guard; all shells now fetch it on mount.
- [x] **Worker crash risk with optional ASSETS**: `getContentIndex(env.ASSETS)` could pass `undefined` — added null guard inside `getContentIndex`. Safe in practice due to early return, but now defensively correct.
- [x] **Realtime message enrichment race condition**: fetching enriched profile using `before=created_at+1s` was unreliable under concurrent inserts. Now fetches last 10 messages and matches by ID.
