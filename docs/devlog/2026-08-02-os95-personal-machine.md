# 2026-08-02 — making SUBSURFACES 95 a personal machine

Continuation of `2026-08-01-os95-and-terminal.md`, following Leon's browser
verification. The useful framing was not “add every nostalgic app”; it was to
make the existing desktop internally coherent and pleasant to return to.

## Applications, documents and files

The old seam was conceptual: published notes wore Notepad chrome, while games
mounted the note that happened to contain them. There are now three honest kinds
of window:

- **Browser** renders published garden documents with a centred measure, useful
  margins, a reader mode, and “Open in main site”.
- **Program** mounts the `SYSTEM_PAGES` component directly in a bounded host.
- **Notepad** edits actual local text files on `H:\MY DOCUMENTS`.

The local file store is `zustand/persist` under `subsurfaces95-files`. Saves are
debounced off the keystroke path and flushed on window close/pagehide. Explorer
navigates folders internally, searches the current folder, protects its read-only
address bar from Backspace, and exposes create/open/delete for local files.
Display Properties → Storage tells the reader exactly which keys exist, how many
bytes their files occupy, and offers export/deletion/reset controls. Windows are
still session-only; reopening stale geometry was judged hostile.

Desktop icons can be reordered on their grid and persist in the existing
`subsurfaces95` settings store. The startup document is the garden's `index.md`
(**Subsurface Territories**) and can be disabled. This gives the machine a home
without inventing a second homepage.

## One terminal, everywhere

Ctrl/Cmd+P now opens the shared terminal over garden/wiki/chat; in the OS it
opens the MS-DOS Prompt window. Ctrl/Cmd+Shift+P retains the old command palette.
The OS owns its keyboard handler completely, avoiding double-fired B and avoiding
Alt+Tab/Alt+F4/Ctrl+Esc conflicts with the reader's actual operating system.

The prompt keeps a small SUBSURFACES 95 drive header, uses restrained contextual
colour, completes command arguments as well as command names, and paces the text
toys instead of dumping their frames synchronously. `help` and tab completion
both derive from the exported command registry. `scripts/test-terminal.ts`
checks name/alias uniqueness and executes Help to prove every registered command
is represented, so there is no hand-maintained list to drift.

## Utilities and state

Taskbar entries gained close buttons; Escape closes the focused window. Task
Manager exposes the same window store. A compact, playlist-first media player
uses the existing global music context. Account reflects the existing shared
session and offers role-appropriate wiki/profile/admin routes rather than
creating a parallel authentication system in one pass.

Screen Saver can select the graph or any existing ambient background. Quiet
startup/open/close/notification sounds are synthesized with Web Audio and have
one enable/volume control. The tray popup now says Mute/Unmute; playback belongs
to Media Player.

## Completing the personal-machine backlog

The follow-up moved the remaining roadmap items through the same boundaries:

- A native account/guest screen now sits between boot and desktop. It reuses
  `useAuth`; profile, page creation/editing and the admin workstation mount the
  existing wiki components in windows. The terminal's privileged commands use
  that adapter rather than navigating away or inventing a second API.
- SOL.EXE is real seeded Klondike. The pure deal/rule module is covered by
  `scripts/test-os.ts`; stats stay in their own small persisted store.
- `H:` gained folders, archive import/export, conflict-safe names and quota
  display. Desktop placement moved to persisted 2D cells with swapping,
  marquee selection and keyboard movement. Window shade and Ctrl/Cmd+` task
  cycling remain scoped to the browser page.
- Widgets became four separate minimal instruments: local clock, local calendar,
  opt-in weather and opt-in feeds. They drag independently, persist position,
  right-click to settings, and live below the window z-order. Fixed remote data
  is Worker-cached; custom RSS/Atom/OPML subscriptions stay local and make direct
  browser requests only after the network switch is enabled.
- Recycle Bin restore became a reversible authenticated visibility flag, not a
  content edit. It requires `docs/migrations/2026-08-os-restores.sql`; the main
  garden then exposes only that reader's recovered notes.
- Media Player now has analyser-backed FFT/scope views, queue editing, named
  mixes and repeat modes. Startup/notification cues default on; noisy window
  open/close cues default off and every event has an explicit control.
- Program-host code now contains known full-viewport offenders (heXO,
  Constellation, Filament and the cabinet) and lets internal Escape controls win
  before the OS closes a window. A complete registry browser matrix remains.

## The two production errors

- The CSP now allows `data:` in `font-src`, matching the embedded font emitted by
  rendered content.
- Audio and covers from the committed R2 manifest are rewritten to
  `/api/music/{audio|covers}/…`. The Worker route proxies the fixed R2 host,
  preserves Range/validator headers and supplies one same-origin URL on the main,
  wiki, chat and OS hosts. This removes dependence on an R2 CORS allowlist that
  named only `https://subsurfaces.net`.

## Desktop media follow-through and console cleanup

The taskbar now has a small static quick-launch shelf for Explorer, Images,
MS-DOS Prompt and Media Player; running apps get a tiny accent mark while the
existing task buttons continue to own focus/minimise/close state. Images also
exists as a desktop folder. It reads `image-dimensions.json` as an index and
renders file metadata only, avoiding an accidental gallery request for several
large photographic originals.

Opening an image reuses `ImageLightbox`; no OS-only viewer was introduced. The
shared viewer now zooms toward the cursor, pans by pointer drag, supports
plus/minus/zero and album arrows, and resets on image load. Photography albums
and wiki portraits were moved onto the same component, so the behavior is
site-wide. Screensavers render the active MusicContext track as a passive
now-playing card only while audio is playing.

Three console reports had separate causes:

- `Terminal` called `resolveSeed()` during render, and that helper called
  `history.replaceState`; TanStack Router therefore updated `Transitioner`
  mid-render. Resolution is now pure and canonicalisation is a post-commit
  fullscreen-terminal/boot effect.
- Before the optional restore migration is applied, PostgREST's missing-table
  response is now treated as `{ available: false, restores: [] }`. Restore
  writes remain visibly unavailable rather than pretending they persisted.
- The Accelerationism clipping itself ended with a WordPress analytics-pixel
  Markdown image. It was removed from canonical `content/`; the source link and
  clipping prose are unchanged.

## Start as an identity surface

Start now ends with the expected Log Off action for authenticated readers and a
matching Log On action for guests. Logoff has a native confirmation window,
clears the shared Supabase session and current windows, and returns to the OS
account screen. It deliberately preserves `H:` and machine preferences; the
dialog says so before committing the action.

The right side of Start is a small live profile card rather than another static
submenu. It derives the name, avatar and role from `useAuth`, offers profile,
wiki, owner-only, Documents and Images routes, shows current playback when there
is any, and reports open-window/local-file counts. A guest sees the same local
machine affordances plus the browser-local persistence boundary. This stays
within the spec's Start-menu scope cap: no second hand-maintained content tree
was introduced.

The primary column now treats Explorer, Notepad, Media Player and Task Manager
as utilities rather than making readers hunt through Programs; the flyout keeps
games, Messenger and content applications. `Find: Files or Folders` opens a
native details-view window, and the previously ineffective OS tray-search icon
opens the same app.

Search itself was not copied. The lazy FlexSearch construction, restored-draft
policy and result flattening moved from `SearchOverlay` into
`useContentSearch`. The main garden overlay consumes that hook unchanged, while
the OS adds namespaced `H:` text files in memory, offers all/garden/local scope,
and routes a result to Browser or Notepad. Local content is indexed entirely in
the browser.

## Verification

- `npx tsc --noEmit` — green
- `npm run typecheck:worker` — green
- `npm test` — green, including 52 terminal commands / 73 names
- `scripts/test-os.ts` — seeded deal/rules, feed parsing and missing-schema restore fallback green
- `npm run lint` — green with 23 warnings, one below the inherited 24-warning baseline
- `npm run check` — green after the taskbar/screensaver/images/console/Start follow-up

No preview server was started. Leon verified the taller terminal on the main
site; `npm run dev:os` now selects the OS shell without touching secret-bearing
local env files. The OS continuation still needs one deliberate visual pass,
especially logon, widget drag/stacking, Solitaire, the program registry and
production same-origin audio. Deferred boundaries are sequenced in ROADMAP §29.

## Closing the hook debt and opening the chronicle queue

PR #22 was reviewed and squash-merged as `548aab5`: it expands Ape,
Charlie(Willow) and My Name without filling in anyone's self-reported survey.
ROADMAP §29.15 now records the follow-up boundary for the next Philchat content
PR: cited log/news additions to the wiki may travel with a reviewed expansion of
the terminal interlocutors, but not as an automatic transcript-ingestion path.

The React Hooks ratchet moved from 23 warnings to zero. The fixes preserve the
intended event boundaries rather than mechanically widening dependency arrays:
wallpaper auto-selection still reacts to slug changes only, boot tones and chat
scrolling use fresh callback refs without restarting their long-lived effects,
and the GIF picker has one request owner instead of two. Stable chat, media and
reader callbacks remove needless subscription/effect churn; Ant Farm no longer
queues an unchanged score update every simulation step. CI actions moved to
their Node 24-backed v5 runtimes while the application's explicit Node 20 test
runtime remains a separate migration decision. The lint gate is now
`--max-warnings 0`, and the full `npm run check` gate passes.

The Start-menu label “Windows Explorer” is now “Garden Files”; the underlying
app and `C:\GARDEN` filesystem contract are unchanged.

## Making the interlocutors coherent and explicit

PR #23 replaces substring keyword matching with precompiled word-boundary
patterns, best-rule scoring, standing-topic fallback and per-speaker repeat
suppression. Its deterministic regression suite covers the old `ai`/`again`,
`bot`/`both`, `cause`/`because` and plural failures and now runs in `npm test`.

PR #24 is rebased as a content-only follow-up. Its description remains the
editorial source record: Willow, Ape and HPCR additions are quoted or lightly
trimmed from private channel logs, while Jeh's larger nationalism and drinking
register is deliberately authored caricature. Raw transcripts are not stored.
The terminal now calls every interlocutor a scripted persona so those authored
lines cannot be mistaken for self-reported profile claims. The broader cited
wiki/news chronicle work remains open in ROADMAP §29.15.
