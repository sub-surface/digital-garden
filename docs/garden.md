# Garden — subsurfaces.net

## Core Platform

- [x] React 19 + Vite 6 + TanStack Router + Zustand + SCSS modules
- [x] MDX build-time compilation via `@mdx-js/rollup` (120 notes)
- [x] Prebuild pipeline: content-index, graph, slug-map, music, folders, photography manifests
- [x] Catch-all routing with system page slugs (graph, chess, photography, bookshelf, movieshelf, music-library)
- [x] CF Workers deployment with custom domains (subsurfaces.net, www, wiki)

---

## Layout System

- [x] Article layout: 900px body, Tufte-style sidenotes, TOC, WikiInfobox for chatter/philosopher types
- [x] Note layout: exploration mode, panel stacking, link previews
- [x] Layout auto-resolution: frontmatter → type → slug prefix → default
- [x] `NoteRenderer` + `NoteBody` unified content loading

---

## Shell & Navigation

- [x] AppShell: BgCanvas + workspace + PanelStack + floating overlays
- [x] WikiShell: lean wiki subdomain shell (no BgCanvas, no music, no panels)
- [x] TerminalTitle: boot sequence, idle animations, wiki context support
- [x] CornerMenu: mobile arc menu with wiki variant
- [x] QuickControls: desktop top-right strip (music, search, theme, clock)
- [x] Panel system: capture-phase click interceptor, depth-aware trimming, card animations

---

## Features

- [x] BgCanvas: graph/vectors/dots/terminal/chess modes
- [x] Music player: persistent audio, FFT visualiser, mobile strip
- [x] Search: FlexSearch + Ctrl+K overlay
- [x] Graph: D3 force sim + PixiJS renderer, local radar + global overlay
- [x] Chess: chess.js + custom board + Stockfish WASM
- [x] Photography: masonry grid + lightbox
- [x] Collections: bookshelf, movieshelf, music library (auto-collected from frontmatter)
- [x] Theme system: dark/light toggle, ROYGBIV accent cycle, palette generation
- [x] Keyboard shortcuts: `useHotkeys` hook — Ctrl+K opens search, Escape closes overlays
- [x] Telescopic text: `TelescopicHandler.tsx` + `remark-telescopic` plugin — collapsible inline expansions in MDX content
- [x] 404 page: `NotFound.tsx` — custom not-found page for unresolved slugs

---

## Note Transclusion (Note Embeds)

- [x] **`![[Note]]` inline embed**: renders as styled `<aside class="note-embed">` block — header with label + link, body content, "open note" footer
- [x] **`![[Note#Section]]` heading-scoped embed**: extracts content under the specified heading at build time
- [x] **2-level depth limit**: `embedDepth` option prevents recursion beyond depth 2 (falls back to plain link)
- [x] **Broken embed detection**: warns at build time when `![[Target]]` cannot be resolved

---

## Content Features

- [x] **Reading time**: calculated at build time in prebuild, stored in content-index, shown in article header
- [x] **Broken link detection**: prebuild pass warns on `[[wikilinks]]` that don't resolve in slug-map; skips media file extensions and code-block/backtick-span false positives
- [x] **`contentPath` in index**: original relative path stored in content-index so runtime fetches use correct casing on CF's case-sensitive Linux filesystem
- [x] **Note aliases**: `aliases: [Name, AltName]` frontmatter → added to slug-map at prebuild, resolves from any alias
- [x] **`/recent` page**: notes sorted by `date` descending, similar to folder page layout
- [x] **Dataview-lite**: `<Query filter="type=book" sort="-date" limit="5" display="list|grid|table" />` MDX component — filters/sorts contentIndex at runtime, registered in MDXProvider; `<Query>` fix: components passed explicitly via props to bypass MDX context lookup issue

### MDX Pipeline

- [x] **Remark plugins** (AST stage): `remark-wikilinks` (wikilinks + embeds), `remark-telescopic` (collapsible text), `remark-callouts` (callout blocks), `remark-sidenotes` (footnote → sidenote conversion)
- [x] **Rehype plugins** (HTML stage): `rehype-sidenotes` (unwrap `<p>` in footnotes), `rehype-image-paths` (rewrite image paths for CF)
- [x] **MDX components registered in `MDXProvider.tsx`**: `BookCard`, `MovieCard`, `Gallery`, `Query`, `WikiSubmitForm`, `AsciiAvatar`, `PhotoAlbums`, custom `<a>` (internal vs external link styling)
- [x] **Content loading**: `content-loader.ts` resolves MDX imports via `import.meta.glob`; `mdx-loader.ts` handles dynamic component loading

---

## UX Polish

- [x] **Breadcrumbs on articles**: `Folder / Subfolder / Note` derived from slug, shown above title in article layout
- [x] **Export / print styles**: `@media print` CSS — hides shell chrome, full-width content, sidenotes inline
- [x] **Hover previews**: body text fetched from `public/content/` using `contentPath` from index (preserves original filename casing); wikilinks rendered as hoverable `<a>` tags; first image shown as full-width header; HTML SPA-fallback rejection via `content-type` check; recursive hover to depth 4; OPEN button pushes panel card

---

## Dev Tools

- [x] **Properties editor redesign**: floating glass panel (bottom-right, no overlay, glassmorphism), session-override fields (title, type, tags)
- [x] **Admin consolidation**: DevDashboard already consolidates content index, note browser, store state, actions — using CSS variables throughout for light/dark support

---

## Typography & Content

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

---

## Photography Albums

- [x] **Album system**: `content/Photos/*.md` frontmatter-driven albums → `public/albums.json`; `<PhotoAlbums />` MDX component renders album grid → drill-in masonry → lightbox with keyboard nav
- [x] **`_template.md`**: album template in `content/Photos/` for adding new albums without code changes
- [x] **Photography.md restored**: written content now renders normally; `<PhotoAlbums />` appended below prose

---

## Content Housekeeping

- [ ] **37 broken wikilinks**: build log reports 37 unresolved `[[wikilinks]]` across 14 notes. Highest priority clusters:
  - `Moltbook` → 10 broken links (private/draft notes not in repo: `[[OpenClaw]]`, `[[Hyperstition]]`, `[[The-Claude-Bliss-Attractor]]`, etc.) — consider either creating stub notes or removing links
  - `Writing/On-Attention` → 5 broken links (`[[Philosophy-of-Mind]]`, `[[Wittgenstein]]`, `[[Wiki/Concepts/index]]`) — create stubs or fix slugs
  - `index` → `[[Music]]`, `[[Tags]]` — slug mismatch; likely should be `music-library` and `tags`
  - `Wiki/Concepts`, `Wiki/Movements` → `[[Sample-Article]]` — placeholder link from wiki template, remove or replace
  - One-offs: `[[Walter-Benjamin]]`, `[[Kodachrome]]`, `[[Lars-von-Trier]]`, `[[Abbas]]`, `[[08-11-25]]`, `[[Thomas-Sauvin]]`, `[[Rabbit-Holes]]`, `[[Narrative-hooks]]`, `[[Literary-orientations]]`, `[[Rosi-Braidotti]]` — create stubs or fix slugs

---

## Content & SEO

- [x] **Sitemap** in prebuild (sitemap.xml → public/)
- [x] **`image` field in content-index**: extracted from frontmatter (`image`/`cover`/`poster`) for OG and meta use
- [x] **RSS feeds (two, opt-in)**: `public/rss.xml` (Writing/ or `published: true`, non-wiki) + `public/wiki-rss.xml` (wiki/ + `published: true`); both generated in prebuild; `published` extracted into content-index; undated notes excluded; fixed wiki feed link text to say `wiki.subsurfaces.net`. `content/Writing/` folder ready — add notes there or set `published: true` + `date` on any note to include it.
- [x] **robots.txt created**: `public/robots.txt` was missing entirely — created with `Allow: /` + sitemap reference; fixes 25 Lighthouse SEO errors
- [x] **Meta descriptions**: already injected by `src/worker.ts` `injectMetaTags()` using `description` ?? `excerpt` frontmatter fields
- [x] **`description` field in content-index**: already extracted in `prebuild.ts`, present in `NoteMetadata` type, used by worker's `injectMetaTags()` for OG + meta description
- [ ] **Detailed documentation**: comprehensive docs for the codebase (delegate to worker agent)

---

## Bug Fixes

- [x] **`class` → `className` in MDX content**: raw HTML in `.md` files compiled as JSX — `class=` attribute causes React warnings. Fixed in: `Chess.md`, `Photography.md`, `Writing/Writing-Template.md`, `Writing/On-Attention.md`, `Wiki/chatters/hughchungus.md`, `thinking in public.md`, `Wiki/Philsurvey Template.md`
- [x] **Telescopic wikilink slugs**: `[[Note Name]]` inside telescopic blocks was generating `href="/Note Name"` (spaces, not hyphens) — now slugified to `href="/note-name"` matching runtime resolver
- [x] **`usePanelClick` stale `tracks` closure**: music link handler closed over empty `tracks` array (before `music.json` loaded) — `tracks` added to `useEffect` deps
- [x] **`music:` link handler matching**: `NoteBody` was calling `playTrack(slug)` but `playTrack` matches by `t.slug` (`"Music/Eden"`) not by name — now matches by `t.title` (case-insensitive), consistent with `usePanelClick`; also opens music player if closed
- [x] **Panel card top padding**: note body in panel cards was overlapping QuickControls — top padding increased to `4rem`
- [x] **`usePanelClick` slug normalisation**: slug extracted from clicked URL now normalises spaces → hyphens before passing to panel/store
- [x] **Graph overlay close on node click**: clicking a node in the GraphOverlay now closes the overlay before opening the panel card

---

## Styling & UX Fixes

- [x] **TOC hash link fix**: `usePanelClick` intercepts `#hash` clicks — add early return for anchor links so TOC smooth-scrolls in both layouts
- [x] **Tag/Folder page headings**: add `<h1>` to TagPage and FolderPage (currently render lists with no heading)
- [x] **Infobox persistence bug**: WikiInfobox remains visible when navigating from a chatter/philosopher page to a non-infobox page — state not clearing on slug change
- [x] **Search overlay light mode**: styling broken in light theme
- [x] **Link preview simplification**: body content shown on hover (fetched from public/content/), recursive hover with depth cap, OPEN button pushes panel card
- [x] **Triadic colour harmony**: JS hue-rotation generates secondary/tertiary from accent; applied to callouts, blockquotes, growth badges, BgCanvas palette, TOC active state
