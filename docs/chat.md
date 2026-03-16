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

- [x] Create `chatter_claims` table: `user_id UUID REFERENCES profiles PRIMARY KEY, wiki_slug TEXT NOT NULL UNIQUE, claimed_at TIMESTAMPTZ`
- [x] `POST /api/chat/claim` — body `{ wiki_slug }`: verifies `username` frontmatter on the markdown file matches the authenticated user's username (fetch from `content-index.json`); inserts into `chatter_claims`; returns claim record
- [x] `GET /api/users/:username/claim` — returns claimed wiki slug if exists
- [x] `GET /api/claims/by-slug/:slug` — returns claim data (username, avatar_url) for a wiki slug
- [x] On `WikiProfilePage` and public profile: show linked chatter wiki page if claim exists; show "Claim this wiki page" button if a matching `username` frontmatter exists but no claim yet
- [ ] On chatter wiki profile pages (`type: chatter`): show linked user account if claim exists; show "Is this you? Claim this page" button otherwise
- [ ] Logged-in users without a claim and without a matching wiki profile: show "Create your chatter profile" button → opens submit form (`/submit`) pre-filled with their username; submission still creates a PR (GitHub App token deferred)

### Avatar Customisation

- [x] Avatar upload on `WikiProfilePage` — 72px circle, `↑` overlay button, hidden file input; max 2MB JPEG/PNG/WebP/GIF; `POST /api/profile/avatar` in worker uploads to Supabase Storage bucket `avatars` (public), stores URL in `profiles.avatar_url`
- [x] Chatter wiki page image fallback — if `avatar_url` null, worker looks up chatter page by `username` frontmatter in content-index and returns its `image` field; applied in `/api/auth/me`, `/api/user/:username`, `/api/chat/users/:username/mini`
- [x] Avatar displayed in: chat `MessageRow`, `MiniProfilePopup`, `WikiProfilePage`
- [x] Avatar displayed in: wiki profile infobox (if claimed) — WikiInfobox fetches `/api/claims/by-slug/:slug` and overrides frontmatter image with claimer's avatar
- [ ] Avatar displayed in: `WikiShell` auth header

#### Idle Game (deferred — design note)
> Cookie-clicker / Universal Paperclips style idle mechanic. Idle rate scales with stonk level. Points calculated on login from `last_login` delta, capped at 24h accumulation. Avatar "collects" while away — client-side presentation of the delta. Full design TBD.

---

## Bug Fixes (Session 2026-03-11)

- [x] **Query component broken on wiki**: `contentIndex` never populated on wiki shell — `AppShell` was guarding the `content-index.json` fetch behind `shell === "main"`. Removed guard; all shells now fetch it on mount.
- [x] **Worker crash risk with optional ASSETS**: `getContentIndex(env.ASSETS)` could pass `undefined` — added null guard inside `getContentIndex`. Safe in practice due to early return, but now defensively correct.
- [x] **Realtime message enrichment race condition**: fetching enriched profile using `before=created_at+1s` was unreliable under concurrent inserts. Now fetches last 10 messages and matches by ID.

---

## Terminal Mode (Chat Polish Session 2026-03-16)

A full terminal/CLI mode for the chat. Toggled via the `>_` button in QuickControls (chat shell only). The design goal is a genuine terminal aesthetic — not just a CSS skin — that treats the chat as a protocol and the UI as one possible frontend.

### Motivation

The terminal mode embodies a key architectural principle: the chat backend is universal, and the nice web UI is just one frontend. The terminal mode is a second frontend for the same backend. This distinction matters for:
- Future API key access: anyone can build their own frontend against the same CF Worker API
- Clarity of what is "chat" vs what is "site UI" — reactions, emotes, density settings are site-layer; messages, rooms, users are protocol-layer
- The terminal mode is a demonstration that the protocol is clean enough to use directly

### Architecture

**Store field:** `chatTerminal: boolean` in Zustand store, persisted to localStorage (`"chatTerminal"` key). Toggled by `TerminalToggle` in `QuickControls.tsx` (visible on chat shell only).

**ChatShell integration:** When `chatTerminal` is true, `data-terminal="1"` is applied to the shell root div. `ChatShell.module.scss` transitions `.shell` background to `#000`. `TerminalChatView` uses `position: fixed; top: 3.5rem; left: 0; right: 0; bottom: 0; z-index: 100` to cover the full chat area below the TerminalTitle nav.

**Component tree (terminal mode):**
```
ChatShell (data-terminal="1", bg: #000)
  TerminalTitle (z: 200+, stays visible)
  QuickControls (z: 200+, stays visible)
  ChatRoom
    TerminalBootScreen (z: 9999, fixed overlay, plays on first toggle)
    TerminalChatView (z: 100, fixed overlay covering chat area)
      [normal ChatRoom header/input hidden]
```

**Normal mode is fully preserved** — toggling terminal off returns to exactly the normal chat UI.

### Boot Sequence (`TerminalBootScreen.tsx`)

Three phases, each skippable:

**Phase 1 — Randomised BIOS** (click to skip to splash):
Picks 4-6 elements at random from a pool of 12 types. Elements include:
- `bios_header` — box-drawn `╔══╗` header with system name
- `bios_post` — 6-9 random hardware POST lines (CPU, RAM, network, Supabase connection status, poetic lines like "Soul: waveform detected ∿∿∿")
- `memory_test` — animated in-place memory counter (0K → 65536K OK)
- `network_handshake` — TX/RX SYN handshake with latency stats
- `scope_pulse` — animated ASCII oscilloscope (sine wave built char by char, self-removes)
- `branch_tree` — ASCII tree growing from bottom up, self-removes
- `echo_text` — word echoes into dim copies at increasing indent
- `hex_dump` — three lines of hex memory dump
- `module_load` — in-place module loader (kernel... ok / auth... ok / chat... ok)
- `spectral` — three-band ASCII spectrum readout
- `perf_test` — benchmark rows with in-place `[PASSED]` update
- `tip_block` — random tip from a 15-item pool (chat tips, philosophical, funny)

Order is shuffled each boot. The `alive` ref pattern ensures unmount safety throughout all async loops.

**Phase 2 — ASCII Splash** (pause for explicit click/keypress):
Terminal cleared. Large PHILCHAT block-char logo displayed line by line (10ms/line). Taglines and a random splash quote from a 5-item pool appear below. A pulsing `[ PRESS ANY KEY ]` prompt at bottom centre. `ESC to skip` hint at bottom right.

This is a deliberate pause — the user must choose to enter.

**Phase 3 — Message roll-in** (last 8 messages typed as boot output):
Messages from the live chat feed roll through the terminal as typed output (`[username] body`, 60ms between messages, 15ms char-by-char). Styled identically to the chat view so the transition from boot output to live chat is seamless. Ends with `-- connected to #channel --` / `-- type /help for commands --`.

**Skip logic:**
- Click during Phase 1 → jump to splash
- Click/keypress during Phase 2 → proceed to message roll-in
- Click during Phase 3 → collapse all typing, show all messages instantly
- ESC at any time → dismiss immediately

### CLI Chat View (`TerminalChatView.tsx`)

**Message format:** `[username] message body` per line. No avatars, no reaction strips, no reply UI, no emote pickers.

**Rich rendering** via `parseMessageBody`:
- Emotes → `<img>` 14px inline, `.gif` + `.png` fallback + text fallback
- URLs → `<a>` dim underline
- Images → `<img>` lazy-loaded, max 120px height, below text
- YouTube/Twitter/Video → plain `<a>` bracketed label

**Input:** Single-line `<input>` with `$` prefix (or `$~` when muted). Always focused. Black background, no border.

**Autocomplete:**
- `/` → command matches from COMMAND_DEFS
- `@` → known users from current message set
- `:` (unclosed) → emote names from `/emotes/index.json` (fetched once on mount, cached in ref)
- Tab/Enter selects, ArrowUp/Down navigates, Escape clears input

**Command history:** ArrowUp/Down (when autocomplete not showing) cycles through last 20 sent entries.

**Boot echo strip:** A dim `kind: "boot"` line at the top of the message area: `PSYCHOGRAPH OS v3.1.4 — session active`. Provides visual continuity from the boot screen.

### Command Suite

| Command | Description |
|---|---|
| `/help` | List all commands in terminal output |
| `/me <action>` | Send action message (`* username action`) |
| `/shrug` | Append `¯\_(ツ)_/¯` to next message |
| `/clear` | Clear local display (messages not deleted) |
| `/timestamps` | Toggle `[HH:MM]` prefix on messages |
| `/reply <n>` | Reply to message #n (1-based from visible list) |
| `/unread` | Count messages after last-read timestamp |
| `/room` | Show current room name |
| `/whoami` | Show username and user ID |
| `/users` | List unique users in current view |
| `/nick` | Show current username |
| `/mute` | Toggle typing indicator broadcast (`$~` prompt) |

### Styling

The terminal view is intentionally isolated from the site's design token cascade:
- All colours are hardcoded: `#000` bg, `#e0e0e0` body text, `#888` prompt, `#666` system lines
- Usernames keep their `name_color` from profiles (validated against `/^#[0-9a-fA-F]{3,8}$/`)
- Font: IBM Plex Mono exclusively (no `var(--font-code)` — deliberate)
- No `backdrop-filter`, no transparency, no CSS variables — pure terminal
- The autocomplete dropdown uses `#0d0d0d` bg with `#2a2a2a` border

### Future Considerations

**Standalone terminal client:**
The architecture deliberately separates protocol (chat Worker API) from UI. The terminal mode is a proof of concept that the API is usable without the site's design system. Next steps could include:
- A raw HTTP-accessible websocket endpoint for true external terminal clients (e.g. `wscat`)
- Documented API schema for third-party client builders
- The `api_keys` table (already implemented with SHA-256 hashing) enables authenticated access without OAuth — important for headless clients

**Terminal-native features:**
The terminal mode currently parity-implements the web UI. Features that would be *better* in terminal:
- `/log <n>` — dump last N messages as plain text (exportable)
- `/grep <pattern>` — local search across visible messages
- `/watch <username>` — highlight lines from a specific user
- `/filter <pattern>` — hide lines not matching a pattern
- Named pipe / clipboard integration for copy-as-text
- Keyboard-driven reply: arrow-select message, Enter to reply

**Emote rendering in terminal:**
Currently emotes render as small inline images. A pure ASCII fallback mode (`:kek:` shown as-is, no images) would make the terminal usable in low-bandwidth or text-only contexts. Could be toggled via `/emotes off`.

**Boot sequence as ambient display:**
The Phase 2 splash screen could evolve into a "screensaver" mode — if the terminal is idle for N minutes, clear screen and play a boot sequence or ASCII animation. Inspired by `TerminalTitle`'s idle snippet system.

**Realtime latency display:**
`/ping` command showing Supabase Realtime round-trip latency would be a useful terminal-native feature for debugging connection quality.

**API key platform (already implemented):**
The `api_keys` Supabase table is live (SHA-256 hashed, `sk_` prefix, `revoked_at` soft-delete). CF Worker `verifyAuth` has fallthrough: JWT first, then API key path. Endpoints: `POST /api/keys` (generate), `GET /api/keys` (list own), `DELETE /api/keys/:id` (revoke). This enables external terminal clients to authenticate without browser OAuth.
