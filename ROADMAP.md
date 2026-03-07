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
- [x] WikiShell with breadcrumb, simplified CornerMenu, back-to-garden link
- [x] Wiki content: index, Philosophers, Concepts, Movements sections

### Wiki Submission System (code complete, env config pending)
- [x] `functions/api/submit.ts` — CF Pages Function (Turnstile + GitHub PR)
- [x] `WikiSubmitPage.tsx` — 4-step form: basic info → survey (35 questions) → page body editor → review
- [x] Survey dropdowns include "Other…" option with inline free-text input
- [x] Markdown editor (step 3): toolbar (bold, italic, heading, link, blockquote, code, rule, bullet), word count, expanded placeholder with image/MDX syntax guide and link to markdownguide.org
- [x] Profile image: upload file (JPEG/PNG/GIF/WebP, max 4MB) or paste URL; upload committed to `content/Wiki/chatters/images/` on PR branch; preview thumbnail shown
- [x] `WikiSubmitForm` registered in MDXProvider — embeds in any MDX note via `<WikiSubmitForm />`
- [x] `Wiki/Submit.md` uses `<WikiSubmitForm />` component directly
- [x] `/wiki/submit` route with Turnstile widget
- [ ] Turnstile widget created in CF dashboard + site key set
- [ ] GitHub fine-grained PAT created + set in CF env vars
- [ ] End-to-end submission verified in production

### Infrastructure
- [x] OG image generation: satori + @resvg/resvg-js (opt-in)
- [x] DNS: Cloudflare nameservers, Worker custom domains for all subdomains
- [x] SPA routing: wrangler.toml `[assets]` block + 404.html fallback

---

## In Progress / Next Up

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

### Performance & Build
- [ ] **Chess performance**: investigate Stockfish WASM latency on local builds
- [ ] **Pre-render SSG**: build-time HTML generation for all notes
- [ ] **Image optimisation**: sharp WebP variants + `<picture>` srcsets
- [ ] **Lighthouse CI**: GitHub Actions target 95+ desktop

### Content & SEO
- [x] **RSS feed + sitemap** in prebuild (rss.xml + sitemap.xml → public/)
- [ ] **Detailed documentation**: comprehensive docs for the codebase (delegate to worker agent)

---

## Future / Low Priority
- [ ] Improve chess UI to match site themes, optimise WASM performance, public leaderboard (Stockfish has built-in support for this)
- [x] Typography: dropcaps (`.dropcap` / `data-dropcap`), pull quotes (`.pullquote` blockquote)
- [ ] GitHub App token for non-expiring wiki submissions
- [ ] Wiki community features (comments, reactions)

---

## Architecture Notes

- `src/content/` is auto-generated — never edit directly
- `functions/` is compiled by CF Workers separately — not part of Vite build
- SPA routing: `wrangler.toml` `[assets]` block + `public/404.html` fallback (not `_redirects`)
- `VITE_WIKI_MODE` must never be `true` in CF Pages build env vars
- Wiki submit route must appear before catch-all in `routeTree.addChildren()`
- `BgCanvas` at z-index 0 — all layout containers must be `background: transparent`
- MDX custom components (`Query`, `WikiSubmitForm`, `BookCard`, etc.) must be passed via `components` prop on `<MDXComponent>` in `NoteBody` as well as registered in `MDXProvider` — context alone is insufficient
- `contentPath` in content-index preserves original filename casing for `public/content/` fetches on CF's Linux filesystem
