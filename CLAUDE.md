# digital-garden — Agent Reference

Quick-start for AI agents working on this codebase. Read this first, refer to `ROADMAP.md` for objectives.

---

## What This Is

Custom React 19 + Vite 6 SPA. A digital garden (notes, essays, collections) at `subsurfaces.net` with a wiki subdomain at `wiki.subsurfaces.net`. Deployed as a Cloudflare Worker (not Pages — despite the name).

**Not Quartz, not Next.js, not Astro.** Fully custom.

---

## Commands

```bash
npm run dev          # prebuild + Vite HMR + nodemon watching content/
npm run build        # prebuild + tsc --noEmit + vite build → dist/
npm run prebuild     # content index rebuild
PROCESS_OG=true npm run prebuild  # + OG image generation (slow)
```

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
| `src/components/ui/` | All page + feature components | Yes |
| `src/components/panel/` | PanelStack, PanelCard, usePanelClick | Yes |
| `src/components/mdx/` | MDXProvider + registered components | Yes |
| `src/lib/` | Remark/rehype plugins | Yes |
| `src/styles/` | SCSS modules + global styles | Yes |
| `src/store/` | Zustand store (single flat store) | Yes |
| `src/router.tsx` | Hand-written route tree (not file-based) | Yes |
| `functions/` | CF Workers functions (compiled separately by CF, NOT by Vite) | Yes |
| `scripts/` | prebuild.ts, og-gen.ts (NOT type-checked by tsconfig) | Yes |
| `public/` | Static assets + generated manifests | Manifests are generated |

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
| `/graph` | GraphView (lazy) | |
| `/tags` / `/tags/:tag` | TagPage | |
| `/folder` / `/folder/*` | FolderPage | |
| `/wiki/submit` | WikiSubmitPage | Must be before catch-all |
| `$` (catch-all) | NoteRenderer | Handles everything else |

**System page slugs** (in NoteRenderer): `graph`, `chess`, `photography`, `bookshelf`, `movieshelf`, `music-library`.

---

## Layout System

`NoteRenderer.resolveLayout()` determines article vs note:
1. `frontmatter.layout` explicit override → wins
2. `type` is `book`/`movie`/`chatter`/`philosopher` → article
3. Slug starts with `wiki/` → article
4. System page slugs → article
5. Default → note

**Article layout:** 900px body, right margin column (TOC + sidenotes), WikiInfobox for chatter/philosopher. Justified text.

**Note layout:** Exploration mode. Hover previews, panel card stacking.

---

## Two Shells

| Shell | Activates when | Has | Doesn't have |
|---|---|---|---|
| AppShell | `subsurfaces.net` | Everything: BgCanvas, music, panels, graph, QuickControls | — |
| WikiShell | `wiki.subsurfaces.net` or `VITE_WIKI_MODE=true` | MDXProvider, ThemePanel, SearchOverlay, LinkPreview, breadcrumb | BgCanvas, music, panels, graph, QuickControls |

Detection: `useIsWiki()` hook in `src/hooks/useIsWiki.ts`. AppShell calls all hooks first (React rules), then conditionally returns WikiShell.

**`VITE_WIKI_MODE=true`** — for local dev testing of wiki shell. Must NEVER be set in CF build env.

---

## Deployment

- **Platform:** Cloudflare Workers (not Pages, despite project name)
- **Trigger:** Push to `main` → CF auto-build
- **Build output:** `dist/`
- **SPA routing:** `wrangler.toml` `[assets]` block + `public/_redirects` (`/* /index.html 200`)
- **Custom domains:** `subsurfaces.net`, `www.subsurfaces.net`, `wiki.subsurfaces.net` (Worker custom domains)
- **Functions:** `functions/api/submit.ts` — compiled by CF separately, not by Vite

---

## Gotchas (read these)

1. **`src/content/` is wiped on every prebuild.** Never edit files there.
2. **`usePanelClick`** intercepts all internal link clicks at capture phase. Hash-only links (`#heading`) are skipped. `isWiki` bail-out added — wiki lets all links navigate normally.
3. **`BgCanvas` is z-index 0.** All containers must be `background: transparent`. Global bg color on `body` only.
4. **`import.meta.glob` is build-time.** New content files need a rebuild. `npm run dev` watches automatically.
5. **`functions/` is NOT in the Vite build.** Don't add it to `vite.config.ts`. CF compiles it independently.
6. **`resolveLayout` is the source of truth** for article vs note. Add new types there.
7. **Sidenote footnotes:** `rehype-sidenotes` unwraps first `<p>` inside footnotes. Don't wrap sidenote content in block elements.
8. **Case sensitivity:** Routes are case-insensitive at runtime. CF is case-sensitive for static assets — keep media filenames consistent.
9. **Graph route** exists as both a dedicated route AND a NoteRenderer system page. Dedicated route wins via router specificity.
10. **MDX content files use JSX syntax for inline HTML.** Use `className` not `class`, `htmlFor` not `for`, etc. in any raw HTML inside `.md`/`.mdx` files — they are compiled as JSX by `@mdx-js/rollup`.
11. **`remark-telescopic` wikilinks must be slugified.** The telescopic plugin processes its own wikilink syntax independently of `remark-wikilinks` — any wikilink href must be lowercased with spaces→hyphens manually (no slug-map access at build time).
12. **`music:` links match by `t.title` (case-insensitive).** Both `usePanelClick` and `NoteBody` resolve `music:TrackName` by matching `tracks.findIndex(t => t.title.toLowerCase() === ...)`. Track slugs (`Music/Eden`) are not used for this.
13. **`BgCanvas` skips on mobile (`≤800px`).** Implemented via an outer `BgCanvas` shell component that returns `null` and an inner `BgCanvasInner` holding all hooks — required to avoid hooks-after-return violation.
14. **`content-index.json` is fetched in `AppShell` `useEffect`, not `main.tsx`.** Deferred post-render to avoid blocking first paint. Do not move it back to startup.

---

## Adding Things

| Task | Where |
|---|---|
| New note | Drop `.md`/`.mdx` in `content/`, add `title` frontmatter, rebuild |
| New system page | Add to `NoteRenderer.renderContent()` + `resolveLayout()` |
| New floating UI | `position: fixed` inside AppShell, correct z-index, no transform on parent |
| New frontmatter field | `NoteMeta` in `prebuild.ts` + `NoteMetadata` in `src/types/content.ts` |
| New MDX component | Register in `src/components/mdx/MDXProvider.tsx` |
| New remark/rehype plugin | Add to `vite.config.ts` plugin array in correct order |
| New wiki submit field | Update `WikiSubmitPage.tsx` form + `functions/api/submit.ts` formatter |

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

**Remark:** frontmatter → mdx-frontmatter → gfm → wikilinks → telescopic → callouts
**Rehype:** slug → raw → imagePaths → sidenotes
