# Future & Deferred

Items that are explicitly deferred, low priority, or pending design work. Grouped by domain. Write to main docs when completed.

> **For the prioritised, sequenced view across all docs, see [`../ROADMAP.md`](../ROADMAP.md).**
> This file remains the full per-domain backlog (detail backer for the roadmap).

---

## Refactoring & Technical Debt (dependency-ordered)

Priority work to improve code quality, performance, and shell isolation. Items are ordered so that earlier items unblock later ones.

### Tier 0: Org review (reviewed 2026-06-09)

- [x] **System-page registry**: introduced as one component/layout map in 2026-06-09; split in 2026-07-12 into pure metadata (`system-pages-meta.ts`) plus matching lazy components (`system-pages.ts`) so prebuild, layout classification, and React rendering share the same registered slugs. `scripts/test-layout.ts` enforces key parity.
- [x] **Split `src/worker.ts`** into `worker/{index,lib,meta,auth,wiki,chat,keys,admin,security,types}.ts` + a thin route-table dispatcher — shipped, see ROADMAP §2. (2026-06-24)
- [x] **Group `src/components/ui/`** — done 2026-07-03: `ui/{chat,wiki,games,shelves,reader,graph,music,overlays}/`, remaining flat files are cross-cutting singles.

### Tier 1: Shell Isolation (unblocks everything else)

- [x] **Lazy-load shell components in router**: wrapped in `lazy()` — ChatPage now code-splits into own 30KB chunk
- [x] **Lazy-load WikiShell and ChatShell in AppShell**: garden visitors no longer download Supabase SDK or chat/wiki code
- [x] **Bookmarks: move off AppShell** — investigated: AppShell has no bookmarks imports. `useBookmarks` is only used by `BookmarkButton` (rendered in NoteRenderer for article layouts) and `WikiProfilePage`. No Supabase import in AppShell. With lazy-loading of shells and route pages, bookmarks code only loads when navigating to a note. Item was stale.

### Tier 2: Chat Quality (the real issues)

- [x] **ChatRoom decomposition**: extracted `useChatMessages`, `useChatScroll`, `useChatToast` hooks — ChatRoom now ~160 lines
- [x] **Silent failure → visible failure**: toast system + optimistic rollback on reaction failure + res.ok checks on send/delete
- [x] **CSS monolith split**: Chat.module.scss split into 5 focused modules (Chat, EmotePicker, GifPicker, MiniProfilePopup, ChatSearch)
- [x] **GifPicker wired up**: toggle button in MessageInput with mutual exclusion against EmotePicker

### Tier 3: Polish & UX

- [x] **Chat restyling**: header bar with channel selector, centered layout (70% viewport), minimal input, autocomplete (`:emote`, `@mention`, `/command`), emote preview strip, pin ticker, popups portalled for z-index safety. SideChat unified with ChatRoom (single header via `headerExtra` prop, container queries handle narrow mode).
- [x] **Admin Room Management UI**: admin-only "+" button in channel dropdown → inline form (name + slug); archive button per room; `PATCH /api/chat/rooms/:id`
- [x] **SideChat docked panel**: SideChat docks to right edge, pushes page content left via flex layout. Left border is a draggable resize handle (260–600px, persisted to localStorage). Container queries adapt ChatRoom to narrow widths.
- [x] **Twitter/X link cards**: `twitter` token type in parseMessageBody + styled card with 𝕏 icon, @username, and URL — no Twitter JS embed loaded
- [x] **Lazy embeds**: IntersectionObserver wrapper (`LazyEmbed`) in MessageRow — images and YouTube thumbnails only load when within 200px of viewport; emotes excluded (inline, tiny)
- [x] **Admin bans — permanent**: on permanent ban: hard-delete all messages + reactions, anonymise profile (username → `[deleted]`, avatar/bio/name_color → null)
- [x] **Chat polish pass**: footnote sidenotes (`[^1]` tufte-style), ephemeral emote glow (canvas-sampled dominant colour), message density/scale presets (compact/comfortable/spacious + S/M/L), terminal mode (full CLI overlay with boot screen, command suite, emote autocomplete, command history, rich rendering)
- [x] **API key platform**: SHA-256 hashed keys, `sk_` prefix, CF Worker `verifyAuth` fallthrough, `POST/GET/DELETE /api/keys` endpoints — enables headless/third-party chat clients
- [x] **Terminal polish pass**: boot/chat sequencing fix (mutually exclusive render), static `SPLASH_LOGO` block-char header at top of chat view, reactions in terminal (emote imgs + count badge), reply rendering (`↳` inline preview + reply bar), ANSI-inspired colour classes in boot lines, centred layout matching boot sequence width

### Terminal Mode — Remaining / Future

- [x] `/log <n>` — dump last N messages as plain text (2026-06-09)
- [x] `/grep <pattern>` — local search across visible messages (2026-06-09)
- [x] `/watch <username>` — highlight lines from a specific user (2026-06-09)
- [ ] `/emotes off` — pure ASCII fallback mode (no inline images)
- [ ] `/ping` — display Supabase Realtime round-trip latency
- [ ] Screensaver mode: idle N minutes → replay ASCII animation (inspired by TerminalTitle idle snippets)
- [ ] Documented public API schema for third-party terminal client builders
- [ ] WebSocket endpoint for raw `wscat`-style access

---

## Garden

- [x] **Chess: homemade three-flavour bot** (drunk/casual/sharp) replaces the unreliable CDN-loaded Stockfish; GIF export now proxied through the Worker (`POST /api/chess/gif`); "Analyse on Lichess" button; accent-aware check/mate board flourish; softened framing. (2026-06-09)
- [ ] Chess: public leaderboard (deferred — needs a results table)
- [x] **Arcade: shared game cabinet shell** — shipped as `<GameCabinet>`, see ROADMAP §6. (2026-06-20)
- [x] **Arcade: Snake** — shipped. (2026-06-17)
- [x] **Arcade: Blackjack** — shipped. (2026-06-17)
- [ ] **Arcade: Memory Garden**: small concentration game using note titles, tags, book/movie covers, or emotes as pairs. Good fit for the site's archive because it turns discovery into play without backend work.
- [ ] **Arcade: Link Ladder**: word-ladder / concept-ladder puzzle seeded from existing note titles and tags. Player transforms one concept into another through valid linked notes; can be daily-seeded without a server.
- [ ] **Arcade: Lights Out / Circuit Shrine**: 5x5 toggle puzzle with theme/accent-driven glow states. Very light implementation, mobile-friendly, and visually distinct from chess/heXO.
- [ ] **Pre-render SSG**: build-time HTML generation for all notes
- [ ] **Image optimisation**: sharp WebP variants + `<picture>` srcsets
- [x] **Lighthouse CI**: shipped, warn-level thresholds — see ROADMAP §0/§5. Tightening to error-level is the open follow-on. (2026-07-03)
- [ ] **OG gen: SVG image support**: satori cannot load `.svg` images — detect SVG URLs in `og-gen.ts` and skip or rasterise via `sharp`
- [x] **OG gen: external image fetch failures** — resolved differently than planned: `og-gen.ts` now inlines only local thumbnails as base64 and skips truly-external URLs entirely, so `covers.openlibrary.org` is never fetched at build. (verified 2026-06-24)
- [~] **OG caching** — actually works locally (156/157 cached on a clean run); moot for deploy since CF never runs `PROCESS_OG` (images ship as committed artifacts). Not tracked in git, so each machine starts cold — low priority.
- [x] **Prebuild runs twice per CF deploy**: fixed by letting npm's `prebuild` lifecycle run once before `build` instead of also invoking `npm run prebuild` inside the build script. (2026-06-09)
- [ ] **`glob@11` deprecation warning**: track — update when fix is released upstream
- [~] **Broken wikilinks** — down to 4 as of 2026-06-16 (was 35); see ROADMAP §7. `public/broken-links.json` now tracks the count automatically.
- [ ] **Detailed documentation**: comprehensive docs for the codebase
- [x] **Fix CLS — intrinsic image dimensions**: prebuild emits `public/image-dimensions.json` and `rehype-image-paths` stamps `width`/`height` onto compiled MDX images while preserving responsive CSS. (2026-06-20)

---

## Wiki

- [ ] Contributor dashboard (recent activity, stats)
- [ ] Watchlist (get notified when bookmarked pages are edited) — needs `watchlist` table
- [ ] Page metadata editing (description, tags) from wiki editor UI
- [x] **Supabase RLS audit**: RLS enabled + policies on `bookmarks` (own-row-only), `edit_log`
  (authenticated insert/select), `page_locks` (admin-only write, authenticated read). Confirmed
  active by Leon 2026-07-12 — resolves the contradiction flagged the same day against `wiki.md`'s
  Future section (which wrongly said this was still outstanding; corrected there too).
- [ ] Wiki community features (comments, reactions)
- [ ] **GitHub App token** for non-expiring wiki submissions — until then, preflight token validity check with clear user-facing error

---

## Stonks (Phase 2) — REMOVED 2026-07

Stonks was removed entirely in 2026-07 (never matured past Phase 2) — tables, endpoints, and UI
all deleted; see `docs/migrations/2026-07-chat-denormalize.sql` for the teardown and ROADMAP §12.
The items below are historical record only — **do not rebuild from this list without a fresh
design pass**, and note that `stonk_ledger`/`stonk_balance`/`stonk_config` no longer exist:

- ~~`stonk_ledger` table, `stonk_balance` view, `stonk_config` table with RLS~~ (removed)
- ~~Reaction-based point events~~ (removed)
- ~~Stonk balance on `MiniProfilePopup` + sparkline on profile pages~~ (removed)
- ~~Admin stonk config UI in ChatSettings~~ (removed)
- ~~`GET /api/chat/users/:username/stonk-history`~~ (removed — route no longer exists)
- [ ] Easter-egg reactions with configurable effects (e.g. confetti via `canvas-confetti`) — the
  one idea here that doesn't depend on stonks; still open, see ROADMAP §12.

## Identity & Avatar (Phase 3 — remaining items)

- [x] Wiki Profile Claiming: `chatter_claims` table, `POST /api/chat/claim`, `GET /api/users/:username/claim`, `GET /api/claims/by-slug/:slug`, claim UI on WikiProfilePage
- [x] Avatar displayed in: WikiInfobox fetches claim data and overrides frontmatter image with claimer's avatar_url; WikiProfilePage shows claimed wiki page link and "Claim this page" button
- [ ] Idle game — full design TBD

---

## Infrastructure & Legal

- [ ] **Trusted Types**: evaluate `require-trusted-types-for 'script'` — audit PixiJS/D3 compatibility first
- [x] **GDPR cookie consent**: `CookieConsent` component in all four shells. Accept/Reject stored in `localStorage`. Reject disables cross-domain cookie, reloads for localStorage-only auth.
- [x] **Privacy policy page**: `/privacy` route on all shells. Links from CornerMenu + cookie consent banner. Covers auth, cookies, third parties, data retention, rights.
