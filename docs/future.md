# Future & Deferred

Items that are explicitly deferred, low priority, or pending design work. Grouped by domain. Write to main docs when completed.

> **For the prioritised, sequenced view across all docs, see [`../ROADMAP.md`](../ROADMAP.md).**
> This file remains the full per-domain backlog (detail backer for the roadmap).

---

## Refactoring & Technical Debt (dependency-ordered)

Priority work to improve code quality, performance, and shell isolation. Items are ordered so that earlier items unblock later ones.

### Tier 0: Org review (reviewed 2026-06-09)

- [x] **systemPages registry**: `src/config/system-pages.ts` is now the single source of truth for system-page slug → component + layout, consumed by `NoteRenderer.resolveLayout`/`renderContent`. Adding a system page (e.g. an arcade game) is now one registry line. (2026-06-09)
- [ ] **Split `src/worker.ts`** (1888 lines, ~55 functions) into `worker/{chat,auth,wiki,stonks,admin,meta}.ts` + a thin dispatcher. Highest manageability win; needs a verification deploy to confirm CF handles a multi-file Worker entry. Deliberately deferred 2026-06-09.
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
- [ ] **Arcade: shared game cabinet shell**: small reusable wrapper for game status, new-game/reset, local bests, keyboard/touch hints, and a consistent route/card treatment. Keep game logic isolated in `src/lib/{game}.ts` where possible.
- [ ] **Arcade: Snake**: lightweight grid game with keyboard + swipe controls, local best score, palette-aware board, optional "garden serpent" theme where food becomes note/tag tokens and special fruit briefly opens shortcut routes.
- [ ] **Arcade: Blackjack**: local-only dealer game with clean hand-value logic, soft/hard total helper, tiny table personality, streak/bankroll saved to localStorage, and no gambling/money framing beyond toy chips.
- [ ] **Arcade: Memory Garden**: small concentration game using note titles, tags, book/movie covers, or emotes as pairs. Good fit for the site's archive because it turns discovery into play without backend work.
- [ ] **Arcade: Link Ladder**: word-ladder / concept-ladder puzzle seeded from existing note titles and tags. Player transforms one concept into another through valid linked notes; can be daily-seeded without a server.
- [ ] **Arcade: Lights Out / Circuit Shrine**: 5x5 toggle puzzle with theme/accent-driven glow states. Very light implementation, mobile-friendly, and visually distinct from chess/heXO.
- [ ] **Pre-render SSG**: build-time HTML generation for all notes
- [ ] **Image optimisation**: sharp WebP variants + `<picture>` srcsets
- [ ] **Lighthouse CI**: GitHub Actions target 95+ desktop
- [ ] **OG gen: SVG image support**: satori cannot load `.svg` images — detect SVG URLs in `og-gen.ts` and skip or rasterise via `sharp`
- [ ] **OG gen: external image fetch failures**: `covers.openlibrary.org` fetch fails in CF build. Catch per-image and fall back gracefully.
- [ ] **OG caching not working**: `0 cached` on every build. Investigate cache key logic; CF builds may not persist cache dir.
- [x] **Prebuild runs twice per CF deploy**: fixed by letting npm's `prebuild` lifecycle run once before `build` instead of also invoking `npm run prebuild` inside the build script. (2026-06-09)
- [ ] **`glob@11` deprecation warning**: track — update when fix is released upstream
- [ ] **35 broken wikilinks** (as of 2026-06-09): see [garden.md](garden.md) for cluster breakdown. The remaining warnings are genuine missing-note/editorial-alias work after fixing route mismatches, wiki sample scaffolding links, and section-fragment false positives.
- [ ] **Detailed documentation**: comprehensive docs for the codebase
- [ ] Fix CLS fully: image `width`/`height` attributes (Gallery, sidenotes, link preview, lightbox)

---

## Wiki

- [ ] Contributor dashboard (recent activity, stats)
- [ ] Watchlist (get notified when bookmarked pages are edited) — needs `watchlist` table
- [ ] Page metadata editing (description, tags) from wiki editor UI
- [x] **Supabase RLS audit**: RLS enabled + policies on `bookmarks` (own-row-only), `edit_log` (authenticated insert/select), `page_locks` (admin-only write, authenticated read)
- [ ] Wiki community features (comments, reactions)
- [ ] **GitHub App token** for non-expiring wiki submissions — until then, preflight token validity check with clear user-facing error

---

## Stonks (Phase 2)

- [x] `stonk_ledger` table, `stonk_balance` view, `stonk_config` table with RLS
- [x] Reaction-based point events (kek +5, nahh -3 received / -1 given, configurable per-emote)
- [x] Stonk balance on `MiniProfilePopup` + sparkline on profile pages
- [x] Admin stonk config UI in ChatSettings (`GET/PUT /api/admin/stonk-config`)
- [x] `GET /api/chat/users/:username/stonk-history` — 90-day daily cumulative balance
- [x] React picker with full emote pool (from `/emotes/index.json`)
- [x] Removed stonk triangle button — all points flow through emote reactions
- [ ] Easter egg reactions with configurable effects (e.g. confetti via `canvas-confetti`)
- [ ] Secondary stonks market — deliberately deferred; ledger schema supports it

## Identity & Avatar (Phase 3 — remaining items)

- [x] Wiki Profile Claiming: `chatter_claims` table, `POST /api/chat/claim`, `GET /api/users/:username/claim`, `GET /api/claims/by-slug/:slug`, claim UI on WikiProfilePage
- [x] Avatar displayed in: WikiInfobox fetches claim data and overrides frontmatter image with claimer's avatar_url; WikiProfilePage shows claimed wiki page link and "Claim this page" button
- [ ] Idle game — full design TBD

---

## Infrastructure & Legal

- [ ] **Trusted Types**: evaluate `require-trusted-types-for 'script'` — audit PixiJS/D3 compatibility first
- [x] **GDPR cookie consent**: `CookieConsent` component in all three shells. Accept/Reject stored in `localStorage`. Reject disables cross-domain cookie, reloads for localStorage-only auth.
- [x] **Privacy policy page**: `/privacy` route on all shells. Links from CornerMenu + cookie consent banner. Covers auth, cookies, third parties, data retention, rights.
