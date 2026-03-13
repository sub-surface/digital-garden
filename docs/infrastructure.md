# Infrastructure

## Infrastructure

- [x] OG image generation: satori + @resvg/resvg-js, per-note thumbnail (cover/image/poster), description linting
- [x] OG meta tag injection in `src/worker.ts` — per-route `og:title`, `og:description`, `og:image`, `twitter:card`
- [x] Wiki subdomain gets "Philchat Wiki" branding in OG/title tags
- [x] `public/og/` gitignored — generated fresh at CF build time via `PROCESS_OG=true`
- [x] DNS: Cloudflare nameservers, Worker custom domains for all subdomains
- [x] SPA routing: `wrangler.toml` `[assets]` + `not_found_handling = "single-page-application"`
- [x] Default theme: light mode, blue accent (`#427ab4`)

---

## Performance & Build

### Desktop Performance (Lighthouse score: 37 — critical)

> Measured on desktop. FCP 3.6s, LCP 6.8s, TBT 130ms, CLS 0.353. Total payload 7.2MB. Same root causes as mobile — sourcemaps shipping to clients, no code splitting.

- [x] **Disable production sourcemaps**: `sourcemap: true` in `vite.config.ts` is shipping `.map` files to the browser — 4MB+ of the 7.2MB payload. Set `sourcemap: false` for production.
- [x] **Code splitting**: add `build.rollupOptions.output.manualChunks` to split `d3`, `pixi.js`, `flexsearch`, `chess.js` into separate chunks — prevents all heavy libs loading on initial page paint
- [x] **Create robots.txt**: `public/robots.txt` is missing entirely — Lighthouse logged 25 errors. Add a valid file.
- [x] **Font display swap**: verified — Google Fonts URL has `display=swap`; no local `@font-face` rules exist in SCSS
- [x] **`<main>` landmark**: wrap main content in `<main>` element for accessibility + SEO (currently missing, flagged by both Lighthouse runs)
- [x] **Heading order**: fixed `h1`→`h2`→`h3` sequence — ChessPage `h4`→`h2`, MusicPage `h3`→`h2`, NoteFooter `h3`→`h2`, TableOfContents `h3`→`<span>` (non-semantic label)

### Mobile Performance (Lighthouse score: 12 — critical)

> Measured on mobile. FCP 21.4s, LCP 43.6s, TBT 1,270ms, CLS 0.399. Total payload 7.2MB. Root cause: enormous unminified/unused JS bundle and eager loading of heavy libraries.

- [x] **Enable Vite minification**: `sourcemap: false` + no disabled minify — fixed alongside sourcemap removal
- [x] **Reduce unused JS**: split vendor chunks done — `d3`, `pixi.js`, `flexsearch`, `chess.js` in own chunks
- [x] **BgCanvas: skip on mobile**: early return added — canvas never mounts on `≤800px`
- [x] **Fix CLS (partial)**: added `@font-face` fallbacks with `size-adjust`, `ascent-override`, `descent-override` in `base.scss` for all three fonts; updated `--font-*` tokens to include fallbacks. Image `width`/`height` attributes remain TODO (affects Gallery, sidenotes, link preview, lightbox)
- [x] **Fix render-blocking requests** (est. 300ms savings): `index.html` Google Fonts now use `rel="preload"` + `onload` swap + `<noscript>` fallback
- [x] **Cache lifetimes** (est. 122KB savings): `public/_headers` sets 1-year immutable cache on `/content/Media/*` and `/assets/*`, 7-day cache on `/og/*`

### Bundle & Loading Optimisations (identified via deep audit)

> LocalGraph imports D3 + PixiJS at module level — 570KB loaded on every desktop page even when the graph widget isn't visible. content-index.json (81KB) fetched before first render. chess.js in manualChunks forces a separate request even though ChessPage is already lazy-loaded.

- [x] **chess.js removed from manualChunks**: was creating a separate chunk that loaded independently; now co-bundled with lazy ChessPage
- [x] **LocalGraph: lazy import D3 + PixiJS**: moved to dynamic `import()` in AppShell — 570KB (D3 + PixiJS) no longer in the initial bundle
- [x] **content-index.json deferred**: moved fetch out of `main.tsx` startup into AppShell `useEffect` — no longer blocks initial React render
- [x] **Trim Google Font weights**: removed unused variants — EB Garamond down to 1 variant (was 6), Playfair down to 4 (was 5), IBM Plex Mono down to 2 (was 3); saves ~30-40KB of font data
- [x] **FlexSearch index: defer to first search open**: index now only built on first `isOpen=true` — no CPU cost if user never searches
- [x] **BgCanvas: skip graph.json fetch unless in graph mode**: `graph.json` (18KB) now only fetched when `bgMode === "graph"` — saves a network request on every other background mode
- [x] **`<main>` landmark**: wrap main content area in `<main>` element — missing, flagged by Lighthouse for accessibility + SEO
- [x] **Auto-deploy on merge**: CF Workers auto-builds on push via `wrangler.toml` `[build]` command — no GitHub Actions needed
- [x] **`_template` compiled as MDX chunk**: `dist/assets/_template-c5OcOr94.js` appears in the bundle — `content/Photos/_template.md` is being picked up by `import.meta.glob` and compiled. Add `_template` to the MDX glob exclusion pattern in `vite.config.ts` or rename to avoid the glob.
- [x] **Static/dynamic import conflict (5→2 warnings)**: `BookshelfPage`, `MovieshelfPage`, `MusicPage`, `ChessPage`, `GraphView` converted to lazy imports in `NoteBody` and `GraphOverlay`. 2 remaining warnings are `TagPage`/`FolderPage` (lightweight, statically imported in router — no perf impact).
- [x] **Main bundle 698KB (212KB gzip)**: reduced from 1.13MB/350KB by fixing static/dynamic import conflicts — heavy modules (chess.js, D3, PixiJS) now properly split into lazy chunks.
- [ ] **Chess performance**: investigate Stockfish WASM latency on local builds
- [ ] **Pre-render SSG**: build-time HTML generation for all notes
- [ ] **Image optimisation**: sharp WebP variants + `<picture>` srcsets
- [ ] **Lighthouse CI**: GitHub Actions target 95+ desktop
- [ ] **OG gen: SVG image support**: satori cannot load `.svg` images from Wikipedia/external sources — throws "Unsupported image type: unknown". Affects any note whose `image`/`cover` frontmatter points to an SVG URL. Fix: detect SVG URLs in `og-gen.ts` and skip the image, or rasterise via `sharp` before passing to satori. Currently crashes silently and falls back to text-only OG card. Affected note: any using `https://upload.wikimedia.org/...svg` cover images.
- [ ] **OG gen: external image fetch failures**: `https://covers.openlibrary.org/...` fetch fails in CF build environment (likely blocked). Fix: catch fetch errors per-image and fall back gracefully rather than crashing the OG generator. Both SVG and fetch-failure cases should be handled together.
- [ ] **OG caching not working**: build log shows `132 image(s) to generate (0 cached)` on every build — cache is never hit. OG images are being regenerated from scratch each deploy (~90s added to build time). Investigate cache key / hash logic in `og-gen.ts` and ensure the cache directory persists between CF builds (may need to use CF build output cache or commit generated images).
- [ ] **Prebuild runs twice per CF deploy**: build log shows prebuild running once standalone (for OG gen) and again as part of `npm run build`. Combined with `wrangler deploy` triggering its own `npm run build`, this means prebuild runs 3× total per deploy. Investigate deduplication — consider splitting OG gen into a separate script not called by `prebuild`.
- [ ] **`glob@11` deprecation warning**: `npm warn deprecated glob@11.1.0` on every install. Not a breaking issue but should be tracked — update when a direct or transitive dependency releases a fix.

---

## Security Headers (Best Practices score: 77)

- [x] **CSP (Content Security Policy)**: `addSecurityHeaders()` in `src/worker.ts` — scoped to own origins, Google Fonts, Supabase, Turnstile, external image CDNs; `frame-ancestors 'none'`
- [x] **HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- [x] **COOP**: `Cross-Origin-Opener-Policy: same-origin`
- [x] **XFO / framing**: `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`
- [x] **Additional**: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] **Trusted Types**: evaluate `require-trusted-types-for 'script'` — may conflict with PixiJS/D3 dynamic DOM writes, audit first

---

## Legal & Compliance

- [ ] **GDPR cookie consent**: cookie consent banner for EU users — required since we set a cross-domain session cookie (`domain=.subsurfaces.net`). Minimal UI: bottom bar with "Accept" / "Reject" buttons; reject disables Supabase auth cookie (localStorage fallback only). Store consent in `localStorage`. Only show on first visit.
- [ ] **Privacy policy page**: document what data is stored (Supabase auth, profiles, messages, bookmarks), cookie usage, and contact info. Link from footer of all three shells.
