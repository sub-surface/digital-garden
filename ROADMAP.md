# ROADMAP — digital-garden

Single source of truth for outstanding work, for an agent picking up the repo. Merges the
public wishlist (`content/index.md` "What's on my mind"), the long backlog (`docs/future.md`),
the sequenced/opinionated cut (`docs/archive/iteration-spec.md`), the HeXO research pipeline
(`../hexgo-theory/DIRECTION.md`), and live threads that were only in memory/devlog.

**Conventions**
- `[ ]` open · `[~]` partially done · `[x]` done (kept briefly for context, then pruned)
- `★` = high win-to-effort (from iteration-spec)
- **Do not edit anything in `content/` without asking Leon first.** `index.md` is the site
  landing page — only update it to reflect things that have actually shipped, and only with the OK.
- Detail backers: `docs/future.md` (full backlog by domain), `docs/archive/iteration-spec.md` (rationale
  + proposed shapes), `../hexgo-theory/{DIRECTION,SPEC}.md` (the theory).

Last reconciled against the working tree: 2026-07-03 (post worker-refactor / chamber / SIGIL /
Collider / four ambient modes / repo reorg).

---

## 0. Now — sequenced top picks

Big structural items from the original cut have since shipped (verified 2026-06-20):
**Worker split** (§2 — `src/worker/*` modules), **`ui/` grouping** (§3 — chat/wiki/games/
shelves/reader/graph subdirs), **CLS image dimensions** (§5 — `rehype-image-paths` stamps
intrinsic w/h from `public/image-dimensions.json`), the **command palette + `?` cheat sheet**
(§4/§15 — `CommandPalette` + `KeyboardCheatSheet`), **reading-progress bar** (§15 —
`ReadingProgress` in `ArticleLayout`), and **error boundaries around all three shells** (§9 —
`ErrorBoundary` with chunk-load detection; verified 2026-06-24). Remaining recommended order:

1. **Lighthouse CI** (§5) — scoreboard *before* perf work. No `.github/workflows` for it yet.
2. **a11y / keyboard pass** (§4) — finish the focus-trap + reduced-motion tails.
3. **Arcade cabinet shell** (§6) — before any new game.
4. Everything else opportunistically.

---

## 1. Pre-commit hygiene

Most of the original list resolved itself: `.gitattributes` exists (LF normalise + binary
rules), `daily-report.md` is now gitignored, the orphaned pasted image and `.codex/` are gone,
tree is clean. Remaining:

- [x] **★ `AGENTS.md` vs `CLAUDE.md` drift.** Resolved: `AGENTS.md` is now a 3-line pointer to
  `CLAUDE.md` (single source of truth), so there is nothing left to drift. (verified 2026-06-15)
- [x] Document the implicit-prebuild build contract inline in the Commands block — `CLAUDE.md`'s
  "Build note" already covers it (prebuild fires via npm's `prebuild` lifecycle hook; a rename
  ships a stale index; `test-package-scripts.mjs` guards the string). Sufficient; closed.

---

## 2. ★ Worker split (highest manageability win) — ✅ SHIPPED

- [x] **Done** (verified 2026-06-24): `src/worker.ts` is now a one-line re-export
  (`export { default } from "./worker/index"`) and the logic lives in `src/worker/*`
  (`index, lib, meta, auth, wiki, chat, stonks, keys, admin, security, types`) — matching
  the proposed shape below. Route ordering preserved; `npm run typecheck:worker` covers it.
  Section kept for the design rationale.

`src/worker.ts` was ~1900 lines / ~50 handlers in one file. Flagged in `future.md` Tier 0,
deferred pending "a verification deploy to confirm CF handles a multi-file Worker entry."

**Decision: did it, de-risked with one deploy.** CF bundles via esbuild; multi-file
entries are routine. Shape — thin dispatcher + domain modules, all pure
`(request, env, url)` functions:

```
src/worker/
  index.ts     # fetch() entry: route table → delegates, then ASSETS + meta injection
  lib.ts       # jsonResponse, corsHeaders, supabaseRest, ghApi, verifyAuth, buildAuthUser
  meta.ts      # getContentIndex, injectMetaTags, slugFromPathname, esc*  (SSR meta tags)
  auth.ts      # handleAuthMe, handleUpdateProfile, handleAvatarUpload, handleRegister
  wiki.ts      # handleSubmit, handleEdit, createEditPR, handleNew, handleLockStatus, handleUserProfile
  chat.ts      # handleChat{Rooms,Messages,Reactions,Search,Pins,Pin,Ban,Claim,UserMini}
  stonks.ts    # getStonkConfig, writeStonkLedger, processStonkReaction, handleStonkHistory
  keys.ts      # handleApiKeys, hashApiKey
  admin.ts     # handleAdmin
  security.ts  # addSecurityHeaders
```

- Keep **route ordering identical** — `/api/keys` must stay before `/api/admin/` (api-keys aliasing).
- The dispatcher is the one risk surface; everything else is cut-and-paste with imports.
- After the split, `npm run typecheck:worker` is the safety net.
- **Bonus:** a `routes.ts` array of `{ method, pattern, handler }` replaces the deep `if` ladder
  and makes ordering explicit instead of implicit-by-position.

---

## 3. ★ Group `src/components/ui/` — ✅ SHIPPED

- [x] **Done** (finished 2026-07-03): eight subdirs — `chat/ games/ reader/ wiki/ shelves/
  graph/ music/ overlays/`. `music/` holds MusicBar/MobileMusicBar/MusicPlayer/MusicContext/
  usePopoutPlayer; `overlays/` holds SearchOverlay/CommandPalette/KeyboardCheatSheet;
  PersianCarpetPage moved into `games/`. The ~12 files still flat are genuinely cross-cutting
  singles (ErrorBoundary, NotFound, buttons, banners) — flat is correct for them.
  `useIsWiki.ts` back-compat shim also removed (import `useIsWiki` from `hooks/useShell`).

Real navigation tax. Churns import paths once; pays back forever. Target layout:

```
ui/
  chat/      ChatRoom, MessageRow, MessageInput, ChatSettings, TerminalChatView,
             TerminalBootScreen, SideChat, MiniProfilePopup, GifPicker, EmotePicker, ChatAutocomplete…
  wiki/      WikiSubmitPage, WikiEditPage, WikiNewPage, WikiAdminPage, WikiProfilePage, WikiAuthModal, WikiInfobox…
  games/     ChessPage, HexoPage + the shipped arcade pages (Snake, Tetris, 2048, Blackjack,
             HexMines, Boids, Sand, AntFarm, HexLife, Progressions, ArcadePage)
  shelves/   BookshelfPage, MovieshelfPage, MusicPage, PhotographyPage
  reader/    NoteRenderer, NoteBody, NoteFooter, ArticleLayout, NoteLayout, LinkPreview, TagPage, FolderPage…
  graph/     ConstellationPage, LocalGraph, GraphOverlay
```

---

## 4. ★ a11y & keyboard pass — the craft layer

Current story (`useHotkeys`): `\` theme, `b` background, `m` music, `r` random note,
`Ctrl/Cmd+P` command palette, `?` (Shift+/) cheat sheet. Bindings declared canonically in
`src/config/hotkeys.ts` and rendered by the cheat sheet.

- [x] **`?` opens a keyboard-shortcut cheat sheet** overlay — shipped (`KeyboardCheatSheet`,
  bound in `useHotkeys`, sourced from `src/config/hotkeys.ts`). (verified 2026-06-24)
- [x] **Audit focus management** on every overlay — `useFocusTrap` now wraps SearchOverlay,
  WikiAuthModal, ThemePanel, GameCabinet zen mode, and EmotePicker (which owns the GIF tab);
  CommandPalette + KeyboardCheatSheet had capture/restore/Esc already. The hook keeps `onEscape`/
  `initialFocus` in refs so inline closures don't tear the trap down every parent re-render
  (that bug silently bounced initial focus back out). (2026-07-03)
- [~] **`aria-label`s on icon-only buttons** — done for the truly icon-only set (MusicBar
  prev/play/next/expand SVGs, SearchButton, RandomNote/Bookmark SVGs marked `aria-hidden`).
  QuickControls/CornerMenu/heXO close already had them. MusicPlayer + MobileMusicBar transport
  buttons labelled 2026-07-03; MessageInput picker/cancel already labelled. Remaining tail: per-game
  zoom buttons (grep `<button` next to `<svg` without `aria-label` — currently clean). (2026-07-03)
- [x] **`prefers-reduced-motion`** — BgCanvas now paints one static frame and runs no loop under
  reduced-motion (JS `matchMedia` check). Also added: pause on hidden tab, and skip redraw during
  active scroll (fixes a scroll hitch from the full-viewport fixed canvas). Telescopic transitions gained a reduced-motion guard
  2026-07-03 (blur dropped; opacity-only); reaction glow disabled and the chat terminal boot
  sequence skips straight to the room under reduced motion. Closed. (2026-07-03)
- [x] **Skip-to-content link** (first focusable, visually hidden until focused). (2026-06-16)
- [x] **Visible accent-aware focus rings** — global `:focus-visible` rule in `base.scss`
  (2px accent, 2px offset; keyboard-only so mouse clicks stay clean). The scattered component
  `outline: none` rules target plain `:focus` and swap in accent borders — acceptable. (2026-07-03)

---

## 4b. Theme-styling consistency (light/dark parity audit)

Some surfaces are hardcoded to dark and don't respond to the light theme. Known: the
**Constellation / graph view appears dark in light mode**. Likely cause — canvas/PixiJS
draws (LocalGraph, ConstellationPage, BgCanvas) read fixed colour literals instead of the
CSS theme tokens, and any panel using a hardcoded `rgba(0,0,0,…)` / OLED `#0a0a0a` instead
of `var(--color-bg*)`. Audit pass:

- [x] **Graph views** — `ConstellationPage` now resolves star/line/label colours from the
  active theme once per frame (dark stars/lines/labels on light bg); `LocalGraph` already
  re-derived `linkColor`/`labelColor` from `data-theme` in its tick loop. Both invert
  correctly in light mode now. (fixed 2026-06-24)
- [ ] **Grep for hardcoded colours** outside `tokens.scss` — `#0a0a0a`, `#1a1a1f`, `rgba(0,0,0`,
  `rgba(255,255,255` literals in components/styles that should be `var(--color-*)`.
- [ ] **Audit every canvas surface** (BgCanvas modes, game pages, OG/boot) for fixed palettes
  that ignore `theme`.
- [ ] **Sweep overlays/panels** (LinkPreview, lightbox, chat glass, dropdowns) in light mode for
  dark-on-dark or low-contrast text.

---

## 5. Performance & Core Web Vitals

- [x] **★ Lighthouse CI** — `.github/workflows/lighthouse.yml` + `lighthouserc.json`: builds the
  SPA, audits static dist (desktop preset, 3 runs), warn-level thresholds (perf/a11y/BP/SEO ≥0.9,
  CLS ≤0.1, LCP ≤3s, TBT ≤300ms), report uploaded as artifact + temporary-public-storage. Tighten
  to error-level once a baseline exists. (2026-07-03)
- [x] **★ Fix CLS — image dimensions.** Shipped: `prebuild` emits `public/image-dimensions.json`
  and `rehype-image-paths` stamps intrinsic `width`/`height` on MDX images (author-supplied
  values kept). `img { max-width:100%; height:auto }` keeps them responsive. (verified 2026-06-20)
- [ ] **Image optimisation pipeline** — prebuild → `sharp` → WebP variants + `<picture>`/srcset.
  Same pass as the dimensions manifest.
- [ ] **Pre-render / SSG** for notes — worker already does SSR meta-tag injection; extend to full
  content pre-render → readable without JS, crushes LCP. Big lift; scope as its own project. The
  ceiling on perf.
- [ ] Verify the `NoteBody` change that un-lazied `TagPage`/`FolderPage` didn't fatten the entry
  chunk past intent — `vite build` and eyeball `dist/assets/index-*.js` before/after.

---

## 6. ★ Arcade cabinet shell — unify heXO & Chess, unblock new games

Lots of bespoke per-game code (heXO zen/pan/zoom/annotations; each toy reinvents the frame).
Extract the cabinet *before* building the next game.

- [x] **`<GameCabinet>` wrapper** — SHIPPED (`src/components/ui/games/GameCabinet.tsx`): title +
  blurb header, start/again overlay, score+best bar (localStorage via `bestKey`), zen/fullscreen
  (Esc to exit), accent-aware win flourish (`data-win`), optional `controls` slot. Migrated:
  **Snake, 2048, Hex Mines** (the clean start→play→win/lose games) + the new **Life** page.
  *Intentional exceptions:* **Tetris** (pause state + side score/lines panel + touch D-pad) and
  **Blackjack** (multi-phase betting state machine with a persistent bankroll) keep bespoke frames
  — folding them in would make the cabinet a leaky abstraction. (2026-06-20)
- [ ] **Generalise heXO zen mode** into the cabinet — Esc-to-exit handler, overlay, bottom bar,
  wide viewBox are all reusable. Currently live in `HexoPage`.
- [ ] heXO polish threads from the code review:
  - `setPointerCapture` targets the *cell* (`e.target`), not the SVG — works via bubbling but
    breaks if a child calls `stopPropagation`. Capture on `svgRef.current`.
  - Nested `setPan` inside `setZoom` reads `z` from captured scope — correct, but reads like a
    stale-closure bug; add a one-line comment.
  - No touch-pinch zoom (wheel only). The cabinet should own a touch story.
  - Annotations (`highlights`/`arrows`) wiped on every stone placement (Lichess-style) —
    intentional, but consider keeping them across a *non-placing* pan.
- [ ] **Back-to-arcade button placement** — currently top-left of `.game-layout` on all game pages
  (`BackToArcade.tsx`); Leon wanted it literally beside the page title. Revisit / per-game header.

### New arcade games queued (future.md)
Shipped: Snake, Tetris, 2048, Blackjack, Hex Mines, Murmuration/Boids, Sandbox, Ant Farm,
Hex Life, Progressions, The Knotted Field (Persian carpet loom — 2026-06-15). Remaining ideas:
- [ ] **Memory Garden** — concentration game on note titles / tags / covers / emotes. No backend.
- [ ] **Link Ladder** — word/concept-ladder seeded from note titles & tags; daily-seedable, no server.
- [ ] **Lights Out / Circuit Shrine** — 5×5 toggle puzzle, theme/accent glow. Very light, mobile-friendly.
- [ ] **The Predictor: Mass** — orbital escape roguelike (see `downloads/the_predictor_mass_shoggoth_artifact.html`).
  Self-contained single HTML with localStorage-persisted "Core memory" (Markov move predictor) + a shoggoth faction mechanic.
  Too large and complex for the in-garden arcade wrapper model; needs its own shell.
  **Leading option: a dedicated subdomain** — `predict.subsurfaces.net` (or `mass.subsurfaces.net`, `omega.subsurfaces.net`).
  Serve as a standalone Worker with the HTML as the root response — no React/Vite needed.
  Alternatively, could live as an iframe game like The Knotted Field, but it uses `overflow:hidden` on `<html>` for its
  own full-viewport loop, and the sidebar-less "whole screen" contract is cleaner as its own domain.
  **Shipped as `omega.subsurfaces.net`** — listed live in ArcadePage as "The Predictor" (featured,
  external). Remaining: optional content/lore note on the garden linking to it (Leon's call).

---

## 7. Wiki & content polish

- [~] **Broken wikilinks** — down to **4** (was 35; content cleanup happened). prebuild now emits
  `public/broken-links.json` (`{total, bySlug}`) so the count is trackable and CI could fail above a
  threshold. The remaining 4 point at notes that don't exist yet (Leon's content call). (2026-06-16)
- [ ] Page metadata editing (description, tags) from the wiki editor UI.
- [ ] Watchlist — notify on bookmarked-page edits. Needs a `watchlist` table; pairs with existing
  bookmarks + `edit_log`.
- [ ] Contributor dashboard — recent activity/stats from `edit_log`.
- [ ] Wiki community features (comments, reactions).
- [ ] **GitHub App token** for non-expiring wiki submissions — until then, preflight token
  validity check with a clear user-facing error.

---

## 8. Terminal mode finish (~90% there)

- [ ] `/emotes off` — pure ASCII fallback (no inline images).
- [ ] `/ping` — Supabase Realtime round-trip latency.
- [ ] Screensaver — idle N min → replay ASCII animation (reuse TerminalTitle idle snippets).
- [ ] Documented public API schema for third-party terminal-client builders (API-key platform
  already exists — documenting it unlocks third-party clients).
- [ ] WebSocket endpoint for raw `wscat`-style access (stretch).

---

## 9. Resilience — make failure visible (project's own design law)

- [x] **Error boundaries** around the Outlet in all three shells (`AppShell` label="note",
  `WikiShell` label="page", `ChatShell` label="chat"), each reset on `location.pathname`. The
  `ErrorBoundary` detects chunk-load failures (stale deploy) and offers RELOAD vs RETRY. The
  out-of-Outlet floating `LocalGraph` has its own boundary too. (verified 2026-06-20)
- [x] **content-index load failure is surfaced** — `AppShell` sets `contentIndexError` on a
  failed/non-JSON fetch and `ContentIndexErrorBanner` renders a visible banner. (verified 2026-06-20)
- [x] **Supabase-down drill** — PASSED 2026-07-03: with all fetch + WebSocket to *.supabase.co
  hard-rejected, six garden routes (index, note, arcade, graph, bookshelf, recent) all rendered
  full content, no error boundary, zero console errors. The layering law holds.
- [x] **Unchecked `fetch` in worker handlers** — resolved by the 2026-07 worker refactor:
  handlers route upstream failures through `upstreamError(label, res, msg)` (logs status + body
  snippet), and the dispatcher's error boundary catches anything thrown (JSON 500 + requestId).

---

## 10. HeXO — theory, bot, and the page

The published `content/HeXO Theory.md` (do not edit without asking) lists the live open
questions. The research repo is `../hexgo-theory` (`DIRECTION.md` is the one-page thesis).

**The thesis (DIRECTION.md):** the transversal number τ of the obligation hypergraph is the
master variable — a position forces a win iff some threat family has τ > 2 (the defender's
2-stone budget). `pressure = max(0, τ − 2)` is a move-scoring function.

- [ ] **Port a stronger bot to the garden.** Garden's `lib/hexo.ts botMove` is plain
  Erdős–Selfridge potential — a *soft* τ-proxy, but **fork-blind** (the gap a human exploits:
  set up a double threat = τ > 2). A fork-aware bot exists in `../hexgo-theory/competition/arena.py`
  (`make_fork_aware`, adds a squared open-4-lines surplus term). Blocker: it *draws* plain ES
  strong-vs-strong — needs an **asymmetric arena test** that actually demonstrates fork > ES before
  porting. Then port line-for-line into `lib/hexo.ts` (Python and TS engines kept identical).
- [ ] **HeXO leaderboard** (index.md wishlist + the page's own "open questions"). Not started.
  Needs a results table (pairs with the deferred Chess leaderboard — could share infra).
- [ ] **NP-hardness via 3-SAT** — Discord sketch of a reduction; no formal proof in repo. The
  threat-atom framework is the natural place for the gadgets. Genuinely open. Different axis of
  difficulty from the set-theory (Borel-hierarchy) result.
- [ ] **The headline experiment** — does description length of strong self-play grow `~log N`
  (finite structure → quasicrystal) or `~N` (refuted)? Everything is built to settle this.
- [ ] **Progressions overwrite-mode research** (ALife / finite-space computation seed in
  DIRECTION.md) — Garden-of-Eden states, loopy-game value, self-replicating gliders. Unbuilt.
- [ ] **Folder rename `hexgo-theory` → `hexo-theory`** — blocked by Leon's open VS Code (file
  lock). Git remote + garden links already point at `hexo-theory`. Manual: close VS Code, `mv`,
  rename the GitHub repo `sub-surface/hexgo-theory` → `hexo-theory`. *(Leon's task.)*

---

## 11. From index.md "What's on my mind" — site features

The public wishlist. Status against code; only the OK'd, shipped ones get reflected back into
`index.md`.

- [x] **Vinyl-record music player** — turntable: grooved spinning disc, cover-art label, radial
  log-scaled visualiser behind the disc, **scratch** (AudioWorklet reads the decoded track at a
  signed hand-driven velocity — real forward/reverse pitch-bend, volume-matched), pop-out via
  Document Picture-in-Picture, SoundCloud title link, side-on progress line. (2026-06-15)
- [x] **Pop-out music window** — Document PiP moves the player into a floating always-on-top
  window (audio stays in the main doc; `createPortal` keeps React handlers live). (2026-06-15)
- [ ] **Music player — extras (notes for later):**
  - LPF/HPF filter knobs behind a toggle (BiquadFilter on the music graph).
  - Playlist reordering (drag), loop-all + single-track loop modes.
  - Scratch first-activation latency: prewarm decodes on open, but a cold first scratch can still
    fall back to silent scrub until decode lands — consider decoding to a smaller/again-cached form.
- [x] **"Random note" button** — dice icon in QuickControls (main shell) + `r` hotkey. Picks a
  random eligible slug from the content-index (system/game/shelf/index pages excluded,
  case-insensitively against `SYSTEM_PAGES`; `private` filtered), opens it as a panel card on the
  garden / navigates on wiki. `useRandomNote` hook + `RandomNoteButton`. (2026-06-15)
- [ ] **Generative-art section** — `[~]` partially: Boids/Sand/AntFarm/HexLife exist as toys and
  Murmuration is the default bg, but no dedicated "create your own & share" surface.
- [ ] **Philosophy ↔ computation writing** — series of notes; analytic angle + Deleuze's unfinished
  set-theory work. Not started. *(Content — Leon writes; agent doesn't author content unprompted.)*
- [x] Publish HeXO Theory writing — `content/HeXO Theory.md` is live (seedling). Follow-on *series*
  still unwritten (Leon's).

---

## 12. Identity (Stonks removed 2026-07)

- Stonks (Phase 2) was **removed entirely** 2026-07 — it never matured. Tables, endpoints, and UI
  deleted; DB teardown in `docs/migrations/2026-07-chat-denormalize.sql`. Do not rebuild from dead code.
- [ ] Easter-egg reactions with configurable effects (e.g. confetti via `canvas-confetti`).
- [ ] Idle game (Identity Phase 3) — full design TBD.

---

## 13. OG image gen hardening

- [x] **Homepage card shipped no og: tags** — `/` mapped directly to `dist/index.html`, so CF's
  asset handler served it and bypassed the Worker → `injectMetaTags` never ran (deep routes hit
  the Worker fine). Fixed with `run_worker_first = true` in `wrangler.toml`. **CAUTION:** the
  array form (`["/", "/index.html"]`) is *exclusive* — it broke every `/api/*` route and disabled
  OG/meta injection on all non-listed pages; only the boolean `true` works here.
  (fixed 2026-06-24; verify post-deploy: `curl -s https://subsurfaces.net/ | grep og:image`)
- [x] **External image fetch failures** — resolved: `og-gen.ts` now inlines only LOCAL thumbnails
  (base64 data URIs) and skips truly-external URLs entirely, so `covers.openlibrary.org` is never
  fetched at build. A full run had zero skips. (verified 2026-06-24)
- [~] **OG caching** — the `.cache.json` works locally (156/157 cached on a clean run) but isn't
  tracked, so each machine starts cold. Moot for deploy: CF never runs `PROCESS_OG`, so OG images
  ship as committed artifacts and the cache only matters when regenerating locally.
- [ ] **SVG image support** — satori can't load `.svg`; detect SVG URLs in `og-gen.ts` and skip or
  rasterise via `sharp` (not yet a dependency).
- [ ] **6 orphaned cards** in `public/og/` (`Moltbook`, `Best-Of-Moltbook`, `On-philosophy`,
  `Rebuild-Upgrade-Prompt`, `Wiki-Ape`, `Wiki-Sample-Article`) — notes since deleted/renamed; safe
  to `git rm`. Re-running `PROCESS_OG` also rewrites ~13 system cards with different bytes (older
  satori/resvg than current `node_modules`) — visually identical, but the committed artifacts
  aren't bit-reproducible from current deps.

---

## 14. Infrastructure & misc

- [ ] **Trusted Types** — evaluate `require-trusted-types-for 'script'`; audit PixiJS/D3 first.
- [ ] **`glob@11` deprecation warning** — track; update when the upstream fix ships.
- [ ] **Detailed codebase documentation** — comprehensive docs pass.

---

## 15. Dream / sweeping bets (none lose anything if skipped)

- [x] **Command palette (`Ctrl+P`)** — shipped (`CommandPalette`, toggled via Ctrl/Cmd+P in
  `useHotkeys`, mounted in `GlobalOverlays`): jump to notes + run actions + search content.
  (verified 2026-06-24)
- **Generalised cabinet for all widgets** — graph, chess, heXO, music get the same zen/fullscreen
  + keyboard model. (Partial: `GameCabinet` covers several arcade games — see §6 — but graph /
  chess / heXO / music aren't unified yet.)
- [x] **Reading progress bar** on articles — shipped (`ReadingProgress` in `ArticleLayout`).
  "Time to read" is computed (`readingTime` in the content index); surface it on articles if not
  already shown. (verified 2026-06-24)
- **Inline backlink mini-map** in the article margin (you have `LocalGraph`) — the note's
  immediate neighbourhood inline, not just on the graph page.
- **Named theme presets** beyond the ROYGBIV cycle — "terminal amber", "blueprint", "newsprint"
  setting accent + bg-style + density together. Triadic palette math already in the store.
- **Music-reactive generative art** — FFT analyser already wired (devlog 2026-06-14 `next:`).
- **Constellation "guided tour" mode** — devlog `next:`.
- **"What changed" timeline** — devlog `next:`. The new `<Query sort="-date">` on `index.md`
  is the seed; promote it to a full dated changelog stream (group by day, show growth badges).
- [x] **Embeddable discovery queries** — `Query` now supports `sort="random"` (render-stable
  seed, `notesOnly` filter) and a new `<OnThisDay />` MDX component (note dated to today's
  calendar day in a past year, random fallback). Both live at the bottom of `index.md`. (2026-06-20)
- [x] **Game of Life consolidated** — extracted the square Conway engine from `MachineGod.tsx`
  into one reusable `<GameOfLife>` (MDX-registered); the machine-god article, `index.md`, and a
  new arcade **Life** page (`/life`) all share it. Hex Life stays a distinct hex automaton. (2026-06-20)
- **Garden seasons / time-of-day ambient theming** — shift the default bg palette + accent
  warmth by local clock (dawn/day/dusk/night) and optionally month. The triadic palette math +
  `bgMode` cycle already exist; this is a thin scheduler over them, respecting any explicit
  user override in localStorage. Quiet, atmospheric, zero new deps.
- **"On this day" resurfacer** — a small index-page module that surfaces a note created/edited
  on this calendar day in a past year (or a random seedling if none). Pairs with the content
  index's `date`; nudges old notes back into view. No backend.
- [x] **Adjustable measure / type-scale control** in reader mode — `±` steps on body width
  (70/80/90/100ch) and font scale (95–135%), persisted to localStorage, applied via
  `--reader-measure`/`--reader-scale` CSS vars on the shell. `ReaderControls` (pill, bottom-centre)
  mounts only in reader mode and includes an Exit button. (shipped 2026-06-20; **the controls were
  inert until 2026-06-24** — AppShell's hardcoded `.mainPane`/`.mainContent` reader rules overrode
  the vars and the var rules only targeted `.article-body`, so notes never responded. Now both the
  pane width and prose size are var-driven and the article grid collapses so notes + articles both
  react.)

---

## 16. Chamber & SIGIL follow-ons (from SPEC-chamber-and-sigil appendix, 2026-07)

`chamber` bg mode + SIGIL shipped 2026-07-03 (see `docs/archive/specs/chamber-and-sigil-spec.md`).
The spec's appendix "idea bank" — all four ambient modes wanted, plus the aiming toy:

- [x] **`schematic` bg mode** (shipped 2026-07-03) — leader lines from drifting anchors to nothing; right-angle
  dimension brackets; edge ruler ticks; sparse asemic glyph clusters fading in/out. The most
  literally "blueprint" mode; could replace `chamber` as SIGIL's themed bg once it exists.
- [x] **`isometric` bg mode** (shipped 2026-07-03) — faint wireframe iso cubes drifting/rotating, some inscribed with
  glyph columns; cursor parallax. Wireframe-only, cheap.
- [x] **`orrery` bg mode** (shipped 2026-07-03) — nested rotating astrolabe/armillary rings (thin arcs + tick radials),
  centred, slowly precessing. The scribe's instrument as pure geometry.
- [x] **`plate-scan` bg mode** (shipped 2026-07-03) — a single Atkinson-dithered generative still rendered once and
  slowly panned/scanline-swept; near-zero per-frame cost (a natural "battery saver" mode).
- [x] **Bubble-chamber aiming toy** — shipped 2026-07-03 as **Collider** (`/collider`) — fire tracks through the `chamber` flow field to hit
  specimen targets; reuses `drawChamber`'s spawn/advection as the toy's physics. One-line
  system-pages registration when built.
- [ ] **Oracle toy** (stretch) — click to cast: reuse the SIGIL generator to auto-route a plate as
  a "reading" (generative plate + asemic gloss + seed). Pairs with a shareable daily-SIGIL result
  string (`SIGIL-<date> · <optimality>% · <moves> moves`).

All are drop-in `drawX(ctx, state, config)` fns + one `config.backgrounds.<mode>` block + the
ThemePanel/cycle/type-union registration — see `chamber` (2026-07) as the template.
