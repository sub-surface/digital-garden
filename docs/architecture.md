# Architecture

One React 19 + Vite 6 SPA, one Cloudflare Worker, one Supabase project, four hostnames. For
commands and gotchas see [`../CLAUDE.md`](../CLAUDE.md); this file explains how the pieces fit.

## Shells

`useShell()` (`src/hooks/useShell.ts`) returns `"main" | "wiki" | "chat" | "os"` from the hostname,
or from `VITE_WIKI_MODE` / `VITE_CHAT_MODE` / `VITE_OS_MODE` for local dev (never set these in the
Cloudflare build env). `AppShell` runs every hook first, then returns the matching shell; hooks that
must not act off the main site (`usePanelClick`) check `shell !== "main"` themselves.

| Shell | Host | Has | Lacks |
|---|---|---|---|
| AppShell | `subsurfaces.net` | BgCanvas, music, panel stack, graph, QuickControls, search | |
| WikiShell | `wiki.subsurfaces.net` | BgCanvas, MDX, ThemePanel, search, LinkPreview, breadcrumb, auth header, QuickControls | music, panels, graph |
| ChatShell | `chat.subsurfaces.net` | BgCanvas, ThemePanel, chat QuickControls, `ChatPage` for every path | music, panels, graph, search |
| OSShell | `os.subsurfaces.net` | finite POST + logon, windowed desktop, shared terminal, lazy programs | main-site panel navigation |

`WikiShell`/`ChatShell`/`OSShell` are lazy chunks. `AuthProvider` and `MusicProvider` wrap all shells
in `main.tsx`; `CookieConsent` is mounted in all four.

### Layering

Dependencies flow one way: garden, then wiki, then chat. A chat outage must not break the wiki and a
Supabase outage must not break the garden. In practice: auth, bookmarks, chat and the wiki editor
talk to Supabase or the Worker API, the Supabase SDK is isolated in a `vendor-supabase` chunk, page content sits behind an error boundary (reset on route change), content is fetched from static manifests, and a content-index
load failure raises `ContentIndexErrorBanner`. (The garden bundle does contain the Supabase client,
via `AuthProvider` and `useBookmarks`; the rule is graceful degradation, not "zero import". A
Supabase-down drill passed: static routes keep working.) OSShell is a presentation surface outside
the community chain.

## Worker (`src/worker.ts` re-exports `src/worker/index.ts`)

One Worker serves all hostnames: API routes, static assets (`ASSETS` binding, `run_worker_first = true`
so every HTML request passes through it) and per-route meta/OG/pre-render injection. `index.ts` is a
declarative route table (`method`, `pattern`, `auth: "user" | "admin" | none`). The dispatcher owns
the cross-cutting layer, so handlers never reimplement it:

- Auth resolved once per request (JWT or `sk_` API key), cached ~60s per token; `invalidateAuthCache(userId)` after profile writes.
- Error boundary: a throwing handler becomes a logged JSON 500 with a short `requestId`.
- CORS (origin allow-list in `lib.ts`) and security headers (`security.ts`) on every response.
- Write methods rate-limited by the `WRITE_LIMITER` binding (30/min); no-op when the binding is absent.
- Post-response work goes through `ctx.waitUntil`. Upstream failures use `upstreamError(label, res, msg)`.

Modules: `auth`, `wiki` (submit/edit/new via GitHub PRs, locks), `chat`, `chatBot` (persona bots),
`keys`, `admin`, `media` (range-aware music proxy over R2), `widgets` (OS news/weather), `restores`
(OS Recycle Bin flag), `meta` (OG/meta/pre-render injection), `security`, `types`, `lib`. The Worker
is excluded from the SPA tsconfig and checked by `npm run typecheck:worker` (`tsconfig.worker.json`).
Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GITHUB_TOKEN`, `TURNSTILE_SECRET_KEY`,
`KLIPY_API_KEY`; SPA vars `VITE_SUPABASE_*`, `VITE_COOKIE_DOMAIN` (`.subsurfaces.net`, unset locally).
Cross-subdomain sessions use a cookie storage adapter in `src/lib/supabase.ts`.

## Build pipeline

1. `scripts/prebuild.ts` scans `content/` (excluding `private`, `templates`, `.obsidian`, `Misc`, `Daily`; `private: true` notes vanish entirely, `draft: true` stays out of RSS/sitemap) and emits, mostly gitignored: `content-index.json`, `graph.json`, `slug-map.json`, `folders.json`, `albums.json`, `broken-links.json`, `image-dimensions.json`, sitemap, two RSS feeds, `public/content/*.md` raw copies, `public/prerender/*.html`, `public/search-index.json`, and a synced `src/content/` MDX copy (wiped each run, never edit). `public/music.json` and `public/og/` are the committed exceptions.
2. Vite compiles MDX at build time (`@mdx-js/rollup`). Remark: frontmatter, mdx-frontmatter, gfm, math, wikilinks, telescopic, callouts, sidenotes. Rehype: slug, raw, KaTeX, imagePaths.
3. `NoteBody` loads compiled notes with `import.meta.glob`; markdown is never fetched for rendering. `src/lib/markdown.ts` is a separate runtime `unified()` pipeline for LinkPreview, the wiki editor preview and terminal documents.
4. `npm run build` is `tsc --noEmit && vite build`; npm's `prebuild` lifecycle hook supplies the prebuild step, so never run `vite build` directly. `wrangler.toml [build]` runs `npm run build`; pushes to `master` auto-deploy. `npm run check` is the CI gate (`.github/workflows/check.yml`); `lighthouse.yml` audits the static `dist/` with error-level budgets (category scores 0.9, CLS 0.1, LCP 3s, TBT 300ms).

### Pre-rendering, search index, baked graph (shipped 2026-09-12)

- `emit-prerender.ts` renders each published note to an HTML fragment (`public/prerender/<slug>.html`). The Worker injects it into `#root` with an in-isolate LRU cache; `main.tsx` stashes it in `window.__PRERENDER_CACHE__` and `NoteBody` hands off to the compiled MDX without a flash. Delegated handlers (sidenotes, telescopic, panel clicks) work on either DOM.
- `emit-search-index.ts` writes an inverted index consumed lazily by the search overlay and the OS Find window (`useContentSearch`).
- `emit-graph.ts` runs the D3 force relaxation at build time and bakes coordinates into `graph.json`.
- `scripts/test-prerender.ts`, `test-search.ts`, `test-graph.ts` guard all three. Remaining work (benchmark, image optimisation) is in the ROADMAP.

### System pages and layout

`src/config/system-pages-meta.ts` (pure metadata: layout/title/loading/since, safe for Node) and
`src/config/system-pages.ts` (lazy components) must have identical key sets; `scripts/test-layout.ts`
enforces it. Prebuild synthesises `system: true` content-index entries for pages with no companion
note (excluded from the graph and Inbox, included in recent queries and the sitemap).
`classifyLayout()` in `src/lib/layout.ts` is the single article/note/game classifier shared by
`NoteRenderer`, `usePanelClick` and `<Query>`.

## Backgrounds

`BgCanvas` draws one 2D canvas at z-index 0 (skipped at phone width). Modes live in
`src/lib/backgrounds/`, are listed in `BG_MODES`/`BG_META` in the store (murmuration, graph, vectors,
dots, terminal, chamber, schematic, isometric, orrery, plate-scan, dendrite, lorenz, cartography) plus
page-scoped `chess`/`hexo`. Each mode reads `config.backgrounds.<mode>`, which is type-enforced by
`BackgroundsConfig`; ThemePanel's dev tab is driven by `BG_CONTROLS`. DPR is clamped to 1.25 and frames
are paced to a 144 FPS ceiling. PixiJS and `eval`-based code are gone, so the CSP can keep `script-src 'self'`.

## Delivery, security, legal

- **OG cards.** `og-gen.ts` (satori + resvg) and `og-system.ts` render cards; `PROCESS_OG=true npm run prebuild` regenerates them. Cloudflare never sets it, so cards ship only if committed in `public/og/`; names are lowercase via `ogCardName()`; `scripts/test-og.ts` enforces both. `src/worker/meta.ts` injects `og:*`/`twitter:*`/description per route (wiki gets "Philchat Wiki" branding).
- **Headers.** `src/worker/security.ts`: CSP (self, Google Fonts, Supabase https+wss, Turnstile, https images/media, `frame-ancestors 'none'`), HSTS, COOP same-origin, X-Frame-Options DENY, nosniff, strict-origin-when-cross-origin. `public/_headers` sets long immutable caching on `/assets/*`, `/content/Media/*`, `/emotes/*` and 7 days on `/og/*`.
- **Performance work already done:** no production sourcemaps, route-level lazy chunks plus `manualChunks` (react, supabase, mdx), deferred `content-index.json` fetch (in `AppShell`, not `main.tsx`), lazy FlexSearch/D3/Turnstile, font fallbacks with size-adjust, intrinsic image dimensions to remove CLS, `<main>` landmark, preloaded fonts.
- **Legal.** `CookieConsent` (reject falls back to localStorage-only auth) and the `/privacy` route exist on every shell.
- **DNS/routing.** Cloudflare nameservers, Worker custom domains for the five hosts, SPA fallback via `wrangler.toml [assets] not_found_handling = "single-page-application"`. GitHub API calls target `master`.

## Data (Supabase)

Tables: `profiles` (role, username, bio, avatar_url, name_color, ban fields), `rooms`, `messages`
(denormalised username/name_color/avatar_url, `pinned_at`, `edited_at`, soft delete), `reactions`
(PK message, user, emote), `api_keys`, `bookmarks`, `edit_log`, `page_locks`, `chatter_claims`,
optional `os_restores`. Storage bucket `avatars` (public). RLS is on (own-row bookmarks, authenticated
insert/select on `edit_log`, admin-only writes on `page_locks`, authenticated reads on chat tables).
Schema changes are dated SQL files in `docs/migrations/`, applied through the SQL Editor (REST cannot
run DDL). The Worker uses the service key, which must never reach the client.
