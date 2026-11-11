# Ideas backlog

The creative docket: what's next, what's someday, and what we decided not to
do. Technical work lives in [`../ROADMAP.md`](../ROADMAP.md); the reset record is [`garden-reset.md`](./garden-reset.md). Status
as of 2026-11-08 (pruned with the owner the same evening).

## The session plan

Roughly one session each, in a sensible order. About **ten sessions** to the
end of this list, give or take the canvas.

1. **Mobile, the whole site.** Work through [`mobile-audit.md`](./mobile-audit.md):
   the sidenote "footnote header" marker, `100vh` → `dvh`, wide tables, the
   dock and Settings as phone sheets (started), the phone chrome.
2. **philchat as a small social space.** Bring `chat.subsurfaces.net` back
   out of cold storage (git tag `cold-storage/chat-shell`) as a quiet feed
   for friends: profiles, notes and edits as events, pebbles (below). The
   dock keeps the live room.
3. **Music.** Overhaul the turntable (scratching is laggy and sometimes
   buggy; profile the AudioWorklet path), make the player draggable, and give
   it a home of its own at `music.subsurfaces.net` so pop-out doesn't depend
   on the garden (a small Worker serving the player + `music.json`; same R2
   bucket).
4. **The Desk.** `content/desk.md` + a `desk` CLI in the jot/wavify idiom
   (`desk reading "…"`, `desk making "…"`, `desk haiku`), feeding the
   homepage's "On the desk" block (drafted by hand in `index.md` for now).
   An Obsidian plugin later, for the phone.
5. **Rooms + the background state machine.** The rooms contract
   (`defineRoom`), and the remaining audit items: one `bgEnabled` + derived
   effective mode (drop `lastBgMode`/`autoChamberRef`), one `music` state
   (closed / bar / player), `activeGraphSlug` derived from the route.
6. **The prompt as companion, part 2.** `ask <word>` (what the garden says
   about it, as snippets from the search index), `trail pdf` (this visit's
   pages as one typeset PDF, a keepsake), and the new **boot**: a clean,
   modern, futuristic redesign of the procedural boot, reachable from `boot`
   and `mode`.
7. **Sky, part 2.** The Haecceity, bottles and the moon (below). (The
   accurate orrery shipped 2026-11-09.)
8. **The 404 roguelike.** Small, abstract, visual, endlessly permutable.
9. **The infinite canvas** (probably two sessions). Built as a room that
   reads the corpus, so it can't break the reader. It is the natural
   evolution of the site's original idea, Matuschak-style notes opening to
   the side: create a note and branch off spatially, more freeform than a
   mind map, an organic view of the connections rather than a list or the
   graph. Making the ontology flexible is the mandate and the risk ("it risks
   destroying everything"), hence the room boundary.

## Articles to write up (proposed 2026-11-10)

Each grew out of a daily note in `content/Daily/` (now published by
opt-in, `public: true`). Longer pieces for `Writing/`, in rough order of how
ready the material is.

- **A nova nobody saw.** V347 Nor's unrecorded 1943 eruption, found on the
  Harvard plates because a catalogue looked straight at it and logged
  nothing. The site's own theme (the history of images, what is in a picture
  that nobody saw) told through archival astronomy. *Wait for the RNAAS
  submission and the original-plate check;* the daily note
  `14-10-26` is held (`public: false`) until then. Source:
  `astro-theory/docs/manuscripts/v347nor_rnaas.md`.
- **The name goes, the frame stays.** The neuron atlas's identity studies
  (S18 to S21, the persona hunt) as a piece on personal identity: a self that
  survives losing its name because it was never stored in the name. Pairs
  with *Attention & Difference*. Source: `ml/mechinterp/LOG.md`, `RESEARCH.md`.
- **Readers are not controllers.** The general-audience version of the
  atlas: the SHOUT neuron that reads CamelCase, read vs write, clean at 58%
  not 90%, why pre-registration matters when you are hoping. Links the live
  site throughout.
- **Two factories.** swarmachines and p(doom) as games that make AI-safety
  arguments procedurally rather than by preaching; the PhaseOne swarm as a
  case of norms, culture and inherited notes emerging among agents. Careful
  sourcing (METR's report directly, not aggregators).
- **Weight-space programming.** What GPT-6 Astra's edit actually was (a
  rank-one doubt/conclude axis), why the obvious fix failed in the organism and
  one compiled gradient step worked, and the jev question underneath: when is
  a fast calibrated judgement enough? Source: `ml/jev-gate/FINDINGS.md`.
- **Fair coins.** FRACTRAN cryptids for non-mathematicians: why the hard
  ones are hard because they are fair, with playable figures. Wants an island
  (a Hydra walker you can start yourself).
- **Twenty-four, sorted**, as an essay on numerology vs evidence, once the
  paper is out; the margin badges are the story.
- **Hyperstition as a website.** The Numogram site as an argument about how
  the Ccru's ideas want to be presented (computed, not imitated). Sits next
  to `the noumenon has fangs`, which is still in draft limbo.

### More proposals (2026-11-11, from the second sweep of the hub)

- **The audit.** Two projects (jev, Celestrium) were torn down or stripped back after I checked AI-assisted research against its own artifacts. What the failures had in common (grand names, confident documents, thin runs), and the boring routine that catches them. Sources: `jev/REVIEW.md`, the Celestrium P1-P4 audit. Daily notes: 4 Oct (held), 25 Sep.
- **One tile, three dimensions.** A proper explainer of Chair44 with the 3D viewer embedded: the chair, the 192 bumps, the 44 contacts, and why "halve it forever" forces aperiodicity. Daily note: 23 Sep. Needs the viewer moved out of the maths repo.
- **The Newcomb floor.** The Predictor as an argument: legibility as a currency, being modelled as a game mechanic, and what Newcomb's problem feels like when the predictor has your real record. Ties to *Why Risk-Averse Agents Make Deals*. Daily note: 16 Sep.
- **Harmony as a place.** Consonance as a property of timbre (Sethares), the Tonnetz as a torus, negative harmony as a reflection, with Lissajous embedded so every claim can be heard. Daily note: 1 Sep.
- **Solving small games.** JANKEN's seven-cell tablebase and Enclosure's max-flow bot: what you learn about a big game by exhausting a tiny one. Daily notes: 2 Sep, 3 Oct.
- **A table of untrusted players.** Running a tabletop game with a language-model DM, and why prompt injection is a game-design problem. Daily note: 17 Oct (held; needs the server's blessing).
- **A drawing a day.** How the logbook cards are made: a date as a seed, ink motifs, a seasonal wash and an almanac. Short, mostly pictures.
- **The Phil Chat Times.** Not mine to write alone (it is stack's paper), but a piece on making a weekly satirical newspaper from a Discord channel would be a good joint one.

## Someday, written down so they aren't lost

- **The Haecceity.** A little ASCII boat that sails between notes across
  time: it docks at the note you're reading, carries the date of the oldest
  note it has visited, and arrives with a small fanfare (a gull, a bell, a
  wake). Lives along the bottom edge like GlorpPeek, or in the OS.
- **Messages in bottles.** Now and then a bottle washes up on the shore of
  the page; click to read: a line from a note, a pebble someone left, or a
  note from the owner. Could carry real messages between readers later
  (via the social space).
- **The moon.** Draw the current phase (the maths is in
  `src/features/ambience/sky.ts`) in the orrery and the sky: a small moon in
  the corner at night when Light & weather is on.
- **A commonplace book that builds itself.** Every quotation across the
  garden gathered into one room, each with its source, its context, and the
  notes that cite it; hovering a quote anywhere lights up where it lives.
  Built at prebuild time from blockquotes and `<Epigraph>`s.
- **An image wall.** Every image in the garden on one wall, arranged by
  visual likeness (colour and composition, computed at build time) rather
  than by note: images as their own way into the garden, for a site about
  the history of images.
- **Zines.** `trail pdf` (session 6) grown up: any essay or trail typeset as
  a printable zine with `src/lib/textlayout.ts` (even lines, real
  justification), perhaps a seasonal "issue" beside the print shop.
- **Music, further.** Side A / Side B (albums as two sides, a needle drop,
  the run-out groove crackling until you lift the needle); the crate (flick
  through sleeves instead of a list); links to a moment (`music:hello@1:32`
  starts there, so essays can cite a bar); listening mode (the background
  follows the audio: bass tightens the flock, transients bring lightning,
  the rivers quicken).
- **Page transitions** with the View Transitions API: a link's title glides
  into the next page's heading; cards open into notes.
- **Footnote threads.** When a sidenote is highlighted, a hairline draws from
  its marker to the note in the margin.
- **Continue reading.** Long essays remember where you stopped; the bar
  offers "back to §4 · 12 min left".
- **Arcade, on theme.** Darkroom (develop one of the owner's negatives:
  enlarger timer, dodge and burn with the cursor, the print coming up in the
  tray); contact sheet (pick the keeper from a roll with a grease pencil,
  then see the frame that was printed); camera obscura (the webcam through a
  pinhole, upside down and soft); cyanotype (any image as a sun print,
  exposing in real time).
- **Quote cards.** Select a passage: a typeset card (`textlayout.ts`) and a
  link to that sentence (`#:~:text=`).
- **Keys and offline.** `j` / `k` between sections (pairs with the contents
  rail); save an essay for offline reading.
- **Writing, near the ground already walked.** Flusser's *apparatus* against
  the Apparatus composer; latent space as a camera obscura; bokeh and lens
  flare as the machine's signature; a series of one-object essays (the light
  meter, the darkroom timer, the contact sheet).
- **The homepage.** A daily epigraph from the commonplace book; "now on the
  turntable" in "On the desk", driven by the player; three doors (read ·
  look · play) first, the full link list folded beneath; notes per month as
  a strip of sediment.
- **Glorp wanders through a paragraph.** Text that reflows around glorp,
  live, as it drifts across a block of prose (per-line widths from
  `src/lib/textlayout.ts`, the in-house cut of pretext's idea).
- **Telescopic text that reflows smoothly.** When a block expands, each line
  glides to its new place instead of jumping. Needs rich inline layout
  (links, italics) in `textlayout.ts`; the owner can supply pretext's
  rich-inline and line-breaking files for reference. Plan: measure the real
  lines once per tap, animate in CSS.
- **`<Shape>`: prose poured into a silhouette** (an aperture, an eye, a lens),
  via per-line widths.
- **Weather, more of it.** Fog as a haze, thunder as a rare far-off flash,
  wind bending the falling things. Today: rain and snow only.
- **Pebbles.** One-line marks a reader leaves beside a paragraph, shown
  faintly in the margin. **Decided: pebbles are public** (everyone sees
  everyone's). Still open for session 2: who can post (signed-in only, or
  anyone with Turnstile), and moderation (the chat ban model, plus the owner
  hiding a pebble).
- **Glorp, further.** Glorp in the OS as the pet (done), peeking in the
  garden (done). Next: an ASCII alien generator (seeded by username) for
  default wiki avatars; glorp reacting to the season and the weather; glorp
  on the 404 page.
- **More easter eggs.** The site should feel alive and reward curiosity;
  [[the machine-god in the future]] hosts aliens that could turn up around
  the garden.
- **OS toys** worth keeping: a tiny explorable world with items; a garden
  that grows over real days. (The aquarium and the space game were dropped
  or belong in the arcade.)

## Done

- Daily notes, in public (2026-11-10): `Daily/` publishes notes marked
  `public: true`; the homepage's "From the logbook" is a `<Query
  display="log">` over them, and "On the desk" was rewritten around them.
- Mobile pass, P1 + P2 of [`mobile-audit.md`](./mobile-audit.md) (2026-11-08,
  session 1): `dvh`, sidenote markers as the tap toggle, scrolling tables,
  one phone gutter, ragged text, folded TOC, safe areas, keyboard-aware
  dock, 16px inputs, touch
  fallbacks for hover-only controls, device-aware hints in notes
  (`.on-desktop` / `.on-touch`). Index and Housekeeping hints follow suit;
  "On my mind" trimmed, its ideas folded in here.
- The phone chrome is one bottom bar (`PhoneBar`), replacing the fixed title
  strip, the ☰ CornerMenu and the separate music bar: › where you are (the
  prompt), music (now-playing folds into the bar), reader (the bar becomes
  A− / A+ / × reader), and `···` for a sheet with the rest. Hides on scroll
  down, back on scroll up.

- Backgrounds on phones, at desktop proportions (a virtual viewport scaled
  down, 30 fps), and a round of backgrounds (2026-11-09): plate-scan and
  schematic retired; cartography as real contours (marching squares, index
  lines, spot heights); Lorenz became Attractor (six systems in an endless
  cycle, three ribbons showing chaos); dendrite became Lightning; dots in one
  ink; vectors several times cheaper; isometric with more solids and a
  tesseract; the orrery from real orbital elements (today's sky, the zodiac,
  the belt, the Moon, Halley). New typographic modes: prose, sediment,
  palimpsest, rivers, cut-up, concordance, teletype, set with an off-DOM
  layout module (`src/lib/textlayout.ts`) that also evens the lines of
  epigraphs and pull quotes.
- The turntable docks (2026-11-09): on desktop the player is the dock's
  third tab instead of floating over the page; turn the record over for the
  sleeve (catalogue line, liner notes from `content/Music/`, where the garden
  mentions it, SoundCloud).
- Contents, reworked (2026-11-09): no stroke, a faint ground, subsections
  folded with the one you're reading opening by itself. Essays on wide
  screens keep it in the right margin level with the header (sharing the
  sidenotes' edge, never displacing one), then a rail of ticks beyond the
  margin that unfolds on hover; phones get one folded line.
- The browser lays things out (2026-11-09): scroll-timeline reading progress,
  anchor-positioned link previews, `field-sizing` chat boxes, folding
  sidenote cards and TOC, keyboard via `interactive-widget`.
- Reader mode: keys, wider ranges, controls that stay visible, padding under
  the bar, "Show background".
- OS music visualizer; customisable desktop (themes, wallpapers, widgets).
- The dock, the prompt and its site commands (`here toc goto backlinks cite
  share bg accent reader look mode boot season sky glorp trail thread
  ponder`), Settings as one sheet.
- Seasonal flurries, Light follows the sun, live weather (rain, snow).
- Essay cards: thin image strip, typographic body.
- The modes nav (the rooms you're not in: notes, wiki, os, arcade); FILAMENT
  and p(doom) in the arcade.
- Link previews read the built note (no runtime markdown), quieter card.
- Housekeeping brought up to date, with the commit history linked.
- The OS pet is glorp.

## Decided against (for now)

- **ML playground on the site.** Models are hard to host; if it happens it's
  its own project, linked from the arcade like FILAMENT.
- **Bluesky / AT Protocol feed.** Folded into session 2 as a private social
  space first; federation only if that space wants it.
- **The chat site as it was** (rooms sidebar, terminal view): in cold storage.
