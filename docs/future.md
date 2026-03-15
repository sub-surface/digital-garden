# Future & Deferred

Items that are explicitly deferred, low priority, or pending design work. Grouped by domain. Write to main docs when completed.

---

## Refactoring & Technical Debt (dependency-ordered)

Priority work to improve code quality, performance, and shell isolation. Items are ordered so that earlier items unblock later ones.

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

- [ ] **Chat restyling**: visual refresh — message density tuning, mobile responsiveness, sidebar UX (collapsible on mobile), input area refinement, typographic consistency across shells
- [ ] **Admin Room Management UI**: admin-only "+" button in room sidebar → inline form; admin can archive a room
- [x] **Twitter/X link cards**: `twitter` token type in parseMessageBody + styled card with 𝕏 icon, @username, and URL — no Twitter JS embed loaded
- [x] **Lazy embeds**: IntersectionObserver wrapper (`LazyEmbed`) in MessageRow — images and YouTube thumbnails only load when within 200px of viewport; emotes excluded (inline, tiny)
- [ ] **Admin bans — permanent**: on permanent ban: hard-delete all message rows + anonymise profile

---

## Garden

- [ ] Improve chess UI to match site themes, optimise WASM performance, public leaderboard
- [ ] **Chess performance**: investigate Stockfish WASM latency on local builds
- [ ] **Pre-render SSG**: build-time HTML generation for all notes
- [ ] **Image optimisation**: sharp WebP variants + `<picture>` srcsets
- [ ] **Lighthouse CI**: GitHub Actions target 95+ desktop
- [ ] **OG gen: SVG image support**: satori cannot load `.svg` images — detect SVG URLs in `og-gen.ts` and skip or rasterise via `sharp`
- [ ] **OG gen: external image fetch failures**: `covers.openlibrary.org` fetch fails in CF build. Catch per-image and fall back gracefully.
- [ ] **OG caching not working**: `0 cached` on every build. Investigate cache key logic; CF builds may not persist cache dir.
- [ ] **Prebuild runs twice per CF deploy**: investigate deduplication
- [ ] **`glob@11` deprecation warning**: track — update when fix is released upstream
- [ ] **37 broken wikilinks**: see [garden.md](garden.md) for cluster breakdown
- [ ] **Detailed documentation**: comprehensive docs for the codebase
- [ ] Fix CLS fully: image `width`/`height` attributes (Gallery, sidenotes, link preview, lightbox)

---

## Wiki

- [ ] Contributor dashboard (recent activity, stats)
- [ ] Watchlist (get notified when bookmarked pages are edited) — needs `watchlist` table
- [ ] Page metadata editing (description, tags) from wiki editor UI
- [ ] **Supabase RLS audit**: `bookmarks`, `edit_log`, `page_locks` have no RLS policies. Before public launch: own-row-only for bookmarks; insert-only for edit_log; admin-only lock management.
- [ ] Wiki community features (comments, reactions)
- [ ] **GitHub App token** for non-expiring wiki submissions — until then, preflight token validity check with clear user-facing error

---

## Stonks (Phase 2 — all items)

- [ ] `stonk_ledger` table, `stonk_balance` view, point events, `stonk_config` table
- [ ] Stonk balance + sparkline on profile pages and `MiniProfilePopup`
- [ ] Admin stonk config UI (`GET/PUT /api/admin/stonk-config`)
- [ ] Easter egg reactions with configurable effects (e.g. confetti via `canvas-confetti`)
- [ ] Secondary stonks market — deliberately deferred; ledger schema supports it

## Identity & Avatar (Phase 3 — remaining items)

- [ ] Wiki Profile Claiming: `chatter_claims` table, `POST /api/chat/claim`, claim UI
- [ ] Avatar displayed in: wiki profile infobox (if claimed), `WikiShell` auth header
- [ ] Idle game — full design TBD

---

## Infrastructure & Legal

- [ ] **Trusted Types**: evaluate `require-trusted-types-for 'script'` — audit PixiJS/D3 compatibility first
- [ ] **GDPR cookie consent**: cookie consent banner — required for cross-domain session cookie. Reject → localStorage fallback only.
- [ ] **Privacy policy page**: document data stored, cookie usage, contact info. Link from all three shells.
