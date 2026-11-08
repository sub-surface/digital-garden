# The Garden Reset

*A plan for putting the notes back at the centre. Drafted 2026-11-08 with the
owner; decisions below are the owner's answers, not proposals.*

## Where we are

subsurfaces.net began as a way to host an Obsidian vault. It is now six
products sharing one codebase and one global store:

| System | Lines (approx) | Relationship to notes |
|---|---|---|
| Filament (cosmology sim) | 11k | none; a system page |
| OS (Subsurfaces 95) | 11k | re-renders notes in windows; imports wiki pages, chat, terminal directly |
| Arcade | 8k | system pages |
| Chat | 8k | two complete front-ends (ChatRoom + TerminalChatView) with duplicated commands |
| Boot / terminal | 5k | procedural attract mode + shared terminal |
| **Notes (reader, MDX, plugins, panels)** | **~7k** | **the core: 344 files, 163 of them wiki** |

Symptoms that all have the same root (no shared contract between systems):

- Five command grammars: SearchOverlay, CommandPalette, KeyboardCheatSheet,
  TerminalOverlay (titled "MS-DOS Prompt" even on the garden), chat slash
  commands (twice).
- Every note is a JavaScript chunk (50–290 KB) compiled from MDX, even plain
  markdown; nothing is readable until the SPA boots. Two markdown pipelines.
- Implicit state machines everywhere (overlay booleans, playback flags,
  stage strings) — see `src/lib/machine.ts` for the pattern that replaces them.

## Decisions (owner, 2026-11-08)

1. **Notes first.** The garden is the front door; every system is reached
   through a note.
2. **One prompt, docked.** A quiet command line under the current note.
   Plain text searches, `>` runs a command, `?` is help. Context-aware.
3. **Rooms.** Systems stay in-repo behind one small typed contract —
   *except Filament*, which moves to its own project.
4. **Static-first notes with islands.** One markdown pipeline renders HTML at
   build time; React hydrates only interactive parts.
5. **Stay on Node + Vite + React; cut dependencies.**
6. **Cozy touches:** the Desk (homepage, updated from a local CLI), Pebbles,
   Light & weather.
7. **Filament:** private repo `sub-surface/filament`, own Worker on
   `filament.subsurfaces.net`; the garden keeps a Filament note linking out.
8. Pruning: propose first, prune only with approval. **Approved
   2026-11-08:** unused deps, TerminalChatView (becomes a skin of ChatRoom),
   the old overlays (once the prompt covers them). **Kept:** the procedural
   boot generator, as an easter egg (redesign later; see `ideas.md`).
9. **Technical first, creative second.** The Desk's look, essay
   thumbnails and other creative choices come after the engine work.
10. **Mobile is its own phase**, covering the whole site rather than the index
    layout.

## The shape we're building

```
            content/  (the vault: the only source of truth)
               │
        ┌──────▼───────┐
        │   corpus     │  one typed document model + ONE md pipeline
        │  (prebuild)  │  → html per note, corpus.json, islands manifest
        └──────┬───────┘
               │
   ┌───────────┼───────────────┬──────────────┐
   │           │               │              │
 reader     prompt          rooms          worker
 (static   (one command    (os, arcade,   (serves note HTML
  HTML +    registry,       chat, wiki     in the first response,
  islands)  per-surface     editor …)      APIs)
            rendering)
```

### 1. The corpus (Martin-Löf: the types are the spec)

One discriminated union describes every document:

```ts
type Doc =
  | { kind: "note";    slug; title; tags; body: Html; tended: Tending }
  | { kind: "article"; ...; sidenotes; toc }
  | { kind: "shelf";   media: "book" | "movie" | "album"; status; ... }
  | { kind: "room";    room: RoomId; ... }   // a note that mounts a room
```

`classifyLayout`, the system-pages registry, music.json joins and the OS
file-type guessing all collapse into "read `kind`". The prebuild emits it;
the Worker, SPA and scripts import the same type.

### 2. Static-first rendering (Carmack: the note should load like a text file)

- One unified pipeline (remark → rehype) renders every note to HTML at build
  time. The Worker already injects a prerender fragment; it becomes the real
  page body.
- Interactive MDX components become **islands**: the HTML carries
  `<div data-island="GameOfLife" data-props="…">`, and a small client
  runtime hydrates only those. Plain notes ship **zero** per-note JS.
- Sidenotes, footnotes, KaTeX, telescopic text: all static HTML + CSS.
- Result: instant first paint, readable with JS off, cheaper OG/RSS, and
  the `@mdx-js/rollup` build step disappears for plain markdown.

### 3. One prompt (Ritchie: one way to do it)

A single typed registry:

```ts
defineCommand({
  name: "backlinks",
  summary: "notes that link here",
  needs: ["note"],              // context the command requires
  surfaces: ["garden", "os", "chat"],
  run: (ctx, args) => blocks,   // returns structured output, not strings
})
```

- Output is **structured blocks** (note list, text, link, error), so each
  surface renders natively: margin cards on the garden, text in the OS
  window, a message in chat.
- Replaces SearchOverlay, CommandPalette, KeyboardCheatSheet,
  TerminalOverlay and both chat command copies.
- Context-aware: `backlinks`, `toc`, `cite`, `random sibling`,
  `open in os`, `pebble` all know the current note.

### 4. Rooms (Hejlsberg/Stroustrup: a small typed interface)

```ts
defineRoom({
  id: "arcade",
  note: "arcade",                 // the companion note: the front door
  mount: lazy(() => import(...)),
  commands: [...],                // contributed to the one prompt
  backgrounds: [...],             // contributed to BgCanvas
})
```

- Core never imports a room; rooms never import each other. Enforced by an
  ESLint `no-restricted-imports` boundary, not by convention.
- The OS becomes a room that *hosts* other rooms' windows via the contract,
  instead of importing wiki pages and chat directly.
- Store: per-room slices; the core store shrinks to reader state + one
  `activeOverlay` machine (replacing eight booleans and three Esc owners).

### 5. The Desk (the cozy part)

The homepage becomes the owner's desk: what's being read, what's on the
turntable, a draft in progress, recently tended notes, a "found in a
drawer" old note, and a short line from the owner. Designed mobile-first,
since it *is* the index.

- **Source of truth is a note**: `content/desk.md` (frontmatter + a short
  body), editable in Obsidian like anything else.
- **`desk` CLI**, a sibling of `jot`/`wavify` (same idiom: Python, a `.cmd`
  shim in `~/.local/bin`, pink accents, warm copy):
  - `desk` shows the current desk as a little terminal card
  - `desk reading "Difference and Repetition"` / `desk listening …` /
    `desk drafting …` / `desk note "…"`
  - `desk capture "half-formed thought"` drops a seedling note into the vault
  - `desk publish` commits `content/desk.md` + captures and pushes (deploy)
- An Obsidian plugin is a later option; the CLI comes first because the data
  is just a markdown file either way.

**Pebbles**: readers leave a one-line marginal remark (or just a mark) on a
note. Reuses the chat backend: one quiet room per note slug, rendered in the
margin, not as a comment thread.

**Light & weather**: the palette warms with the reader's local time (dawn,
day, dusk, night) and the ambient background can follow the season. Off by
default for reduced-motion, with a single toggle.

## Phases

| # | Phase | Changes for readers | Size |
|---|---|---|---|
| 0 | Review fixes + OS boot hang | **Shipped 2026-11-08** | — |
| 1 | One md pipeline + static HTML notes | **Shipped 2026-11-08** (typed corpus `Doc` union still to do) | L |
| 2 | Islands runtime; retire MDX-as-JS | **Shipped 2026-11-08**: 410 → 84 JS chunks, build ~1m → ~30s | M |
| 3 | The one prompt (registry + docked garden line) | Ctrl+P feels native everywhere | M |
| 4 | Rooms contract + lint boundary; OS as host | systems reached through notes | L |
| 5 | Filament → own project | **Shipped 2026-11-08**: filament.subsurfaces.net (private repo sub-surface/filament); −13k lines | M |
| 6 | Desk + `desk` CLI + mobile index | a living homepage | M |
| 7 | Pebbles; Light & weather | readers leave a trace; the site has a time of day | S–M |
| 8 | Sweep: activeOverlay, single chat view, GameCabinet, dep cuts | fewer bugs, less code | M |
| 9 | Mobile pass across the whole site (audit-driven) | the site stops feeling desktop-first | M |
| 10 | Creative pass: Desk look, essay cards, explicit modes, boot redesign | the site feels lived-in | M |

Order rationale: the corpus (1) is what everything else consumes. The
prompt (3) and rooms (4) both need the corpus types. The Desk (6) is
smaller once the corpus and the static renderer exist, but can be pulled
forward because it only depends on a markdown file.

## Pruning candidates (decided 2026-11-08, see decision 8)

- **TerminalChatView** (≈1.1k lines) as a second chat front-end → fold into
  ChatRoom as a terminal *skin* with the one prompt's commands.
- **CommandPalette, SearchOverlay, KeyboardCheatSheet, TerminalOverlay** →
  replaced by the prompt (consolidation rather than loss).
- **Unused dependencies**: flexsearch, react-markdown,
  rehype-autolink-headings (zero imports).
- **DevDashboard** (`/__dev`): dev-only; keep or fold into the prompt.
- The **procedural boot generator** (≈1.5k lines + 1k chatbot) powers the
  /terminal attract mode and the OS full boot: keep as a room's easter egg,
  or retire.

## Follow-ups recorded during phase 1

- **Sanitizer → allowlist.** `src/lib/rehype-note-safety.ts` is a hardened
  denylist (scripts, plugins, SVG animation, foreignObject, forms, `on*`,
  unsafe URL schemes, non-video iframes). The robust end state is
  `rehype-sanitize` with a schema extended for KaTeX (MathML + SVG + inline
  styles), sidenote inputs/labels, telescopic/callout markup, island
  `data-*` attributes and VIDEO_FRAME_HOSTS iframes. Adopt it only with a
  corpus diff proving every one of the 326 rendered notes is unchanged.
- **Filament deploy.** The extracted project (`Psychograph\filament`) needs
  its GitHub repo and Worker; merge `reset/filament-out` into the garden
  once filament.subsurfaces.net resolves.

## Progress 2026-11-08 (later)

- **Performance pass (part 1)**: main chunk 353 → 271 KB (lazy overlays via
  `lazyOverlay()`, all-lazy note components, lazy `/__dev`, no `buffer`);
  background capped at 60 fps and settles to 30 fps after 30 s idle;
  GameOfLife and clock hot paths fixed.
- **Seamless first paint**: `NoteHeader` is rendered by the app and, at
  build time, by `emit-prerender` (`StaticArticle`); the fragment carries a
  seed so the app's first render matches it; `theme-boot.js` applies the
  saved theme before paint. No movement between first paint and hydration.
- Two wiki-home regressions found and fixed the same day (React 19
  `dangerouslySetInnerHTML` identity loop; nested islands under lazy
  parents). Lesson: after each deploy, probe the wiki home and a sample of
  pages in a capped headless browser; CI can't see these.

## Progress 2026-11-08 (evening): fonts, the dock, the bar, Settings

- **Self-hosted fonts.** `scripts/fetch-fonts.mjs` writes hashed woff2
  files to `public/fonts/` (immutable cache), `public/fonts.css`, and the
  preload tags in `index.html` (Plex Sans + Playfair, latin). Google is out
  of the CSP. Run it only when the family list changes.
- **Phase 3: the dock** (`src/features/dock/`). One right-hand panel, two
  tabs: the prompt and philchat. It replaced the search overlay, command
  palette, `?` cheat sheet, Ctrl+P MS-DOS window and the wiki's SideChat
  (all deleted). It pushes the page over (`--dock-width`), is a full-screen
  sheet on phones, and keeps its scrollback while closed. Store: one
  `dock: "prompt" | "chat" | null` replaced five booleans.
- **The prompt** is the existing terminal on a new `dock` surface: live
  suggestions (commands, Tab-completable arguments, full-text note hits),
  Enter runs what you typed or the highlighted row, persisted history, Esc
  clears then closes. Keys: Ctrl/Cmd+P or K, `/`, `?` (runs `keys`), C
  (philchat). New site commands (`siteCommands.ts`, never in the OS):
  `here toc goto top backlinks cite share bg accent reader look player
  philchat keys`.
- **QuickControls**: three clusters. Now (the song once you've listened,
  else the newest notes, rotating), the prompt button, then reader / chat /
  settings / profile / clock. Day-night, accent dot, bg toggle, search and
  random buttons left the bar; all are commands or in Settings.
- **Settings** (`\`, was the ThemePanel): one sheet, Look / Reading /
  Background, per-mode tuning behind a disclosure, reset-to-defaults,
  outside-click closes, bottom sheet on phones (fixes mobile-audit P1 #1).
  The chosen background is now remembered between visits.

Next: phase 4 (rooms contract), then the cosy phases. Mobile phase still
owes the rest of docs/mobile-audit.md.

## Progress 2026-11-08 (night): sky, glorp, chat to cold storage, perf

- Chat shell to cold storage (tag `cold-storage/chat-shell`); philchat is
  the dock's tab; chat.subsurfaces.net is the bare pop-out room. Terminal
  chat removed.
- Modes nav `notes · wiki · os · arcade` + `mode`, `boot`. FILAMENT and
  p(doom) in the arcade.
- Sky (`src/features/ambience`): seasonal flurries at each turn of season
  (default on), Light follows the sun and live weather (both opt-in; the
  Worker's weather endpoint falls back to Cloudflare's city-level location).
  Commands `season`, `sky`.
- Glorp (`src/features/glorp`): shared module; the OS pet is glorp; GlorpPeek
  drops by once a visit; `glorp` command. Companion commands `trail`,
  `thread`, `ponder`.
- Settings: collapsible sections, Sky section, "Show background" in reading,
  "Glorp drops by". Essay cards restyled.
- Perf (from a read-only audit): Supabase loads on demand (no longer in
  every visitor's first load); GameOfLife and the homepage glorp only
  animate on screen; the music visualiser stops while paused (30 fps cap);
  the clock is a leaf component; background at 8 fps under reader mode;
  dock resize no longer writes localStorage per frame. Bugs: first `?` lost
  its request (now a mailbox); the title replayed its boot on every click.
- The session plan to the end of the backlog lives in docs/ideas.md.
