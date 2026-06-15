# ROADMAP — digital-garden

Single source of truth for outstanding work, for an agent picking up the repo. Merges the
public wishlist (`content/index.md` "What's on my mind"), the long backlog (`docs/future.md`),
the sequenced/opinionated cut (`docs/iteration-spec.md`), the HeXO research pipeline
(`../hexgo-theory/DIRECTION.md`), and live threads that were only in memory/devlog.

**Conventions**
- `[ ]` open · `[~]` partially done · `[x]` done (kept briefly for context, then pruned)
- `★` = high win-to-effort (from iteration-spec)
- **Do not edit anything in `content/` without asking Leon first.** `index.md` is the site
  landing page — only update it to reflect things that have actually shipped, and only with the OK.
- Detail backers: `docs/future.md` (full backlog by domain), `docs/iteration-spec.md` (rationale
  + proposed shapes), `../hexgo-theory/{DIRECTION,SPEC}.md` (the theory).

Last reconciled against the working tree: 2026-06-15.

---

## 0. Now — sequenced top picks

The iteration-spec's recommended order, pruned to what's actually still open:

1. **Hygiene** (§1) — `AGENTS.md`/`CLAUDE.md` drift is the only one left. Minutes.
2. **Lighthouse CI** (§5) — scoreboard *before* perf work.
3. **Worker split** (§2) then **`ui/` grouping** (§3) — structural; do while fresh.
4. **CLS image dimensions** (§5) + **broken wikilinks** (§7) — highest felt-quality wins.
5. **a11y / keyboard pass** (§4) — the craft layer.
6. **Arcade cabinet shell** (§6) — before any new game.
7. Everything else opportunistically.

---

## 1. Pre-commit hygiene

Most of the original list resolved itself: `.gitattributes` exists (LF normalise + binary
rules), `daily-report.md` is now gitignored, the orphaned pasted image and `.codex/` are gone,
tree is clean. Remaining:

- [ ] **★ `AGENTS.md` vs `CLAUDE.md` drift.** Both tracked, already disagree — `AGENTS.md`
  documents `npm test` / `typecheck:worker` / `check`; `CLAUDE.md`'s Commands block now covers
  these too, so re-verify they match. Pick `CLAUDE.md` as canonical; reduce `AGENTS.md` to a
  one-line pointer (or delete). Two drifting references is worse than one.
- [ ] Document the implicit-prebuild build contract inline in the Commands block (memory
  `build-prebuild-lifecycle`): `build` relies on npm's `prebuild` lifecycle hook; a rename
  silently ships a stale index. `test-package-scripts.mjs` guards the string. *(CLAUDE.md already
  has a "Build note" — confirm it's sufficient, then close.)*

---

## 2. ★ Worker split (highest manageability win)

`src/worker.ts` is ~1900 lines / ~50 handlers in one file. Flagged in `future.md` Tier 0,
deferred pending "a verification deploy to confirm CF handles a multi-file Worker entry."

**Decision: do it, de-risk with one throwaway deploy.** CF bundles via esbuild; multi-file
entries are routine. Proposed shape — thin dispatcher + domain modules, all pure
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

## 3. ★ Group `src/components/ui/` (56 flat files)

Real navigation tax. Churns import paths once; pays back forever. Do *after* the worker split
(separate, mechanical). `tsc --noEmit` catches every miss.

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

Current story (`useHotkeys`): `\` theme, `b` background, `m` music, `Ctrl+K` search, `Esc` (heXO).
Thin and undiscoverable.

- [ ] **`?` opens a keyboard-shortcut cheat sheet** overlay — single source of truth for bindings.
- [ ] **Audit focus management** on every overlay (Search, ThemePanel, WikiAuthModal, zen mode,
  GifPicker, EmotePicker): focus trap while open, `Esc` to close, focus restored to trigger on close.
- [ ] **`aria-label`s on icon-only buttons** — heXO `✕`/`⤢ Zen`, profile SVG, zoom buttons, chat
  controls. Many have `title=` (tooltip) but not `aria-label` (screen reader).
- [ ] **`prefers-reduced-motion`** — BgCanvas (incl. murmuration loop), emote glow, telescopic
  transitions, terminal boot. One `@media` block in `base.scss` + a JS check to skip the bg loop.
- [ ] **Skip-to-content link** (first focusable, visually hidden until focused).
- [ ] **Visible accent-aware focus rings** — verify nothing `outline: none`'s them away.

---

## 5. Performance & Core Web Vitals

- [ ] **★ Lighthouse CI** (GitHub Actions, 95+ desktop) — do *first* so the rest has a scoreboard.
- [ ] **★ Fix CLS — image dimensions.** Gallery, sidenotes, LinkPreview, lightbox images lack
  `width`/`height`. prebuild already reads images for OG — have it emit intrinsic dimensions into
  a manifest the components consume. Biggest *felt* win.
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

- [ ] **`<GameCabinet>` wrapper** — status line, New Game / reset, local-best (localStorage),
  keyboard+touch hint footer, optional zen/fullscreen overlay (generalise heXO's), accent-aware
  win flourish (`data-win`). Game logic stays pure in `src/lib/{game}.ts`.
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
Hex Life, Progressions. Remaining ideas:
- [ ] **Memory Garden** — concentration game on note titles / tags / covers / emotes. No backend.
- [ ] **Link Ladder** — word/concept-ladder seeded from note titles & tags; daily-seedable, no server.
- [ ] **Lights Out / Circuit Shrine** — 5×5 toggle puzzle, theme/accent glow. Very light, mobile-friendly.

---

## 7. Wiki & content polish

- [ ] **★ 35 broken wikilinks** (cluster breakdown in `docs/garden.md`). Finish the cluster;
  consider making prebuild emit a machine-readable broken-link report (or fail above a threshold)
  so the count can only go down.
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

- [ ] **Error boundaries** around each lazy route and the three shells — a thrown render in one
  note shouldn't white-screen the garden; a failed `lazy()` chunk (stale deploy / flaky net)
  currently shows nothing. Add a retry-able fallback.
- [ ] **content-index load failure is silent** (`AppShell` useEffect). If `content-index.json`
  404s, search returns nothing forever with no signal. Surface it.
- [ ] **Supabase-down drill** — confirm the garden fully renders with auth/chat hard-failing
  (block the Supabase domain in devtools, click around). The architecture claims this; verify it.
- [ ] **Unchecked `fetch` in worker handlers** — grep for un-checked `await fetch(`; some return
  500 on `!res.ok`, some swallow.

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
- [ ] **"Random note" button** — jump to a random note. content-index is already loaded in AppShell.
- [ ] **Generative-art section** — `[~]` partially: Boids/Sand/AntFarm/HexLife exist as toys and
  Murmuration is the default bg, but no dedicated "create your own & share" surface.
- [ ] **Philosophy ↔ computation writing** — series of notes; analytic angle + Deleuze's unfinished
  set-theory work. Not started. *(Content — Leon writes; agent doesn't author content unprompted.)*
- [x] Publish HeXO Theory writing — `content/HeXO Theory.md` is live (seedling). Follow-on *series*
  still unwritten (Leon's).

---

## 12. Stonks (Phase 2) & Identity

- [ ] Easter-egg reactions with configurable effects (e.g. confetti via `canvas-confetti`).
- [ ] Secondary stonks market — deliberately deferred; ledger schema already supports it.
- [ ] Idle game (Identity Phase 3) — full design TBD.

---

## 13. OG image gen hardening

- [ ] **SVG image support** — satori can't load `.svg`; detect SVG URLs in `og-gen.ts` and skip or
  rasterise via `sharp`.
- [ ] **External image fetch failures** — `covers.openlibrary.org` fetch fails in the CF build;
  catch per-image and fall back gracefully.
- [ ] **OG caching not working** — `0 cached` on every build; CF builds may not persist the cache
  dir. Investigate the cache-key logic.

---

## 14. Infrastructure & misc

- [ ] **Trusted Types** — evaluate `require-trusted-types-for 'script'`; audit PixiJS/D3 first.
- [ ] **`glob@11` deprecation warning** — track; update when the upstream fix ships.
- [ ] **Detailed codebase documentation** — comprehensive docs pass.

---

## 15. Dream / sweeping bets (none lose anything if skipped)

- **Command palette (`Ctrl+P`)** — superset of search: jump to notes, run actions (theme, bg,
  graph, new game), search content. Store actions all exist; mostly wiring. Could subsume hotkey
  discoverability entirely.
- **Generalised cabinet for all widgets** — graph, chess, heXO, music get the same zen/fullscreen
  + keyboard model.
- **Reading progress + "time to read"** on articles — thin top progress bar. Cheap, felt.
- **Inline backlink mini-map** in the article margin (you have `LocalGraph`) — the note's
  immediate neighbourhood inline, not just on the graph page.
- **Named theme presets** beyond the ROYGBIV cycle — "terminal amber", "blueprint", "newsprint"
  setting accent + bg-style + density together. Triadic palette math already in the store.
- **Music-reactive generative art** — FFT analyser already wired (devlog 2026-06-14 `next:`).
- **Constellation "guided tour" mode** — devlog `next:`.
- **"What changed" timeline** — devlog `next:`.
