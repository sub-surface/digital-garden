# SUBSURFACES 95 (os.subsurfaces.net)

A windowed, Win95-form desktop that is a second reading interface for the same garden. Code lives in
`src/features/os/`, `src/features/terminal/` and `src/features/boot/`. The original long-form design
spec (phases, ARG plans, media/Paint/Petri contracts) is archived at
[`archive/specs/os-95-spec.md`](archive/specs/os-95-spec.md); this file is the living summary.
Outstanding work is ROADMAP section 11.

## Design laws

1. **Chrome is Win95, documents are the garden.** Title bars, bevels, menus, taskbar and dialogs use 1995 grammar (sharp corners, 2px bevels). The document area renders `<NoteBody>` untouched, in site typography.
2. **The chrome inherits the site theme.** `--os-*` tokens derive from `--color-*` (`_os.scss`), so light/dark and the ROYGBIV accent recolour every window for free.
3. **The wallpaper is `BgCanvas`.** Display Properties is a Win95 front end over the existing `BG_MODES`, theme, accent and `bgOpacity`.
4. **Nothing is lost.** The old endless boot TUI survives as the shared terminal (`/boot` redirects to `/terminal`; "Restart in MS-DOS mode" and the MS-DOS Prompt window use it).
5. **Failure is visible.** A failing program shows a Retry/Close dialog with the real slug/error, never an empty frame.
6. **Reader's real OS wins.** Alt+Tab, Alt+F4 and Ctrl+Esc are not intercepted; Ctrl/Cmd+backtick cycles tasks in-page and Esc closes the active window.

## Shape

- `OSShell` renders `OSBoot` (finite POST, skippable, once per session, reduced-motion aware), then `OSLogon` (sign in, create/recover account, continue as guest), then the desktop: icons with collision-aware grid and marquee select, `Taskbar` (Start with flyouts and a right-hand identity card, per-window close, tray, clock), `ContextMenu`, `DesktopWidgets`.
- **Window manager** (`osStore.ts`, `WindowFrame.tsx`, `useDrag.ts`): drag with a dotted outline (Shift for live), 8 resize grips, title-bar double-click shades, maximise/minimise, z-order focus, dedupe per `(appId, args)` (blank Notepads multi-instance; one editor per local file). Geometry and open windows are session-only on purpose. `activateWindow` owns restore+focus; Log Off owns sign-out + window teardown.
- **Registry rule**: desktop chrome may import `appRegistry.tsx` (metadata and `lazy()` loaders) and `appNavigation.ts`, never `apps.tsx`. Paint, Petri and Solitaire have their own chunks; heavyweight terminal/wiki/chat descendants have nested boundaries. Every window is wrapped in `ProgramBoundary` inside its `WindowFrame`. Add behaviour coverage to `osInteractions.test.tsx`.
- **Mobile**: below `$bp-phone` the OS shows a full-screen "display of 800x600 or greater is required" panel linking to `subsurfaces.net` (via `usePhoneViewport()`).
- **One auth lifecycle**: `AuthProvider` once in `main.tsx`; Profile/New/Edit/Admin windows reuse the wiki components and role gates.

## Programs

Browser (`BROWSER.EXE`, garden notes in chrome), Notepad (editable local files, debounced save plus pagehide flush), Windows Help viewer, My Computer and Explorer (`C:\GARDEN` read-only from `content-index.json` with `.DOC/.TXT/.EXE/.NFO` by layout, `H:\MY DOCUMENTS` writable browser-local with directories, import/export, quota), Find (shared lazy search index plus `H:`), Images (generated media manifest, shared fullscreen viewer), MS-DOS Prompt, Media Player (`MPLAYER.EXE`), Paint, Petri, Task Manager, Messenger (`ChatRoom`), Display Properties, Run, Solitaire, Recycle Bin (draft notes), Account, Owner tools, and direct mounts of `SYSTEM_PAGES` entries (Chess, HeXO, SIGIL, arcade...) inside a bounded program host. `CONSTELLATION.SCR` is the 90s idle screensaver (any screensaver shows a compact now-playing card when music plays). Widgets (clock, calendar, news, weather) are private by default: news/weather make no request until enabled, the Worker caches fixed feeds (`/api/widgets/*`) and rounds weather coordinates.

## Terminal (`src/features/terminal/`)

One module, four frames: `/terminal` fullscreen, Ctrl/Cmd+P overlay on main/wiki/chat, the OS MS-DOS Prompt, and DOS mode. `commands.ts` is one registry (about 38 commands) driving help and completion (a regression test enforces the derivation). Spatial toys are launchers via the `PROGRAMS` map, which Start, Run and the terminal share; text-native toys stay commands. `ctx.open(slug)` navigates on the main site and opens a window in the OS, so no command branches on surface. The command palette moved to Ctrl/Cmd+Shift+P. Attract mode plays the procedural sequence (`bootGenerators`, `useBootPlayback`, `bootSeed`, `bootRng`) and collapses to a prompt on first keypress.

## Contracts

- **Media Player** is a control surface over the single global `MusicProvider` (two streaming decks, one analyser, one effects chain, one output). Five-band EQ + HPF/LPF with click-safe bypass, optional 0-8s equal-power crossfade, Canvas visualisers plus lazy WebGL2 `MELT`/`WARP`, detachable EQ/VIS/PL panes as real windows, four bounded skins, queue and named Mixes keyed by stable track slugs (duplicates allowed). Audio is served through the same-origin range-aware Worker route `/api/music/...`.
- **Paint**: bounded 8-64px local editor, normalised `.PXL` JSON (transparent or six-digit hex cells only) saved under `H:\MY DOCUMENTS\Pictures`, PNG as explicit export. **Petri**: one versioned local record, elapsed-time decay settled on view (capped 30 days, needs floor at five), never dies or punishes, may read the shared music session.
- **Persistence keys** (all versioned, with migration hooks): `subsurfaces95` (settings, widgets, icon order), `subsurfaces95-files`, `subsurfaces95-solitaire`, `subsurfaces95-media` (v2), `subsurfaces95-petri`, plus the shared `music-session`/`music-volume`.
- **Cross-shell recovery**: Recycle Bin writes `os_restores (user_id, slug)`; the main garden reveals the recovered draft via `RecoveredControl`/`useRestoredNotes`. Apply `docs/migrations/2026-08-os-restores.sql` first; without the table GET reports the capability unavailable and Restore is disabled.
- **ARG layer**: shitpost notes appear as files (`README.TXT`, `TRUSTME.DOC`, `GRASS.HLP`, `LEXICON.HLP`, `INBOX.EXE`, `FOUCAULT.EXE`), `draft: true` notes only exist in the Recycle Bin, and the telescopic `readme.1st` assembles a boot seed for `os.subsurfaces.net/?seed=`. Content policy is the puzzle; no new code paths.

## Non-goals

Pixel-perfect Win95, window snapping/tiling/virtual desktops, a server-backed filesystem (`H:` stays small and browser-local; publishing belongs to the wiki), emulating real Win95 apps beyond the joke.

## Run it

`npm run dev:os` (or `VITE_OS_MODE=true`). Keep `src/features/os/` lazy boundaries intact; none of Paint/Petri/Solitaire/`apps.tsx` may land in the main-site or initial OS chunk.
