# Garden (subsurfaces.net)

Feature reference for the main site. Outstanding work is in [`../ROADMAP.md`](../ROADMAP.md).

## Reading model

- **Layout** is decided by `classifyLayout()` (`src/lib/layout.ts`): frontmatter `layout` wins, then `type` book/movie/chatter/philosopher, then `wiki/` and `writing/` slug prefixes, then system-page metadata, else note.
- **Article layout**: 900px body, right margin column (TOC and Tufte sidenotes above the `$article-narrow` width, checkbox toggle below it), `WikiInfobox` for chatter/philosopher types, breadcrumbs, reading time, bookmark button, `data-article-kind` ("essay" vs "wiki") for typography. Reader mode keeps the grid and drives the prose track from `--reader-measure`; its controls live in the ThemePanel Reader tab (`\`).
- **Note layout**: exploration mode. Internal links open stacked panel cards (`usePanelClick`, `PanelStack`); article/game destinations and all mobile navigation use client-side `navigate()` so music keeps playing. Hover previews (`LinkPreview`) fetch `public/content/*.md` raw copies, recurse to depth 4, and have an OPEN button that pushes a card; they are disabled on touch.
- **Backlinks, tags, folders, `/recent`, Inbox, random note (`r`)** are derived from `content-index.json`.

## Authoring syntax

- `[[wikilinks]]` (aliases from frontmatter `aliases`; fragments stripped before slugging), `![[Note]]` / `![[Note#Section]]` transclusion (depth limit 2), `![[image]]`, Obsidian callouts (`> [!type]`), `[^n]` footnotes rendered as Roman-numeral sidenotes, telescopic text (`remark-telescopic`), KaTeX math (`$...$`, `$$...$$`).
- MDX components registered in `MDXProvider.tsx` (and passed explicitly in `NoteBody`): `Query` (dataview-lite: `filter`, `sort`, `limit`, `display=list|grid|table`, layout pills), `BookCard`, `MovieCard`, `Gallery`, `PhotoAlbums`, `EmbedGraph` (BFS neighbourhood via `src/lib/graph-filter.ts`; `WikiGraph` is an alias defaulting to the wiki scope), `GameOfLife`, `OnThisDay`, `AsciiAvatar`, `Epigraph`, `WikiSubmitForm`, plus the wiki editorial set (`ChatterCard`, `ConceptCard`, `ChronicleCard`, `Clipping`, `Classifieds`, `BroadsheetColumns`, `FactionTree`, `MachineGod`, `Tape`, `WeighIn`, `ChuckleRating`).
- Raw HTML in `.md` is compiled as JSX (`className`, not `class`).
- Frontmatter extras: `image`/`cover`/`poster` (OG + header), `description`, `published`, `draft`, `private`, `date`, `layout`, `type`, `username` (chatter claim key), `aliases`.
- Feeds: `rss.xml` (Writing/ or `published: true`) and `wiki-rss.xml`; `sitemap.xml`; `robots.txt`.

## Platform features

- **Backgrounds** (13 modes, ThemePanel `\`, hotkey `b`): see architecture.md. Theme: dark/light plus ROYGBIV accent cycle with triadic secondary colours; `bgOpacity` "Intensity".
- **Navigation overlays**: search (Ctrl+K, FlexSearch over the pre-built index), command palette (Ctrl+Shift+P), terminal (Ctrl+P, shared with `/terminal` and the OS), keyboard cheat sheet (`?`), skip link, global focus ring.
- **Graph**: `/graph` constellation (Canvas 2D + D3), local radar, global overlay, MDX embeds.
- **Music**: persistent `MusicProvider` (one `<audio>`, FFT analyser), turntable player with vinyl scratch (AudioWorklet in `public/`), radial visualiser, Document-PiP pop-out, mobile bar, `music:Track Title` links. See [`music-workflow.md`](music-workflow.md).
- **Collections**: bookshelf, movieshelf, music library, photography albums (`content/Photos/*.md` into `albums.json`), Inbox triage (`/inbox`).
- **Games and toys** (`/arcade`, `GameCabinet` shell with start/again overlay, score+best, zen): Chess (chess.js, homemade drunk/casual/sharp bot, Worker-proxied GIF export, Lichess link), HeXO (connect six on a hex grid, SVG, in-repo bot `src/lib/hexo.ts`), Snake, Tetris, 2048, Blackjack, Hex Mines, Hex Life, Life, Boids/Murmuration, Sandbox, Ant Farm, Progressions, The Knotted Field (Persian carpet), SIGIL and Collider (chamber engine), Apparatus ([`apparatus.md`](apparatus.md)), FILAMENT (cosmic-web simulation, `src/features/filament`). The arcade also links out to StarWeft, Lines of Flight, Anabasis, JANKEN, The Predictor and Lissajous.
- **Accessibility and motion**: focus traps on overlays, `prefers-reduced-motion` honoured by backgrounds/telescopic/boot, `--color-overlay-tint` for theme-correct chrome.
- **Mobile** (`<=800px`, `$bp-phone` / `usePhoneViewport()`): no BgCanvas, CornerMenu arc, article grid collapses, commands reachable from CornerMenu.
- **Dev tools**: `/__dev` dashboard (dev only), properties editor, `npm run dash`, `scripts/audit-site.mjs`.

## Conventions worth knowing

- `BgCanvas` sits at z-index 0, so every container is `background: transparent`; only `body` has the colour.
- Persisted settings go through the single `garden-settings` zustand-persist key (`PERSISTED_KEYS`).
- Telescopic blur stays at or below 3px; no terminal glow effects; no emojis in file content.
- Failure must be visible: toasts, error banners and per-window boundaries, never silent empties.
