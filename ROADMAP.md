# Digital Garden v2 — Roadmap

Custom React/Vite digital garden. Live at `subsurfaces.net`, wiki at `wiki.subsurfaces.net`.

---

## Completed

### Core Platform
- [x] React 19 + Vite 6 + TanStack Router + Zustand + SCSS modules
- [x] MDX build-time compilation via `@mdx-js/rollup` (120 notes)
- [x] Prebuild pipeline: content-index, graph, slug-map, music, folders, photography manifests
- [x] Catch-all routing with system page slugs (graph, chess, photography, bookshelf, movieshelf, music-library)
- [x] CF Workers deployment with custom domains (subsurfaces.net, www, wiki)

### Layout System
- [x] Article layout: 900px body, Tufte-style sidenotes, TOC, WikiInfobox for chatter/philosopher types
- [x] Note layout: exploration mode, panel stacking, link previews
- [x] Layout auto-resolution: frontmatter → type → slug prefix → default
- [x] `NoteRenderer` + `NoteBody` unified content loading

### Shell & Navigation
- [x] AppShell: BgCanvas + workspace + PanelStack + floating overlays
- [x] WikiShell: lean wiki subdomain shell (no BgCanvas, no music, no panels)
- [x] TerminalTitle: boot sequence, idle animations, wiki context support
- [x] CornerMenu: mobile arc menu with wiki variant
- [x] QuickControls: desktop top-right strip (music, search, theme, clock)
- [x] Panel system: capture-phase click interceptor, depth-aware trimming, card animations

### Features
- [x] BgCanvas: graph/vectors/dots/terminal/chess modes
- [x] Music player: persistent audio, FFT visualiser, mobile strip
- [x] Search: FlexSearch + Ctrl+K overlay
- [x] Graph: D3 force sim + PixiJS renderer, local radar + global overlay
- [x] Chess: chess.js + custom board + Stockfish WASM
- [x] Photography: masonry grid + lightbox
- [x] Collections: bookshelf, movieshelf, music library (auto-collected from frontmatter)
- [x] Theme system: dark/light toggle, ROYGBIV accent cycle, palette generation

### Wiki Subdomain
- [x] `wiki.subsurfaces.net` Worker custom domain configured
- [x] `useIsWiki` hook (hostname + VITE_WIKI_MODE detection)
- [x] WikiShell with BgCanvas, QuickControls, breadcrumb, simplified CornerMenu
- [x] Wiki content: index, Philosophers, Concepts, Movements, Chatters sections
- [x] Wiki index routing: `wiki.subsurfaces.net/` correctly resolves to `Wiki/index.md`
- [x] Case-insensitive `contentIndex` lookup via `resolveSlug` — fixes titles/metadata on all wiki pages

### Wiki Submission System
- [x] `src/worker.ts` — CF Worker entry point handles `POST /api/submit` (Turnstile + GitHub PR)
- [x] `WikiSubmitPage.tsx` — 4-step form: basic info → survey (35 questions) → page body editor → review
- [x] Survey dropdowns include "Other…" option with inline free-text input
- [x] Markdown editor with toolbar, word count, MDX syntax guide
- [x] Profile image: upload file or paste URL; committed to `content/Media/Wiki/chatters/` on PR branch
- [x] Draft save/load: `localStorage` auto-restore, download/upload `.json` draft file
- [x] Upload draft on step 1 — jumps straight to review step
- [x] Submissions create PR against `master` branch with `tags: [wiki, chatter]`
- [x] Turnstile + GitHub token configured in CF Worker runtime secrets
- [x] End-to-end submission verified in production

### Infrastructure
- [x] OG image generation: satori + @resvg/resvg-js, per-note thumbnail (cover/image/poster), description linting
- [x] OG meta tag injection in `src/worker.ts` — per-route `og:title`, `og:description`, `og:image`, `twitter:card`
- [x] Wiki subdomain gets "Philchat Wiki" branding in OG/title tags
- [x] `public/og/` gitignored — generated fresh at CF build time via `PROCESS_OG=true`
- [x] DNS: Cloudflare nameservers, Worker custom domains for all subdomains
- [x] SPA routing: `wrangler.toml` `[assets]` + `not_found_handling = "single-page-application"`
- [x] Default theme: light mode, blue accent (`#427ab4`)

---

## In Progress / Next Up

### Wiki Subdomain UX Fixes
- [x] **Submit page 404 in wiki subdomain**: added dedicated `/submit` route in router (before catch-all) rendering `WikiSubmitPage`
- [x] **Tag/folder pages unconstrained width in wiki**: removed `tags`/`folder` from article slug list in `resolveLayout`; also fixed `NoteBody` frontmatter override to not force article layout for tag/folder pages
- [x] **Search overlay links broken in wiki**: `handleSelect` now uses `navigate()` in wiki mode instead of `pushCard` (which requires PanelStack)
- [x] **TerminalTitle home button**: wiki logo now links to `/` (wiki root) instead of `https://subsurfaces.net`
- [x] **Tag/folder links not navigating in wiki**: `usePanelClick` was intercepting all clicks (hooks run before conditional shell return) — added `isWiki` bail-out so wiki lets links navigate normally
- [x] **Cross-domain backlinks broken in wiki**: backlinks to non-wiki slugs now link to `https://subsurfaces.net/{slug}` instead of `/{slug}`, preventing the wiki router from swallowing them

### Styling & UX Fixes
- [x] **TOC hash link fix**: `usePanelClick` intercepts `#hash` clicks — add early return for anchor links so TOC smooth-scrolls in both layouts
- [x] **Tag/Folder page headings**: add `<h1>` to TagPage and FolderPage (currently render lists with no heading)
- [x] **Infobox persistence bug**: WikiInfobox remains visible when navigating from a chatter/philosopher page to a non-infobox page — state not clearing on slug change
- [x] **Search overlay light mode**: styling broken in light theme
- [x] **Link preview simplification**: body content shown on hover (fetched from public/content/), recursive hover with depth cap, OPEN button pushes panel card
- [x] **Triadic colour harmony**: JS hue-rotation generates secondary/tertiary from accent; applied to callouts, blockquotes, growth badges, BgCanvas palette, TOC active state

### Wiki Content & Structure
- [x] **Wiki frontmatter cleanup**: add explicit `type` fields where semantically appropriate (chatters, philosophers); leave slug-based article rule as fallback
- [x] **Wiki tag taxonomy**: standardised tags (`philosopher`, `chatter`, `concept`, `movement`) on all wiki content; section links on index page route to `/tags/{type}`
- [x] **Wiki index redesign**: make it a proper hub page — section links (tag-based), recent additions, community stats
- [x] **Wiki page organisation**: establish standard wiki pages (index, about, guidelines, submit)

### Note Transclusion (Note Embeds)
- [x] **`![[Note]]` inline embed**: renders as styled `<aside class="note-embed">` block — header with label + link, body content, "open note" footer
- [x] **`![[Note#Section]]` heading-scoped embed**: extracts content under the specified heading at build time
- [x] **2-level depth limit**: `embedDepth` option prevents recursion beyond depth 2 (falls back to plain link)
- [x] **Broken embed detection**: warns at build time when `![[Target]]` cannot be resolved

### Content Features
- [x] **Reading time**: calculated at build time in prebuild, stored in content-index, shown in article header
- [x] **Broken link detection**: prebuild pass warns on `[[wikilinks]]` that don't resolve in slug-map; skips media file extensions and code-block/backtick-span false positives
- [x] **`contentPath` in index**: original relative path stored in content-index so runtime fetches use correct casing on CF's case-sensitive Linux filesystem
- [x] **Note aliases**: `aliases: [Name, AltName]` frontmatter → added to slug-map at prebuild, resolves from any alias
- [x] **`/recent` page**: notes sorted by `date` descending, similar to folder page layout
- [x] **Dataview-lite**: `<Query filter="type=book" sort="-date" limit="5" display="list|grid|table" />` MDX component — filters/sorts contentIndex at runtime, registered in MDXProvider; `<Query>` fix: components passed explicitly via props to bypass MDX context lookup issue

### UX Polish
- [x] **Breadcrumbs on articles**: `Folder / Subfolder / Note` derived from slug, shown above title in article layout
- [x] **Export / print styles**: `@media print` CSS — hides shell chrome, full-width content, sidenotes inline
- [x] **Hover previews**: body text fetched from `public/content/` using `contentPath` from index (preserves original filename casing); wikilinks rendered as hoverable `<a>` tags; first image shown as full-width header; HTML SPA-fallback rejection via `content-type` check; recursive hover to depth 4; OPEN button pushes panel card

### Dev Tools
- [x] **Properties editor redesign**: floating glass panel (bottom-right, no overlay, glassmorphism), session-override fields (title, type, tags)
- [x] **Admin consolidation**: DevDashboard already consolidates content index, note browser, store state, actions — using CSS variables throughout for light/dark support

### Typography & Content
- [x] **Tufte sidenotes in article layout**: `remarkSidenotes` plugin converts GFM footnotes (`[^1]`) at remark stage (rehype-level approach failed in MDX); injects `<aside class="sidenote">` after the containing block; floats into right margin at `>1101px`, checkbox toggle on narrow viewports
- [x] **Obsidian callouts**: `>[!type] Title` syntax renders as styled callout divs; fixed single-node collapse (remark-gfm collapses blockquote continuations into one `\n`-joined text node — plugin now splits on first `\n`)
- [x] **External link styling**: `href^="http"` links not pointing to `subsurfaces.net` get muted colour + `↗` superscript arrow; print stylesheet updated to show full URL only for external links
- [x] **WikiInfobox image expand**: clicking avatar opens fullscreen lightbox overlay; click backdrop to close; `cursor: zoom-in` hint
- [x] **`Writing/` slug → article layout**: `resolveLayout` now returns `article` for any `writing/` slug without needing `layout: article` in frontmatter (though frontmatter still wins)
- [x] **`rehypeImagePaths` double-prefix fix**: strips leading `media/` or `Media/` before prepending `/content/Media/` — prevents `media/media/` doubling when images are referenced from sidenotes or raw HTML
- [x] **Sample writing note**: `content/Writing/On-Attention.md` — demos dropcap, pullquote, callouts, sidenotes with wikilink + external link + image, `<Query>` component, `published: true` for RSS
- [x] **Writing template**: `content/Writing/Writing-Template.md` — style reference covering all supported features with inline examples
- [x] **Note embed HTML rendering**: embed body now parsed via `mdast-util-from-markdown` + `hast-util-to-html` — was injecting raw markdown as text
- [x] **EB Garamond dropcap**: loaded via Google Fonts; upright 400, `5.4em`, `clear: right` on pullquote prevents sidenote overlap; `z-index: 1` prevents text overlap
- [x] **`Query` filter key fix**: filter key is `tag=` not `tags=`; fixed in template and On-Attention
- [x] **`Query` date formatting**: raw `Date.toString()` output (e.g. `Sat Mar 07 2026 00:00:00 GMT+0000 (Greenwich Mean Time)`) now formatted to short date (`Sat, 07 Mar 2026`) or with short timezone (`Sat, 07 Mar 2026, 12:00 GMT`) when time is specified

### Performance & Build
- [ ] **Chess performance**: investigate Stockfish WASM latency on local builds
- [ ] **Pre-render SSG**: build-time HTML generation for all notes
- [ ] **Image optimisation**: sharp WebP variants + `<picture>` srcsets
- [ ] **Lighthouse CI**: GitHub Actions target 95+ desktop
- [x] **Auto-deploy on merge**: CF Workers auto-builds on push via `wrangler.toml` `[build]` command — no GitHub Actions needed
- [ ] **OG gen: SVG image support**: satori cannot load `.svg` images from Wikipedia/external sources — throws "Unsupported image type: unknown". Affects any note whose `image`/`cover` frontmatter points to an SVG URL. Fix: detect SVG URLs in `og-gen.ts` and skip the image, or rasterise via `sharp` before passing to satori. Currently crashes silently and falls back to text-only OG card. Affected note: any using `https://upload.wikimedia.org/...svg` cover images.
- [ ] **OG gen: external image fetch failures**: `https://covers.openlibrary.org/...` fetch fails in CF build environment (likely blocked). Fix: catch fetch errors per-image and fall back gracefully rather than crashing the OG generator. Both SVG and fetch-failure cases should be handled together.
- [ ] **OG caching not working**: build log shows `132 image(s) to generate (0 cached)` on every build — cache is never hit. OG images are being regenerated from scratch each deploy (~90s added to build time). Investigate cache key / hash logic in `og-gen.ts` and ensure the cache directory persists between CF builds (may need to use CF build output cache or commit generated images).
- [ ] **Prebuild runs twice per CF deploy**: build log shows prebuild running once standalone (for OG gen) and again as part of `npm run build`. Combined with `wrangler deploy` triggering its own `npm run build`, this means prebuild runs 3× total per deploy. Investigate deduplication — consider splitting OG gen into a separate script not called by `prebuild`.
- [x] **`_template` compiled as MDX chunk**: `dist/assets/_template-c5OcOr94.js` appears in the bundle — `content/Photos/_template.md` is being picked up by `import.meta.glob` and compiled. Add `_template` to the MDX glob exclusion pattern in `vite.config.ts` or rename to avoid the glob.
- [x] **Static/dynamic import conflict (5→2 warnings)**: `BookshelfPage`, `MovieshelfPage`, `MusicPage`, `ChessPage`, `GraphView` converted to lazy imports in `NoteBody` and `GraphOverlay`. 2 remaining warnings are `TagPage`/`FolderPage` (lightweight, statically imported in router — no perf impact).
- [x] **Main bundle 698KB (212KB gzip)**: reduced from 1.13MB/350KB by fixing static/dynamic import conflicts — heavy modules (chess.js, D3, PixiJS) now properly split into lazy chunks.
- [ ] **`glob@11` deprecation warning**: `npm warn deprecated glob@11.1.0` on every install. Not a breaking issue but should be tracked — update when a direct or transitive dependency releases a fix.

### Desktop Performance (Lighthouse score: 37 — critical)
> Measured on desktop. FCP 3.6s, LCP 6.8s, TBT 130ms, CLS 0.353. Total payload 7.2MB. Same root causes as mobile — sourcemaps shipping to clients, no code splitting.

- [x] **Disable production sourcemaps**: `sourcemap: true` in `vite.config.ts` is shipping `.map` files to the browser — 4MB+ of the 7.2MB payload. Set `sourcemap: false` for production.
- [x] **Code splitting**: add `build.rollupOptions.output.manualChunks` to split `d3`, `pixi.js`, `flexsearch`, `chess.js` into separate chunks — prevents all heavy libs loading on initial page paint
- [x] **Create robots.txt**: `public/robots.txt` is missing entirely — Lighthouse logged 25 errors. Add a valid file.
- [x] **Font display swap**: verified — Google Fonts URL has `display=swap`; no local `@font-face` rules exist in SCSS
- [x] **`<main>` landmark**: wrap main content in `<main>` element for accessibility + SEO (currently missing, flagged by both Lighthouse runs)
- [ ] **Heading order**: audit `h1`→`h2`→`h3` sequence — Lighthouse flagged non-sequential headings

### Mobile Performance (Lighthouse score: 12 — critical)
> Measured on mobile. FCP 21.4s, LCP 43.6s, TBT 1,270ms, CLS 0.399. Total payload 7.2MB. Root cause: enormous unminified/unused JS bundle and eager loading of heavy libraries.

- [x] **Enable Vite minification**: `sourcemap: false` + no disabled minify — fixed alongside sourcemap removal
- [x] **Reduce unused JS**: split vendor chunks done — `d3`, `pixi.js`, `flexsearch`, `chess.js` in own chunks
- [x] **BgCanvas: skip on mobile**: early return added — canvas never mounts on `≤800px`
- [ ] **Fix CLS**: web fonts loading without size fallbacks cause layout shift. Add `size-adjust` descriptors to font fallbacks in `base.scss`; ensure all `<img>` have explicit `width`/`height`
- [ ] **Fix render-blocking requests** (est. 300ms savings): Google Fonts stylesheet is render-blocking — use `<link rel="preload">` + `onload` swap trick, or self-host fonts
- [ ] **Cache lifetimes** (est. 122KB savings): set long `Cache-Control` on `/content/Media/` and `/og/` in `wrangler.toml` `[assets]` headers config

### Bundle & Loading Optimisations (identified via deep audit)
> LocalGraph imports D3 + PixiJS at module level — 570KB loaded on every desktop page even when the graph widget isn't visible. content-index.json (81KB) fetched before first render. chess.js in manualChunks forces a separate request even though ChessPage is already lazy-loaded.

- [x] **chess.js removed from manualChunks**: was creating a separate chunk that loaded independently; now co-bundled with lazy ChessPage
- [x] **LocalGraph: lazy import D3 + PixiJS**: moved to dynamic `import()` in AppShell — 570KB (D3 + PixiJS) no longer in the initial bundle
- [x] **content-index.json deferred**: moved fetch out of `main.tsx` startup into AppShell `useEffect` — no longer blocks initial React render
- [x] **Trim Google Font weights**: removed unused variants — EB Garamond down to 1 variant (was 6), Playfair down to 4 (was 5), IBM Plex Mono down to 2 (was 3); saves ~30-40KB of font data
- [x] **FlexSearch index: defer to first search open**: index now only built on first `isOpen=true` — no CPU cost if user never searches
- [x] **BgCanvas: skip graph.json fetch unless in graph mode**: `graph.json` (18KB) now only fetched when `bgMode === "graph"` — saves a network request on every other background mode
- [x] **`<main>` landmark**: wrap main content area in `<main>` element — missing, flagged by Lighthouse for accessibility + SEO

### Content Housekeeping
- [ ] **37 broken wikilinks**: build log reports 37 unresolved `[[wikilinks]]` across 14 notes. Highest priority clusters:
  - `Moltbook` → 10 broken links (private/draft notes not in repo: `[[OpenClaw]]`, `[[Hyperstition]]`, `[[The-Claude-Bliss-Attractor]]`, etc.) — consider either creating stub notes or removing links
  - `Writing/On-Attention` → 5 broken links (`[[Philosophy-of-Mind]]`, `[[Wittgenstein]]`, `[[Wiki/Concepts/index]]`) — create stubs or fix slugs
  - `index` → `[[Music]]`, `[[Tags]]` — slug mismatch; likely should be `music-library` and `tags`
  - `Wiki/Concepts`, `Wiki/Movements` → `[[Sample-Article]]` — placeholder link from wiki template, remove or replace
  - One-offs: `[[Walter-Benjamin]]`, `[[Kodachrome]]`, `[[Lars-von-Trier]]`, `[[Abbas]]`, `[[08-11-25]]`, `[[Thomas-Sauvin]]`, `[[Rabbit-Holes]]`, `[[Narrative-hooks]]`, `[[Literary-orientations]]`, `[[Rosi-Braidotti]]` — create stubs or fix slugs

### Content & SEO
- [x] **Sitemap** in prebuild (sitemap.xml → public/)
- [x] **`image` field in content-index**: extracted from frontmatter (`image`/`cover`/`poster`) for OG and meta use
- [x] **RSS feeds (two, opt-in)**: `public/rss.xml` (Writing/ or `published: true`, non-wiki) + `public/wiki-rss.xml` (wiki/ + `published: true`); both generated in prebuild; `published` extracted into content-index; undated notes excluded; fixed wiki feed link text to say `wiki.subsurfaces.net`. `content/Writing/` folder ready — add notes there or set `published: true` + `date` on any note to include it.
- [x] **robots.txt created**: `public/robots.txt` was missing entirely — created with `Allow: /` + sitemap reference; fixes 25 Lighthouse SEO errors
- [x] **Meta descriptions**: already injected by `src/worker.ts` `injectMetaTags()` using `description` ?? `excerpt` frontmatter fields
- [x] **`description` field in content-index**: already extracted in `prebuild.ts`, present in `NoteMetadata` type, used by worker's `injectMetaTags()` for OG + meta description
- [ ] **Detailed documentation**: comprehensive docs for the codebase (delegate to worker agent)

### Photography Albums
- [x] **Album system**: `content/Photos/*.md` frontmatter-driven albums → `public/albums.json`; `<PhotoAlbums />` MDX component renders album grid → drill-in masonry → lightbox with keyboard nav
- [x] **`_template.md`**: album template in `content/Photos/` for adding new albums without code changes
- [x] **Photography.md restored**: written content now renders normally; `<PhotoAlbums />` appended below prose

### Bug Fixes
- [x] **`class` → `className` in MDX content**: raw HTML in `.md` files compiled as JSX — `class=` attribute causes React warnings. Fixed in: `Chess.md`, `Photography.md`, `Writing/Writing-Template.md`, `Writing/On-Attention.md`, `Wiki/chatters/hughchungus.md`, `thinking in public.md`, `Wiki/Philsurvey Template.md`
- [x] **Telescopic wikilink slugs**: `[[Note Name]]` inside telescopic blocks was generating `href="/Note Name"` (spaces, not hyphens) — now slugified to `href="/note-name"` matching runtime resolver
- [x] **`usePanelClick` stale `tracks` closure**: music link handler closed over empty `tracks` array (before `music.json` loaded) — `tracks` added to `useEffect` deps
- [x] **`music:` link handler matching**: `NoteBody` was calling `playTrack(slug)` but `playTrack` matches by `t.slug` (`"Music/Eden"`) not by name — now matches by `t.title` (case-insensitive), consistent with `usePanelClick`; also opens music player if closed
- [x] **Panel card top padding**: note body in panel cards was overlapping QuickControls — top padding increased to `4rem`
- [x] **`usePanelClick` slug normalisation**: slug extracted from clicked URL now normalises spaces → hyphens before passing to panel/store
- [x] **Graph overlay close on node click**: clicking a node in the GraphOverlay now closes the overlay before opening the panel card

### Security Headers (Best Practices score: 77)
- [x] **CSP (Content Security Policy)**: `addSecurityHeaders()` in `src/worker.ts` — scoped to own origins, Google Fonts, Supabase, Turnstile, external image CDNs; `frame-ancestors 'none'`
- [x] **HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- [x] **COOP**: `Cross-Origin-Opener-Policy: same-origin`
- [x] **XFO / framing**: `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`
- [x] **Additional**: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] **Trusted Types**: evaluate `require-trusted-types-for 'script'` — may conflict with PixiJS/D3 dynamic DOM writes, audit first

---

## Comments System

Opt-in per-note comments. Turnstile-gated, no login required. Pseudonymous (name only). Stored in Cloudflare D1 via the existing Worker. Hierarchical replies, upvote/downvote. Available site-wide (wiki + main), styled to match the active shell.

### D1 Database Setup
- [ ] Create D1 database via Wrangler: `npx wrangler d1 create digital-garden-comments`
- [ ] Add `[[d1_databases]]` binding to `wrangler.toml`: `binding = "DB", database_name = "digital-garden-comments"`
- [ ] Add `DB: D1Database` to `Env` interface in `src/worker.ts`
- [ ] Run schema migration via `wrangler d1 execute`:
  ```sql
  CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    parent_id TEXT,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_comments_slug ON comments(slug);
  ```

### Worker API Endpoints (src/worker.ts)
- [ ] `GET /api/comments?slug=...` — fetch all comments for a slug (ordered by created_at, tree structure assembled client-side)
- [ ] `POST /api/comments` — submit a new comment: validate Turnstile token, validate name + body (non-empty, length limits), insert into D1, return created comment
- [ ] `POST /api/comments/:id/vote` — body `{ dir: 1 | -1 }`: increment upvotes or downvotes on a comment row
- [ ] `DELETE /api/comments/:id` — admin-only delete: requires `Authorization: Bearer <ADMIN_SECRET>` header; add `ADMIN_SECRET` to Worker secrets
- [ ] Add `ADMIN_SECRET` to Worker runtime secrets in CF dashboard

### Frontend — CommentSection Component
- [ ] Create `src/components/ui/CommentSection.tsx`:
  - Fetches comments on mount via `GET /api/comments?slug={slug}`
  - Assembles flat list into tree (parent_id → children) client-side
  - Renders top-level comments first (oldest first, LessWrong style)
  - Each comment shows: author, relative timestamp, body, upvote/downvote buttons, reply button
  - Upvote/downvote calls `POST /api/comments/:id/vote` and updates count optimistically
  - Reply button opens inline reply form below the comment
  - Submit form at the bottom of the comment list (top-level new comment)
- [ ] Create `src/components/ui/CommentSection.module.scss` — styled to CSS variables, works in both dark/light, both shells
- [ ] Submit form fields: Name (text, required), Comment (textarea, required), Turnstile widget, Submit button
- [ ] Inline reply form: same fields, nested visually under parent
- [ ] Loading + error states

### Integration
- [ ] Add `comments?: boolean` to `NoteMetadata` in `src/types/content.ts`
- [ ] Extract `comments` field in `scripts/prebuild.ts` (add to `NoteMeta`, write to content-index)
- [ ] In `NoteRenderer.tsx`: if `meta?.comments` is true, render `<CommentSection slug={slug} />` below `<NoteFooter>`
- [ ] `CommentSection` uses `useIsWiki()` to determine which domain's API to call (both domains share the same Worker, so `/api/comments` works on both)

### Opt-in
- [ ] Add `comments: true` to any note frontmatter to enable the section
- [ ] Suggested initial candidates: `content/Wiki/index.md`, chatter profiles

---

## Future / Low Priority
- [ ] Improve chess UI to match site themes, optimise WASM performance, public leaderboard (Stockfish has built-in support for this)
- [x] Typography: dropcaps (`.dropcap` / `data-dropcap`), pull quotes (`.pullquote` blockquote)
- [ ] GitHub App token for non-expiring wiki submissions
- [ ] Wiki community features (comments, reactions)

---

## Architecture Notes

- `src/content/` is auto-generated — never edit directly
- `src/worker.ts` is the CF Worker entry point — excluded from main tsconfig, compiled by wrangler independently
- `functions/` directory removed — API handled directly in `src/worker.ts`
- SPA routing: `wrangler.toml` `[assets]` + `not_found_handling = "single-page-application"` (not `_redirects`)
- `VITE_WIKI_MODE` must never be `true` in CF Pages build env vars
- Wiki submit route must appear before catch-all in `routeTree.addChildren()`
- `BgCanvas` at z-index 0 — all layout containers must be `background: transparent`
- MDX custom components (`Query`, `WikiSubmitForm`, `BookCard`, etc.) must be passed via `components` prop on `<MDXComponent>` in `NoteBody` as well as registered in `MDXProvider` — context alone is insufficient
- `contentPath` in content-index preserves original filename casing for `public/content/` fetches on CF's Linux filesystem
