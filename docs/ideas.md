# Ideas backlog

The creative docket: what's next, what's someday, and what we decided not to
do. The engineering record is [`garden-reset.md`](./garden-reset.md). Status
as of 2026-11-08 (pruned with the owner the same evening).

## The session plan

Roughly one session each, in a sensible order. About **ten sessions** to the
end of this list, give or take the canvas.

1. **Mobile, the whole site.** Work through [`mobile-audit.md`](./mobile-audit.md):
   the sidenote "footnote header" marker, `100vh` → `dvh`, wide tables, the
   dock and Settings as phone sheets (started), CornerMenu tidy.
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
7. **Sky, part 2.** The Haecceity, bottles, an accurate orrery and the moon
   (below).
8. **The 404 roguelike.** Small, abstract, visual, endlessly permutable.
9. **The infinite canvas** (probably two sessions). Built as a room that
   reads the corpus, so it can't break the reader.

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
- **An accurate orrery.** The `orrery` background drawn from real planetary
  positions (low-precision Keplerian elements are plenty) for today's date,
  with the time scrubbable.
- **Weather, more of it.** Fog as a haze, thunder as a rare far-off flash,
  wind bending the falling things. Today: rain and snow only.
- **Pebbles.** One-line marks a reader leaves beside a paragraph, shown
  faintly in the margin. Open question (for session 2): who can post
  (signed-in only, or anyone with a captcha), moderation, and whether they're
  public or just yours.
- **Glorp, further.** Glorp in the OS as the pet (done), peeking in the
  garden (done). Next: an ASCII alien generator (seeded by username) for
  default wiki avatars; glorp reacting to the season and the weather; glorp
  on the 404 page.
- **OS toys** worth keeping: a tiny explorable world with items; a garden
  that grows over real days. (The aquarium and the space game were dropped
  or belong in the arcade.)

## Done

- Reader mode: keys, wider ranges, controls that stay visible, padding under
  the bar, "Show background".
- OS music visualizer; customisable desktop (themes, wallpapers, widgets).
- The dock, the prompt and its site commands (`here toc goto backlinks cite
  share bg accent reader look mode boot season sky glorp trail thread
  ponder`), Settings as one sheet.
- Seasonal flurries, Light follows the sun, live weather (rain, snow).
- Essay cards: thin image strip, typographic body.
- The modes nav (`notes · wiki · os · arcade`); FILAMENT and p(doom) in the
  arcade.
- The OS pet is glorp.

## Decided against (for now)

- **ML playground on the site.** Models are hard to host; if it happens it's
  its own project, linked from the arcade like FILAMENT.
- **Bluesky / AT Protocol feed.** Folded into session 2 as a private social
  space first; federation only if that space wants it.
- **The chat site as it was** (rooms sidebar, terminal view): in cold storage.
