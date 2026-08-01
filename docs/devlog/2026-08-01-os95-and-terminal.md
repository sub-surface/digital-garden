# 2026-08-01 — SUBSURFACES 95, and the terminal refactor

Session log. Spec lives at [`../os-95-spec.md`](../os-95-spec.md); this is the
running order of what happened and why, so the spec can stay a description of
the system rather than a diary.

---

## 1. Content first

Six shitposts, then three more for the ARG. Each runs on a **different markdown
device** so the set doesn't read as one template — that was the design
constraint, not a stylistic accident:

| Note | Device |
|---|---|
| `i-didnt-read` | forensic table + KaTeX comprehension formula |
| `trust-me-bro` | the works-cited list *is* the joke |
| `touch-grass` | dichotomous identification key |
| `its-giving` | OED entry with a dated quotation ladder (1591→2024) |
| `unread` | responsive catechism |
| `foucault-fight` | stat block + Monte Carlo results table |
| `readme-1st` | telescopic recovery — the ARG keystone |
| `disk-1/2/3-of-3` | install-set framing; 1 and 3 are `draft: true` |

**The ARG needed no new code.** `parseSeed()` already falls through to
`hashString()`, so *any word* is a valid boot seed — the three telescopic
recovery passes in `readme-1st` yield `PER`/`SIST`/`ENCE`, and
`os.subsurfaces.net/?seed=PERSISTENCE` resolves today. The POST reads the raw URL
param (not the hash) so it can greet the label by name.

Disks 1 and 3 are `draft: true`: rendered, absent from RSS and sitemap, unlinked.
**The content policy is the puzzle** — they surface only in the Recycle Bin.

## 2. The OS

Built against `docs/os-95-spec.md`. The two loadbearing decisions:

- **Chrome is Win95, documents are the garden.** We frame MDX, we never restyle
  it. This is why there was no "make sidenotes work in a window" problem: there
  was nothing to fight.
- **Theme inheritance** (Leon's call, and it improved the design): bevels derive
  from `--color-bg-surface`, and the Win95 title-bar gradient is driven by
  `--color-accent-base`. Dark mode is High Contrast Black for free.

`PanelCard` turned out to be 80% of a window manager already, and `NoteBody`
mounts every `SYSTEM_PAGES` entry, so every game became an app for nothing.

### Deviation, recorded

Spec said "add a `mode` prop to BootPage". On reading it — 1,143 lines — that
would have dragged a command prompt, telemetry panes and an auth modal into the
OS boot. Wrote a bounded `OSBoot.tsx` instead. That decision then made §3
obvious.

## 3. Retiring BootPage

Answered by Leon: attract-mode-then-prompt, three surfaces, `/boot` redirects,
keep all four command families but fold *spatial* toys into the OS as apps.

The clean mechanism: **`useBootPlayback` already owned both the generated stream
and `injectLine`**, so attract mode and the prompt can share one line buffer and
"collapse to a prompt" is just `setPaused(true)`. The boot art becomes
scrollback instead of being discarded.

The bridge is **one function**: `ctx.open(slug)` navigates on the main site and
opens a window in the OS. No command branches on surface.

Toys split by nature — anything with a board or a field already had a system
page, so it became a launcher entry in `PROGRAMS`, which **Start → Run... also
resolves against**. One namespace, three entry points.

Removed 4,531 lines (`BootPage`, `bootCommands`, `bootTelemetry`, `bootAudio`,
`chatbot`). `chatbot` came back by request as a `chat` session plus a `debate`
command that feeds two personas each other's replies. **`bootAudio` (377 lines,
the AmbientEngine) is still removed** — recoverable from `2f7963c` if wanted back
as a `sound` command.

## 4. Bugs found and fixed in-flight

- **Side effects inside a `setState` updater.** `collapseToPrompt` paused
  playback and printed a banner *inside* `setMode(m => ...)`. React double-invokes
  updaters in StrictMode → doubled banner. Now a ref guard.
- **`setState` on every `pointermove`.** The screensaver's activity handler
  called `setActive` on all input. Now a ref mirror plus a 1s re-arm throttle —
  this page runs an animated canvas and could not afford it.
- **Links reset the whole OS** (reported by Leon). `<a href="/slug">` inside a
  note did a real navigation; since AppShell returns OSShell for *every* path on
  that host, the desktop remounted — boot replayed, windows lost. `usePanelClick`
  deliberately bails on non-main shells, so the OS needed its own: `useOSLinks`
  intercepts same-origin anchors and opens windows. Cross-origin, `music:`,
  hash, download and modified clicks all still pass through.

## 5. QoL pass

System tray (QuickControls translated to Win95 idiom, with the authentic
vertical volume popup), right-click desktop menu, Run..., Shut Down dialog,
`CONSTELLATION.SCR` screensaver, BSOD, hotkeys (`B`, `Ctrl+P`, `F1`) with an
on-desktop crib sheet, and a tabbed Settings sheet — Background / Appearance /
Startup / Screen Saver / About.

**Boot is now a setting**: off / POST / full procedural, persisted. The "full"
option is the original endless TUI, run until it has said enough and then handed
off — which is how the old `/boot` sequence got plugged back in as a first-class
option rather than a legacy route.

Settings persist in a **separate** `zustand/persist` store keyed `subsurfaces95`,
not in the garden's `PERSISTED_KEYS`: they are settings for a different machine
and the main site shouldn't carry them. Still zustand/persist, not hand-rolled
`localStorage` (gotcha #16).

A windowed terminal now opens **straight to a prompt** — attract mode in a 680px
window is noise — and `exit` closes it.

---

## Still open

- Messenger (`ChatRoom` needs tokens + a rooms fetch — not a thin wrapper)
- Marquee select, icon drag-to-rearrange
- Cross-shell restore flag (§8.4): restoring from the Recycle Bin doesn't yet
  unhide anything on the main site
- **Nothing has been visually verified.** All gates green; no browser run.
  Preview servers are expensive here (animated canvas). First run should check
  drag feel, focus order, and MDX inside a 620px canvas.
