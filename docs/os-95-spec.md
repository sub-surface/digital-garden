# SUBSURFACES 95 — OS shell spec

**Status:** draft → in progress
**Created:** 2026-08-01
**Scope:** overhaul `os.subsurfaces.net` from a fullscreen TUI into a windowed,
Win95-form desktop that hosts the garden's own notes, system pages, and features.

---

## 1. Premise

`os.subsurfaces.net` currently renders one thing: `BootPage`, an endless procedural
TUI. This spec keeps that work intact and puts a desktop *after* it.

The sequence a visitor gets:

1. Cold boot — a **finite** POST (memory count, device enumeration, disk spin-up).
2. A splash.
3. A desktop: wallpaper, icons, taskbar, Start menu.
4. Windows that open, drag, focus, minimise, maximise and close — each one
   rendering real garden content.

The OS is not a museum piece. It is a **second reading interface for the same
garden**, wearing Win95's form because that form is the most legible windowing
metaphor ever shipped, and because it is funny.

---

## 2. Design laws

These are load-bearing. Violating one produces the bad version of this project.

### 2.1 Chrome is Win95. Documents are the garden.

Win95 applications had a hard split: grey bevelled **chrome** around a white
**document canvas**, and the document rendered in *its own* typography. WordPad
did not force your document into MS Sans Serif; it framed it.

So:

- **Chrome** — title bars, bevels, menu bars, status bars, scrollbars, taskbar,
  buttons, dialogs. Pixel-grammar of 1995. Sharp corners, 2px bevels, no
  border-radius anywhere, no shadows except the drag outline.
- **Document area** — an inset-bevelled surface containing `<NoteBody>`,
  rendered exactly as it is on `subsurfaces.net`. Playfair headings, IBM Plex
  body, sidenotes, KaTeX, telescopic text, callouts, MDX components. **Untouched.**

This is the entire answer to "how do we render MDX elegantly in Win95 apps."
We do not restyle MDX. We frame it. Restyling would mean fighting the whole
garden stylesheet and would make essays unreadable; framing is both zero-effort
and *more* period-accurate.

> The only concession: `.os-doc` sets a slightly tighter max-width and drops the
> article grid's right margin column, since a 900px article grid does not fit a
> 620px window. Sidenotes fall back to their existing narrow-viewport behaviour —
> the checkbox/label/aside toggle that already exists (CLAUDE.md gotcha #7). No new
> sidenote code.

### 2.2 The OS inherits the site's theme.

**Not** hardcoded `#c0c0c0`. The chrome derives from existing tokens, so light
mode, dark mode, and the ROYGBIV accent cycle all work in the OS for free.

```scss
// src/features/os/os-tokens.scss
--os-face:         var(--color-bg-surface);
--os-face-raised:  color-mix(in srgb, var(--os-face) 92%, var(--color-text));
--os-bevel-light:  color-mix(in srgb, var(--os-face) 65%, white);
--os-bevel-dark:   color-mix(in srgb, var(--os-face) 65%, black);
--os-bevel-darker: color-mix(in srgb, var(--os-face) 35%, black);
--os-doc-bg:       var(--color-bg);
--os-title-active: linear-gradient(90deg,
                     var(--color-accent-base),
                     color-mix(in srgb, var(--color-accent-base) 45%, var(--color-bg)));
--os-title-idle:   color-mix(in srgb, var(--color-text-muted) 40%, var(--os-face));
```

The Win95 title bar gradient — navy fading to blue — is *exactly* the right home
for the site accent. Cycling the accent recolours every window title bar. Dark
mode gives you the "Windows Standard (High Contrast Black)" scheme for free.

Two mixins carry the whole look:

```scss
@mixin bevel-out { border: 2px solid; border-color: var(--os-bevel-light) var(--os-bevel-darker) var(--os-bevel-darker) var(--os-bevel-light); }
@mixin bevel-in  { border: 2px solid; border-color: var(--os-bevel-darker) var(--os-bevel-light) var(--os-bevel-light) var(--os-bevel-darker); }
```

### 2.3 The desktop wallpaper is `BgCanvas`.

Not a bitmap. The existing ambient canvas — murmuration, orrery, chamber,
schematic, the lot — renders behind the desktop at z-index 0, exactly as it does
on the main site. `bgOpacity` still applies. Right-click the desktop →
**Properties** opens a Display Properties dialog that is a Win95-chromed front
end for the *existing* `BG_MODES` list and `ThemePanel` controls.

That is the joke landing perfectly: Display Properties → Background, and the
options are "Murmuration", "Orrery", "Bubble Chamber".

### 2.4 Nothing is lost.

The endless TUI is good work and stays reachable:

- **MS-DOS Prompt** app — a window running the existing `BOOT_COMMANDS` registry.
- **Start → Shut Down → Restart in MS-DOS mode** — drops to the current
  fullscreen endless `BootPage`, unchanged.
- `/boot` on the main site keeps working exactly as today.

### 2.5 Failure is visible.

House law. A window whose note fails to load shows a Win95 error dialog with the
real slug and a red-circle icon — not an empty frame. `NoteBody` already renders
`<NotFound />`; the OS wraps it in chrome rather than swallowing it.

---

## 3. What already exists (reuse map)

The reason this is tractable. Almost nothing here is new rendering work.

| Need | Already exists | Notes |
|---|---|---|
| Render a note in a box | `NoteBody` | Slug in, MDX out. Case-insensitive resolve, `SYSTEM_PAGES` handling, `music:` link interception, telescopic handlers. |
| A floating card with a title bar | `PanelCard` | Title, close, promote, scrollable content. A Win95 window is this with new chrome + free positioning. |
| Apps (chess, HeXO, arcade, shelves…) | `SYSTEM_PAGES` | `NoteBody` already mounts every registry entry. Each becomes an OS app for free. |
| A command shell | `BOOT_COMMANDS` (~60 cmds) | `ls`, `cat`, `find`, `tags`, `random`, `whoami`, `play`, `calc`, `maze`, `life`, `orbit`, `matrix`, `whois`, `edit`, `neofetch`… Powers MS-DOS Prompt **and** Start → Run. |
| A file system | `content-index.json` + folder tree | Folders → directories, notes → files. `FolderPage` already walks it. |
| Boot sequence | `src/features/boot/*` | Timing-free generators + `useBootPlayback` owning clocks. A finite variant is an addition, not a rewrite. |
| Wallpaper | `BgCanvas` | Drop in at z-0. |
| Music player | turntable + `music.json` | Becomes Media Player. |
| Chat | `ChatRoom` | Becomes an IM window. |
| Graph | `ConstellationPage` | Becomes `CONSTELLATION.SCR`, the idle screensaver. |
| Theme plumbing | store `theme`/`accentBase`/`bgMode`/`config` | Display Properties is a reskin of `ThemePanel`. |

---

## 4. Boot → desktop handoff

`bootTypes.ts` is explicit that "generators describe what should happen, while
useBootPlayback owns clocks." That separation is what makes this cheap.

**New:** `src/features/boot/bootPost.ts` — a *finite* `SnippetFactory` sequence:

```
SUBSURFACES BIOS v4.7.1 — © 1995 Psychograph Systems
Memory Test: 16384K OK
Detecting IDE Primary Master ... GARDEN (C:)
Detecting IDE Primary Slave  ... WIKI (W:)
Detecting IDE Secondary      ... CHAT (X:)
Verifying DMI Pool Data ......
Starting Subsurfaces 95...
```

- Emits a bounded event list, then resolves.
- `BootPage` gains an optional `mode: "endless" | "post"` prop. Default stays
  `"endless"` so `/boot` and every existing entry point are untouched.
- `OSShell` renders `<BootPage mode="post" onComplete={…} />`, then a splash,
  then `<Desktop />`.
- **Skip:** any keypress or click during POST jumps to the desktop. Respect
  `prefers-reduced-motion` by skipping to the splash immediately.
- **Once per session:** `sessionStorage` flag, so a reload inside the OS does not
  replay the boot. Start → Shut Down → Restart clears it.

---

## 5. Window manager

The only genuinely new engineering, and it is small.

### 5.1 Store slice — `src/store/os.ts`

```ts
export interface OSWindow {
  id: string            // nanoid
  appId: string         // key into APPS
  args?: Record<string, string>   // e.g. { slug: "writing/on-diagrams" }
  title: string
  icon: string
  x: number; y: number
  w: number; h: number
  z: number
  state: "normal" | "minimized" | "maximized"
  /** Pre-maximize geometry, restored on un-maximize. */
  restore?: { x: number; y: number; w: number; h: number }
}
```

Actions: `openWindow`, `closeWindow`, `focusWindow`, `moveWindow`,
`resizeWindow`, `setWindowState`, `cascade`.

- **Persistence:** deliberately **not** in `PERSISTED_KEYS`. A restored desktop
  full of windows from three weeks ago is hostile. Session-only.
- **Focus:** `focusWindow` bumps `z` to `maxZ + 1`. Focused window gets
  `--os-title-active`; all others `--os-title-idle`.
- **Dedupe:** opening an already-open (appId, args) pair focuses the existing
  window rather than spawning a duplicate. Exception: Notepad, which is
  multi-instance.

### 5.2 Components — `src/features/os/`

```
os/
  OSShell.tsx           desktop root: BgCanvas + icons + WindowLayer + Taskbar
  Desktop.tsx           icon grid, marquee select, right-click menu
  WindowFrame.tsx       chrome: title bar, min/max/close, resize grips, focus
  WindowLayer.tsx       maps store windows → WindowFrame
  Taskbar.tsx           Start button, task buttons, tray, clock
  StartMenu.tsx         the blue sidebar, cascading submenus
  apps/                 one thin module per app (see §6)
  os-tokens.scss        theme-derived bevel/face/title variables
  OS.module.scss        chrome
  useDrag.ts            pointer-events drag + resize, no library
```

### 5.3 Interaction details that make it feel real

- Drag by title bar. Double-click title bar = maximize toggle.
- Resize from all four edges + corners (8 invisible 4px grips).
- **Drag outline:** while dragging, show a 2px dotted inverted outline and move
  the window on release — the authentic Win95 behaviour, and it is also cheaper
  than repainting an MDX document at 60fps. Hold `Shift` for live drag.
- Windows clamp to the desktop; the title bar can never leave the viewport.
- Cascade new windows at 24px offsets (`PanelCard` already does exactly this).
- `Alt+Tab` cycles. `Alt+F4` closes focused. `Ctrl+Esc` opens Start.
- Minimize animates to its taskbar button.

---

## 6. Apps

Each app is a thin wrapper. `APPS` is a registry keyed by `appId`, in the spirit
of `SYSTEM_PAGES` — adding an app is one entry.

```ts
interface OSApp {
  id: string
  title: string | ((args) => string)
  icon: string
  defaultSize: { w: number; h: number }
  menus?: MenuSpec[]          // File / Edit / View / Help
  statusBar?: (args) => string
  component: React.LazyExoticComponent<React.ComponentType<AppProps>>
  multiInstance?: boolean
}
```

| App | Filename | Implementation |
|---|---|---|
| **Notepad** | `NOTEPAD.EXE` | `<NoteBody slug>` in `.os-doc`. Multi-instance. Status bar shows word count + `growth:`. |
| **WordPad** | `WORDPAD.EXE` | Same, wider default, for `layout: article` notes. Adds a toolbar that is inert and honest about it. |
| **Windows Help** | `*.HLP` | Same renderer, Help-viewer chrome — Contents / Index / Back buttons. Home of the field-guide and dictionary shitposts. |
| **My Computer** | — | Explorer over `content-index.json`. Drives: `C:\GARDEN`, `W:\WIKI`, `X:\CHAT`, `A:\` (empty, errors in character). |
| **Explorer** | — | Folder tree + list/details view. Double-click a note → Notepad/WordPad by `classifyLayout()`. |
| **MS-DOS Prompt** | `COMMAND.COM` | `BOOT_COMMANDS` in a window. |
| **Media Player** | `MPLAYER.EXE` | Existing turntable + `music.json`. |
| **Minesweeper / Chess / HeXO / SIGIL / arcade** | `*.EXE` | `SYSTEM_PAGES` entries via `NoteBody`. Free. |
| **Subsurfaces Messenger** | `MSGR.EXE` | `ChatRoom` in chrome. |
| **Recycle Bin** | — | ARG surface. See §8. |
| **Display Properties** | `CONTROL.EXE` | Tabbed dialog over `BG_MODES`, theme, accent, `bgOpacity`. |
| **Constellation** | `CONSTELLATION.SCR` | Screensaver. 90s idle → fullscreen graph. Any input dismisses. |
| **Clock / Calculator** | — | `BOOT_COMMANDS` already has `date` and `calc`. |

### 6.1 Filesystem mapping

`content-index.json` → a drive tree. Rules:

- Folder → directory. Note → file.
- Extension by `classifyLayout()`: article → `.DOC`, note → `.TXT`,
  system page → `.EXE`, `type: book`/`movie` → `.NFO`.
- Filenames are **8.3-shaped where it is funny and full where it is useful** —
  display the real title, show a truncated 8.3 name in details view's "MS-DOS
  name" column. (`i-didnt-read` → `IDIDNT~1.TXT`.)
- `private: true` notes do not exist here either — the content policy is
  enforced once, in prebuild, and the OS reads the same index.
- `draft: true` notes are visible **only** in the Recycle Bin. This is the ARG
  hook, and it costs nothing.

---

## 7. Mobile

A desktop OS on a 390px phone is bad, and `BgCanvas` already skips at ≤800px.
The in-character answer is free and better than an apology:

Below `$bp-phone`, the OS renders a full-screen CRT panel:

```
SUBSURFACES WORKSTATION

A display of 800 × 600 or greater is required.

Please connect a suitable monitor, or visit
the garden at subsurfaces.net.

                                    [ OK ]
```

`[ OK ]` links to `subsurfaces.net`. Uses `usePhoneViewport()` — never a
hardcoded `innerWidth <= 800` (CLAUDE.md gotcha #13).

---

## 8. The ARG layer

The shitposts are the filesystem. That is what stops the desktop feeling empty:
the contents were written first.

### 8.1 Notes that become files

| Note | Appears as | Device |
|---|---|---|
| `i-didnt-read` | `README.TXT` on the desktop, unopened | — |
| `trust-me-bro` | `TRUSTME.DOC` | Bibliography is the joke |
| `touch-grass` | `GRASS.HLP` | Dichotomous key in a Help viewer |
| `its-giving` | `LEXICON.HLP` | OED entry with dated citations |
| `unread` | `INBOX.EXE` | An inbox showing 47,314 unread |
| `foucault-fight` | `FOUCAULT.EXE` | Runs the Monte Carlo live |
| `readme-1st` | `README.1ST` | Recovered floppy — see below |

### 8.2 `readme.1st` — the recovered floppy

The keystone. A note presented as a damaged text file with corrupted regions.
**Telescopic text** (unique to this garden) means clicking a corrupted block
expands it *in place* into recovered text. Each expansion yields a fragment of a
boot seed. Assembled, the seed goes to `os.subsurfaces.net/?seed=…` and the boot
sequence says something specific to the reader.

Uses telescopic text + the existing `bootSeed.ts` URL seed resolution. No new
mechanics — only new content.

### 8.3 Disk 2 of 3

A note that is explicitly the middle floppy. Disks 1 and 3 are `draft: true`:
rendered, but out of RSS and the sitemap, unlinked from anywhere. The only paths
in are guessing the slug or finding them in the Recycle Bin. **The content policy
is the puzzle.** Zero new code.

### 8.4 Cross-shell state

Restoring a note from the OS Recycle Bin writes a flag that unhides a note on the
main garden. `os.subsurfaces.net` reaching into `subsurfaces.net` is what makes
the two feel like one machine. Implementation: a persisted store key, shared via
the existing `.subsurfaces.net` cookie domain, read by the main shell.

### 8.5 Others queued

- **Sysop** — `chatbot.ts` already exists; the note is one half of a transcript,
  the OS lets you continue it.
- **Uninstall** — a note as uninstall-wizard screens; every Cancel goes deeper.
- **An OG card that contradicts its note.** One PNG.

---

## 9. Phases

| Phase | Contents | Status |
|---|---|---|
| **0** | The shitposts: `readme-1st`, `trust-me-bro`, `touch-grass`, `its-giving`, `unread`, `foucault-fight`. | **Shipped** (2026-08-01) |
| **1** | Finite POST, splash, handoff, skip-on-input, reduced-motion, once-per-session. | **Shipped** |
| **2** | Store, `WindowFrame`, `useDrag`, drag outline, 8 resize grips, focus/z-order, Alt+Tab / Alt+F4 / Ctrl+Esc. | **Shipped** |
| **3** | Desktop icons, Taskbar, Start menu with flyouts, mobile CRT panel. | **Shipped** |
| **4** | Notepad, WordPad, Help, Explorer, My Computer, Recycle Bin, Display Properties, games via `program`. | **Partial** — see below |
| **5** | ARG: Recycle Bin surface + seed payoff wired. | **Partial** — see below |

### Deviation from §4 (recorded)

The spec called for a `mode` prop on `BootPage`. On reading it — 1,143 lines, an
endless generator plus a command prompt, telemetry panes, zoom panes and an auth
modal — that would have dragged the whole application into the OS boot for no
gain. **`OSBoot.tsx` is a separate bounded component instead**, and BootPage was
subsequently retired altogether — see §12.

### Still open

- **Messenger (`ChatRoom` in a window).** Not the thin wrapper the other apps
  are: it needs `roomId`, `accessToken`, `currentUserId`, a rooms fetch and a
  logged-out state. Its own piece of work.
- **Marquee select** on the desktop, and icon drag-to-rearrange.
- **Cross-shell restore flag** (§8.4) — restoring from the Recycle Bin does not
  yet unhide anything on the main site.
- **Not visually verified.** Build, typecheck, lint and test gates are green, but
  the desktop has not been run in a browser — the animated background canvas
  makes preview servers expensive here. First run should check drag feel, window
  focus order, and MDX inside a 620px document canvas.

---

## 12. The terminal (2026-08-01)

`BootPage.tsx` is gone. In its place, `src/features/terminal/` — **one module,
three surfaces**.

### Why

BootPage was 1,143 lines carrying an endless generator, a command prompt,
telemetry gauges, zoom panes, a scroll-follow control, speed and palette
pickers, a help overlay and an auth modal. The commands were good; the chrome
around them was four features wearing one coat.

### Shape

- **Attract → prompt.** The procedural sequence still plays, then collapses into
  a prompt on the first keypress. `useBootPlayback` already owned both the
  generated stream *and* `injectLine`, so attract mode and the prompt share one
  line buffer and the transition is just pausing the generator. The boot art
  becomes scrollback rather than being discarded.
- **Three frames, one module.** `/terminal` fullscreen on the main site; the
  MS-DOS Prompt window in the OS; fullscreen again under Start → Restart in
  MS-DOS mode. `/boot` redirects to `/terminal`.
- **The bridge is one function.** `ctx.open(slug)` navigates on the main site and
  opens a *window* in the OS. No command branches on surface; the substitution
  happens once, at the mount site.
- **Toys split by nature.** Anything spatial (a board, a flock, a grid) already
  exists as a system page, so its command became a launcher via the `PROGRAMS`
  map — which Start → Run... also resolves against, giving one namespace across
  terminal, Run dialog and Start menu. Text-native toys stayed as commands.

### Removed

`BootPage.tsx` (1,143), `bootCommands.ts` (1,820), `bootTelemetry.ts` (482),
`bootAudio.ts` (377), `chatbot.ts` (709) — 4,531 lines. The last two were
features rather than chrome and had no caller left once the commands were
curated; they are recoverable from git if wanted back as terminal commands.

**Kept and still live:** `bootGenerators`, `useBootPlayback`, `bootSeed`,
`bootRng`, `bootTypes`, `bootMarkdown` (the last via a dynamic import in `cat`).

Chunk size: 139 kB → 53 kB (49 → 19 kB gzip).

### Also shipped in this pass

Right-click desktop → Properties; Start → Run...; `CONSTELLATION.SCR` idle
screensaver at 90s; a **system tray** translating the main site's QuickControls
into Win95 idiom (search, random note, theme, volume popup, Display Properties,
clock); Disks 1–3 completing the Recycle Bin ARG.

---

## 10. Risks

- **Perf:** many open windows each mounting MDX. Mitigation: minimised windows
  unmount their document (keep geometry in store); drag uses an outline, not live
  reflow.
- **Focus/scroll trapping:** documents scroll inside windows; the desktop must not.
  `overflow: hidden` on the desktop root, `overflow: auto` on `.os-doc`.
- **`usePanelClick`** must not fire in the OS shell. It already bails on
  `shell !== "main"` — verify, don't assume.
- **Bundle:** the OS is lazy per-app; `APPS` entries are `lazy()`. It must not
  land in the main-site chunk.
- **Scope creep:** the Start menu can eat a week. Cap it at real entries from the
  content index, no bespoke submenus.

---

## 11. Non-goals

- Pixel-perfect Win95 replication. We inherit the site's theme by design (§2.2).
- Window snapping, tiling, virtual desktops.
- A writable filesystem. Explorer is a *reader*; the wiki is where writing happens.
- Emulating real Win95 apps beyond the joke's needs.
