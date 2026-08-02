# digital-garden — Agent Reference

Quick-start for AI agents working on this codebase. Read this first, refer to `docs/` for objectives and status tracking.

---

## What This Is

Custom React 19 + Vite 6 SPA. A digital garden (notes, essays, collections) at `subsurfaces.net`, with wiki, chat, and OS subdomains. Four shells, one codebase — see [Four Shells](#four-shells). Deployed as a Cloudflare Worker (not Pages — despite the name).

**Not Quartz, not Next.js, not Astro.** Fully custom.

---

## Commands

```bash
npm run dev          # prebuild + Vite HMR + nodemon watching content/
npm run dev:os       # same stack, forced into the SUBSURFACES 95 shell
npm run build        # prebuild (via npm lifecycle) + tsc --noEmit + vite build → dist/
npm test             # lightweight script checks (slug/layout parity, sidenotes, generators, OG integrity, package scripts)
npm run lint         # ESLint — React Hooks rules only, `--max-warnings 25` ratchet (ROADMAP §28.3)
npm run typecheck:worker  # type-check the Cloudflare Worker entry point
npm run check        # npm test + lint + Worker typecheck + full build (what CI runs, .github/workflows/check.yml)
npm run prebuild     # content index rebuild
PROCESS_OG=true npm run prebuild  # + OG image generation (slow)
```

**Build note:** the `build` script is `tsc --noEmit && vite build` — it does NOT call `prebuild`
explicitly. Prebuild runs only via npm's `prebuild` lifecycle hook (fires before any script named
`build`). CF is safe because `wrangler.toml [build] command = "npm run build"`. Never run
`vite build` directly for a real build — it skips prebuild and ships a stale content index.

Dev dashboard: `/__dev` (dev mode only).

---

## Key Directories

| Path | What | Editable? |
|---|---|---|
| `content/` | Source markdown/MDX (Obsidian vault) | Yes |
| `content/Wiki/` | Wiki section content | Yes |
| `content/Media/` | Images, audio | Yes |
| `src/content/` | **Auto-generated** by prebuild | **NO** |
| `src/components/layout/` | AppShell, WikiShell, TerminalTitle, CornerMenu, ThemePanel, QuickControls, BgCanvas | Yes |
| `src/components/ui/` | Page + feature components, grouped: `chat/ wiki/ reader/ games/ shelves/ graph/ music/ overlays/` + small shared bits flat | Yes |
| `src/components/panel/` | PanelStack, PanelCard, usePanelClick | Yes |
| `src/features/boot/` | The `/boot` TUI — self-contained feature module (page + generators + audio + rng) | Yes |
| `src/components/mdx/` | MDXProvider + registered components | Yes |
| `src/lib/` | Remark/rehype plugins | Yes |
| `src/styles/` | SCSS modules + global styles | Yes |
| `src/store/` | Zustand store (single flat store) | Yes |
| `src/router.tsx` | Hand-written route tree (not file-based) | Yes |
| `src/config/system-pages-meta.ts` | Pure system-page slug → title/layout/date metadata (safe for prebuild) | Yes |
| `src/config/system-pages.ts` | React component registry joined onto system-page metadata | Yes |
| `src/worker.ts` | Cloudflare Worker entry: API routes + asset/meta handling (`tsconfig.worker.json`) | Yes |
| `scripts/` | prebuild.ts, og-gen.ts, test-*.ts, dash.mjs (NOT type-checked by tsconfig) | Yes |
| `public/` | Static assets + generated manifests | Manifests are generated |
| `docs/` | Living docs; `docs/migrations/` (SQL), `docs/devlog/` (session logs), `docs/archive/` (shipped/superseded specs — reference only) | Yes |
| `scratch/` | Gitignored local scratch — one-off scripts, agent output | Yes (never committed) |

---

## How Content Works

1. Markdown/MDX files live in `content/`
2. `scripts/prebuild.ts` scans them → generates manifests in `public/` + syncs MDX copies to `src/content/`
3. Vite compiles MDX to JS at build time via `@mdx-js/rollup`
4. At runtime, `NoteBody` uses `import.meta.glob` to dynamically import compiled MDX
5. **Never fetch markdown at runtime** — it's all build-time compiled

**Excluded folders:** `private`, `templates`, `.obsidian`, `Misc`, `Daily`

**Slug format:** `folder/note-name` (spaces → hyphens, case-insensitive at lookup).

---

## Routing

| Route | Component | Notes |
|---|---|---|
| `/__dev` | DevDashboard | Dev mode only |
| `/graph` | ConstellationPage (lazy) | Full screen graph view |
| `/tags` / `/tags/$tag` | TagPage | |
| `/folder` / `/folder/$` | FolderPage | |
| `/recent` | RecentPage | |
| `/submit` | WikiSubmitPage (lazy) | Wiki submission form |
| `/new` | WikiNewPage (lazy) | Create new wiki article |
| `/admin` | WikiAdminPage (lazy) | Admin dashboard |
| `/profile` / `/user/$` | WikiProfilePage (lazy) | User profiles |
| `/privacy` | PrivacyPage (lazy) | Privacy policy |
| `/edit/$` | WikiEditPage (lazy) | Edit wiki article |
| `/boot` | BootPage (lazy) | Endless procedural TUI boot sequence |
| `$` (catch-all) | NoteRenderer / ChatPage | Renders note content or ChatPage if in ChatShell |

**System page slugs** have pure metadata in `src/config/system-pages-meta.ts` and matching lazy component entries in `src/config/system-pages.ts`: `graph`, `chess`, `hexo`, `sigil`, `bookshelf`, `movieshelf`, `music-library`, `arcade`, plus the smaller games/toys. The key sets must stay identical; `npm test` checks parity.

**Background modes** (`BgCanvas.tsx`): `murmuration` (default), `graph`, `vectors`, `dots`, `terminal`, `chamber`, `schematic`, `isometric`, `orrery`, `plate-scan` — all user-selectable, ordered by `BG_MODES` in the store — plus page-scoped `chess`/`hexo`. Game pages auto-switch their themed bg via the slug map in `BgCanvasInner` (`sigil`/`collider` → `chamber`); `chamber` is also user-selectable, so its auto-switch bypasses `setBgMode` (preserving `lastBgMode`) and reverts only when it was page-triggered (`autoChamberRef`). SIGIL board generation lives in `src/lib/sigil.ts` (pure, tested by `scripts/test-sigil.ts`).

**Every ambient mode is config-driven** via `config.backgrounds.<mode>` (`src/config/site-defaults.ts`) — each `drawX(ctx, state, config)` reads its own block. The `\` **ThemePanel** dev tab is schema-driven: `BG_CONTROLS` in `ThemePanel.tsx` maps each mode → its sliders, and the dev tab contextually edits whatever mode is live. **Adding a mode = draw fn + one `config.backgrounds` block + one `BG_CONTROLS` entry + `BG_MODES`/`BgMode`/`BG_META` in the store.** That checklist is **type-enforced**, not just documented (ROADMAP §28.12): `BackgroundsConfig` in `src/types/backgrounds.ts` is a mapped type over `Exclude<BgMode, "chess" | "hexo">` and `site-defaults.ts` `satisfies` it, so a mode without its config block fails `tsc` by name. `BgCanvas` state/config are fully typed (`BgState`, no `any`). Mode **labels** live once, in `BG_META` beside `BG_MODES` in the store — `BgModeToggle` and `ThemePanel` both read it, so don't reintroduce a label `switch`. Global **`bgOpacity`** (persisted store key, System-tab "Intensity") is folded into `readerTarget`, so every mode honours it for free via the existing `* readerAlpha` sites.

---

## Layout System

`classifyLayout()` in `src/lib/layout.ts` is the single source of truth for article/note/game classification:
1. `frontmatter.layout` explicit override → wins
2. `type` is `book`/`movie`/`chatter`/`philosopher` → article
3. Slug starts with `wiki/` → article
4. Slug starts with `writing/` → article
5. System page slug → layout supplied by `SYSTEM_PAGE_META`
6. Default → note

`NoteRenderer`, `usePanelClick`, and `<Query>` all call this helper. Prebuild passes explicit `layout` through the content index and synthesizes `system: true` entries for registered system pages that have no companion content note.

**Article layout:** 900px body, right margin column (TOC + sidenotes), WikiInfobox for chatter/philosopher. Justified text.

**Note layout:** Exploration mode. Hover previews, panel card stacking.

---

## Four Shells

| Shell | Activates when | Has | Doesn't have |
|---|---|---|---|
| AppShell | `subsurfaces.net` | Everything: BgCanvas, music, panels, graph, QuickControls | — |
| WikiShell | `wiki.subsurfaces.net` or `VITE_WIKI_MODE=true` | MDXProvider, ThemePanel, SearchOverlay, LinkPreview, breadcrumb | Music, panels, graph |
| ChatShell | `chat.subsurfaces.net` or `VITE_CHAT_MODE=true` | BgCanvas, ThemePanel, QuickControls (chat variant), ChatPage | Music, panels, graph, search |
| OSShell | `os.subsurfaces.net` or `VITE_OS_MODE=true` | BootPage (endless procedural TUI) | Everything else |

Detection: `useShell()` hook in `src/hooks/useShell.ts` returns `"main" | "wiki" | "chat" | "os"`. `useIsWiki()` / `useIsChat()` / `useIsOS()` are thin wrappers. AppShell calls all hooks first (React rules), then conditionally returns the other shells.

**`VITE_WIKI_MODE`** / **`VITE_CHAT_MODE`** / **`VITE_OS_MODE`** — for local dev testing. Must NEVER be set in CF build env.

---

## Deployment

- **Platform:** Cloudflare Workers (not Pages, despite project name)
- **Trigger:** Push to `master` → CF auto-build
- **Build output:** `dist/`
- **SPA routing:** `wrangler.toml` `[assets]` block + `public/_redirects` (`/* /index.html 200`)
- **Custom domains:** `subsurfaces.net`, `www.subsurfaces.net`, `wiki.subsurfaces.net`, `chat.subsurfaces.net`, `os.subsurfaces.net` (Worker custom domains)
- **Worker/API:** `src/worker.ts` — one Cloudflare Worker serves API routes, static assets, and per-route OG/meta injection. Excluded from the Vite SPA build and `tsconfig.json`; compiled by Wrangler/CF and type-checked via `tsconfig.worker.json`.

### Worker architecture (src/worker/)

`index.ts` is a declarative dispatcher: each route in the table declares `method`, `pattern`, and `auth` (`"user"` | `"admin"` | none). The dispatcher owns the cross-cutting layer — handlers never reimplement it:

- **Auth:** resolved once per request (`verifyAuth`, cached in-isolate ~60s per bearer token); handlers receive the user via `ctx.auth`. Call `invalidateAuthCache(userId)` after profile mutations.
- **Error boundary:** a thrown handler becomes a logged JSON 500 with a short `requestId` (correlate user reports with `wrangler tail`).
- **CORS + security headers:** applied to every `/api` response by `applyApiHeaders` (origin allowlist in `lib.ts`). Handlers return plain `jsonResponse(...)`.
- **Rate limiting:** write methods are limited per user/IP via the `WRITE_LIMITER` binding (wrangler.toml); absent binding = no-op (dev).
- **Background work:** anything after the response (identity propagation, bookkeeping) MUST go through `ctx.waitUntil(...)` or the runtime may cancel it.
- **Upstream failures:** use `upstreamError(label, res, clientMsg)` — logs status + body snippet, returns a safe error. Never swallow upstream detail (failure must be visible — design law).

Handler signature: `(ctx: RouteCtx) => Promise<Response>` where `RouteCtx = { request, env, url, match, auth, waitUntil }`.

**Chat identity is denormalized:** `messages` carries `username`/`name_color`/`avatar_url`, written at POST time and propagated on profile change (see `docs/migrations/2026-07-chat-denormalize.sql`). Realtime broadcasts are self-describing — clients must not re-fetch message lists to enrich them.

---

## Gotchas (read these)

1. **`src/content/` is wiped on every prebuild.** Never edit files there. It is also **gitignored** (ROADMAP §28.14) — it used to be tracked, which made 167 derived files look like source and invited edits the next prebuild silently destroyed. Same policy for every prebuild-generated manifest in `public/`; the only committed exceptions are `public/music.json` (written by `npm run sync:music`) and `public/og/` (see #20).
2. **`usePanelClick`** intercepts all internal link clicks at capture phase. Hash-only links (`#heading`) are skipped. `isWiki` bail-out added — wiki lets all links navigate normally.
3. **`BgCanvas` is z-index 0.** All containers must be `background: transparent`. Global bg color on `body` only.
4. **`import.meta.glob` is build-time.** New content files need a rebuild. `npm run dev` watches automatically.
5. **`src/worker.ts` is NOT in the Vite SPA build.** Excluded from `tsconfig.json`; compiled by Wrangler/CF. VS Code errors against it are ignorable — type-check it with `npm run typecheck:worker`.
6. **System pages use a paired registry.** Add pure title/layout/date metadata in `src/config/system-pages-meta.ts` and the matching lazy React component in `src/config/system-pages.ts`; `scripts/test-layout.ts` enforces key parity. Add content-driven layout rules only in `src/lib/layout.ts`'s `classifyLayout()`.
7. **Sidenote footnotes — two plugins, two pipelines, never both at once.** `remark-sidenotes.ts` is the one that matters for published notes — wired into `vite.config.ts`'s MDX build. It converts footnote identifiers to sequential Roman numerals for display (the `[^bateson]`-style identifier is just an internal key, never shown to readers), and inserts the checkbox/label/aside triplet as siblings of the nearest *block* ancestor rather than inline — an `<aside>` can't legally nest inside a `<p>`/heading, and letting the HTML parser silently hoist it out breaks the CSS `:checked + label + aside` sibling chain the narrow-viewport toggle depends on. `rehype-sidenotes-runtime.ts` is unrelated to that pipeline — it's only for `markdown.ts`'s standalone runtime `unified()` processor (LinkPreview hover, WikiEditPage live preview, BootPage terminal rendering), which unwraps the first `<p>` inside footnote definitions. Don't wrap sidenote content in block elements there either.
8. **Case sensitivity:** Routes are case-insensitive at runtime. CF is case-sensitive for static assets — keep media filenames consistent. This bit us for real once: `og:image` was built from the *request* casing, so `/Abbas` got a working card and `/abbas` a 404 (ROADMAP §28.16). Any static path derived from a slug must go through a single canonical casing — `ogCardName()` in `src/lib/slug.ts` is the pattern (lowercase, shared by both generators, the Worker, and the guard).
9. **Graph route** exists as both a dedicated route AND a NoteRenderer system page. Dedicated route wins via router specificity.
10. **MDX content files use JSX syntax for inline HTML.** Use `className` not `class`, `htmlFor` not `for`, etc. in any raw HTML inside `.md`/`.mdx` files — they are compiled as JSX by `@mdx-js/rollup`.
11. **`remark-telescopic` wikilinks must be slugified.** The telescopic plugin processes its own wikilink syntax independently of `remark-wikilinks` — any wikilink href must be lowercased with spaces→hyphens manually (no slug-map access at build time).
12. **`music:` links match by `t.title` (case-insensitive), handled in `NoteBody` only.** `NoteBody` resolves `music:TrackName` via `tracks.findIndex(t => t.title.toLowerCase() === ...)`. `usePanelClick` deliberately bails on `music:` (it used to duplicate this). Track slugs are not used for matching.
12b. **Music is SoundCloud-driven, NOT note-driven.** `public/music.json` is the committed source of truth, written by `npm run sync:music` (SoundCloud → R2). `prebuild` does NOT generate it (only seeds `[]` if missing). Audio/covers live in the `subsurfaces-music` R2 bucket. See `docs/music-workflow.md`. Per-track `content/Music/*.md` notes are now optional liner notes only.
13. **`BgCanvas` skips on mobile (`≤800px`).** Implemented via an outer `BgCanvas` shell component that returns `null` and an inner `BgCanvasInner` holding all hooks — required to avoid hooks-after-return violation. The `≤800px` check goes through the shared **`isPhoneViewport()` / `usePhoneViewport()`** (`src/config/breakpoints.ts` `PHONE_BREAKPOINT`) — never hardcode `innerWidth <= 800` or a bare `max-width: 800px` again. `usePhoneViewport()` is the ONLY React phone check (matchMedia + `useSyncExternalStore`, so it re-renders on boundary crossings rather than every resize pixel); AppShell and BootPage each used to hand-roll their own. In SCSS the mirrors are **`$bp-phone` / `$bp-panel-narrow` / `$article-narrow` in `src/styles/_breakpoints.scss`** — not tokens.scss — and `vite.config.ts` auto-injects that partial into **every** `.scss` file, so the variables are already in scope in any `.module.scss` with no import. Two rules: `_breakpoints.scss` must never emit CSS (it is injected ~80 times), and a partial pulled in transitively via `@use` does NOT receive the injection, so it must `@use "./breakpoints" as *;` itself. (ROADMAP §28.4) `breakpoints.ts`'s header holds the container-query-vs-viewport-`@media` ownership rule (ROADMAP §18).
14. **`content-index.json` is fetched in `AppShell` `useEffect`, not `main.tsx`.** Deferred post-render to avoid blocking first paint. Do not move it back to startup.
15. **Slug semantics live in `src/lib/slug.ts` — never reimplement.** `normalizeSlug` / `slugifyPath` / `slugFromPathname` / `buildSlugResolver` are shared by the SPA, the Worker (`src/worker/meta.ts`), and `scripts/prebuild.ts`. Any new slug handling imports from there.
16. **User settings persist via `zustand/persist`** under one localStorage key `garden-settings` (see `PERSISTED_KEYS` in `src/store/index.ts`). Do not add ad-hoc `localStorage.setItem` calls for store state — add the key to `PERSISTED_KEYS` instead. Legacy per-key reads seed initial state for pre-migration users.
17. **Content policy is enforced in prebuild's `scan()`:** `private: true` frontmatter excludes a note entirely (no index entry, no raw copy in `public/content/`); `draft: true` keeps it rendered but out of RSS + sitemap. `public/content/*.md` raw copies are load-bearing (LinkPreview, WikiEditPage, BootPage fetch them) — don't remove.
18. **Stonks was removed (2026-07).** No `stonk_*` tables, endpoints, or UI. If reviving points/economy, start from `docs/archive/specs/2026-03-15-stonks-phase2-design.md` as history, not from dead code.
19. **Client API calls go through `src/lib/api.ts` — do not hand-roll `fetch`.** `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete` set `Authorization: Bearer <token>` and `Content-Type`, and **throw `ApiError` on a non-2xx status OR a 2xx body containing `error`** — matching the `if (!res.ok || data.error)` check ~40 call sites used to write by hand (7 of which forgot it, so failures flowed onward as data). Catch with `apiErrorMessage(e, fallback)` to surface the server's own message. `FormData`/`Blob`/`File` bodies are passed through untouched and get no automatic `Content-Type` — JSON-stringifying a `File` silently yields `"{}"`. Two deliberate raw-`fetch` exceptions, both commented: `/api/chess/gif` (returns a blob) and `WikiEditPage`'s raw-markdown fetch (not JSON, and it sniffs content-type to detect an SPA fallback). (ROADMAP §28.15)
20. **OG cards are COMMITTED artifacts, lowercase, and guarded.** CF never sets `PROCESS_OG`, so a card exists in production if and only if it is in git. `public/og/` was once gitignored *and* force-added past that rule, so every newly generated card was silently dropped. `scripts/test-og.ts` (in `npm test`) now fails if the ignore rule returns or a card on disk is untracked, and warns if a published note has no card. Filenames come from `ogCardName()` — always lowercase. (ROADMAP §28.1 / §28.16)
21. **HTML-escaping and frontmatter-stripping have one home each.** `src/lib/escape.ts` (`escapeHtml` for text, `escapeAttr` for attribute values) replaced four near-identical escapers with three different coverage sets across the remark plugins and the Worker. `src/lib/frontmatter.ts` (`stripFrontmatter`) replaced two copies, one of which used an unanchored regex that stopped at the first `---` *anywhere* — including inside a YAML value, eating the top of the note body. Both modules must stay dependency-free: prebuild, the Worker, and the browser all import them. (ROADMAP §28.7/§28.9)
22. **Math is statically rendered with KaTeX.** Use `$...$` for inline math and `$$...$$` for display math. `remark-math` and `rehype-katex` are wired into both the MDX build and the standalone runtime renderer; the wiki editor lazy-loads the same pair for preview. `src/styles/math.scss` compiles KaTeX's base styles with WOFF2 fonts only and then applies the site's layout rules. KaTeX supports mathematical LaTeX, not arbitrary document commands; malformed or unsupported expressions emit a build message and remain as a visible red error fallback instead of disappearing. Escape a literal currency sign as `\$` when another dollar sign appears later in the same paragraph, so the pair cannot be read as inline math. `scripts/test-math.ts` guards inline, display, accessible MathML, visible errors, and unmatched-currency behavior.

---

## Adding Things

| Task | Where |
|---|---|
| New note | Drop `.md`/`.mdx` in `content/`, add `title` frontmatter, rebuild |
| New system page | Add matching metadata + component entries to `src/config/system-pages-meta.ts` and `src/config/system-pages.ts` |
| New floating UI | `position: fixed` inside AppShell, correct z-index, no transform on parent |
| New frontmatter field | `NoteMeta` in `prebuild.ts` + `NoteMetadata` in `src/types/content.ts` |
| New MDX component | Register in `src/components/mdx/MDXProvider.tsx` |
| New remark/rehype plugin | Add to `vite.config.ts` plugin array in correct order |
| New wiki submit field | Update `WikiSubmitPage.tsx` form + `src/worker/wiki.ts` submit formatter (user text must go through `yamlStr()`) |
| New API endpoint | Handler `(ctx: RouteCtx) => Response` in the right `src/worker/*.ts` module + one row in the route table in `src/worker/index.ts` (declare `auth` there) |
| Calling an API from the client | `apiGet`/`apiPost`/… from `src/lib/api.ts` — never a hand-rolled `fetch` (gotcha #19) |
| New persisted user setting | Add to store + `PERSISTED_KEYS` in `src/store/index.ts` |
| New DB schema change | SQL file in `docs/migrations/`, run via Supabase SQL Editor (REST can't do DDL) |
| New music track | Upload to SoundCloud, run `npm run sync:music`, commit `public/music.json` (see `docs/music-workflow.md`) |

---

## Style Tokens (don't change without understanding the cascade)

```scss
--color-bg: #0a0a0a            // OLED dark
--color-bg-surface: #1a1a1f
--color-text: #e0e0e0
--color-accent-base: #b4424c   // User-configurable, ROYGBIV cycle, localStorage
--font-header: "Playfair Display", serif
--font-body: "IBM Plex Sans", sans-serif
--font-code: "IBM Plex Mono", monospace
--main-width: 750px
--card-width: 512px
```

SCSS files: `tokens.scss` → `base.scss` → `global.scss` (imports all others). No circular imports.

---

## Zustand Store (single flat store)

Key slices: `theme`, `accentBase`, `bgMode`, `panelStack`, `activeGraphSlug`, `activeLayout`, `contentIndex`, `sessionOverrides`, overlay toggles (`isSearchOpen`, `isGraphOpen`, `isThemePanelOpen`, `isMusicOpen`).

---

## MDX Plugin Order (vite.config.ts)

**Remark:** frontmatter → mdx-frontmatter → gfm → math → wikilinks → telescopic → callouts → sidenotes
**Rehype:** slug → raw → KaTeX → imagePaths

Sidenotes runs at the remark stage (`remark-sidenotes.ts`) — rehype-level footnote
sections are never emitted inside MDX, so it builds the sidenote markup itself
from the mdast footnote nodes. See gotcha #7.
