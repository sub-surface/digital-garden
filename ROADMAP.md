# ROADMAP — digital-garden

The **engineering** docket: open technical work only. The creative docket and
the session plan live in [`docs/ideas.md`](docs/ideas.md); the reset's record
is [`docs/garden-reset.md`](docs/garden-reset.md). Anything that is a feature
or a toy goes in `ideas.md`, not here, so the two lists never overlap.
Reconciled against the working tree 2026-11-10.

Conventions
- `[ ]` open, `[~]` partly done (the note says what remains), `★` high win for effort.
- Never edit `content/` without asking Leon.
- Research dependencies live outside this repo: `../hexo-theory/{DIRECTION,SPEC}.md`.

---

## 1. Architecture (from the reset)

- [ ] Typed corpus: the `Doc` union (garden-reset phase 1 remainder).
- [ ] Sanitizer → allowlist: `rehype-sanitize` with a schema for KaTeX, sidenotes, telescopic/callout
      markup, island `data-*` and `VIDEO_FRAME_HOSTS` iframes; only with a corpus diff proving every
      rendered note is unchanged (garden-reset follow-ups).
- [ ] Rooms contract + lint boundary (`defineRoom`), with the background/music state machines:
      one `bgEnabled` + derived effective mode (drop `lastBgMode`/`autoChamberRef`), one `music` state,
      `activeGraphSlug` derived from the route. This is ideas.md session 5.
- [ ] Sweep (phase 8): `activeOverlay`, `GameCabinet` owning zen (HeXO, Collider, SIGIL, Snake and Life
      still carry their own), dependency cuts.

## 2. Content health

- [~] **Broken wikilinks.** `public/broken-links.json` reports 468 unresolved references, mostly
      missing philosopher/concept stubs in the wiki. Decide: write stubs, alias, or accept red links;
      then a build-time ratchet so the count can only go down. Parked 2026-11-10: the owner wants to
      trim the wiki first (fewer, better pages), which will change the count anyway.

## 3. Performance and delivery

- [ ] ★ **Benchmark the static pipeline**: Lighthouse FCP/LCP on mobile and desktop, then a budget
      per route class in `lighthouserc.json`.
- [ ] Image optimisation: `sharp` WebP variants plus `<picture>`/srcset (pairs with `image-dimensions.json`).
- [ ] Resource/lingering-state sweep: intervals, listeners, audio contexts on unmount.
- [ ] OG gen: SVG image support (satori cannot load `.svg`; rasterise via `sharp`, or skip).
- [ ] OG gen: generative card per coverless note (seed a motif from the primary tag; extends `og-system.ts`).
- [ ] Trusted Types: evaluate `require-trusted-types-for 'script'` (audit D3 dynamic DOM writes first).
- [ ] Audit icon-only buttons for `aria-label` (many rely on `title=` only).
- [ ] Style debt: `!important` declarations; per-game `rgba(255,255,255,N)` literals →
      `color-mix(in srgb, var(--color-overlay-tint) N%, transparent)`.

## 4. Mobile (remainder of [`docs/mobile-audit.md`](docs/mobile-audit.md))

- [ ] Touch: one pinch-zoom story owned by the cabinet (heXO, Collider, SIGIL, Constellation;
      wheel-only today); Constellation tap-to-label.
- [ ] Tap-to-peek for wikilinks.
- [ ] Raw breakpoints off `$bp-phone`: QuickControls 700px, article 900px, NoteFooter 900/768,
      MDX cards 600/640/768/960. `vh` left in GameCabinet/Constellation.
- [ ] Full on-device visual sweep of key pages.

## 5. Tests and tooling

- [~] Vitest + RTL harness exists (auth, scroll manager, NoteHtml, reader toggle, prompt, OS). Add
      `usePanelClick`, `useFocusTrap`, hotkeys, and the wiki submit/edit flows.

## 6. Wiki

- [ ] Page metadata editing (description, tags) from the wiki editor UI.
- [ ] **GitHub App token** for non-expiring wiki submissions (today: PAT plus a preflight check).
- [ ] Chatter pages: on-page "Is this you? Claim this page" prompt (claim data is already fetched by
      `WikiInfobox`); "Create your chatter profile" pre-filling `/submit`.
- [ ] Show the user's avatar in the `WikiShell` auth header.
- [ ] Watchlist (Supabase `watchlist` table); contributor dashboard from `edit_log`.
- [ ] Wiki content backlog (owner's call): `Map of Philosophy` prose, Texts / thought-experiment articles.

## 7. Authoring

- [ ] **Owner-side publishing**: an Obsidian plugin that edits and pushes from the phone (preferred),
      or admin inline editing via the GitHub Contents API (reuse `page_locks`, skip Turnstile for admin).

## 8. Arcade and HeXO (engineering)

- [ ] heXO: keep annotations (`highlights`/`arrows`) across a non-placing pan; move undo, game export.
- [ ] Port a stronger bot to `src/lib/hexo.ts` (first the asymmetric arena test in
      `../hexo-theory/competition/arena.py`).
- [ ] Shareable `?seed=` URL convention across generative toys (SIGIL, Collider; Apparatus has one).
- [ ] Chess/heXO leaderboards (needs a results table).
- [ ] New small games if wanted: Memory Garden, Link Ladder, Lights Out.
- Research (in `../hexo-theory`): 3-SAT hardness reduction, description length of strong self-play,
  Progressions overwrite mode, self-play spectator arena.

## 9. Music (engineering)

- [ ] Scratch latency: prewarm/cache the AudioWorklet; profile the scratch path (ideas.md session 3).
- [ ] Unify the garden player with the OS Media Player: one queue, stable slugs, the EQ/filter rack.
- [ ] `music.subsurfaces.net` (independent origin, handoff via `?track=&t=`).

## 10. SUBSURFACES 95 (OS shell)

See [`docs/os.md`](docs/os.md).
- [ ] Program-host hardening: browser-check every `SYSTEM_PAGES` entry at narrow/default/maximised sizes.
- [ ] Visual certification (`npm run dev:os`): logon, widgets, Solitaire, program host, audio.
- [ ] Account filesystem sync (needs visible revision history and a conflict model first).
- [ ] Paint: selection/move, layers, image import, wallpaper handoff.
- [ ] ARG queue: **Sysop**, **Uninstall**, an OG card that contradicts its note.
- Non-goals: pet-to-pet, cloud sync, push notifications, currencies, punitive streaks.

## 11. Apparatus

See [`docs/apparatus.md`](docs/apparatus.md).
- [ ] True Hershey single-stroke font (`font: "hershey"` falls back to mono today).
- [ ] More eras: Spectrum, MSX, Teletext, Atari, Hercules mono, Risograph 2-colour.
- [ ] Zoom/pan on the stage; plot-in animation and WebM/GIF export.
- [ ] Saved and public galleries (Supabase `plates`); breeding/lineage; a textual DSL; node patcher;
      AxiDraw export; print-store hookup.

## 12. Terminal

- [ ] Easter eggs from the TempleOS idea bank: `god`, an ASCII elephant scene, `temple`.
- [ ] ASCII DOOM.

## Parked

- **Chat** is in cold storage (git tag `cold-storage/chat-shell`); its engineering backlog (API schema,
  WebSocket endpoint, extra commands) waits on ideas.md session 2. `TerminalChatView` was pruned.
