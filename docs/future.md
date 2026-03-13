# Future & Deferred

Items that are explicitly deferred, low priority, or pending design work. Grouped by domain.

---

## Garden

- [ ] Improve chess UI to match site themes, optimise WASM performance, public leaderboard (Stockfish has built-in support for this)
- [ ] **Chess performance**: investigate Stockfish WASM latency on local builds
- [ ] **Pre-render SSG**: build-time HTML generation for all notes
- [ ] **Image optimisation**: sharp WebP variants + `<picture>` srcsets
- [ ] **Lighthouse CI**: GitHub Actions target 95+ desktop
- [ ] **OG gen: SVG image support**: satori cannot load `.svg` images from Wikipedia/external sources — throws "Unsupported image type: unknown". Fix: detect SVG URLs in `og-gen.ts` and skip the image, or rasterise via `sharp` before passing to satori.
- [ ] **OG gen: external image fetch failures**: `https://covers.openlibrary.org/...` fetch fails in CF build environment (likely blocked). Fix: catch fetch errors per-image and fall back gracefully.
- [ ] **OG caching not working**: build log shows `132 image(s) to generate (0 cached)` on every build. Investigate cache key / hash logic in `og-gen.ts` and ensure the cache directory persists between CF builds.
- [ ] **Prebuild runs twice per CF deploy**: build log shows prebuild running once standalone (for OG gen) and again as part of `npm run build`. Investigate deduplication.
- [ ] **`glob@11` deprecation warning**: `npm warn deprecated glob@11.1.0` on every install. Track — update when a direct or transitive dependency releases a fix.
- [ ] **37 broken wikilinks**: build log reports 37 unresolved `[[wikilinks]]` across 14 notes — see [garden.md](garden.md) for the full cluster breakdown.
- [ ] **Detailed documentation**: comprehensive docs for the codebase (delegate to worker agent)
- [ ] Fix CLS fully: image `width`/`height` attributes (affects Gallery, sidenotes, link preview, lightbox)

---

## Wiki

- [ ] Contributor dashboard (recent activity, stats)
- [ ] Watchlist (get notified when bookmarked pages are edited) — needs Supabase `watchlist` table
- [ ] Page metadata editing (description, tags) from wiki editor UI
- [ ] **Bookmarks: move off AppShell** — `AppShell` currently imports Supabase client for bookmarks, violating the "garden has no Supabase dependency" rule. Bookmarks should live entirely on `wiki.subsurfaces.net`; remove Supabase import from `AppShell` and `useBookmarks` hook from the main site
- [ ] **Supabase RLS audit**: `bookmarks`, `edit_log`, `page_locks` tables have no RLS policies. Acceptable for now (trusted editors only). Before public launch: own-row-only for bookmarks; insert-only for edit_log; admin-only lock management.
- [ ] Wiki community features (comments, reactions)
- [ ] **GitHub App token** for non-expiring wiki submissions — until then, add a Worker startup preflight: verify token validity on boot, return clear "wiki submissions temporarily unavailable" error to users rather than a silent 500 if token is expired

---

## Chat / Stonks / Identity

- [ ] **Admin bans — permanent**: on permanent ban: hard-delete all message rows + anonymise profile
- [ ] **Admin Room Management UI**: admin-only "+" button in room sidebar → inline form; admin can archive a room (removes from sidebar, preserves history)
- [ ] **Twitter/X link cards**: render as styled link card (username + tweet text if extractable) — avoid loading Twitter's JS embed script by default; optional "load embed" button
- [ ] **Lazy embeds**: all embeds lazy — nothing loads until the message is in the viewport (`IntersectionObserver`)
- [ ] **Chat restyling**: visual refresh of the chat UI to better match the garden/wiki aesthetic — consider: message density tuning, thread/reply presentation, room header design, mobile responsiveness, dark/light theme parity, sidebar UX (collapsible on mobile, room descriptions), input area refinement (toolbar, formatting hints), and overall typographic consistency across all three shells

### Stonks (Phase 2 — all items)

- [ ] `stonk_ledger` table, `stonk_balance` view, point events, `stonk_config` table
- [ ] Stonk balance + sparkline on profile pages and `MiniProfilePopup`
- [ ] Admin stonk config UI (`GET/PUT /api/admin/stonk-config`)
- [ ] Easter egg reactions with configurable effects (e.g. confetti via `canvas-confetti`)
- [ ] Secondary stonks market (users investing in other users' stonks, prediction-market style) — deliberately deferred; ledger schema supports it without changes

### Identity & Avatar (Phase 3 — remaining items)

- [ ] Wiki Profile Claiming: `chatter_claims` table, `POST /api/chat/claim`, claim UI on profile and chatter pages
- [ ] Avatar displayed in: wiki profile infobox (if claimed), `WikiShell` auth header
- [ ] Idle game (cookie-clicker / Universal Paperclips style) — full design TBD; idle rate scales with stonk level, points calculated from `last_login` delta, capped at 24h accumulation

---

## Infrastructure & Legal

- [ ] **Trusted Types**: evaluate `require-trusted-types-for 'script'` — may conflict with PixiJS/D3 dynamic DOM writes, audit first
- [ ] **GDPR cookie consent**: cookie consent banner for EU users — required since we set a cross-domain session cookie (`domain=.subsurfaces.net`). Minimal UI: bottom bar with "Accept" / "Reject" buttons; reject disables Supabase auth cookie (localStorage fallback only).
- [ ] **Privacy policy page**: document what data is stored (Supabase auth, profiles, messages, bookmarks), cookie usage, and contact info. Link from footer of all three shells.
