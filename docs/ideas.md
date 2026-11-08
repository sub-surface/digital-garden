# Ideas backlog

Owner's ideas worth keeping, collected from the "What's on my mind" section of
`content/index.md` (updated 2026-09-27) and planning conversations. Status is
as of 2026-11-08. The phased engineering plan lives in
[`garden-reset.md`](./garden-reset.md); this file is the creative docket.

## Done (can come off the homepage list)

- **Reader-mode controls**: `f` toggles reader mode, `+`/`-` text size,
  `[`/`]` column width (`src/hooks/useHotkeys.ts`). Wider ranges shipped.
- **OS music visualizer** reacting to playback (Media Player, WebGL modes).
- **OS customisable desktop**: themes, wallpapers (background modes),
  widgets, all persisted locally.

## In the plan

- **Mobile experience** (Synth's notes: the footnote header is useless on
  phones; the site needs a better mobile model generally). Now its own
  phase in `garden-reset.md`.
- **Adding notes from a phone / without opening the site**: the Desk CLI
  (`desk capture`) comes first; an Obsidian plugin that publishes from the
  phone is the natural follow-up, since both write the same markdown.
- **Daily notes / daily haiku in public**: fits the Desk (a "today" slot)
  once it exists.
- **Boot text generator**: keep as an easter egg for now. Later: integrate
  it into the OS properly and give it a cleaner, more modern, futuristic
  design. Part of making the site's "modes" explicit (see below).

## Worth discussing

- **Explicit modes.** The site has several personalities (garden, reader
  mode, OS, terminal attract mode, chamber/game boards) that switch
  implicitly. Making them explicit, named, and switchable from the prompt
  would make the site easier to understand and to build on.
- **Infinite canvas for notes.** A spatial, freeform evolution of the
  Matuschak-style side panels: branch from a note into others on a canvas,
  more mind-map than graph. The owner flagged the risk ("it risks
  destroying everything") — best attempted after the corpus and rooms work,
  as a room that reads the corpus rather than a change to the reader.
- **404 page as a tiny game.** Simple but infinitely permutable: a
  procedural, minimal, visual roguelike with simple controls and upgrades.
- **Essay thumbnails on the homepage.** The owner is unsure about the
  current card thumbnails. To propose alternatives during the creative pass
  (e.g. typographic cards, an epigraph line instead of an image, or a
  reading-time/growth glyph).
- **ASCII aliens everywhere.** More easter eggs and aliens through the site
  (`the machine-god in the future` hosts candidates); an ASCII alien
  generator could double as default wiki profile avatars.
- **The OS pet.** The Petri pet is cute but sloppy: rework as an alien with
  distinct interactions and animations; keep its reactions to music.
- **More OS toys**: a tiny explorable world with items; a virtual garden that
  grows over time; real-world weather; an aquarium.
- **ML playground**: interactive models; hosting is hard, so likely a
  separate project linked from here (like Filament now is).
- **Social feed** for wiki/chat friends (Bluesky/AT Protocol was suggested).
  Not yet; a small private space first. The chat API-key system needs an
  overhaul either way.
