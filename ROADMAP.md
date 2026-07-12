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

Last reconciled against the working tree: 2026-07-12 (post A&D essay publish / sidenotes +
epigraph + dropcap article polish / Inbox page / codebase stale-file hygiene sweep).

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

1. **Mobile breakpoints foundation** (§18) — named breakpoint tokens (SCSS + mirrored
   `src/config/breakpoints.ts`) + the container-vs-media-query ownership rule; unblocks the
   rest of §18 cleanly instead of another one-off point fix.
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
- [ ] **The Predictor: Mass** — orbital escape roguelike (see `downloads/the_predictor_mass_shoggoth_artifact.html`).
  Self-contained single HTML with localStorage-persisted "Core memory" (Markov move predictor) + a shoggoth faction mechanic.
  Too large and complex for the in-garden arcade wrapper model; needs its own shell.
  **Leading option: a dedicated subdomain** — `predict.subsurfaces.net` (or `mass.subsurfaces.net`, `omega.subsurfaces.net`).
  Serve as a standalone Worker with the HTML as the root response — no React/Vite needed.
  Alternatively, could live as an iframe game like The Knotted Field, but it uses `overflow:hidden` on `<html>` for its
  own full-viewport loop, and the sidebar-less "whole screen" contract is cleaner as its own domain.
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

- [ ] **No shared breakpoint source of truth.** Grepped `max-width:\d+px` across `src/styles` +
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
- [ ] **Two responsive mechanisms coexist without a stated rule.** Many game/shelf pages respond
  to `@container panel (max-width: 560px)` (their width inside the panel-stack "note" layout) while
  also carrying plain `@media (max-width: Npx)` rules (viewport width) in the same stylesheet —
  e.g. `TetrisPage.module.scss`, `ConstellationPage.module.scss`, `BlackjackPage.module.scss`. A
  component can be narrow-via-container but wide-via-viewport (or vice versa) depending on whether
  it's rendered as a panel card or a full page, and the two rule sets can silently disagree. Needs
  an explicit rule for which mechanism owns which layout context.
- [ ] **Command Palette has no touch entry point.** It's bound only to `Ctrl/Cmd+P` in
  `useHotkeys` — no button in `QuickControls` or `CornerMenu` opens it. On a touch device with no
  keyboard, "jump to notes / run actions / search content" is simply unreachable. (The `?` cheat
  sheet has the same gap, but is lower-stakes — there's nothing to look up if there's no keyboard
  in the first place.)
- [ ] **`LinkPreview` is mouse-hover only** (`document.addEventListener("mouseover"/"mouseout")`,
  `DELAY = 320`) — no tap/touch path. Probably fine as an intentional desktop-only affordance
  (hover-to-peek doesn't map cleanly to touch), but it should be a stated decision, not a silent
  gap — confirm mobile just navigates straight through with no broken half-behaviour from
  touch-emulated `mouseover` events on first tap (a known mobile Safari/Chrome quirk).
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

- [ ] **Component/hook test coverage (Vitest + React Testing Library).** Today's only tests are
  standalone script checks over pure-logic modules (slug, sigil, composer, footnotes) — there is
  no test harness for React hooks/components at all. §19's `usePanelClick` bug (right layout data
  available, just never consulted) is exactly the class of regression a handful of unit tests over
  `usePanelClick`, `useFocusTrap`, `useHotkeys`, and the new `classifyLayout()` would catch for
  cheap, before they ship. Worth standing up once `classifyLayout()` exists, so it launches with a
  test rather than becoming the next thing that quietly drifts.
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
the same pattern as `os.subsurfaces.net`/`BootPage` — a dedicated shell with nothing else loaded,
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
- [ ] **§11's existing "Music player — extras" wishlist becomes this app's natural feature set**
  once it exists: LPF/HPF filter knobs (BiquadFilter, already scoped there), playlist reordering,
  loop modes. Advanced realtime controls make much more sense as first-class UI on a dedicated
  player page than squeezed into the garden's compact `MusicBar`. Those items don't need to move,
  just noting they're the natural next step here.
- [ ] Realtime/effects ideas worth scoping in: a visible LPF/HPF with a big obvious knob (the
  scratch mechanic already proves the audio graph can do real-time parameter changes cheaply), a
  proper playlist/queue view, maybe a shareable "now playing" state if that's ever wanted.
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
