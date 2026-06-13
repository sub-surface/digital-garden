# Iteration Spec — Love, Care & Attention

A grounded plan for the next passes on the garden. Every item below was checked against the
actual code, not assumed. Cross-reference: [`future.md`](future.md) holds the long roadmap; this
doc is the *curated, sequenced, opinionated* cut — what to do, in what order, and why each one
earns its place.

Status key: `[ ]` open · `[~]` partially done elsewhere · `★` high win-to-effort.

---

## 0. Pre-commit hygiene (do before anything ships)

These are loose threads in the current working tree, not future work.

- [ ] **★ Decide the fate of untracked files.** None are gitignored:
  - `daily-report.md` — skill output, almost certainly not meant for the repo. → gitignore or delete.
  - `content/Pasted image 20260611181432.png` — orphaned paste, no note references it. → delete or wire up.
  - `AGENTS.md` vs `CLAUDE.md` — near-duplicates that *already disagree*: `AGENTS.md` documents
    `npm test` / `typecheck:worker` / `check`; `CLAUDE.md` omits them. Pick one as source of truth.
    Recommendation: keep `CLAUDE.md` canonical, backport the four missing command rows, delete
    `AGENTS.md` (or make it a one-line pointer). Two drifting references is worse than one.
  - `.codex/agents/` — decide if it belongs in version control.
- [ ] **Add a `.gitattributes`** with `* text=auto eol=lf`. The diff is drowning in
  "LF will be replaced by CRLF" warnings on every file Git touches. One file ends the noise and
  prevents a future all-files-changed line-ending commit.
- [ ] **Document the implicit-prebuild build contract** (see memory `build-prebuild-lifecycle`).
  `build` relies on npm's `prebuild` lifecycle hook; a rename silently ships a stale index.
  `test-package-scripts.mjs` guards the string — add a comment row in `AGENTS.md`/`CLAUDE.md` commands.

---

## 1. The worker split (highest manageability win) ★

`src/worker.ts` is **1919 lines, ~50 handlers** in one file. It's already flagged in `future.md`
Tier 0 but deferred pending "a verification deploy to confirm CF handles a multi-file Worker entry."

**Decision: do it, but de-risk it.** CF Workers bundle via esbuild; multi-file entries are routine.
The deferral reason is solvable with a single throwaway deploy.

Proposed shape — a thin dispatcher + domain modules, all pure functions taking `(request, env, url)`:

```
src/worker/
  index.ts        # fetch() entry: route table → delegates, then ASSETS + meta injection
  lib.ts          # jsonResponse, corsHeaders, supabaseRest, ghApi, verifyAuth, buildAuthUser
  meta.ts         # getContentIndex, injectMetaTags, slugFromPathname, esc*  (SSR meta tags)
  auth.ts         # handleAuthMe, handleUpdateProfile, handleAvatarUpload, handleRegister
  wiki.ts         # handleSubmit, handleEdit, createEditPR, handleNew, handleLockStatus, handleUserProfile
  chat.ts         # handleChat{Rooms,Messages,Reactions,Search,Pins,Pin,Ban,Claim,UserMini}
  stonks.ts       # getStonkConfig, writeStonkLedger, processStonkReaction, handleStonkHistory
  keys.ts         # handleApiKeys, hashApiKey
  admin.ts        # handleAdmin
  security.ts     # addSecurityHeaders
```

The dispatcher is the one risk surface; everything else is a cut-and-paste with imports.
Keep the **route ordering identical** (the `/api/keys` before `/api/admin/` ordering matters —
see the recent api-keys aliasing). After the split, `typecheck:worker` is the safety net.

**Bonus once split:** a tiny `routes.ts` array of `{ method, pattern, handler }` would replace the
40-deep `if` ladder in `fetch()` and make the ordering explicit instead of implicit-by-position.

---

## 2. `src/components/ui/` is 56 flat files — group it ★

Also in `future.md` Tier 0, deferred as "pure tidiness." But at 56 files it's a real
navigation tax. Churns import paths once; pays back forever. Suggested grouping:

```
ui/
  chat/      ChatRoom, MessageRow, MessageInput, ChatSettings, TerminalChatView,
             TerminalBootScreen, SideChat, MiniProfilePopup, GifPicker, EmotePicker, ChatAutocomplete…
  wiki/      WikiSubmitPage, WikiEditPage, WikiNewPage, WikiAdminPage, WikiProfilePage, WikiAuthModal, WikiInfobox…
  games/     ChessPage, HexoPage, (future Arcade games)
  shelves/   BookshelfPage, MovieshelfPage, MusicPage, PhotographyPage
  reader/    NoteRenderer, NoteBody, NoteFooter, ArticleLayout, NoteLayout, LinkPreview, TagPage, FolderPage…
  graph/     GraphView, LocalGraph
```

Do this *after* the worker split (separate, mechanical, easy to review). Use a codemod or
find/replace on the `@/components/ui/X` import paths. `tsc --noEmit` catches every miss.

---

## 3. Arcade cabinet shell — unify heXO & Chess, unblock new games ★

`future.md` lists 5 future arcade games (Snake, Blackjack, Memory Garden, Link Ladder, Lights Out)
plus "shared game cabinet shell." heXO just grew zen mode, pan/zoom, and Lichess-style annotations
— all bespoke. Before building game #3, extract the cabinet now so the pattern is set:

- [ ] **`<GameCabinet>` wrapper**: consistent status line, New Game / reset, local-best (localStorage),
  keyboard+touch hint footer, optional "zen/fullscreen" overlay (heXO already has this — generalise it),
  accent-aware win flourish (`data-win`). Game logic stays pure in `src/lib/{game}.ts`.
- [ ] **Generalise heXO zen mode** into the cabinet: the Esc-to-exit handler, the overlay, the
  bottom bar, and the wide viewBox are all reusable. Right now they live in `HexoPage`.
- [ ] heXO polish threads spotted in the new code:
  - The `setPointerCapture` targets the *cell* (`e.target`), not the SVG. Works via bubbling but
    should capture on `svgRef.current` — breaks the moment a child calls `stopPropagation`.
  - The nested `setPan` inside `setZoom` reads `z` from the captured render scope; it's correct but
    deserves a one-line comment, it reads like a stale-closure bug.
  - No touch-pinch zoom (wheel only) — fine for desktop, but the cabinet should own a touch story.
  - Annotations (`highlights`/`arrows`) are wiped on every stone placement (Lichess-style). Intentional,
    but consider keeping them across a *non-placing* pan so a marked-up position survives exploration.

---

## 4. Keyboard & a11y pass — the detail layer that makes it feel crafted ★

Current keyboard story (`useHotkeys`): `\` theme, `b` background, `m` music. Search is `Ctrl+K`.
heXO adds `Esc`. That's a good start but thin and undiscoverable.

- [ ] **`?` opens a keyboard-shortcut cheat sheet** overlay (single source of truth for all bindings).
  Discoverability is the whole game with hotkeys.
- [ ] **Audit focus management** on every overlay (Search, ThemePanel, WikiAuthModal, zen mode,
  GifPicker, EmotePicker): focus trap while open, `Esc` to close, focus restored to the trigger on close.
  Search already autofocuses; verify the rest. This is the single biggest "feels unpolished" risk.
- [ ] **`aria-label`s on icon-only buttons** — heXO's `✕`, `⤢ Zen`, the profile SVG button,
  zoom buttons, chat controls. Many use `title=` (tooltip) but not `aria-label` (screen reader).
- [ ] **`prefers-reduced-motion`**: BgCanvas, emote glow, telescopic transitions, terminal boot
  animation. Honour it globally — one `@media (prefers-reduced-motion: reduce)` block in `base.scss`
  that kills/shortens transitions, plus a JS check in BgCanvas to skip the animation loop.
- [ ] **Skip-to-content link** for keyboard users (first focusable element, visually hidden until focused).
- [ ] **Visible focus rings** that respect the accent palette — verify they aren't `outline: none`'d anywhere.

---

## 5. Performance & Core Web Vitals — finish the threads already started

The recent bundle-chunking work (Supabase isolated, flexsearch lazy) shows this is a live concern.
`future.md` has the matching open items; here's the sequenced cut:

- [ ] **★ Fix CLS — image dimensions.** Already flagged in `future.md`. Gallery, sidenotes, LinkPreview,
  lightbox images lack `width`/`height`, so layout shifts as they load. prebuild already reads images
  for OG; have it emit intrinsic dimensions into a manifest the components consume. Biggest *felt* win.
- [ ] **Image optimisation pipeline**: prebuild → `sharp` → WebP variants + `<picture>`/srcset.
  Pairs with the dimensions manifest (same pass).
- [ ] **Pre-render / SSG** for notes: the worker already does SSR meta-tag injection (`injectMetaTags`).
  Extending to full-content pre-render would make the garden readable without JS and crush LCP.
  Big lift — scope as its own project, but it's the ceiling on perf.
- [ ] **Lighthouse CI** (GitHub Actions, 95+ desktop target) — turns all of the above into a ratchet
  instead of a vibe. Do this *first* so the other items have a scoreboard.
- [ ] Verify the `NoteBody` change that un-lazied `TagPage`/`FolderPage` didn't fatten the entry chunk
  past intent — run `vite build` and eyeball `dist/assets/index-*.js` size before/after.

---

## 6. Resilience — make failure visible, per the project's own design law

Memory + docs both state: *"Make failure visible and explicit, not silent"* and *"each layer must be
independently functional."* Audit against that bar:

- [ ] **Error boundaries** around each lazy route and the three shells. A thrown render in one note
  shouldn't white-screen the whole garden. Today a `lazy()` chunk failing to load (stale deploy,
  flaky network) shows nothing — add a retry-able fallback.
- [ ] **Search/content-index load failure** is silent (`AppShell` useEffect fetch). If
  `content-index.json` 404s, search just returns nothing forever with no signal. Surface it.
- [ ] **Supabase-down drill**: confirm the garden still fully renders with auth/chat hard-failing.
  The architecture claims this; verify it (block the Supabase domain in devtools and click around).
- [ ] **`fetch` error handling in worker handlers** — several do `if (!res.ok) return 500` but some
  swallow. A quick grep for un-checked `await fetch(` in `worker.ts` would find the gaps.

---

## 7. Wiki & content polish

- [ ] **★ 35 broken wikilinks** (tracked in `garden.md`). The prebuild change in this very diff
  (stripping `#fragments` before slugifying) was a step toward this — finish the cluster.
  Make the prebuild *fail the build* (or at least emit a machine-readable report) on broken links
  above a threshold, so the count can only go down.
- [ ] **Page metadata editing from the wiki editor** (description, tags) — `future.md` Wiki.
- [ ] **Watchlist** (notify on bookmarked-page edits) — needs a `watchlist` table; pairs with the
  existing bookmarks + edit_log infra.
- [ ] **Contributor dashboard** — recent activity/stats from `edit_log`.

---

## 8. Terminal-mode finish (it's 90% there)

`future.md` Terminal section has a clean remaining list — all small, all in character:
- [ ] `/emotes off` ASCII-only fallback
- [ ] `/ping` Realtime round-trip latency
- [ ] Screensaver: idle N min → replay ASCII animation (reuse TerminalTitle idle snippets)
- [ ] Documented public API schema + (stretch) a `wscat`-friendly WS endpoint. The API-key platform
  already exists; documenting it unlocks third-party clients, which is a genuinely novel feature.

---

## 9. Dream / sweeping ideas (bigger bets, none lose anything)

- **Command palette (`Ctrl+P`)** superset of search: jump to notes, run actions (toggle theme, cycle
  bg, open graph, new game), search content — one fuzzy surface. The store actions are already all
  there; this is mostly wiring. Could subsume `useHotkeys` discoverability entirely.
- **Shared "cabinet" generalised to all interactive widgets**, not just games — graph, chess, heXO,
  music all get the same fullscreen/zen affordance and keyboard model.
- **Reading progress + "time to read"** on articles; a thin top progress bar. Cheap, felt.
- **Backlink graph mini-map in the article margin** (you have `LocalGraph` already) — show the note's
  immediate neighbourhood inline, not just on the graph page.
- **Theme presets** beyond the ROYGBIV accent cycle: named palettes (e.g. "terminal amber", "blueprint",
  "newsprint") that set accent + bg-style + density together. The triadic palette math is already in the store.
- **OG image gen hardening** (3 open items in `future.md`: SVG support, external-fetch fallback,
  cache actually persisting) — makes shared links look intentional everywhere.

---

## Suggested sequencing

1. **Section 0** (hygiene) — minutes, unblocks a clean commit.
2. **Lighthouse CI** (5.4) — scoreboard before perf work.
3. **Worker split** (1) then **ui/ grouping** (2) — structural, do while the codebase is fresh in mind.
4. **CLS image dimensions** (5) + **broken wikilinks** (7) — highest felt-quality wins.
5. **a11y/keyboard pass** (4) — the craft layer.
6. **Arcade cabinet** (3) — before any new game.
7. Everything else opportunistically.
