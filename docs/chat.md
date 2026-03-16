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

### Message Pinning (Admin)

- [x] `pinned_at`, `pinned_by` columns on `messages` table
- [x] `GET /api/chat/pins?room=` — list pinned messages for a room
- [x] `POST /api/chat/messages/:id/pin` — admin only
- [x] `DELETE /api/chat/messages/:id/pin` — admin only
- [x] Pin ticker bar below header — accent-tinted background, carousel with dot pips for multiple pins, auto-cycles every 6s, pauses on hover
- [x] Pin ticker renders emotes via `parseMessageBody`
- [x] Pin/unpin action on message hover (admin only)

### Message Editing

- [x] `edited_at` column on `messages` table
- [x] `PATCH /api/chat/messages/:id` — own messages only, updates body + sets `edited_at`
- [x] Inline edit mode on MessageRow — textarea auto-sizes to content, Enter saves, Escape cancels
- [x] Edit button in message hover actions (own messages only)
- [x] Up arrow on empty input triggers edit on last own message
- [x] "(edited)" indicator on edited messages
- [x] Optimistic update with rollback on failure

### Autocomplete System

- [x] Unified autocomplete popup in MessageInput — triggered by `:` (emotes), `@` (mentions), `/` (commands)
- [x] Arrow keys navigate, Tab/Enter selects, Escape dismisses
- [x] Emote completions from `/emotes/index.json` with thumbnail previews
- [x] User mention completions from known message authors in room
- [x] Initial commands: `/gif` (opens picker), `/shrug` (inserts text), `/me` (action text)
- [ ] Future commands: `/whisper`, `/pepo`, `/remind`

### Emote Preview Strip

- [x] Thin strip above input area — renders emote images when input contains `:emote:` tokens
- [x] Deduplicates emotes, falls back from .gif to .png

### Chat Layout Overhaul

- [x] Sidebar collapsed into compact header bar: `[# channel selector] ... [search] [pin] [settings]`
- [x] Chat main area centered (`justify-content: center`), 70% viewport width, max 860px
- [x] Channel selector dropdown in header — unified between ChatPage and SideChat via `headerExtra` prop
- [x] Search button expands inline input field with debounced results
- [x] Borders removed between panels for leaner look
- [x] Input box minimalized — transparent background, bottom-line only
- [x] Name color applied as default username color (not just hover accent)

### Admin Room Management UI

- [ ] Admin-only "+" button in header → inline form: room name + slug → `POST /api/chat/rooms`
- [ ] Admin can archive a room (removes from list, preserves history)

---

## Phase 2: Stonks

### Supabase Schema

- [x] `stonk_ledger` table: append-only, `id UUID PK`, `user_id`, `amount`, `reason`, `source_type`, `source_id` (composite `{msg_id}:{reactor}:{emote}`), `created_at`. Indexes: `(user_id, created_at DESC)`, `(created_at)`, `(source_id, source_type)`. RLS enabled, no client policies (service key only).
- [x] `stonk_balance` view: `SELECT user_id, GREATEST(COALESCE(SUM(amount), 0), 0) AS balance FROM stonk_ledger GROUP BY user_id`
- [x] `stonk_config` table: `key TEXT PK, value INTEGER`. RLS enabled.
- [x] `stonk_balance` added to `GET /api/chat/users/:username/mini` (null when disabled, 0 when no entries)

### Point Events (reaction-based, all write to `stonk_ledger`)

- [x] Received a kek reaction: +5 (configurable via `kek_received`)
- [x] Received a nahh reaction: -3 (configurable via `nahh_received`; balance floor 0)
- [x] Gave a nahh reaction: -1 to giver (configurable via `nahh_given`)
- [x] Other reaction emotes: configurable per-emote value (default 0 via `reaction_received_default`)
- [x] No self-stonking (reactor === author skipped)
- [x] Reaction delete: reversal rows (negated original amount from ledger, not current config)
- [x] Kill switch: `stonks_enabled` in config — 0 disables all ledger writes and hides UI
- [ ] Profile created points, wiki edit points — deferred to Phase 3

### `stonk_config` table

- [x] Seeded defaults: `stonks_enabled=1`, `kek_received=5`, `nahh_received=-3`, `nahh_given=-1`, `reaction_received_default=0`
- [x] `GET /api/admin/stonk-config` — returns all config rows (admin only)
- [x] `PUT /api/admin/stonk-config` — body `{ key, value }`: update a config value (admin only)

### Frontend — Stonks Display

- [x] Stonk balance + sparkline on `WikiProfilePage` (own + public) — shows even with 0 balance
- [x] Stonk balance on `MiniProfilePopup` (monospace number)
- [x] `StonkSparkline` component: pure inline SVG polyline, accent-coloured, flat line when < 2 data points
- [x] `useStonkHistory` hook: fetches history + balance in parallel
- [x] `GET /api/chat/users/:username/stonk-history` — 90-day daily cumulative balance via window function
- [x] React picker in message actions (`+` button): full emote pool from `/emotes/index.json`, filterable, scrollable grid, portalled
- [x] Removed stonk triangle button — all point flow through emote reactions
- [x] Admin stonk config section in ChatSettings: toggle for enabled, inline-editable number inputs per emote
- [ ] Easter egg reactions: configurable per-emote effects — deferred

> **Future note:** Secondary stonks market — deliberately deferred. Ledger schema supports it.

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
