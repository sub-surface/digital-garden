# ROADMAP — digital-garden

Single source of truth for outstanding work, for an agent picking up the repo. Merges the
public wishlist (`content/index.md` "What's on my mind"), the long backlog (`docs/future.md`),
the sequenced/opinionated cut (`docs/archive/iteration-spec.md`), the HeXO research pipeline
(`../hexgo-theory/DIRECTION.md`), and live threads that were only in memory/devlog.

> [!NOTE]
> For historical rationale, root-cause analyses, and implementation records of completed milestones
> (§2 Worker split, §3 UI grouping, §4 a11y, §4b theme audit, §16 ambient modes, §17 hygiene, §19 nav rewrite,
> §21 layout classification, §23 reader mode, §28 desloppification sweep), see **[`docs/archive/shipped-milestones.md`](docs/archive/shipped-milestones.md)**.

**Conventions**
- `[ ]` open · `[~]` partially done · `[x]` done (kept briefly for context, then pruned or archived)
- `★` = high win-to-effort (from iteration-spec)
- **Do not edit anything in `content/` without asking Leon first.** `index.md` is the site
  landing page — only update it to reflect things that have actually shipped, and only with the OK.
- Detail backers: `docs/future.md` (full backlog by domain), `docs/archive/shipped-milestones.md` (completed milestones archive),
  `docs/ssg-pipeline-plan.md` (pre-rendering specification), `../hexgo-theory/{DIRECTION,SPEC}.md` (the theory).

Last reconciled against the working tree: 2026-09-12 (Modular background engine, 144 FPS pacing, PixiJS purge, Form autofill diagnostics, `<EmbedGraph />` consolidation, SSG architecture plan).

---

## 0. Now — sequenced top picks

Recent completions:
- **Browser Autofill Diagnostics & Strict CSP Audit** (§29.21, 2026-09-12): Added `id`, `name`, and `autoComplete` to all interactive form fields. Purged `pixi.js` and dead `GraphView.tsx` to align with strict `script-src 'self'` without `eval`.
- **Modular Background Engine & 144 FPS Pacing** (§26, 2026-09-12): Extracted all canvas draw routines into `src/lib/backgrounds/`. Clamped DPR to 1.25 max, batched compound paths, clamped frame rate to monitor refresh with a 144 FPS ceiling, and added 3 new modes: `dendrite`, `lorenz`, and `cartography`.
- **Unified `<EmbedGraph />`** (2026-09-12): Consolidating `<LocalGraph />` and `<WikiGraph />` into a single customizable MDX embed component with pure BFS neighborhood extraction (`src/lib/graph-filter.ts`).

Active sequenced priorities:
1. **SSG / Note Pre-Rendering Pipeline** (§5, §26, and [`docs/ssg-pipeline-plan.md`](docs/ssg-pipeline-plan.md)) — Build-time HTML pre-rendering, edge injection in Cloudflare Worker, pre-computed FlexSearch index, and D3 coordinate baking.
2. **heXO → arcade cabinet integration + bot polish** (§6, §10) — Touch-pinch zoom, generalize zen mode, asymmetric arena test for fork-aware bot.
3. **Component/hook test coverage** (§22) — Expand Vitest + RTL coverage into `usePanelClick`, `useFocusTrap`, shared hotkeys, and high-risk chat/wiki flows.
4. **Live inline editing for admin** (§20) — Command Palette triggered in-place editor with GitHub Contents API direct commit.
5. **Dedicated music player subdomain** (§25) — `music.subsurfaces.net`, independent origin player with advanced mixer/EQ controls.

---

## 1. Pre-commit hygiene

- [x] **★ `AGENTS.md` vs `CLAUDE.md` drift.** Resolved: `AGENTS.md` is a 3-line pointer to `CLAUDE.md` (single source of truth).
- [x] Document implicit-prebuild build contract inline in Commands block — covered by `CLAUDE.md` and guarded by `test-package-scripts.mjs`.

---

## 2. Worker split — ✅ SHIPPED

- [x] **Done** (2026-06-24): `src/worker.ts` split into thin dispatcher + domain modules in `src/worker/*`.
- Full rationale and directory layout archived in [`docs/archive/shipped-milestones.md#2-worker-split-shipped-2026-06-24`](docs/archive/shipped-milestones.md#2-worker-split-shipped-2026-06-24).

---

## 3. Group `src/components/ui/` — ✅ SHIPPED

- [x] **Done** (2026-07-03): Organized into eight subdirectories (`chat/`, `games/`, `reader/`, `wiki/`, `shelves/`, `graph/`, `music/`, `overlays/`).
- Full layout archived in [`docs/archive/shipped-milestones.md#3-group-srccomponentsui-shipped-2026-07-03`](docs/archive/shipped-milestones.md#3-group-srccomponentsui-shipped-2026-07-03).

---

## 4 & 4b. a11y, Keyboard, and Theme Consistency Audit — ✅ SHIPPED

- [x] **a11y & Keyboard Pass**: Shipped `?` cheat sheet (`KeyboardCheatSheet`), focus traps (`useFocusTrap`), `prefers-reduced-motion` guards across canvas and animations, skip-to-content link, and global `:focus-visible` ring.
- [x] **Theme Consistency Audit**: Dynamically resolved theme colors in canvas views (`ConstellationPage`, `LocalGraph`, `ProgressionsPage`), added `--color-overlay-tint` and eliminated hardcoded `rgba(255,255,255,N)` across all global chrome.
- [ ] **Follow-on**: Per-game module CSS (`ChessPage`, `HexoPage`, etc.) still carries some `rgba(255,255,255,N)` texture/hover literals. Migrate to `color-mix(in srgb, var(--color-overlay-tint) N%, transparent)` opportunistically.
- Full details archived in [`docs/archive/shipped-milestones.md#4--4b-a11y-keyboard-and-theme-consistency-audit-shipped-2026-07-03--2026-07-12`](docs/archive/shipped-milestones.md#4--4b-a11y-keyboard-and-theme-consistency-audit-shipped-2026-07-03--2026-07-12).

---

## 5. Performance & Core Web Vitals

- [x] **★ Lighthouse CI** — `.github/workflows/lighthouse.yml` + `lighthouserc.json`: automated audit on static dist with error-level thresholds (perf/a11y/BP/SEO >= 0.9, CLS <= 0.1, LCP <= 3s, TBT <= 300ms).
- [x] **★ Fix CLS — image dimensions.** Prebuild emits `public/image-dimensions.json` and `rehype-image-paths` stamps intrinsic dimensions on MDX images.
- [x] **★ Pre-render / SSG for notes** — Complete SSG pipeline shipped 2026-09-12. Phase 1 (prebuild HTML fragment emitter `emitPrerender`), Phase 2 (Cloudflare Worker edge injection with V8 LRU cache & client handoff in `NoteBody`), Phase 3a (pre-computed inverted full-text search index `emitSearchIndex` in `scripts/emit-search-index.ts`), and Phase 3b (deterministic D3 force relaxation `emitGraph` in `scripts/emit-graph.ts` baking celestial coordinates into `public/graph.json`). See [`docs/ssg-pipeline-plan.md`](docs/ssg-pipeline-plan.md).
- [ ] Verify `NoteBody` un-lazying didn't fatten entry chunk past intent (`dist/assets/index-*.js`).

---

## 6. ★ Arcade cabinet shell — unify heXO & Chess, unblock new games

- [x] **`<GameCabinet>` wrapper** — Shipped (`src/components/ui/games/GameCabinet.tsx`): title + blurb header, start/again overlay, score+best bar, zen/fullscreen, accent-aware win flourish. Migrated Snake, 2048, Hex Mines, Hex Life.
- [ ] **Generalise heXO zen mode** into cabinet — Esc-to-exit handler, overlay, bottom bar, wide viewBox.
- [ ] heXO polish threads:
  - [x] `setPointerCapture` targeted SVG cell; fixed to `svgRef.current`.
  - [ ] Touch-pinch zoom (wheel only currently). The cabinet should own a touch story.
  - [ ] Annotations (`highlights`/`arrows`) wiped on every move — consider preserving across non-placing pan.
- [ ] **Back-to-arcade button placement** — Revisit placement beside page title vs corner.

### New arcade games queued:
- [ ] **Memory Garden** — Concentration game on note titles / tags / covers / emotes.
- [ ] **Link Ladder** — Word/concept ladder seeded from note titles & tags.
- [ ] **Lights Out / Circuit Shrine** — 5x5 toggle puzzle with theme/accent glow.
- [x] **The Predictor: Mass** — Shipped as standalone worker `omega.subsurfaces.net`.
- [ ] **Add p(doom) (`pdoom.subsurfaces.net`) to the arcade** — Featured/external card in `ArcadePage.tsx`.
- [ ] **Add `bazar.subsurfaces.net` to the arcade** — Procedural Persian-carpet walking simulator card.

---

## 7. Wiki & content polish

- [~] **Broken wikilinks** — Down to 5 (originating in placeholder notes). Monitored via `public/broken-links.json`.
- [ ] Page metadata editing (description, tags) from wiki editor UI.
- [ ] Watchlist — Notify on bookmarked-page edits via Supabase table.
- [ ] Contributor dashboard — Recent activity and stats from `edit_log`.
- [ ] Wiki community features (comments, reactions).
- [ ] **GitHub App token** for non-expiring wiki submissions (until then, preflight token check with friendly error).

---

## 8. Terminal mode finish (~90% there)

- [ ] `/emotes off` — Pure ASCII fallback (no inline images).
- [ ] `/ping` — Supabase Realtime round-trip latency.
- [ ] Screensaver — Idle N min -> replay ASCII animation (reuse TerminalTitle idle snippets).
- [ ] Documented public API schema for third-party terminal clients.
- [ ] WebSocket endpoint for raw `wscat`-style access.

---

## 9. Resilience — make failure visible

- [x] **Error boundaries** around Outlet in all three shells (`AppShell`, `WikiShell`, `ChatShell`), reset on `location.pathname`.
- [x] **Content-index load failure surfaced** via `ContentIndexErrorBanner`.
- [x] **Supabase-down drill passed**: Site degrades gracefully without Supabase; static garden routes remain 100% functional.
- [x] **Unchecked fetch in worker handlers**: Wrapped with `upstreamError` and global dispatcher error boundary.

---

## 10. HeXO — theory, bot, and the page

- [ ] **Port a stronger bot to the garden.** Asymmetric arena test (`make_fork_aware` vs plain ES) in `../hexgo-theory/competition/arena.py` before porting to `src/lib/hexo.ts`.
- [ ] **HeXO leaderboard** (results table, pairs with chess leaderboard).
- [ ] **NP-hardness via 3-SAT** — Formalize threat-atom reduction.
- [ ] **Headline experiment** — Measure description length of strong self-play (`~log N` vs `~N`).
- [ ] **Progressions overwrite-mode research** — Garden-of-Eden states, loopy games, gliders.
- [ ] **Folder rename `hexgo-theory` -> `hexo-theory`** (Leon manual task).

---

## 11. From index.md "What's on my mind" — site features

- [x] **Vinyl-record music player** — Shipped with turntable, grooved spinning disc, radial visualizer, AudioWorklet scratch, Document PiP.
- [ ] **Music player extras**:
  - LPF/HPF filter knobs behind a toggle (BiquadFilter on music graph).
  - Unify queue drag/reordering and stable slugs with OS Media Player.
  - Scratch first-activation latency prewarm/cache.
- [x] **"Random note" button** (`r` hotkey + QuickControls dice icon).
- [ ] **Generative-art section** — Dedicated "create your own & share" surface for toys.
- [ ] **Philosophy <-> computation writing** (Leon content).

---

## 12. Identity

- [x] Stonks (Phase 2) removed entirely 2026-07.
- [ ] Easter-egg reactions with configurable effects (e.g. confetti).
- [ ] Idle game (Identity Phase 3).

---

## 13. OG image gen hardening

- [x] Homepage card meta tag injection (`run_worker_first = true`).
- [x] Local-only thumbnail inlining in `og-gen.ts`.
- [x] Filenames normalized to lowercase (`ogCardName()`) and guarded by `scripts/test-og.ts`.
- [ ] **SVG image support** — Detect SVG URLs in `og-gen.ts` and rasterize via `sharp`.

---

## 14. Infrastructure & misc

- [ ] **Trusted Types** — Evaluate `require-trusted-types-for 'script'`.
- [ ] **`glob@11` deprecation warning** — Track and update upstream.
- [ ] **Detailed codebase documentation** — Comprehensive docs pass.

---

## 15. Dream / sweeping bets

- [x] **Command palette (`Ctrl+P`)** — Shipped (`CommandPalette`).
- [x] **Reading progress bar** on articles (`ReadingProgress`).
- [x] **Game of Life consolidated** (`<GameOfLife>` MDX component).
- [x] **Adjustable measure / type-scale control** in reader mode (`ThemePanel` Reader tab).
- [ ] **Inline backlink mini-map** in article margin.
- [ ] **Named theme presets** ("terminal amber", "blueprint", "newsprint").
- [ ] **Garden seasons / time-of-day ambient theming** — Shift default bg palette and warmth by local clock.

---

## 16. Chamber & SIGIL follow-ons — ✅ SHIPPED

- [x] **Done** (2026-07-03): Shipped `schematic`, `isometric`, `orrery`, `plate-scan` ambient modes, and `Collider` aiming toy.
- [ ] **Oracle toy** (stretch) — Click-to-cast daily plate with asemic gloss.
- Archived in [`docs/archive/shipped-milestones.md#16-chamber--sigil-follow-ons-shipped-2026-07-03`](docs/archive/shipped-milestones.md#16-chamber--sigil-follow-ons-shipped-2026-07-03).

---

## 17. Codebase hygiene sweep (2026-07-12) — ✅ SHIPPED

- [x] **Done**: Dead code deleted, test scripts modernized, docs reconciled, chat API split into `CHAT-API.md`.
- Archived in [`docs/archive/shipped-milestones.md#17-codebase-hygiene-sweep-shipped-2026-07-12`](docs/archive/shipped-milestones.md#17-codebase-hygiene-sweep-shipped-2026-07-12).

---

## 18. Mobile coherence sweep

- [x] **Article grid backlinks fix**: Grid collapses cleanly without stranding footer in right column.
- [x] **Shared breakpoint source of truth**: `$bp-phone: 800px` and `$bp-panel-narrow: 560px` in `_breakpoints.scss`, mirrored in `src/config/breakpoints.ts` with `usePhoneViewport()`.
- [x] **Command Palette touch entry**: Reachable via "Commands" in `CornerMenu`.
- [x] **LinkPreview hover gate**: Disabled on touch via `(hover: hover) and (pointer: fine)`.
- [ ] **Touch-gesture parity on canvas/SVG pages**: Pinch-zoom on heXO, Collider, graph views, SIGIL.
- [ ] **Full visual sweep**: On-device audit across key pages for reflow and touch targets.

---

## 19. `usePanelClick` & SPA routing overhaul — ✅ SHIPPED

- [x] **Done** (2026-07-12): Destination classification via `classifyLayout()`, TanStack Router `navigate()` for articles/games/mobile, eliminating hard reloads and preserving music playback.
- Archived in [`docs/archive/shipped-milestones.md#19-usepanelclick--spa-navigation-rewrite-shipped-2026-07-12`](docs/archive/shipped-milestones.md#19-usepanelclick--spa-navigation-rewrite-shipped-2026-07-12).

---

## 20. Live inline editing for admin (design ready)

- [ ] Command Palette action **"Toggle edit mode"** (admin-only via `ctx.auth.role`).
- [ ] Direct commit via GitHub Contents API `PUT` (skipping PR for admin; instant save, CF rebuild takes ~minutes).
- [ ] UI copy setting expectations ("saved — live in a few minutes").
- [ ] Skip Turnstile captcha for authenticated admin requests.
- [ ] Verify `WRITE_LIMITER` allows comfortable editing rhythm.
- [ ] Reuse `page_locks` table during active inline session.

---

## 21. Query "type" display + system pages in index — ✅ SHIPPED

- [x] **Done** (2026-07-12): Split `src/config/system-pages-meta.ts`, synthesized `system: true` entries in `prebuild.ts`, and rendered layout pills (`game`, `article`, `note`) in `Query.tsx`.
- Archived in [`docs/archive/shipped-milestones.md#21-query-type-display--system-pages-index-integration-shipped-2026-07-12`](docs/archive/shipped-milestones.md#21-query-type-display--system-pages-index-integration-shipped-2026-07-12).

---

## 22. Component & hook test coverage

- [~] Vitest + React Testing Library harness shipped (2026-08-02). Tests singleton auth lifecycle, per-window OS error isolation, Task Manager restoration, Start flyouts.
- [x] Pure unit tests added for background simulations (`scripts/test-backgrounds.ts`) and embed graph filtering (`scripts/test-embed-graph.ts`).
- [ ] Expand component tests into `usePanelClick`, `useFocusTrap`, hotkeys, and high-risk wiki/chat interactions.
- [ ] Shareable `?seed=` URL parameter convention across generative toys (Apparatus, Collider, SIGIL).
- [ ] Visitor marginalia (localStorage highlights and private annotations on essay text).

---

## 23. Reader mode sidenotes & settings consolidation — ✅ SHIPPED

- [x] **Done** (2026-07-12): Preserved article CSS grid in reader mode with `--reader-measure` prose track and floating sidenote margins; consolidated controls into `ThemePanel` Reader tab.
- Archived in [`docs/archive/shipped-milestones.md#23-reader-mode-sidenotes--settings-consolidation-shipped-2026-07-12`](docs/archive/shipped-milestones.md#23-reader-mode-sidenotes--settings-consolidation-shipped-2026-07-12).

---

## 24. Writing health

- [ ] New "Log" or "What's on my mind" page absorbing recent thoughts as dated prose notes.
- [ ] Merge with `a place to start writing` as unified writing hub.
- [ ] Randomized writing prompt widget on hub using Inbox flag counts ("X notes have no frontmatter...").
- [ ] Visible cadence indicator ("N days since last entry").

---

## 25. Dedicated music player subdomain

- [ ] Standalone shell (`music.subsurfaces.net` / `MusicShell`) running independently of main garden tab.
- [ ] Advanced controls: LPF/HPF filter knobs, OS mix editor, crossfader, visualizer modes.
- [ ] Minimal handoff from garden via `?track=&t=` query parameters.

---

## 26. Performance review sweep & Pre-rendering

- [x] **Background engine modularization & optimization** (2026-09-12): Extracted `src/lib/backgrounds/`, clamped DPR to 1.25 max, batched compound paths, clamped frame pacing to 144 FPS max, added `dendrite`, `lorenz`, `cartography`.
- [x] **Purged PixiJS & GraphView** (2026-09-12): Completely eliminated WebGL shader compilation and dynamic code evaluation.
- [ ] **SSG / Note Pre-Rendering Pipeline**: Full architectural spec in [`docs/ssg-pipeline-plan.md`](docs/ssg-pipeline-plan.md). Pre-renders markdown to static HTML fragments at build time, injected at Cloudflare Worker edge for instant first-contentful paint without JS.
- [ ] **Resource-hogging / lingering state sweep**: Audit intervals, event listeners, and audio contexts on unmount.

---

## 27. Dream features

- [ ] **Living garden growth timelapse** — Scrubbable timeline replaying graph growth node-by-node.
- [ ] **HeXO self-play spectator arena** — Live bot-vs-bot matches annotated with real-time tau pressure and threat families.
- [ ] **Semantic "ask the garden" query layer** — Cloudflare Vectorize + Workers AI embeddings over content index.
- [ ] **Public marginalia** — Moderated running commentary layer around essay text.
- [ ] **Physical printable export** — Printable zine/poster generator for curated notes.

---

## 28. Desloppification sweep — ✅ SHIPPED

- [x] **Done** (2026-07-25 / 2026-08-02): All 16 items shipped (OG card test guard, CI check pipeline, ESLint 0 warnings, breakpoint injection, HTML escaper unification, API helper `src/lib/api.ts`, strictly-typed `BackgroundsConfig`, dead code purge).
- [ ] **Follow-on**: 61 `!important` declarations across SCSS stylesheets to audit and unpick.
- Archived in [`docs/archive/shipped-milestones.md#28-desloppification-sweep-shipped-2026-07-25--2026-08-02`](docs/archive/shipped-milestones.md#28-desloppification-sweep-shipped-2026-07-25--2026-08-02).

---

## 29. SUBSURFACES 95 — personal-machine backlog

See `docs/os-95-spec.md` §13 for state boundaries. Remaining:
- [ ] **8. Program-host hardening pass**: Browser-check every `SYSTEM_PAGES` entry at narrow/default/maximized sizes; replace page-level fixed assumptions.
- [ ] **15. Philchat chronicle intake**: Review chatter additions, expand terminal persona phrase banks, cited wiki enrichment.
- [ ] **18. FILAMENT: Celestrium simulation bridge**: Ingest Gaia DR3 stellar streams into comoving dark matter web.
- [x] **19. Wiki reorganisation, Philchat orientation, Wikipedia QoL**: Orientation article, curated index, header search.
- [x] **20. Obsidian-style physics graph**: Interactive D3 force simulation on pure Canvas 2D.
- [x] **21. Browser console hygiene and CSP audit** (2026-09-12):
  - Added `id`, `name`, and contextual `autoComplete` to all form inputs across search overlays, command palette, wiki, arcade, chat, and OS.
  - Purged `pixi.js` and dead `GraphView.tsx`, fully eliminating dynamic code evaluation (`eval()`, `new Function()`) to comply with strict Cloudflare Workers CSP `script-src 'self'`.
