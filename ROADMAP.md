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

Last reconciled against the working tree: 2026-08-02 (SUBSURFACES 95 personal-machine
continuation; see §29 and `docs/os-95-spec.md` §13).

2026-07-12 (later session): elegance-review pass over the open proposals — §18–§21, §23, §25
gained implementation notes from a code read (corrected the §21 prebuild/`SYSTEM_PAGES` approach,
which was unbuildable as written; pinned §19's navigate mechanics and ripple effects). The
§19+§21+§23 cluster now has a full implementation spec:
`docs/archive/specs/2026-07-12-classify-layout-nav-reader-spec.md`.

---

## 0. Now — sequenced top picks

Everything in the previous "Now" list has shipped: **Lighthouse CI** (§5, tightened to
error-level 2026-07-12), **a11y / keyboard pass** (§4, 2026-07-03), the **theme-styling
consistency audit** (§4b, 2026-07-12), and the **arcade cabinet shell** (§6, 2026-06-20 — the
cabinet itself; heXO integration is a separate remaining item, its pointer-capture bug fixed
2026-07-12). Also shipped since the last reconciliation and not previously tracked here: the
**Inbox page** (`/inbox` — untagged/orphaned/draft/broken-link triage, linked from `index.md`),
a full article-typography pass (frontmatter-driven epigraph, dropcap font + competing-floats
fixes, sidenotes mobile toggle/breakpoints/Roman numerals), and the **§19+§21+§23 nav/layout/
reader-mode cluster** (2026-07-12, see those sections) — see `docs/garden.md` /
article-typography memory for detail; the Attention & Difference essay publish itself is
content, tracked by Leon, not here. Revised order:

1. ~~**Mobile breakpoints foundation** (§18)~~ — **DONE 2026-07-13.** Named breakpoint tokens
   (`$bp-phone`/`$bp-panel-narrow` in `tokens.scss`) + mirrored `src/config/breakpoints.ts`
   (`isPhoneViewport()`/`usePhoneViewport()`) + the container-vs-media-query ownership rule, all
   JS hardcodes unified. Shipped alongside the article-grid mobile bug, Command Palette touch
   entry, and LinkPreview hover gate — see §18. Remaining §18: component-module literal migration
   (over time), touch-gesture parity, full on-device visual sweep.
2. **heXO → arcade cabinet integration + polish threads** (§6) — reframed from "before any new
   game" (stale premise — a dozen games shipped without it) to whenever heXO gets its next pass.
   The `setPointerCapture` bug is fixed; zen-mode generalization and touch-pinch remain.
3. **Component/hook test coverage** (§22) — now unblocked (`classifyLayout()` exists); cheapest
   while `usePanelClick`'s rewrite is still fresh.
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
- [x] **Grep for hardcoded colours** outside `tokens.scss` (2026-07-12) — grepped
  `#0a0a0a`/`#1a1a1f`/`rgba(0,0,0`/`rgba(255,255,255` across `src/`. Findings:
  - **Exact-hex matches** (`#0a0a0a`/`#1a1a1f`) were all already theme-safe — either a
    `var(--color-bg[-surface], #0a0a0a)` fallback pattern (fallback never fires in practice)
    or an explicit `isDark ? … : …` branch (`useDynamicFavicon.ts`). No bug there.
  - **`rgba(0,0,0,…)`** is overwhelmingly `box-shadow`/`drop-shadow`/`text-shadow` or a
    scrim over an image/video thumbnail — correct in both themes by convention (shadows and
    media dimmers are black-based regardless of site theme). Left alone.
  - **`rgba(255,255,255,N)`** used as a `background`/`border` "raise this surface" tint on
    global chrome was the real bug class — a token (`--color-highlight`, already theme-aware)
    existed for exactly this, but ~15 chrome components hardcoded the white literal directly
    instead, at a dozen different tuned opacities. A single shared token would've visibly
    changed each component's tuned intensity, so instead added `--color-overlay-tint`
    (`#fff` dark / `#000` light) to `tokens.scss` and mechanically converted every
    `rgba(255,255,255,N)` → `color-mix(in srgb, var(--color-overlay-tint) N%, transparent)`
    in the global-chrome set: `ThemePanel`, `CommandPalette`, `KeyboardCheatSheet`,
    `NotificationBanner`, `QuickControls`, `LocalGraph`, `MDXComponents` (article
    pullquote/blockquote — every article), `ChatSettings` (colour-swatch picker, see below).
    Preserves every component's exact dark-mode appearance (color-mix at N% ≈ rgba at N)
    while correctly inverting to a dark tint in light mode instead of vanishing.
  - **`ChatSettings`'s active colour-swatch ring** was a literal `border-color: white` —
    genuinely invisible against a light-mode panel. Fixed to `var(--color-text)`, matching
    the already-correct idiom `ThemePanel.module.scss`'s `.accentOption[data-active]`
    already used for the same "selected swatch" pattern.
  - **Deliberately left alone** (confirmed correct-as-is, not bugs): `MusicPlayer`'s vinyl
    record chrome, `PersianCarpetPage`'s woven-carpet pixel simulation, `Chat`'s
    `Terminal.module.scss` CRT aesthetic, `Game2048Page`'s coloured tile chips + white text —
    all are deliberately fixed-palette "objects" independent of site theme, same reasoning as
    a vinyl record staying black regardless of the page around it.
  - **Not touched, scoped as a follow-on**: per-game module CSS (`ChessPage`, `HexoPage`,
    `TetrisPage`, `SnakePage`, `Game2048Page`, `HexMinesPage`, `HexLifePage`, `BoidsPage`,
    `AntFarmPage`, `ArcadePage`, `Collections`/shelves, `WikiInfobox`, `ComposerStage`) still
    carries ~50 `rgba(255,255,255,N)` texture/hover literals at the same bug class as above.
    Lower priority than global chrome (visited less, mostly very-low-opacity 0.02–0.05 grain
    that's barely perceptible either way) but same fix mechanically applies — swap to
    `color-mix(in srgb, var(--color-overlay-tint) N%, transparent)` per file, then eyeball
    each game in light mode before committing (higher visual-regression risk per file since
    each was hand-tuned; not safe to batch-convert blind).
- [x] **Audit every canvas surface** (2026-07-12) — `BgCanvas`'s ten ambient modes already
  pull every colour from live CSS custom properties via `colorCache` (invalidated on
  `[theme, accentBase]` change), so they're fully theme-reactive already; `ConstellationPage`/
  `LocalGraph` confirmed above; `HexLifePage` already reads `--color-accent-base`/
  `--color-bg-surface` live. **Found and fixed**: `ProgressionsPage`'s empty-cell grid fill
  was a hardcoded `rgba(255,255,255,0.03)` canvas `fillStyle` — invisible in light mode
  (white-on-white). Now reads `--color-overlay-tint` via `getComputedStyle` once per frame
  (cheap relative to the existing per-frame grid iteration) and builds a `color-mix()` fill
  string, same mechanism as the CSS fix above but for a canvas context (which can't resolve
  `var()` directly). OG image generation (build-time, satori) and `/boot`'s terminal aesthetic
  are intentionally theme-invariant by design — not bugs.
- [x] **Sweep overlays/panels** (2026-07-12) — `LinkPreview`, `ImageLightbox`, `WikiInfobox`,
  and the chat frosted-glass surfaces (`SideChat`, `Chat.module.scss`'s `.reactPicker`) were
  already fully token-driven; no light-mode contrast bugs found there. `ChatSettings`'s swatch
  picker was the one real find (see above, folded into the hardcoded-colour pass since it's
  the same root cause). Dropdowns (`ChatAutocomplete`, `EmotePicker`) only had shadow-class
  `rgba(0,0,0,…)`, already fine.

---

## 5. Performance & Core Web Vitals

- [x] **★ Lighthouse CI** — `.github/workflows/lighthouse.yml` + `lighthouserc.json`: builds the
  SPA, audits static dist (desktop preset, 3 runs), all assertions flipped from `warn` to
  `error` (perf/a11y/BP/SEO ≥0.9, CLS ≤0.1, LCP ≤3s, TBT ≤300ms) now that a baseline exists,
  report uploaded as artifact + temporary-public-storage. (baseline 2026-07-03, tightened
  2026-07-12)
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
  - [x] `setPointerCapture` targeted the *cell* (`e.target`), not the SVG — worked via
    bubbling but broke if a child called `stopPropagation`. Now captures on `svgRef.current`.
    (fixed 2026-07-12)
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
- [ ] **The Predictor: Mass** — orbital escape roguelike (see `omega.subsurfaces.net`).
  Served as a standalone Worker with the HTML as the root response — no React/Vite needed
    **Shipped as `omega.subsurfaces.net`** — listed live in ArcadePage as "The Predictor" (featured,
  external). Remaining: optional content/lore note on the garden linking to it (Leon's call).
- [ ] **Add p(doom) (`pdoom.subsurfaces.net`) to the arcade** (Leon, 2026-07-12) — same featured/
  external card pattern already used for StarWeft, Lines of Flight, ANABASIS, and The Predictor
  (`ArcadePage.tsx`'s `GAMES` array, `section: "featured", external: true` — renders with the ↗
  marker and opens in a new tab, see `renderRow()`). A text incremental about an AI lab's funding/
  compute/talent/doom problems; blurb needs Leon's own phrasing to match the wry tone the other
  cards have, not agent-invented.
- [ ] **`bazar.subsurfaces.net` is the other one missing from this set** — noticed while adding
  p(doom): StarWeft, Lines of Flight, and ANABASIS are all already featured/external cards in
  `ArcadePage.tsx`, but bazar (the infinite procedural Persian-carpet walking simulator) isn't,
  despite being live and in the same "elsewhere in the constellation" list as the other three.
  Possibly deliberate (there's already an in-garden Persian-carpet game, "The Knotted Field" —
  might be a conscious choice not to double up), but flagging in case it was just missed.

---

## 7. Wiki & content polish

- [~] **Broken wikilinks** — currently **5** (was 35; content cleanup happened). prebuild now emits
  `public/broken-links.json` (`{total, bySlug}`) so the count is trackable and CI could fail above a
  threshold. Three originate in `a-place-to-start-writing`; two originate on `index`. They point at
  notes that don't exist yet (Leon's content call). (reconciled 2026-08-02)
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
  - Queue drag/reordering, Play Next/Add, duplicate entries, named mixes, repeat modes and stable
    slug persistence now ship in the OS Media Player. Decide whether the compact garden player
    should expose them too rather than creating a second queue implementation.
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
- [x] **6 orphaned cards** in `public/og/` (`Moltbook`, `Best-Of-Moltbook`, `On-philosophy`,
  `Rebuild-Upgrade-Prompt`, `Wiki-Ape`, `Wiki-Sample-Article`) — notes since deleted/renamed;
  `git rm`'d, no live references found. (2026-07-12) Re-running `PROCESS_OG` also rewrites ~13
  system cards with different bytes (older satori/resvg than current `node_modules`) — visually
  identical, but the committed artifacts aren't bit-reproducible from current deps.

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

---

## 17. Codebase hygiene sweep (2026-07-12)

An agent-led review of files/scripts untouched since the March/April early build, cross-checked
against the current codebase rather than just file age. Findings, fixed same session:

- [x] **Dead code: `src/lib/mdx-loader.ts`** — zero real importers (superseded by the inline
  `import.meta.glob` in `NoteBody.tsx`); deleted. `docs/garden.md`'s content-loading line was also
  wrong about what `content-loader.ts` does — corrected alongside the deletion.
- [x] **`BgModeToggle.tsx` stale label switch** — `getLabel()` only named 4 of the 10 current
  `BG_MODES`; the other six (`murmuration`, `chamber`, `schematic`, `isometric`, `orrery`,
  `plate-scan`) fell through to the raw lowercase mode string in the tooltip. Fixed.
- [x] **`scripts/test-slugs.mjs` tested nothing real** — re-simulated old duplicated slug logic
  instead of importing `src/lib/slug.ts` (the module whose own header comment says it exists
  *because* three call sites drifted). Rewritten as `scripts/test-slugs.ts`, imports the real
  `normalizeSlug`/`slugifyPath`/`slugFromPathname`/`buildSlugResolver`; `package.json` test script
  updated to match.
- [x] **`scripts/audit-site.mjs` route list stale** — covered 8 routes predating most of the
  current site (composer, sigil, hexo, collider, arcade, music-library, movieshelf, inbox, chat,
  boot, wiki submit). Route list expanded; still a manually-run tool, not wired into CI.
- [x] **`docs/wiki.md` missing Admin Panel + chatter-claim docs** — added: Admin Panel section
  (`/admin`, role ladder, users/edit-log/locks tabs) and Chatter Profile Claiming section
  (`chatter_claims`, claim endpoints, WikiInfobox override).
- [x] **README scope/tone** — chat API reference split into `CHAT-API.md` (also fixed stale
  content in the process: the old `mini`/`stonk-history` endpoint docs referenced the removed
  stonks system, and `/api/admin/api-keys` was documented as the primary path when the frontend
  actually uses `/api/keys`). README front matter rewritten to cover the full front-facing surface
  (HeXO, SIGIL/Collider, Apparatus, `/boot`, arcade) instead of just "notes, philosophy, chess".
- [x] **`docs/future.md` reconciliation** — while in the roadmap docs: marked several already-shipped
  items done (worker split, cabinet shell, Snake/Blackjack, Lighthouse CI, OG external-image fix),
  corrected the stale broken-wikilinks count, and struck the dead Stonks (Phase 2) section down to
  historical record (removed 2026-07, see ROADMAP §12). Also resolved the RLS contradiction between
  `docs/future.md` and `docs/wiki.md` flagged the same session: RLS is active (confirmed by Leon
  2026-07-12); `wiki.md`'s copy was the stale one and has been corrected.

---

## 18. Mobile coherence sweep

Mobile has accumulated one-off fixes (the 2026-07-12 sidenote mobile-toggle/breakpoint-unify fix
is a recent example) without a systemic pass — issues are hard to track because there's no single
place mobile behaviour is defined. Needs a dedicated sweep across look, reflow, and interaction
model, not another point fix. Preliminary findings from this session (not yet a full audit):

**2026-07-13 progress:** the foundation + three of the leads below shipped (breakpoint source of
truth, container-vs-media ownership rule, Command Palette touch entry, LinkPreview hover gate),
plus the concrete article-grid mobile bug Leon screenshotted. `npm run build` + `npm test` green.
Remaining open: touch-gesture parity (§18 5th bullet / §6) and the full on-device visual sweep.

- [x] **Article grid stranded the backlinks footer in an implicit right column on mobile**
  (2026-07-13, Leon-reported via screenshot — "the right column seems dominant"). `.article-layout`
  is a 4-col grid; `.article-body` and `NoteFooter`'s `.footer` are both pinned to `grid-column: 2`
  so the footer flows under the prose on desktop. At ≤900px `article.scss` collapses the grid to a
  single `1fr` column and moves `.article-body` → `grid-column: 1`, but nothing moved the footer, so
  it kept `grid-column: 2` → CSS Grid spawned an implicit auto-sized track on the right and dropped
  the whole backlinks block into it. Long backlink titles then stole width and squeezed the prose
  column to a sliver (title fragmenting into "Atten-tion & Dif-fer-ence"). Fix: `NoteFooter.module.scss`
  now moves `.footer` to `grid-column: 1` at the same ≤900px breakpoint `.article-body` uses; also
  set `hyphens: manual` on article headings so a heading never auto-fragments when narrow.
- [x] **No shared breakpoint source of truth.** (2026-07-13) Grepped `max-width:\d+px` across `src/styles` +
  every component module: mobile/narrow breakpoints are declared ad hoc at 500, 560, 600, 640,
  700, 760, 768, 800, 900, 920, and 1120px across ~40 files, each component picking its own number
  independently. The only named breakpoint variable, `$article-narrow` (`tokens.scss`, 1300px —
  where the article margin column collapses), is a different concept (content-fit, not device
  width) and correctly stays separate. This fragmentation is the most likely root cause of "hard
  to track" — adjacent components disagreeing on where "mobile" starts is exactly the bug class
  the sidenote toggle fix just patched once. **Fix shape:** add 1–2 named breakpoints to
  `tokens.scss` (e.g. a phone width and a tablet/narrow-desktop width) and migrate component
  modules onto them over time; new mobile CSS should never hardcode a bare px value again.
  **Include the JS side in the same convention**: `window.innerWidth <= 800` is also hardcoded in
  at least `usePanelClick.ts:43` and BgCanvas's mobile skip (CLAUDE.md gotcha #13) — add a
  `src/config/breakpoints.ts` exporting the same numbers, with a comment in each file pointing at
  the other (SCSS can't import TS; a documented mirrored-constant pair beats generation machinery
  at this scale). The 800px value is effectively already the site's de-facto "phone" breakpoint —
  name it rather than invent a new number.
  **Shipped (2026-07-13):** `tokens.scss` now defines `$bp-phone: 800px` + `$bp-panel-narrow: 560px`
  (both existing de-facto numbers, named not invented); `src/config/breakpoints.ts` is the JS mirror
  (`PHONE_BREAKPOINT`/`PANEL_NARROW` + SSR-safe `isPhoneViewport()`), with a header comment on each
  side pointing at the other. All four JS hardcodes now go through the shared constant/hook: the two
  with a resize listener (`NoteFooter`, `LocalGraph`) share a new `usePhoneViewport()` hook;
  `usePanelClick` + `BgCanvas` call `isPhoneViewport()`. Global `src/styles/*` phone `@media`s
  (article.scss, reader-mode.scss) migrated to `$bp-phone`. **Remaining (deliberate, over time):**
  component `.module.scss` files still hardcode literals — they don't `@use tokens`, so each needs
  an import added; migrate opportunistically, don't batch-convert blind (hand-tuned per file). The
  900px article single-column collapse and 560px `@container` widths are separate concepts — left as
  literals or their own token, not folded into `$bp-phone`.
- [x] **Two responsive mechanisms coexist without a stated rule.** (rule stated 2026-07-13; migration
  ongoing) The container-vs-media-query ownership rule is now written down in `breakpoints.ts` and
  `tokens.scss`: container query (`$bp-panel-narrow`) when a component reflows on the width of the
  box it's rendered *in* (panel card vs full page); viewport `@media`/`isPhoneViewport()`
  (`$bp-phone`) only for device-level concerns. Existing violators (`TetrisPage`, `ConstellationPage`,
  `BlackjackPage`, …) still need migrating onto the rule — that's the same over-time component-module
  sweep as the bullet above. Many game/shelf pages respond
  to `@container panel (max-width: 560px)` (their width inside the panel-stack "note" layout) while
  also carrying plain `@media (max-width: Npx)` rules (viewport width) in the same stylesheet —
  e.g. `TetrisPage.module.scss`, `ConstellationPage.module.scss`, `BlackjackPage.module.scss`. A
  component can be narrow-via-container but wide-via-viewport (or vice versa) depending on whether
  it's rendered as a panel card or a full page, and the two rule sets can silently disagree. Needs
  an explicit rule for which mechanism owns which layout context.
- [x] **Command Palette has no touch entry point.** (shipped 2026-07-13) Bound only to `Ctrl/Cmd+P`
  in `useHotkeys` — and on mobile the whole `QuickControls` bar is `display:none` (≤$bp-phone),
  `CornerMenu` being the only control surface. Added a **"Commands"** item to both `CornerMenu`
  variants (default + wiki) that calls `toggleCommandPalette()`, so the palette (jump to notes / run
  actions / search) is now reachable on touch. (The `?` cheat sheet still has the same gap, but is
  lower-stakes — nothing to look up if there's no keyboard.)
- [x] **`LinkPreview` is mouse-hover only** — decision made explicit (2026-07-13). Confirmed
  desktop-only-by-design: the effect now early-returns unless
  `matchMedia("(hover: hover) and (pointer: fine)")` matches, so the `mouseover`/`mouseout`
  listeners never attach on touch devices. That both states the decision in code and kills the
  touch-emulated-`mouseover` first-tap flash (the Safari/Chrome quirk) — mobile just navigates
  straight through, no half-behaviour.
- [ ] **Touch-gesture parity on canvas/SVG pages** — heXO's pinch-zoom gap is already tracked
  (ROADMAP §6: "No touch-pinch zoom (wheel only)"). Worth checking whether the same gap exists on
  the other pointer-driven canvas pages (Collider, the graph views, SIGIL routing) rather than
  fixing heXO in isolation.
- Checked and confirmed **fine, not gaps**: `GameCabinet`'s zen-mode exit has both an `Esc` handler
  and a tappable `✕` button (not keyboard-only); Document PiP for the music player already
  feature-detects and hides its button on unsupported browsers (Safari iOS included); the mobile
  music bar is intentionally a separate, simpler component with no scratch/turntable interaction.
- [ ] **Full visual sweep still needed** — actual on-device/emulator pass across the three shells'
  key pages (home, an article, a note, wiki pages, chat, a couple of game pages, `/boot`) for
  reflow, overlap, and touch-target sizing. The above are leads from a code read, not a substitute
  for looking at it.

---

## 19. `usePanelClick` gap: small panel-card games, AND full page reloads on article links — ✅ SHIPPED

**Done** (2026-07-12): `src/lib/layout.ts` (`classifyLayout`) is now the shared source of truth,
used by both `NoteRenderer.resolveLayout()` and `usePanelClick`. `usePanelClick` classifies the
*destination* slug before deciding whether to open a panel card; games/articles (and any click
made while on an article/game page, and all mobile clicks) now go through `navigate()` — a real SPA
transition, panel stack cleared — instead of either a 750px-card mis-render or a full page reload.
`npm run check` (tests + worker typecheck + build) passes. Manual click-path verification (home →
game, article internal link keeps music playing, mobile navigate) is still Leon's to eyeball per
the spec's verification checklist. Full implementation spec, now archived:
`docs/archive/specs/2026-07-12-classify-layout-nav-reader-spec.md`. Section kept for the root-cause
analysis below.

Root cause (fixed) — Hex Life was the reported symptom but this affected **every**
game, from most navigation paths.

`usePanelClick.ts` (the global click interceptor that turns internal links into panel cards for
the "note" exploration mode) decides whether to intercept a click by checking the **current**
page's `activeLayout` (bails out only if you're *already on* an `"article"` or `"game"` page —
`src/components/panel/usePanelClick.ts:32-33`). It never checks what the **destination** link
actually resolves to. `NoteRenderer.resolveLayout()` is where "is this slug a game?" really lives
(frontmatter → type → wiki/writing slug prefix → `SYSTEM_PAGES[slug].layout`), and
`usePanelClick` doesn't share that logic at all.

Net effect: click a link to `/hex-life` (or any game) from anywhere whose *current* page isn't
itself article/game — the home page, a folder page, tags, recent, search results, most ordinary
notes — and the click gets intercepted and opened as a `PanelCard`, which is hard-fixed at
**750px wide** (`Panel.module.scss:9`, `flex: 0 0 750px`). That 750px box is the "small box" —
it has nothing to do with the actual `.game-layout` CSS, which is already correct (bare, full pane
width, `margin: -2rem -3rem` to cancel the content padding — `article.scss:302-317`). The game
renders fine; it's just being stuffed into the wrong container.

- [x] **Fix**: make `usePanelClick` check the *destination* slug's resolved layout before
  deciding to intercept, not the current page's. Concretely: extract the classification logic
  inside `NoteRenderer.resolveLayout()` (frontmatter/type/slug-prefix/`SYSTEM_PAGES` lookup) into
  a shared helper so both `NoteRenderer` and `usePanelClick` call the same function instead of
  one being a partial, drifted copy of the other. `usePanelClick` already computes `slug` and has
  `contentIndex` in scope, so this is a same-shape call, not new plumbing. (This is the same
  "shared logic drifts when duplicated" lesson as `src/lib/slug.ts` — see the 2026-07-12 hygiene
  sweep above.) **Implementation notes from a code read (2026-07-12), to save the implementer
  re-deriving them:**
  - **Signature**: `classifyLayout(slug: string, opts: { layout?: string; type?: string }): "article" | "note" | "game"`
    in `src/lib/layout.ts`. The `opts` shape is deliberately satisfiable by *either* full
    frontmatter (NoteRenderer's case — it passes `{ layout: fm.layout, type: fm.type ?? meta?.type }`)
    or a bare content-index entry (`usePanelClick`'s case — `{ layout: meta?.layout, type: meta?.type }`).
    Rule order must exactly mirror `resolveLayout()` (`NoteRenderer.tsx:30-47`): explicit layout →
    book/movie/chatter/philosopher type → `wiki`/`wiki/` prefix → `writing/` prefix →
    `SYSTEM_PAGES[slug].layout` → `"note"`. Keep `resolveLayout()` as a thin wrapper that feeds
    frontmatter in, so its callers don't churn.
  - **Prerequisite — the content index doesn't carry `layout`.** `NoteMetadata`
    (`src/types/content.ts`) and prebuild's `NoteMeta` have `type` but no `layout` field, so
    classification from index data alone would silently miss any note using the explicit
    `layout:` frontmatter override. One-line fix in both type defs + the frontmatter passthrough
    in `prebuild.ts`'s `scan()` (around line 184-195, next to `type`). Without this the fix
    *mostly* works and drifts later — do it as part of the same change.
  - **`SYSTEM_PAGES` import is safe for the SPA bundle** — `NoteRenderer` already imports it into
    the entry graph, and the `lazy()` wrappers don't load the page chunks until render. If §21's
    data/meta split lands (see there), `classifyLayout` should import the pure meta module
    instead; either order works, but doing §19+§21 together means writing it against the meta
    module once.
  - **Known edge**: `contentIndex` loads deferred post-render (CLAUDE.md gotcha #14), so a click
    in the first ~second may classify with `meta === undefined`. System pages still classify
    correctly (pure `SYSTEM_PAGES` lookup); a content note relying on the `layout:` override
    would fall back to panel-card behaviour. Acceptable — don't add loading-state plumbing for it.
- [x] ~~Once fixed, re-check whether any game *should* still open as a panel card from certain
  entry points~~ — **decided (Leon, 2026-07-12): games always navigate full-page, no exceptions.**
  No peek-preview UX for any game.
- [x] The same shared `classifyLayout()` helper would also directly enable §21's Query type-tag
  feature (below) — worth doing both in the same pass.

**Second symptom, same root cause, found 2026-07-12 (Leon: clicking a link on an article page
"pauses music and closes the player"):** `usePanelClick` only has two behaviours — push a panel
card, or bail out and do nothing. On article/game pages it bails (`al === "article" || al ===
"game"` → early `return`, `usePanelClick.ts:33`) — but "do nothing" doesn't mean "let the router
handle it," because **nothing else in the app intercepts internal link clicks for client-side
routing**. MDXProvider's custom `<a>` (`MDXProvider.tsx:75-83`) only adds a CSS class, it doesn't
call `navigate()`. So a link clicked anywhere inside an article or game page is a genuine,
unintercepted `<a href="/slug">` — the browser does a real full page load, not a SPA transition.
That's why the whole app remounts and the music player's React state (and playback) is wiped: it
isn't "a partial refresh," it's a full reload that happens to feel fast on a CF-edge SPA shell.
This almost certainly also resets reader-mode state, theme-panel state, scroll position, and
anything else held in memory — the music pause is just the most *noticeable* symptom, not the only
one.
- [x] **Fix, same pass as the panel-card fix above**: `usePanelClick` needs a third branch, not
  just two. Today it's binary (panel-card / do-nothing-and-hope). It needs: (1) panel-card for
  note-mode exploration, (2) **client-side `navigate()`, no panel card** — for article/game pages,
  or any click whose destination resolves to article/game — so the SPA transition still happens,
  just without opening a side panel, (3) true no-op only for genuinely special cases (hash links,
  `music:` links, modifier-key clicks, external origins) which already exist. Once
  `classifyLayout()` exists (above), branch (2) is a one-line check plus a navigate call instead
  of the current bare `return`. **Implementation notes (2026-07-12 code read):**
  - **Use the `useNavigate()` hook from `@tanstack/react-router`, NOT `import { router } from
    "@/router"`.** The latter is a circular import: `router.tsx` imports `AppShell`, which calls
    `usePanelClick`. The hook is safe — `AppShell` is the root route's component, so router
    context exists. Add the returned `navigate` to the effect's dep array (it's stable, but the
    lint rule will want it).
  - **Branch ordering matters.** Today the `activeLayout` bail (`usePanelClick.ts:32-33`) runs
    *before* the special-case bails (hash, `music:`, modifiers, `data-panel-ignore`, `_blank`,
    external origin, mobile). When replacing it with destination classification, keep all the
    special-case bails FIRST so they behave identically regardless of which branch fires —
    e.g. a Ctrl+click on a game link must still open a new tab, not client-navigate.
  - **Branch (2) should `clearStack()`** (already in the store, `src/store/index.ts:359`) before
    `navigate()` + `preventDefault()`. Today's accidental full reload wipes the panel stack;
    keeping stale cards behind a full-page game/article would be a new behaviour, not a
    preservation of the old one. Also call `setActiveGraphSlug(slug)` as the panel branch does.
  - **Decide branch (2)'s trigger precisely**: it fires when *either* the destination classifies
    as article/game (fixes the Hex-Life-in-a-750px-card symptom) *or* the current `activeLayout`
    is article/game (fixes the music-killing full reload for note→note links clicked from within
    an article). I.e. the current-page check doesn't disappear — it just routes to branch (2)
    instead of a bare return.
  - **The mobile bail (`window.innerWidth <= 800`, line 43) currently means full reloads on
    mobile too** — same music-wipe bug, no panel stack involved. Branch (2) should handle mobile
    (client-navigate everything internal on mobile) rather than keeping the bare return. Cheap to
    include; easy to miss.

---

## 20. Live inline editing for admin (Leon, 2026-07-12) — needs a design decision

Leon: "if I have an admin login i should just be able to edit and push changes from any page" —
an inline, Command-Palette-triggered edit mode, not limited to the wiki.

**What already exists, and matters for scoping this cheaply:**
- `handleEdit` (`src/worker/wiki.ts:193`) is **already slug-generic**, not wiki-only — it takes any
  `body.slug`, resolves it to `content/${slug}.md` on GitHub, and always creates a branch + PR
  against `master`. The "wiki only" restriction today is purely a **frontend** gate: `NoteRenderer`
  only shows `WikiEditButton` when `isWiki && layout === "article" && slug startsWith "wiki/"`.
  Extending "edit any page" to garden notes is mostly a frontend exposure change, not new backend
  plumbing — the write path already handles any content path.
- `handleEdit` currently **always** creates a PR — there is no direct-to-`master` commit path for
  any role, admin included. Also always requires a Turnstile token, even for an already-authed,
  role-gated request — friction that makes more sense for anonymous public submissions than for
  an admin's own frequent small edits.
- `WikiMarkdownEditor` already has the toolbar/preview/word-count machinery an inline editor needs
  — reuse it rather than building a second editor.
- `page_locks` (Admin Panel, §"Admin Panel" in `docs/wiki.md`) already exists for concurrent-edit
  protection and could guard against an inline admin edit colliding with an in-flight community PR
  on the same slug.

**Proposed shape** (agent's recommendation, not yet built):
- [ ] Command Palette action **"Toggle edit mode"** (admin-only, checked via `ctx.auth.role`
  server-side same as everywhere else) — sets a store flag; while on, an inline edit affordance
  appears on the current note/article (garden or wiki) using `WikiMarkdownEditor` in place.
- [ ] **Open question for Leon**: on save, commit straight to `master` (skip the PR entirely for
  admin), or keep the PR but auto-merge it server-side? Direct commit is simpler and matches "just
  edit and push" literally, but loses the PR as an audit trail / one-command revert point — though
  note every commit is still individually revertable via git regardless, so the PR's main value
  here would just be the GitHub UI diff view, not safety. Leaning direct-commit given Leon is the
  only admin and it's his own site, but worth confirming before building. Direct-commit is
  mechanically small: a `commitDirect()` sibling of `createEditPR` (`wiki.ts:250`) using the
  GitHub Contents API `PUT` with the file `sha` — `handleEdit` already fetches that sha
  (`wiki.ts:242`), so it's the same call minus the branch/PR steps.
- [ ] **Expectation-setting that MUST be in the UI copy**: a commit to `master` triggers a full
  CF build + deploy (~minutes), and the SPA reads content from the *built* index — so the save is
  instant but the published change is not. Inline edit mode should say so ("saved — live in a few
  minutes") rather than pretending to be a CMS. `WikiMarkdownEditor`'s live preview covers the
  "did I write it right" need; nothing needs to fake instant publish. Also: N quick successive
  edits = N deploys. Fine at Leon's volume; if it ever isn't, batch by committing to a branch and
  merging on a timer — noting the option, not recommending the complexity now.
- [ ] Skip Turnstile for authenticated **admin** requests — it's redundant with role-gating and
  just adds latency to an interaction meant to feel instant. Concretely: `handleEdit` requires
  `turnstileToken` as a field (`wiki.ts:203`) and verifies it (`wiki.ts:207-214`); make both
  conditional on `ctx.auth.role !== "admin"` (keep it for editors — they're the
  public-submission tier the captcha exists for).
- [ ] Check `WRITE_LIMITER` (the per-user write rate limit in the dispatcher) against the
  expected editing rhythm — frequent small admin saves could plausibly trip it. Either exempt
  admin in the dispatcher's rate-limit step or confirm the current limit is comfortably above
  realistic use before shipping.
- [ ] Reuse `page_locks` — lock the slug for the duration of an inline edit session.
- [ ] **Nice synergy**: since this produces one commit per edit, it's a ready-made feed for the
  already-wishlisted "What changed" timeline (§15) — surfacing admin edits there is close to free
  once this exists.
- [ ] Scope check: garden notes (`content/`) as well as wiki (`content/Wiki/`)? Leon's message
  implies yes ("from any page") — flagging since it's a bigger surface than the wiki editor was
  ever exposed to, including this repo's own docs/config pages if slug resolution isn't restricted
  to `content/`.

---

## 21. Query "type" display + system pages are invisible to the content index — ✅ SHIPPED

**Done** (2026-07-12): `src/config/system-pages-meta.ts` is the pure-data split; `prebuild.ts`
synthesizes a `NoteMetadata` entry per system page not shadowed by a real content file (9 of 24
were synthesized on the current tree — the rest already have companion notes), tagged
`system: true`. `emitGraph` excludes them (no orphan stars), the sitemap includes them (Leon's
call), `InboxPage`/`useRandomNote` were already safe (they filter by the `SYSTEM_PAGES` key set,
not index shape — verified unaffected), and `LinkPreview` skips the body fetch for `system`
entries. `Query.tsx` renders a `classifyLayout()`-driven type pill (game/article/note) in all three
display modes. `npm run check` passes.

Leon: the `<Query sort="-date">` "new additions" list on `index.md` shows only title + date;
wants type (article/note/game) shown as a tag/row, and noted this "may require tracking when new
games/arcade items are added" — correct, and the reason is more fundamental than a missing column.

- [x] **System pages (all arcade games, HeXO, SIGIL, Collider, Apparatus, chess, graph…) have zero
  content-index entries.** `scripts/prebuild.ts` only scans `content/*.md` — it has no awareness
  of `SYSTEM_PAGES` (`src/config/system-pages.ts`) at all. `<Query>` reads `contentIndex`
  (`Query.tsx:87`), so today it is **structurally incapable** of listing a new game as a "recent
  addition" no matter what display changes are made — there's no date, no title, no entry to sort.
- [x] **Fix shape — REVISED 2026-07-12 after a code read**: the original idea ("have `prebuild.ts`
  import `SYSTEM_PAGES`") **doesn't work as written** — every `SYSTEM_PAGES` value holds a
  `lazy(() => import("...Page"))` React component, so a Node script importing that module drags
  React and every page component (and their `.scss` imports, which `tsx` can't resolve) into the
  prebuild process. The elegant fix is a **data/component split**:
  - New pure-data module `src/config/system-pages-meta.ts`: `SYSTEM_PAGE_META: Record<string,
    { layout: "article" | "note" | "game"; title: string; since?: string; loading: string }>` —
    no imports, no React. `since` is a date, manually set when a game ships; most existing ones
    are recoverable from this ROADMAP's own shipped-dates (Snake/Blackjack 2026-06-17,
    HexLife/2048/Sandbox 2026-06-20, SIGIL/Collider/Apparatus 2026-07-03/05).
  - `system-pages.ts` keeps only the `component` map and joins it onto the meta at module scope
    (build-time assert or type-level check that the key sets match, so a game added to one map
    but not the other fails loudly). "One line to add a game" (CLAUDE.md gotcha #6) becomes two
    short lines — one data, one component — still trivially cheap.
  - `prebuild.ts` imports the meta module only (precedent: it already imports `src/lib/slug.ts` —
    gotcha #15) and synthesizes one `NoteMetadata`-shaped entry per system page (`type: "game"`
    for game-layout pages, `date: since`, empty tags/links, **plus a `system: true` marker
    field** — see ripple effects below). §19's `classifyLayout` should also read this meta module
    rather than `SYSTEM_PAGES`, which is why doing §19+§21 in one pass is cheapest.
- [x] **Ripple effects of synthetic index entries — each consumer of the index needs a decision,
  and `system: true` gives them all one cheap filter** (found 2026-07-12; missing any of these
  ships a regression):
  - **`InboxPage` would flood**: ~20 new entries with no tags, no links, no backlinks land
    straight in its untagged/orphaned triage buckets. Filter `system` entries out of Inbox
    entirely — a game is never "incomplete writing."
  - **`graph.json` (`emitGraph`, prebuild) would gain ~20 orphan nodes** with zero links —
    floating disconnected stars in the Constellation. Probably exclude `system` entries from the
    graph (or, later, deliberately link them from an "arcade" hub node — but that's a design
    choice, not a default).
  - **`LinkPreview` / hover excerpts fetch `public/content/<contentPath>.md`** — synthetic
    entries have no `contentPath` and no raw copy. Guard the fetch (skip preview when
    `contentPath` is missing) rather than 404ing.
  - **RSS is already safe** — promotion is opt-in (`published: true` or `Writing/` folder,
    prebuild `emitRss`), synthetic entries qualify for neither. **Sitemap**: include game pages
    (decided by Leon, 2026-07-12 — they're real indexable pages).
  - **`RecentPage` and `<Query sort="-date">` showing games is the entire point** — no filter
    there. **`useRandomNote` already excludes `SYSTEM_PAGES` keys** case-insensitively — verify
    it keeps excluding once entries exist in the index (it checks the slug against the registry,
    not the index, so it should be unaffected).
- [x] **Display fix** (`Query.tsx`): what Leon actually asked for is the resolved *layout*
  (article/note/game), not the content `type` field (book/movie/chatter/philosopher/undefined) —
  those are different axes today. Once games have index entries, showing "game" is easy (their
  `type` literally is `"game"`), but showing "article" vs "note" for everything else means
  running the same classification `NoteRenderer.resolveLayout()` does. This is the same
  `classifyLayout()` extraction as §19 — do it once, use it in both places, then add a small tag/
  pill next to the title in `Query`'s list/grid/table renders. With §19's index `layout`
  passthrough in place, the pill is exactly `classifyLayout(note.slug, note)` per row — no extra
  data fetch. (Note this needs the prebuild `layout` field from §19's prerequisite bullet, or
  explicit-`layout:` articles will show as "note".)

---

## 22. Agent-suggested additions (signed, 2026-07-12 — Leon's call on all of these)

Ideas surfaced while working the above, not requested — housekeeping foresight and a couple of
"could be cool" long-shots. None built; flagging for Leon to accept, reject, or reprioritize.

- [~] **Component/hook test coverage (Vitest + React Testing Library).** Harness shipped
  2026-08-02 and runs inside `npm test`. Initial coverage locks down the singleton auth lifecycle,
  per-window OS error isolation, same-origin OS links, Task Manager restoration, local-file
  deduplication and keyboard-openable Start flyouts. Remaining: broaden into `usePanelClick`,
  `useFocusTrap`, shared hotkeys and the
  highest-risk wiki/chat interactions as those areas change.
- [ ] **Shareable seed/permalink convention across the generative toys.** SIGIL's daily-result
  string idea (§16, `SIGIL-<date>·<optimality>%·<moves>`) is a special case of something more
  general: Apparatus, Collider, and SIGIL are all seeded generators already — a shared `?seed=`
  URL-param convention would make any specific composition/run bookmarkable and shareable across
  all three, for one small shared piece of plumbing instead of three bespoke ones.
- [ ] **Marginalia — visitor-side highlight + private note on essay text.** Fits the site's
  character directly (philosophy essays, sidenotes already exist as the scholarly-annotation
  language) and costs nothing structurally: localStorage-only, no backend, keeps the "garden works
  without Supabase" design law intact. Optional stretch: sync via Supabase for logged-in wiki
  users, later, if ever.
- [ ] **Dependency-freshness check-in.** React 19 / Vite 6 are current now but this project moves
  fast — worth a periodic (quarterly?) `npm outdated` pass so upgrades happen in small deliberate
  steps instead of a big scary jump later. Low priority, just a "remember to" note.

---

## 23. Reader mode: sidenotes get cut off, controls feel disjunctive — ✅ SHIPPED

**Done** (2026-07-12), option (b) as Leon decided: `reader-mode.scss` now only collapses
`.note-layout` to a block; `.article-layout` keeps `display: grid`, with a reader-mode-scoped
`grid-template-columns` override (above the `$article-narrow` breakpoint) that drives the prose
track from `--reader-measure` while keeping the `calc(4rem + 250px)` margin track intact, so the
sidenote float math (`sidenotes.scss`, unchanged) stays valid. `AppShell.module.scss`'s
`.mainPane` reader-mode max-width has a `[data-layout="article"]` override sized for prose +
margin track, not just the prose measure. `ReaderControls` (the fixed bottom pill) is retired;
its steppers + exit/enter toggle moved into a new "Reader" tab in `ThemePanel`, auto-selected when
reader mode is switched on from the System tab. `npm run check` passes; the actual float-math
verification (does the sidenote visibly clip at any `--reader-measure` step, does the ~1300px
handoff look clean) is on Leon's plate per the spec's manual verification checklist — CSS grid math
checked by inspection, not a running browser.

**Root cause of the sidenote clipping (fixed):** `reader-mode.scss` forces `.article-layout {
display: block }` (line 46-48) to collapse the article grid when reader mode is on. But
`sidenotes.scss`'s wide-viewport rule (`@media (min-width: $article-narrow + 1)`, i.e. above
1300px — independent of reader mode, it doesn't check `data-reader`) still applies
`float: right; margin-right: -290px; width: 250px` to every `.sidenote`. That negative margin is
only sane *because* `.article-layout` normally reserves a real `calc(4rem + 250px)` grid track on
the right for it to float into (`article.scss`'s `grid-template-columns`). Once reader mode
switches the container to `display: block`, that track no longer exists — the sidenote still
tries to float 290px right of the (now `max-width: 100%`, reader-measure-driven) prose column, and
sails past the edge of the visible content area. It isn't disappearing, it's floating off-canvas.
- [x] **Fix direction — DECIDED (Leon, 2026-07-12): option (b), keep the floating sidenotes.**
  The archived spec (`docs/archive/specs/2026-07-12-classify-layout-nav-reader-spec.md`, step 6) carries the
  (b) implementation shape — preserve the article grid in reader mode, drive the prose track from
  `--reader-measure`, keep the margin track's width intact so the float math stays valid. The
  original analysis of both options is kept below for context:
  (a) in reader mode, force sidenotes into the same
  treatment `sidenotes.scss` already uses for narrow viewports — `float: none; width: 100%;`
  inline toggle-expand cards — since reader mode is *specifically* a narrower, customizable
  reading measure, treating it like "narrow" rather than "wide" is arguably the more correct model
  regardless of actual viewport width; or (b) keep `.article-layout` as `display: grid` in reader
  mode and only widen/recolumn the prose track via the existing `--reader-measure` var, so the
  margin-column track survives and the float math stays valid. (a) is less code and matches how
  the narrow-viewport case already looks; (b) preserves the "cute" floating sidenotes Leon
  mentioned liking. Worth a quick gut-check with Leon on which look he wants before picking.
  **Concrete shape for (a), the recommended option (2026-07-12 code read):** the narrow-viewport
  treatment currently lives only inside `@media (max-width: $article-narrow)` in `sidenotes.scss`
  (~line 201) — it can't be reused by selector because media queries don't compose with
  `[data-reader]`. Extract those rules (marker/toggle swap, `.sidenote` inline-card styles, the
  `:checked + label + aside` display chain) into an SCSS mixin (e.g. `@mixin sidenotes-inline`),
  then include it from **both** the existing media query **and** a new
  `[data-reader="true"] .article-layout` scope. The mixin must also neutralise the wide-mode
  float rules (`float: none; margin-right: 0; width: 100%` — it already sets these) *and* mirror
  the wide-mode `.footnote-marker[data-content]::after { display: none }` / toggle-visibility
  swap, or reader mode gets the wide markers with narrow cards. Note against (b): reader mode's
  grid collapse (`reader-mode.scss:46-48`) exists because the measure/scale vars drive the pane
  directly — resurrecting the grid means reconciling `--reader-measure` with
  `grid-template-columns` and the TOC column that reader mode hides, i.e. (b) is a layout-system
  change, not a one-liner. Prefer (a) unless Leon specifically wants the floats.

**Controls feel disjunctive** — `ReaderControls` is a fixed bottom-centre pill with its own visual
language (see `ReaderControls.module.scss`), while every other settings surface on the site is the
right-anchored `ThemePanel` (`position: fixed; right: var(--space-8)`), opened by `\`.
`ThemePanel` **already has a tab system** (`activeTab: "system" | "dev"`, `styles.tabs`/
`tabBtn`/`tabContent` — `ThemePanel.tsx:100,174-185`), so folding reader controls in as a third
tab is a small, well-shaped change, not a rebuild:
- [x] Move `ReaderControls`'s width/scale steppers + exit button into a new `"reader"` tab inside
  `ThemePanel`, only shown/auto-selected while `isReaderMode` is true (or always present, greyed
  until reader mode is on — Leon's call on which reads better). Retire the standalone fixed pill.
  Mechanics: widen the `activeTab` union at `ThemePanel.tsx:100` (`"system" | "dev"` →
  `+ "reader"`), add the tab button beside System/Dev; note the System tab **already hosts the
  Reader on/off toggle** (`ThemePanel.tsx:235`) — keep that toggle where it is (it's how you
  *enter* reader mode) and have it auto-select the reader tab when switched on. One judgment
  call: the pill's virtue was being reachable *without leaving the reading posture* (bottom
  centre, no panel). If losing that stings, the compromise is keeping a minimal "Aa" affordance
  that just opens ThemePanel on the reader tab — but default to full retirement first and see if
  it's missed.
- [ ] **Bigger picture, per Leon**: keep growing `ThemePanel` generally as *the* personalization
  and aesthetic-tuning surface for the site — accent/theme/background already live there, reader
  typography would join them, and it's the natural home for anything else in this vein (future
  named theme presets from §15, "garden seasons" ambient theming from §15, etc.) rather than each
  new personalization knob inventing its own floating widget with its own visual language.

---

## 24. Writing health (Leon, 2026-07-12)

Daily-folder rethink confirmed by Leon: the Dataview/Templater notes are local-Obsidian-only
workspace scratch, not draft public writing — plan below stands as the agreed shape.

Goal: turn "What's on my mind" into a real page — a chronological, browsable "peer into my
thinking" feed — merge it with the bare `a place to start writing` page, fold in some of Inbox's
triage functionality, and use the whole thing as a forcing function for writing more often.

**Flagging before building anything**: the literal ask was "make `content/Daily/` visible to the
whole site," but I read a few Daily notes first and they aren't publishable prose — they're
Obsidian workspace templates full of Dataview inline queries (`` $= dv.current().file.ctime...
``), `` ```dataview `` `LIST WHERE file.cday = this.file.cday` blocks, Templater stamps, and
embeds of plugin-powered widgets (`![[Weather]]`, `![[Moon Phase Calculator]]`, `![[NYT Top
Stories]]` — all in the already-excluded `Misc/` folder for exactly this reason). None of that
renders through this site's remark/rehype/MDX pipeline — there's no Dataview or Templater support
here at all, by design (`Daily` and `Misc` are both in prebuild's exclusion list already). Flipping
the exclusion on as-is would ship broken query syntax and dead widget embeds to production. This
looks like genuinely private workspace scratch (task checkbox, calendar, weather, RSS feed) that
should probably stay exactly as private as it is today — separate from the public writing-log
idea, not the same thing wearing a different visibility flag.

The actual "peer into my thinking" content **already exists and already works**: the "What's on my
mind" section on `index.md` — hand-written, dated, prose bullets — is functionally the log Leon is
describing, just living inline on the homepage with no history and no page of its own.

- [ ] **Proposed shape**: a new page (working title "Log", or keep "What's on my mind") that:
  - Absorbs the current index.md section as its most recent entries.
  - Going forward, is fed by short dated entries **that are real prose notes**, not Dataview
    templates — either (a) one growing page appended to over time (simplest, matches the current
    format exactly, just needs an archive/pagination story once it's long), or (b) individual
    dated files in a new clean folder (e.g. `content/Log/2026-07-12.md`) that prebuild indexes
    like any other note — the latter plays nicely with §21's Query type-tagging work (`type:
    "log"` entries would just show up in "Recently added" for free) and gives each entry its own
    permalink/backlink target.
  - Merges with `a place to start writing` (already essentially the Writing-section hub: a
    `<Query filter="folder=Writing">` feed + a curated "what to write" prompt list) into one
    writing hub page.
  - Links from `index.md`'s top nav bar (already has `[[a place to start writing|Enter The
    Garden]]` — if merged, that one link becomes the entry point to the whole hub).
- [ ] **Inbox stays its own page** (Leon: "pretty strong to just check any outstanding issues and
  incomplete notes" as a dedicated destination) — but surface it on the writing hub too, either by
  embedding it directly via the existing `![[Inbox]]` note-embed feature (`remark-wikilinks.ts`),
  or by reusing its underlying flag-counting logic to drive small prompt widgets on the hub itself
  (below) rather than embedding the whole page.
- [ ] **Randomised writing-prompt widget** (Leon's idea, with examples): a small hub widget that
  picks a random line each load, generated from Inbox's existing counts/heuristics — e.g. "*[title]
  is larval, help it grow?*" (from `suggestGrowth`), "*N notes have no frontmatter, you should
  [[Inbox|take a look at that]]*" (from the untagged filter), pulling from orphaned/broken counts
  too. Cute, low-effort (the data already exists in `InboxPage.tsx`, this is just a phrasing layer
  + `Math.random()` pick on load), and it's the actual mechanism that makes the hub *prompt* writing
  rather than just report on it.
- [ ] **Ties into §20** (admin inline editing) once that ships: jump straight from an Inbox flag
  or a prompt widget into editing that note in place, instead of round-tripping through Obsidian.
- [x] **"On this day" stays on `index.md`** — Leon's call: it's nice for new visitors to see the
  site's history on the front page, not moved to the writing hub. Settled, not open.

**A few methodology suggestions** (agent's, take or leave):
- [ ] A gentle, visible-only-to-you cadence indicator on the hub — "N days since the last Log
  entry" — accountability without being punishing, and it's exactly the kind of thing a personal
  dashboard should surface that a public page shouldn't.
- [x] Extend `InboxPage`'s existing `suggestGrowth` heuristic (backlinks + reading-time based)
  with a **staleness lens** — notes untouched for N+ months with few/no backlinks, surfaced as
  "revisit" candidates. Same instinct as this session's codebase stale-file review, aimed at
  content instead of code — a note nobody's linked to in months is the content equivalent of dead
  code, and the Inbox is exactly the place to surface that instead of it being invisible.
  Leon: "sounds good."

---

## 25. Dedicated music player subdomain (Leon, 2026-07-12) — dream feature

Leon, prompted by the §19 music-pause bug: a music player that lives independent of the main
site, poppable and still playing even after leaving the garden entirely — not just the same-tab
Document PiP pop-out that exists today (`usePopoutPlayer.ts`), which is still a dependent child of
the opener tab and dies with it.

**Framing**: this doesn't need a new backend — SoundCloud is already the source of truth, R2
already hosts audio/covers, `music.json` is already the manifest (`docs/music-workflow.md`). What
it needs is a **new frontend surface**: its own subdomain (e.g. `music.subsurfaces.net`) following
the same pattern as `os.subsurfaces.net`/`OSShell` — a dedicated shell with nothing else loaded,
opened as its own tab/window so its lifecycle isn't tied to the garden's React tree at all. That's
what actually delivers "keeps playing after you leave the site" — a genuinely separate origin the
user keeps a tab open on, rather than anything that follows a single tab around.

- [ ] New shell (`MusicShell` or similar) + `VITE_MUSIC_MODE` / hostname detection, matching the
  existing `useShell()` pattern (`"main" | "wiki" | "chat" | "os"` → add `"music"`).
  `MusicProvider`/`MusicContext` already exists and is mostly reusable as-is. One caveat to
  design around: **localStorage is per-origin**, so the garden's persisted settings
  (`garden-settings` key — theme, accent, volume, queue position) will NOT carry over to
  `music.subsurfaces.net`; only the Supabase auth cookie crosses subdomains
  (`VITE_COOKIE_DOMAIN`). Fine for a standalone player (it keeps its own state), just don't
  promise "picks up where the garden left off" without building an explicit handoff (e.g. a
  `?track=&t=` URL param when launching the subdomain from the garden — which is probably the
  right minimal handoff anyway).
- [ ] Decide the relationship to the in-garden `MusicBar`/pop-out: does the subdomain replace the
  pop-out, or do both coexist (quick controls in-garden, full app on the subdomain)? Leaning
  toward both existing — the in-garden bar is for casual listening while browsing, the subdomain
  is for "I just want music running while I do other things all day."
- [ ] **§11's remaining "Music player — extras" wishlist becomes this app's natural feature set**
  once it exists: LPF/HPF filter knobs and the OS player's established slug queue/mix editor.
  Advanced realtime controls make much more sense as first-class UI on a dedicated player page
  than squeezed into the garden's compact `MusicBar`; reuse the queue model rather than forking it.
- [ ] Realtime/effects ideas worth scoping in: a visible LPF/HPF with a big obvious knob (the
  scratch mechanic already proves the audio graph can do real-time parameter changes cheaply), a
  full-page treatment of the existing OS queue/mix view, maybe a shareable "now playing" state if
  that's ever wanted.
- [ ] Not yet decided: whether this is a fully separate Worker (like `omega.subsurfaces.net`'s
  standalone HTML approach) or a lazy-loaded shell within the existing Worker/SPA build, same as
  the other four shells. The latter is far less infra to stand up and is probably right unless
  there's a reason to want it fully decoupled from a garden deploy.

---

## 26. Performance review sweep (Leon, 2026-07-12) — scoping note only, not investigated yet

Leon asked for this to be logged as a future dedicated pass, explicitly not investigated deeply
this session. Scope as requested:
- [ ] **GPU demand of ambient backgrounds** — ten `drawX(ctx, state, config)` canvas modes now
  exist (`BgCanvas.tsx` / `src/config/site-defaults.ts`); worth measuring relative cost per mode
  and whether any want cheaper fallbacks or tighter frame budgets, beyond the reduced-motion/
  hidden-tab/scroll guards already shipped (ROADMAP §4).
- [ ] **Resource-hogging / lingering state generally** — audio contexts, intervals, event
  listeners, or canvas RAF loops that outlive the page/component that started them (the kind of
  bug class the §19 full-reload finding this session would have made hard to notice, since a full
  reload conveniently cleans up anything that was leaking).
- [ ] **General cross-site performance pass** — beyond backgrounds specifically: bundle weight per
  route, hydration/mount cost on the heavier pages (composer, chess, graph), anything worth lazy-
  loading that isn't already. Lighthouse CI (§0/§5) gives a top-line score; this would be the
  deeper, manual follow-up once that baseline is trustworthy.
- Not scoped yet: which pages/modes to prioritize, target metrics, or tooling (Chrome DevTools
  profiling vs. something automated). Leave that to whoever picks this up.

---

## 27. Dream features (signed, agent, 2026-07-12) — genuine long shots, Leon's to wave through or wave off

Asked for explicitly ambitious ones, not scoped for feasibility beyond a gut-check that they'd
build on infra that already exists rather than needing something foreign to the project.

- [ ] **Living garden growth timelapse.** The knowledge graph (`ConstellationPage`/`LocalGraph`,
  D3+PixiJS) already exists as a static snapshot; every note already carries a `date` in the
  content index. A scrubbable timeline that replays the graph growing node-by-node from the first
  note to today — the "digital garden" metaphor taken completely literally, and most of the
  needed data and rendering engine already exist. The ambitious part is purely the scrub/playback
  UI and animating graph layout stability as nodes are added, not new infrastructure.
- [ ] **HeXO self-play spectator arena.** The theory work (τ-pressure, forcing sequences, the
  fork-aware bot in `../hexgo-theory/competition/arena.py`) is real and deep but locked in a dense
  write-up. A live page where the plain-ES bot and fork-aware bot play each other continuously,
  annotated in real time with the actual theory terms (pressure values, threat families) as moves
  happen, turns private research into public spectacle — something to *watch*, not just read
  about. Depends on §10's fork-aware-bot port landing first.
- [ ] **A semantic "ask the garden" query layer.** Embeddings over the content index (Cloudflare
  Vectorize + Workers AI would fit the already-all-Cloudflare infra) so a visitor can ask something
  meaning-shaped ("what have you written about attention and memory?") and get back an assembled
  path through actual notes — clearly labelled as search-that-understands-meaning, not a chatbot
  impersonating Leon. The most technically ambitious item here (new embedding pipeline in
  prebuild, a Vectorize index, a query UI) but it's a genuinely natural fit for a site whose
  flagship essay is *about* attention and computation.
- [ ] **Public marginalia, as a follow-on to §22's private annotation idea.** Once visitor
  highlight+note exists (localStorage-only, §22), the ambitious next step is making it optionally
  social — opt-in, moderated public marginalia on essays tied to wiki accounts, growing into
  something like a lightweight running commentary layer around the text over time. Bigger trust/
  moderation surface than §22, hence kept separate and explicitly a later maybe.
- [ ] **A physical/printable export.** Using the article CSS (dropcaps, sidenotes, the whole
  typography investment) or the Apparatus plate engine, generate a one-off printable zine/poster
  from a curated set of notes — the `pandoc-export` capability already available makes the
  plumbing plausible. Turns the digital garden into something that can, occasionally, become an
  actual object. Charming rather than urgent.

---

## 28. Desloppification sweep (agent code review, 2026-07-25)

A full-tree review pass (`npm test` green at baseline, 6 suites; no `TODO`/`FIXME` anywhere; every
empty `catch` annotated and justified — the slop is concentrated, not diffuse). Fifteen items,
grouped into five phases in **dependency order**: each phase's changes shrink or unblock the next.

Numbering maps 1:1 onto the review's tiers; the dead-code group became its own item (28.10), so
review items #10-#14 land here as 28.11-28.15.

**2026-07-25 — ALL 16 ITEMS SHIPPED.** `npm run check` green end-to-end: 7 test suites, lint
(0 errors / 25 warnings under the ratchet), Worker typecheck, full build. Highlights and the two
places reality differed from the review:

- Phase A: 348 lines of dead code deleted, 181 derived files untracked, the OG landmine closed and
  locked behind a new `scripts/test-og.ts` guard. Writing that guard surfaced a genuine latent prod
  bug outside the reviewed set — logged as **28.16** and fixed in the same pass.
- **28.4 needed a prerequisite the review missed.** The plan was one line of `additionalData` in
  vite.config.ts, but `tokens.scss` emits ~100 lines of `:root` custom properties, so injecting it
  into all ~80 CSS modules would have cloned the theme block into every stylesheet. The breakpoint
  variables were split into an output-free `src/styles/_breakpoints.scss` first; that partial is what
  gets injected. Verified: `dist/assets/*.css` stayed at 294K and the theme block still appears
  exactly twice. Second wrinkle: `additionalData` does NOT reach partials loaded transitively via
  `@use`, so `base.scss`/`article.scss`/`reader-mode.scss`/`sidenotes.scss` import it explicitly.
- **28.9 was half a false positive.** `stripFrontmatter` was real duplication *and* concealed a bug —
  the MDX-pipeline copy used an unanchored `/^---[\s\S]*?---
?/`, which stops at the first `---`
  anywhere including inside a YAML value, eating the top of the note body. Consolidated on the
  anchored version in `src/lib/frontmatter.ts`. But the two `formatDate`s are NOT duplicates:
  `OnThisDay`'s omits the weekday and ignores any time component, `Query`'s includes the weekday and
  renders time + timezone when the raw string has one. Same name, different formatters — left alone,
  same call as the two `formatTimestamp`s.
- **28.3 found more than the 18 suppressions.** With ESLint actually installed there are 25
  `exhaustive-deps` warnings, so ~10 sites had drifted with no suppression at all — and 3 of the
  original 18 suppressed *nothing* (dead directives, now deleted; 15 remain). `reportUnusedDisableDirectives`
  is set to `error` so a lying comment can't recur, and `npm run lint` runs `--max-warnings 25` as a
  ratchet: existing debt is tolerated, new debt fails. Only the React Hooks rules are enabled — a
  broad recommended set over 115 never-linted `.tsx` files would produce hundreds of findings and get
  switched off.
- **28.12 achieved the actual goal**, not just the `any` removal: `BackgroundsConfig` is a mapped type
  over `Exclude<BgMode, "chess" | "hexo">` and `site-defaults.ts` now `satisfies` it, so adding a
  background mode without its config block is a compile error. CLAUDE.md's "adding a mode" checklist
  is type-enforced instead of prose-enforced. 29 `any`s → 0.
- **28.15 exposed 4 real silent failures** where `res.ok` was never checked: a stuck-forever optimistic
  reaction in `ChatRoom`, a chat API key removed from the UI even when the server-side revoke failed,
  un-rolled-back bookmark toggles, and admin lock add/remove that always refetched regardless. The
  helper's throw-on-failure contract fixes them by construction. One call site stays raw `fetch` on
  purpose (`/api/chess/gif` returns a blob, not JSON) and is commented as such; the avatar upload
  needed `api.ts` taught to pass `Blob`/`File` through, since JSON-stringifying a `File` silently
  yields `"{}"`.


**Phase A — dead code + git hygiene** (shrinks the surface every later phase touches)

- [x] **28.10 Dead code: 248 lines, zero importers.** `src/components/ui/chat/ChatSearch.tsx`
  (160 lines, never imported — and `TerminalChatView.tsx:699` reimplements `/api/chat/search`
  inline, so the feature exists twice, once unreachable); `games/BackToArcade.tsx` + its module
  (62 lines, zero references anywhere); `ui/BgModeToggle.module.scss` (26 lines, orphaned — the
  component uses the global `quick-icon-btn` class). Decide wire-up-vs-delete on ChatSearch;
  delete the other two outright.
- [x] **28.1 `public/og/` is gitignored *and* force-committed — silent-failure landmine.**
  `.gitignore:15` ignores the directory; 178 cards are tracked past it (`git add -f`, documented as
  the workaround in `docs/devlog/2026-06-15.yaml:34`). Verified with `git check-ignore --no-index`:
  a *newly generated* card matches the ignore rule. Failure mode: add a note → `PROCESS_OG=true npm
  run prebuild` → new PNG → silently never committed → prod ships a missing OG card with no warning.
  Directly violates §9 / the project's own design law. (Currently latent, not live — 0 untracked
  cards on disk, so the force-add discipline has held.) Also `docs/infrastructure.md:8` asserts the
  opposite mechanism ("generated fresh at CF build time via `PROCESS_OG=true`") and is flatly wrong:
  CF never sets `PROCESS_OG`. Fix: un-ignore, correct the doc, and add a `npm test` guard asserting
  every non-draft content-index entry has a tracked `public/og/*.png`.
- [x] **28.13 Generated artifacts are tracked inconsistently → permanent diff churn.**
  `content-index.json` / `graph.json` / `search-index.json` are ignored, but `folders.json`,
  `slug-map.json`, `broken-links.json`, `image-dimensions.json`, `albums.json`, `sitemap.xml`,
  `rss.xml`, `emotes/index.json` are all prebuild-generated *and tracked* — so every dev run dirties
  the tree. (Baseline `git status` showed `folders.json` + `slug-map.json` modified by nothing but a
  dev run.) Pick one policy and apply it. `music.json` is the deliberate exception and stays tracked.
- [x] **28.14 `src/content/` — 167 generated files tracked, and `prebuild.ts:401` `rmSync`s the
  whole directory on every run.** CLAUDE.md gotcha #1 says never edit them, but tracking them makes
  them look like source; the stray untracked `src/content/Writing/The-Rock-Is-Not-Choosing.md` in the
  baseline working tree is that confusion surfacing. Only argument for tracking is that a bare
  `vite build` (no prebuild) would otherwise ship an empty site — a path CLAUDE.md already forbids
  and `test-package-scripts.mjs` already guards. The one item here with a real (if small) tradeoff.

**Phase B — breakpoint foundation** (28.4 must land before any literal sweep)

- [x] **28.4 ROADMAP §18's breakpoint tokens are ~8% adopted, because they are not in scope where
  they are needed.** `max-width: 800px` hardcoded 21x, `$bp-phone` used 3x; `560px` hardcoded 15x,
  `$bp-panel-narrow` used **0x**. Root cause: `.module.scss` files never `@use` tokens.scss, so the
  variables are undefined there — the convention `breakpoints.ts`' 23-line header documents is
  *structurally impossible* to follow in component modules. Fix is one line of
  `css.preprocessorOptions.scss.additionalData` in `vite.config.ts:104` to inject the token module
  everywhere, then sweep the 36 literals. Everything else in §18's "component-module literal
  migration (over time)" bullet is blocked on this.
- [x] **28.6 `HexLifePage.module.scss:87` mixes the two mechanisms `breakpoints.ts:17` forbids.**
  Uses `@media (max-width: 560px)` where every sibling game page uses `@container panel (max-width:
  560px)`. Consequence: the 290px control panel never reflows inside a narrow panel card, and
  expands to `100vw` (a viewport unit inside a container-scoped box) on a phone even when rendered
  inside a card. One-word fix.
- [x] **28.5 Three implementations of the same phone check.** `usePhoneViewport.ts` (resize
  listener), `AppShell.tsx:34` `useIsMobile` (matchMedia + `useSyncExternalStore`), and
  `BootPage.tsx:286` `useMediaQuery("(max-width: 800px)")`. AppShell's is strictly best — no
  re-render per resize pixel. Move that impl into `usePhoneViewport` over `PHONE_BREAKPOINT` and
  delete the other two.

**Phase C — duplication**

- [x] **28.7 Four HTML escapers with three different coverage sets — a correctness smell, not just
  repetition.** `remark-callouts.ts:79` (no `"`), `remark-telescopic.ts:17` (+`"`),
  `remark-wikilinks.ts:83` (+`"` +`>`), `worker/meta.ts:94` (no `>`). All four build raw HTML
  strings, so the divergence is the actual hazard. One `src/lib/escape.ts` exporting
  `escapeHtml`/`escapeAttr`, shared SPA-Worker-prebuild exactly the way `src/lib/slug.ts` already is
  (precedent: CLAUDE.md gotcha #15).
- [x] **28.8 `hashStr` + `mulberry32` duplicated verbatim** in `lib/sigil.ts:8,17` and
  `lib/composer/rng.ts:13,22`. The rng header justifies it as staying "dependency-free… must not
  pull in DOM or sibling modules", but `sigil.ts` is equally pure and equally headless-tested, so the
  stated rationale doesn't hold. Low priority; both are covered by `test-sigil.ts` / `test-composer.ts`
  so consolidation is safe.
- [x] **28.9 Small duplicate helpers.** `formatDate` in both `mdx/OnThisDay.tsx:11` and
  `mdx/Query.tsx:92`; `stripFrontmatter` in both `WikiMarkdownEditor.tsx:66` and
  `remark-wikilinks.ts:44`. (The two `formatTimestamp`s are *different* functions — a name collision,
  not duplication. Leave them.)
- [x] **28.11 `BgModeToggle.tsx:8-21` is a 5th sync point for adding a background mode.** A 10-case
  switch that only title-cases the mode slug, duplicating `ThemePanel.tsx:19-28`'s `BG_META` labels —
  and they already disagree ("Plate Scan" vs "Plate-scan"). CLAUDE.md's "adding a mode = draw fn +
  `config.backgrounds` block + `BG_CONTROLS` entry + `BG_MODES`/`BgMode`" list doesn't mention it.
  Note §17 already fixed this switch once (it named only 4 of 10 modes) — fixing the duplication
  rather than the symptom is what stops a third visit.

**Phase D — structural** (the two large items; each is a standalone pass)

- [x] **28.15 No client-side API helper.** ~40 hand-rolled `fetch` + `Authorization: Bearer` +
  `Content-Type` blocks across `ChatRoom.tsx` (14 sites), `TerminalChatView.tsx`,
  `ChatSettings.tsx`, `ChatSearch.tsx`, and the wiki pages. 49 client fetches vs 42 `.ok` checks, so
  some paths fail silently — again §9's design law. The Worker got a clean declarative dispatcher
  (§2); the client never got its counterpart. Wants `src/lib/api.ts` with `apiGet`/`apiPost`/
  `apiDelete` that take the token, set headers, check `res.ok`, and throw a typed error.
- [x] **28.12 `BgCanvas.tsx`: 1126 lines, 29 `any`s, `state: any, config: any` on all ten `drawX`
  fns.** A `BgState`/`BgConfig` pair would make CLAUDE.md's "adding a mode" checklist
  *type-enforced* instead of prose-enforced (the same class of fix as 28.11). Splitting the draw fns
  into `src/lib/backgrounds/` would additionally make them headlessly testable like `sigil.ts` /
  `hexo.ts` — but the typing is the win; the split is optional.

**Phase E — make the gates real** (last, so they land on an already-green tree)

- [x] **28.3 18 `// eslint-disable-next-line react-hooks/exhaustive-deps` comments, and no ESLint
  exists.** No config file, no dependency, no script. The suppressions enforce nothing — and worse,
  they mark 18 hand-audited dep lists (`useAuth.ts:119`, `TerminalTitle.tsx:378`,
  `CommandPalette.tsx:101,124`, `useChatScroll.ts:63,72`, …) that no tool can re-verify. The
  `useFocusTrap` regression already in memory is exactly this bug class. Either install
  `eslint-plugin-react-hooks` and make the comments mean something, or strip them as cargo cult.
- [x] **28.2 CI runs neither `npm test` nor `npm run typecheck:worker`.** Only `lighthouse.yml`,
  which happens to run `npm run build` — so `tsc --noEmit` fires incidentally while the *worker*
  typecheck, the one thing VS Code structurally cannot see (CLAUDE.md gotcha #5), is entirely
  ungated. `npm run check` exists and nothing invokes it. Add a workflow that runs it.

**Discovered while implementing Phase A**

- [x] **28.16 OG cards had two competing filename conventions, so social cards 404'd depending on
  URL casing.** `og-gen.ts` named note cards after the content-index key (`Abbas.png`), while
  `og-system.ts` named system-page cards after the lowercase system slug (`arcade.png`) — and the
  Worker built `og:image` from *the casing the visitor happened to use*
  (`ogSlug = slug.replace(/\//g, "-")` over the raw request path). Routes resolve
  case-insensitively but CF serves static assets case-SENSITIVELY (CLAUDE.md gotcha #8), so `/Abbas`
  got a working card and `/abbas` got a 404 — same page, same note metadata, different social image.
  `og:url`/`canonical` had the same defect, splitting one page into two canonicals by inbound-link
  casing. Compounding it, og-gen's `!fs.existsSync(outPath)` skip-check *silently agreed with both
  conventions* on a case-insensitive dev filesystem, so 13 pages that had a lowercase system card but
  a capitalised index key were never generated under the name actually requested — invisible until
  the new guard's coverage advisory printed them.
  Fixed by unifying on lowercase: a single `ogCardName()` in `src/lib/slug.ts` (the module gotcha #15
  already designates as the one place slug semantics may live), consumed by og-gen, og-system, the
  Worker, and the guard; 137 committed cards `git mv`'d to lowercase; the Worker now resolves the
  canonical index key before building meta. Coverage went 165/178 → 178/178 with no image
  regenerated. No lowercase collisions exist among the 177 index keys, so the mapping is injective.

**Deferred — knowingly not done in this sweep**

Recorded so §28 isn't read as exhaustively finished. None of these block the tree; all are
low-stakes and were consciously left rather than missed.

- [x] **The hook-warning ratchet reached zero.** The 25 `exhaustive-deps` warnings were audited and
  `package.json` now runs ESLint with `--max-warnings 0`; 13 targeted suppression comments remain
  for intentionally stable lifecycles, and dead directives are still errors. (2026-08-02)
- [ ] **`BgCanvas.tsx` is still ~1066 lines.** 28.12 typed it (29 `any`s → 0) but deliberately did
  not split it; extracting the draw functions into `src/lib/backgrounds/` was declared out of scope
  so the typing change stayed reviewable. The mapped-type enforcement works either way, so this is
  now purely a file-size question.
- [ ] **Three dead branches inside `BgCanvas`, found during 28.12 and reported rather than fixed**
  (touching them would have mixed behaviour changes into a types-only diff):
  `drawField`'s `"terminal"` branch is unreachable — the dispatcher only ever passes `vectors` or
  `dots`; `drawField`'s `style: string` parameter is never read; and `BgState` carries `Ripple` /
  `Drop` fields nothing writes. Each needs a quick check that no mode is *supposed* to reach it
  before deleting.
- [ ] **61 `!important` declarations in SCSS, 21 of them in `global.scss`.** Observed during the
  review but never made it into a numbered item, so it was never scoped. Each one is a specificity
  fight that was won with a hammer; unpicking them safely needs the cascade understood first, which
  is a bigger job than it looks and is why it isn't a §28 item.

Two things that look like residue but are settled, not deferred: the two `formatDate` functions
stay separate (see the 28.9 note above — different formatters, same name), and the two raw `fetch`
call sites (`/api/chess/gif` returns a blob; `WikiEditPage`'s raw-markdown fetch isn't JSON and
sniffs content-type to detect an SPA fallback) are commented exceptions to gotcha #19, not misses.

---

## 29. SUBSURFACES 95 — personal-machine backlog

The 2026-08-02 continuation shipped the coherent middle layer: Browser vs program
windows, a writable local `H:\MY DOCUMENTS`, real Notepad, grid-reordered desktop
icons, startup document, Task Manager, media player, Paint, Petri, Account bridge, taskbar close,
Escape-to-close, multi-mode screensavers, quiet OS sounds, terminal overlay/tab
completion/paced toys, and the production music/CSP fixes. The implementation and
state boundaries are recorded in `docs/os-95-spec.md` §13.

What remains is deliberately ordered by value and architectural dependency:

1. [x] **★ SOL.EXE.** Self-contained Klondike with keyboard/touch affordances,
   seeded deals, a tiny persisted win counter, and the card-cascade ending. It
   uses the direct program-host contract and adds no garden-wide state.
2. [x] **Native OS logon and first-run home setup.** A post-boot welcome now
   offers native sign-in, create-account and recovery plus an explicit guest
   path. Profile/new-page setup mounts the established wiki surfaces inside OS
   windows; there is still only one auth/API path.
3. [x] **Owner workstation tools.** `new`, `edit` and `admin` keep their existing
   role gates, PR/review boundary and audit surfaces, but now open native OS
   windows from the terminal. No unlogged terminal backdoor was added.
4. [x] **Filesystem v2.** JSON import/restore, directories, quota display,
   conflict handling and visible storage keys ship. Preserve the current split:
   published `C:\GARDEN` is read-only; local `H:` is writable; server publishing
   crosses a visible wiki boundary. Account sync remains deferred until it has
   revisions and an explicit merge model.
5. [x] **Desktop placement v2.** Free 2D grid coordinates, collision resolution,
   marquee selection and keyboard rearrangement ship. The old persisted string
   order remains a migration-safe fallback until an icon is explicitly placed.
6. [x] **Widgets, behind an explicit network/privacy control.** Independent,
   draggable clock/calendar/weather/feed instruments ship. NYT and weather are
   cached at the Worker; custom RSS/Atom URLs and OPML import are browser-local,
   visibly fail on CORS, and all network widgets remain off until enabled.
7. [x] **Cross-shell ARG restore flag.** Recycle Bin restore now writes a
   reversible per-user server flag. The main garden reveals recovered drafts in
   its own control/search only for that reader. Deployment requires applying
   `docs/migrations/2026-08-os-restores.sql`.
8. [ ] **Program-host hardening pass.** Browser-check every `SYSTEM_PAGES` entry
   at narrow, default and maximized sizes; replace remaining page-level `fixed`,
   `100vh` and global Escape assumptions with the host context. Hex Life, the
   cabinet, heXO, Constellation and Filament are adapted; only the full-registry
   visual certification remains.
9. [x] **Window shade and richer task switching.** Double-click title bar rolls
   up; Ctrl/Cmd+` cycles tasks inside the page. Do not reinstate
   Alt+Tab/Alt+F4/Ctrl+Esc interception: those belong to the reader's real OS.
10. [x] **Music workstation ideas.** A Winamp-inspired deck now has peak-hold
    spectrum, phosphor scope, waterfall and radial visualisers; searchable
    Library / Queue / Mixes views; explicit Play Next/Add; duplicate-preserving
    drag reorder; shuffle/repeat/stop; and named mixes. Sessions and queues use
    stable slugs with legacy numeric-playlist migration. The second workstation
    layer adds a shared five-band EQ with HPF/LPF and bypass, 0–8 second
    equal-power crossfade over two coordinated decks, four bounded skins,
    synchronized detachable EQ/visualiser/playlist windows, and lazy WebGL2
    `MELT`/`WARP` feedback modes. Rendering pauses when hidden, caps DPR/frame
    rate, and avoids running both main and detached visualisers. Mix interchange,
    stereo vectorscope, imported skins and sample-accurate gapless playback remain
    explicit follow-ons in the OS spec; editing metadata or uploading audio stays
    an owner workflow inheriting item 3's audit/preview requirements.
11. [x] **Messenger window.** The adapter owns room selection,
    session/token state and a useful logged-out view around the shared `ChatRoom`.
12. [x] **Sound set and ARG ambience.** The synthesized cues now have a
    per-event control panel. The removed 377-line AmbientEngine remains available
    in `2f7963c`, but should return only if it earns its bundle/runtime cost.
13. [x] **Desktop media affordances.** Explorer, Images, MS-DOS Prompt and the
    music player are pinned beside Start. `C:\GARDEN\IMAGES` lists the generated
    media manifest without preloading full-resolution originals and opens the
    shared site lightbox. That viewer now owns wheel/button/keyboard zoom, drag
    panning and album navigation across notes, chat, photography, wiki portraits
    and the OS. An active screensaver carries a quiet now-playing card.
14. [x] **Start-menu consolidation and native Find.** Garden Files (the Explorer
    app), Notepad, Media Player and Task Manager now sit at the top level instead
    of hiding inside Programs. `FIND.EXE` shares the garden overlay's lazy FlexSearch backend,
    adds browser-local `H:` documents without uploading them, scopes by drive,
    and opens results directly in Browser or Notepad.
15. [ ] **Philchat chronicle intake.** When the next content PR arrives, review
    the proposed chatter additions alongside two deliberately coupled follow-ups:
    expand the terminal's interlocutor aliases/persona phrase banks (including
    deterministic coverage for `chat` and `debate`), and enrich the wiki from
    cited Philchat logs and relevant news reports. Preserve the boundary from
    PR #22: survey answers remain self-reported. Log-derived prose needs a
    source trail, privacy/redaction review and a human editorial pass; news
    should be linked and dated rather than silently absorbed as character fact.
    Keep ingestion reviewable—content and chatbot changes may share a PR, but
    no automatic publishing pipeline or unreviewed transcript dump.
    The terminal-only slice landed through PRs #23 and #24: matching, topic
    continuity and repeat suppression are covered deterministically; channel
    additions retain #24 as their quoted/trimmed/invented editorial record; and
    the UI labels every interlocutor as scripted. Cited wiki/news enrichment
    remains open, as does any future per-line source ledger beyond that PR.
16. [x] **OS stabilization and program containment.** Each window now owns an
    error boundary with Retry/Close recovery; one root `AuthProvider` owns the
    Supabase session/profile lifecycle; desktop chrome imports a metadata-only
    lazy app registry rather than the implementation bundle; persisted OS stores
    are versioned; and Vitest/RTL interaction coverage ships in `npm test`.
    The pass also fixed foundation-suit validation, minimized Task Manager
    switching, root-link remounts, full account logoff, same-file Notepad races
    and My Computer's single/double-click preference. (2026-08-02)
17. [x] **Local creative programs.** `PAINT.EXE` is a bounded pixel editor with
    gap-free pencil strokes, eraser, fill, picker, mirror mode, bounded undo/redo,
    a safe versioned `.PXL` format in `H:\MY DOCUMENTS\Pictures`, Explorer/Find
    routing and explicit PNG export. `PETRI.EXE` is a persistent virtual pet with
    seeded temperament, needs, moods and four growth forms; it reacts to care,
    elapsed time, pointer attention, open windows and the shared music session.
    Petri can become dormant but never dies or uses notifications/streaks. Both
    programs are independent lazy chunks with pure hostile-state normalization
    and interaction coverage. Selection/layers/import/animation for Paint and
    accessories/mini-games/desktop roaming for Petri remain bounded follow-ons
    in the OS spec; cloud sync requires an explicit revisions/merge design.
    (2026-08-02)
18. [ ] **FILAMENT: Celestrium simulation bridge.** Export bridge between Celestrium
    (`../astro-theory/`) and FILAMENT (`src/features/filament/`). Ingests real
    observational sky survey queries (Gaia DR3 stellar stream gaps like GD-1,
    CatWISE/DESI quasar number-count dipole candidates), converts 3D celestial coordinates
    into comoving particle coordinates, and renders an interactive diagnostic overlay over
    the evolving $\Lambda\text{CDM}$ dark matter web to measure real cosmic variance and
    test theoretical density signatures against live cosmological simulation.


Verification note: Leon browser-verified the 2026-08-01 OS pass and the taller
main-site terminal. The 2026-08-02 stabilization adds component-level interaction
coverage plus static/compiler/build checks, but the full animated OS matrix is
still open; `npm run dev:os` is the explicit local path, and its pass should
prioritize item 8, logon, widget drag/stacking, Solitaire and production audio
playback from `os.subsurfaces.net`, plus Paint pointer drawing and Petri's
responsive layouts at narrow/default window sizes.

Console follow-up: seed URL canonicalisation now runs after React commit (and
only on the fullscreen terminal), so opening Ctrl/Cmd+P cannot update the router
Transitioner during render. An unapplied optional `os_restores` migration now
reports `available: false` instead of throwing a GET 500; writes remain disabled
until the documented migration is installed. The copied WordPress tracking
pixel in the Accelerationism clipping was removed at its canonical source.
