# ROADMAP — digital-garden

Single list of outstanding work. Open items only; shipped work lives in git history,
`docs/devlog/` and `docs/archive/`. Reconciled against the working tree 2026-10-03.

Conventions
- `[ ]` open, `[~]` partly done (the note says what remains), `★` high win for effort.
- Never edit `content/` without asking Leon. `content/index.md` ("What's on my mind") is the
  owner's wishlist; section 14 mirrors it so nothing there is lost.
- Research dependencies live outside this repo: `../hexo-theory/{DIRECTION,SPEC}.md`.
- Docs map: [`docs/index.md`](docs/index.md).

---

## 0. Next up (suggested order)

1. Benchmark the SSG pipeline: Lighthouse FCP/LCP before/after on mobile and desktop (section 5).
2. Mobile pass: footnote/sidenote header, touch-gesture parity, reader-mode controls (section 7).
3. heXO into the arcade cabinet + bot polish (sections 1, 9).
4. Component/hook test coverage: `usePanelClick`, `useFocusTrap`, hotkeys, chat/wiki flows (section 12).
5. Live inline editing for admin, or an Obsidian-side publish path (section 8).
6. Dedicated music subdomain (section 10).

---

## 1. Arcade and games

- [ ] **Generalise heXO zen mode into `GameCabinet`.** `GameCabinet` already has an opt-in `zen`
      prop, but `HexoPage` still owns its own zen state (Esc handler, overlay, bottom bar, wide viewBox).
- [ ] heXO: touch-pinch zoom (wheel only today). Same gap on Collider, SIGIL and graph pages; the
      cabinet should own one touch story.
- [ ] heXO: annotations (`highlights`/`arrows`) are wiped on every move; keep them across a non-placing pan.
- [ ] Revisit back-to-arcade placement (beside the title vs a corner); `BackToArcade` was deleted in the 2026-07 sweep.
- [ ] Add `pdoom.subsurfaces.net` and `bazar.subsurfaces.net` as external cards in `ArcadePage.tsx`
      (StarWeft, Lines of Flight, Anabasis, JANKEN, The Predictor and Lissajous are already there).
- [ ] New games: **Memory Garden** (concentration on note titles/tags/covers/emotes), **Link Ladder**
      (word/concept ladder over linked notes, daily-seeded), **Lights Out / Circuit Shrine** (5x5 toggle puzzle, accent glow).
- [ ] **Specimen-plate memory/matching game** and an **Oracle toy** (click to cast a daily plate with an asemic reading), both from the chamber/Apparatus register.
- [ ] **404 page as a game**: simple, infinitely permutable, abstract/minimal roguelike or nethack-like with upgrades (owner idea, not designed).
- [ ] Chess: public leaderboard (needs a results table). heXO leaderboard pairs with it.
- [ ] Generalise the cabinet's fullscreen/zen affordance to other interactive widgets (graph, chess, music).
- [ ] Shareable `?seed=` URL convention across generative toys (SIGIL, Collider; Apparatus already uses a hash code).

## 2. HeXO research and bot

- [ ] Port a stronger bot to `src/lib/hexo.ts`. First run the asymmetric arena test (`make_fork_aware` vs plain ES) in `../hexo-theory/competition/arena.py`.
- [ ] NP-hardness via 3-SAT: formalise the threat-atom reduction.
- [ ] Headline experiment: description length of strong self-play (`~log N` vs `~N`).
- [ ] Progressions overwrite mode: Garden-of-Eden states, loopy games, gliders.
- [ ] heXO page features never built: move undo, game export, online play.
- [ ] HeXO self-play spectator arena: live bot-vs-bot with tau pressure and threat families annotated.

## 3. Wiki

- [~] **Broken wikilinks.** `public/broken-links.json` (2026-10-01) reports 469 unresolved references across 52 notes,
      335 distinct targets, mostly missing philosopher/concept stubs after the wiki expansion (Schopenhauer, Quine,
      Nagel, Benatar, Sellars, Mill...). Earlier docs claimed 4-5; that was stale. Decide: write stubs, alias, or accept red links; consider a build-time threshold so the count can only go down.
- [ ] Page metadata editing (description, tags) from the wiki editor UI.
- [ ] Watchlist: notify on bookmarked-page edits (needs a Supabase `watchlist` table).
- [ ] Contributor dashboard: recent activity and stats from `edit_log`.
- [ ] Wiki community features: comments, reactions.
- [ ] **GitHub App token** for non-expiring wiki submissions (today: PAT plus a preflight check with a friendly error).
- [ ] Chatter pages (`type: chatter`): "Is this you? Claim this page" button and linked-account display (claim data is already fetched by `WikiInfobox`; the claim/avatar override works, the on-page claim prompt does not exist).
- [ ] "Create your chatter profile" for logged-in users with no claim and no matching page: open `/submit` pre-filled with their username.
- [ ] Show the user's avatar in the `WikiShell` auth header.
- [ ] Wiki content backlog (owner's call): deepen `Map of Philosophy` prose, more Texts / thought-experiment articles, keep Bibliography anchors and `[^key]` footnote definitions complete.
- [ ] Philchat chronicle intake: review chatter additions, expand terminal persona phrase banks, cited wiki enrichment.

## 4. Chat and identity

- [ ] Terminal chat: `/emotes off` (pure ASCII), `/ping` (Realtime round-trip), idle screensaver (replay boot/ASCII; reuse `TerminalTitle` idle snippets), `/filter <pattern>`, copy-as-text/clipboard integration, keyboard-driven reply (arrow-select then Enter).
- [ ] Future chat commands: `/whisper`, `/pepo`, `/remind`.
- [ ] Machine-readable API schema (OpenAPI or similar) on top of [`CHAT-API.md`](CHAT-API.md), plus a raw WebSocket endpoint for `wscat`-style clients.
- [ ] Chat API-key platform overhaul; evaluate an AT-protocol / Bluesky bridge (suggested by a user) and a small private social feed for the wiki/chat community. Owner is not ready to host a public social network.
- [ ] Easter-egg reactions with configurable effects (e.g. confetti via `canvas-confetti`).
- [ ] Idle game (Identity phase 3): cookie-clicker style, avatar "collects" while away, delta computed from `last_login`, capped at 24h. Design TBD; stonks is gone, so it needs a fresh premise.

## 5. Performance and delivery

- [x] SSG pre-render, search index and baked graph shipped 2026-09-12 (see `docs/architecture.md`).
- [ ] **Benchmark SSG**: Lighthouse FCP/LCP comparison on mobile and desktop (the plan's "Phase 4").
- [ ] Verify `NoteBody` un-lazying did not fatten the entry chunk past intent (`dist/assets/index-*.js`).
- [ ] Image optimisation: `sharp` WebP variants plus `<picture>`/srcset (pairs with `image-dimensions.json`).
- [ ] Resource/lingering-state sweep: intervals, listeners, audio contexts on unmount.
- [ ] OG gen: SVG image support (satori cannot load `.svg`; detect and rasterise via `sharp`, or skip).
- [ ] OG gen: generative card per coverless note (seed a motif from the primary tag; extends `og-system.ts`).
- [ ] Trusted Types: evaluate `require-trusted-types-for 'script'` (audit D3 dynamic DOM writes first).
- [ ] `glob@11` deprecation warning on install: update when a dependency releases a fix.
- [ ] Audit icon-only buttons for `aria-label` (many rely on `title=` only).
- [ ] Style debt: 61 `!important` declarations in SCSS; per-game CSS still carries `rgba(255,255,255,N)` literals to migrate to `color-mix(in srgb, var(--color-overlay-tint) N%, transparent)`.

## 6. Garden features and dream bets

- [ ] **Infinite canvas for notes**: freeform spatial branching (mind-map-like), a possible successor to the panel stack. Risky to the site's ontology; owner is deferring until a stronger model is available.
- [ ] Inline backlink mini-map in the article margin (reuse `LocalGraph`).
- [ ] Named theme presets ("terminal amber", "blueprint", "newsprint") setting accent, background style and density together.
- [ ] Time-of-day / seasonal ambient theming from the local clock.
- [ ] Constellation "guided tour" mode; a "what changed" timeline; living garden growth timelapse (scrubbable graph growth).
- [ ] Music-reactive generative art (FFT analyser already available); living visit-decay note visuals.
- [ ] Semantic "ask the garden": Cloudflare Vectorize + Workers AI embeddings over the content index.
- [ ] Marginalia: visitor-private highlights/annotations in localStorage; later a moderated public layer.
- [ ] Printable zine/poster export for curated notes.
- [ ] Generative-art section: a "make your own and share" surface for the toys.
- [ ] More ASCII aliens, cute features and easter eggs site-wide (see `[[the machine-god in the future]]`); an ASCII alien generator, possibly for wiki profiles.
- [ ] "ML playground" for the owner's ML projects, hosted as a separate site and linked from here.
- [ ] Philosophy-computation writing (owner content).

## 7. Mobile and reader mode

- [ ] Mobile: owner feedback that the footnote header is useless and the mobile experience needs work.
- [ ] Touch-gesture parity on canvas/SVG pages: pinch-zoom on heXO, Collider, graph, SIGIL.
- [ ] Full on-device visual sweep of key pages (reflow, touch targets).
- [ ] Reader mode: keep QuickControls visible, widen the text-size and column-width ranges, add a keyboard shortcut to toggle it and to step size/measure.

## 8. Authoring and writing health

- [ ] **Live inline editing for admin**: command-palette "Toggle edit mode" (admin only), direct commit via the GitHub Contents API `PUT`, "saved, live in a few minutes" copy, skip Turnstile for authenticated admin, confirm `WRITE_LIMITER` allows editing cadence, reuse `page_locks`. Alternative the owner prefers: an Obsidian plugin that edits and pushes from the phone.
- [ ] Publish daily notes publicly (`Daily/` is excluded from prebuild today); a daily haiku.
- [ ] A "Log" / "What's on my mind" page absorbing dated thoughts, merged with `a place to start writing` as one writing hub.
- [ ] Writing prompt widget driven by Inbox flag counts; visible cadence indicator ("N days since last entry").

## 9. Terminal (shared `/terminal`, Ctrl+P, OS prompt)

- [ ] Easter-egg commands from the old TempleOS idea bank: `god` (3-7 random poetic words, after F7 "God word"), an ASCII TempleOS elephant scene, an ASCII `temple` scene. (`holyc` and `theme temple` already exist.)
- [ ] ASCII DOOM.
- [ ] Wire a chatbot Eliza persona as its own command if wanted (`chat`/`debate` personas exist in `src/features/boot/chatbot.ts`).

## 10. Music

- [ ] Dedicated `music.subsurfaces.net` shell (independent origin, handoff via `?track=&t=`).
- [ ] Unify the garden player with the OS Media Player: one queue implementation, stable slugs, the EQ/HPF/LPF rack and crossfade (the OS player has them; the garden player has no filter knobs).
- [ ] Scratch first-activation latency: prewarm/cache the AudioWorklet.
- [ ] Media follow-ons: mix rename/duplicate/import/export/sharing, stereo vectorscope, user-authored skins, sample-accurate gapless playback, a player-specific windowshade layout.

## 11. SUBSURFACES 95 (OS shell)

See [`docs/os.md`](docs/os.md).
- [ ] Program-host hardening: browser-check every `SYSTEM_PAGES` entry at narrow/default/maximised sizes; replace page-level fixed-position assumptions.
- [ ] Visual certification of the 2026-08-02 continuation (`npm run dev:os`): logon, widgets, Solitaire, program host, production audio.
- [ ] Account filesystem sync (needs visible revision history and an explicit conflict model first).
- [ ] FILAMENT: Celestrium observational bridge: ingest Gaia DR3 stellar streams / CatWISE-DESI quasar dipole candidates from `../astro-theory` into the comoving simulation buffers with a diagnostic overlay against simulated LCDM.
- [ ] Paint: selection/move, layers, image import, animation, wallpaper handoff.
- [ ] Petri: accessories, mini-games, desktop roaming. Owner wants it reworked as an alien with distinct interactions and animations (it already reacts to music).
- [ ] More OS toys from the owner list: tiny explorable collect-items world, virtual garden that grows, virtual aquarium, alien pet that can be fed/played with/trained. (Visualiser, desktop theming, weather widget, wiki hub are done; the space-exploration game belongs in the arcade.)
- [ ] ARG queue: **Sysop** (continue half a chatbot transcript), **Uninstall** (wizard where every Cancel goes deeper), an OG card that contradicts its note.
- [ ] No pet-to-pet, cloud sync, push notifications, currencies or punitive streaks (deliberate non-goals).

## 12. Tests and tooling

- [~] Vitest + RTL harness exists (auth lifecycle, OS error isolation, Task Manager, Start flyouts, Media pane, Paint, Petri). Add component tests for `usePanelClick`, `useFocusTrap`, hotkeys and high-risk wiki/chat interactions.
- [ ] Optional: tighten or add a Lighthouse budget per route class once the SSG benchmark is in.

## 13. Apparatus (generative plate composer)

See [`docs/apparatus.md`](docs/apparatus.md).
- [ ] True Hershey single-stroke font for labels and the plotter path (`font: "hershey"` exists in the types but the renderer still falls back to mono).
- [ ] More eras: Spectrum, MSX, Teletext, Atari, Hercules mono, Risograph 2-colour.
- [ ] Zoom/pan on the stage; animated plot-in flourish and WebM/GIF export of it.
- [ ] Saved galleries (Supabase `plates` table) and a public gallery.
- [ ] Breeding/lineage: crossover two plates (armature from A, palette from B, motifs from both).
- [ ] Tiny textual DSL that compiles to the IR (`radial { orrery; voxel*3 } --dotted--> margin`).
- [ ] Node-graph patcher (rack paradigm); the trigger to graduate to `composer.subsurfaces.net`.
- [ ] AxiDraw export with pen ordering and travel optimisation.
- [ ] Print-store hookup: contact sheet, pick, hi-res PNG/SVG, product.

## 14. Owner wishlist cross-check (`content/index.md`, 2026-09-27)

Every bullet there maps to a section above: wiki reading/Fontcuberta (content, not code); mobile notes (7); 404 game (1);
reader-mode controls (7); infinite canvas and ontology (6); ML playground (6); ASCII aliens/easter eggs (6);
daily haiku, public daily notes, owner-side adding of notes and the Obsidian plugin (8); social feed / Bluesky (4);
Petri as alien and the OS idea list (11).
