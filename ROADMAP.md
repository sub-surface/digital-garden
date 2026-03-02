# Digital Garden v2 — Roadmap

Ground-up rebuild from Quartz v4.5.2 into a custom React/Vite stack.
Repo: `digital-garden-v2` | Deploy target: Cloudflare Pages | Wiki: separate repo (Starlight)

---

## Design Principles

- **No sidebar.** Navigation lives in the corners: terminal title top-left, mini menu bottom-right.
- **Two page layouts:** Article mode (long-form, Tufte-style margin sidenotes) and Note mode (exploration, panel stacking).
- **OLED Black Dark Mode** (`#0a0a0a` - near black). Mono/Triad/Pentatonic theme cycling.
- **Maximal minimalism.** Scrollbars hidden until hover. Panel tabs 24px thin. Buttons appear on interaction.
- **Terminal aesthetic accents.** Boot-sequence title animation, monospace UI elements, ASCII loading art.

---

## Phase 1 — Scaffold

- [x] Vite + React 19 + TanStack Router project init
- [x] Design token SCSS ported from `custom.scss` → `src/styles/tokens.scss`
- [x] AppShell layout: left sidebar (280px), center pane (750px), fixed toolbar stub
- [x] Pre-build script: content-index.json (120 notes), graph.json (35 links), music.json (9 tracks)
- [x] Content + media files copied to `public/content/` at prebuild
- [x] `NotePage`: fetch `.md`, render via remark/rehype pipeline
- [x] `IndexPage`, `TagPage`, `NotFoundPage` routes
- [x] ThemeToggle (dark/light, localStorage)
- [x] Zustand store: theme, reader mode, background mode, panel stack
- [x] CF Pages initial deploy + custom domain migration from GitHub Pages

## Phase 2 — Layout Overhaul + MDX Pipeline

### 2a — Remove Sidebar, New Shell Layout
- [x] Remove left sidebar from AppShell
- [x] **Terminal title** (top-left): `TerminalTitle.tsx`
  - [x] Boot sequence animation
  - [x] Idle re-trigger snippets (Matrix, Pulse, thinking, etc.)
  - [x] **Cute Animations**: Cat walk, heart beat, ghost dance, coffee time.
  - [x] **Easter Eggs**: Tooltips and click-to-trigger animations on index.
  - [x] **Terminal Karat**: Flashing caret at the end of the title.
- [x] **Bottom-right radial menu**: `CornerMenu.tsx` (relocated and flipped)
- [x] **Theme Panel**: Floating minimal customiser above corner menu
- [x] Update CSS grid: remove sidebar column → full-viewport workspace
- [x] Global scrollbar styles: hidden by default, thin overlay on hover (all scrollable areas)
- [x] Dark mode token update: `--color-bg: #0a0a0a` (Near black)

### 2b — Article vs Note Layouts
- [x] `ArticleLayout.tsx`: 750px body + ~250px right margin column (CSS grid, Tufte-style)
  - [x] Sidenotes render in right margin as small floating windows
  - [x] Sidenote popup allows content interaction + nested Gwern-style previews (truncated for performance)
  - [x] Title click on sidenote → navigates to full page
  - [x] Wiki pages default to article layout
  - [x] Other pages opt-in via `layout: article` frontmatter
- [x] `NoteLayout.tsx`: default exploration layout, panel navigation active
  - [x] Hover link previews: first paragraph, appears below mouse with delay
  - [x] Manual "EXPAND" click → rich preview (~200 words + leading image + terminal animation)
  - [x] Click opens panel card (existing behavior)
- [x] Layout selector logic: check `layout` frontmatter → fall back to `type` inference → default note
- [x] **Footnote System**: Sidenotes in Article layout, bottom-of-page in Note layout
- [x] **Footnote Previews**: Hovering footnote markers shows content in preview window
- [x] **Recursive Previews**: Support for nested Gwern-style previews (hierarchical culling)

### 2c — Components + Polish
- [x] Fix double-rendering of homepage (consolidated catch-all route)
- [x] **Active Link Styling**: Inverted highlights (white in darkmode, black in lightmode).
- [x] Fix footnote double-rendering (flattened HTML in sidenote injector)
- [x] Improve LinkPreview stability (safe-zone bridge + robust expand trigger)
- [x] MDX component library: `<BookCard>`, `<MovieCard>`, `<Gallery>`
- [x] `<MDXProvider>` wrapping app with component map
- [x] Switch to full MDX (`@mdx-js/rollup`) — `.md` + `.mdx` both processed (Build-time compilation + runtime dynamic imports)
- [x] **Markdown Embeds**: `![[image.jpg]]`, `![](url)`, and YouTube/Vimeo support
- [x] **Automatic Path Mapping**: Relative image paths automatically resolved to `/content/Media/`

### 2d — Theme System
- [x] **Mono/Triad/Pentatonic cycle**
  - [x] OLED High Contrast: `#0a0a0a` background
  - [x] Pentatonic: One Dark inspired terminal syntax scheme
  - [x] Mono: Subtle near-black/white with single accent
  - [x] **Accent Selector**: Dynamic generation of hierarchy (secondary/tertiary) via color-mix
  - [x] **Minimal Floating Panel**: Fades in above menu, allows simultaneous navigation
- [x] Dark/light toggle remains separate from palette cycle

### 2e — Panel Refinements
- [x] Panel navigation: `PanelStack.tsx` + `PanelCard.tsx` components
- [x] `usePanelClick.ts`: capture-phase click interceptor for internal links
- [x] Cards fetch markdown, parse via remark pipeline, inject HTML
- [x] Depth-aware trimming: link in card N trims everything right of N
- [x] Alt+click bypasses panel (normal nav), Ctrl/Cmd+click opens new tab
- [x] Escape pops rightmost card, title click promotes card to main body
- [x] Panel integrated into AppShell workspace
- [x] **Smooth card animations**: ease-in and fade-in from the right (0.4s slide)
- [x] Panel tab headers: slim down to ~24px, text-only minimal actions
- [x] Smooth scroll-into-view animation on new card

## Phase 3 — Background Engine

- [x] `BgCanvas.tsx` React component (Ported from v1, performance optimized)
- [ ] Simplex noise + glyph/ASCII mode
- [ ] Dots mode (particle field)
- [ ] Vectors mode (flowing line art)
- [x] Network mode (Springy nodes, drifted background)
- [x] **Knowledge Map Mode**: Background-layer non-interactive graph
- [ ] Terminal mode (phosphor scanline + monospace glyphs)
- [x] **Integrated Switcher**: Toggle between active mode and knowledge map
- [x] Reader mode: fade canvas alpha
- [x] Color cache pattern (refreshed on theme change)
- [x] **Config Manager**: Centralised `SITE_DEFAULTS` for global baseline
- [x] **Dev Options Tab**: Real-time parameter tuning in Theme Panel
- [ ] **Commit Workflow**: "Copy Commit Data" signal for agent-led source updates

## Phase 4 — Music Player

- [x] `MusicContext.tsx` + persistent audio element at root
- [x] `MusicBar.tsx` — ultra-minimal horizontal strip top-right (next to clock)
- [x] `MusicPlayer.tsx` — minimal floating panel (matching Theme Panel style, borderless)
- [x] WebGL FFT visualiser (Canvas-based frequency bars in player)
- [x] Track switching, progress, volume controls
- [x] `music:` protocol link handler
- [x] Multi-stage expansion: Bar → Floating Player → Playlist view

## Phase 5 — Collections + Photography

- [x] `BookshelfPage` — auto-collected grid from `type: book` frontmatter
- [x] `MovieshelfPage` — auto-collected grid from `type: movie` frontmatter
- [x] `MusicPage` — track list with play buttons
- [x] `PhotographyPage`: masonry `PhotoGrid` + `Lightbox` (Runtime MD scanning)
- [x] `featured:` flag support in content index + homepage
- [x] Homepage: updated with Photos, Chess, and Wiki quick-links

## Phase 6 — Graph + Chess + Search + Footnotes

- [x] `GraphView.tsx`: D3 force sim + PixiJS renderer (v8 API)
- [x] Local graph (note footer) + global graph (`/graph` route)
- [x] `ChessPage.tsx`: chess.js + custom SVG board + basic AI
- [x] `SearchOverlay.tsx`: Ctrl+K, FlexSearch, results open in panel
- [x] `Sidenote.tsx`: wide-viewport margin notes, narrow-viewport inline toggle
- [x] `NoteFooter.tsx`: footnotes + backlinks + local graph
- [x] `/tags/:tag` and `/folder/:path` page templates
- [x] Dev dashboard at `/__dev`: content stats, note browser, store viewer, actions
- [x] **Properties manager** in dev dashboard: read/write frontmatter fields (session-only overrides)

## Phase 7 — Auth + Admin

- [ ] CF Worker: `POST /api/login`, session in KV, `GET /api/session`
- [ ] D1 schema: `featured_overrides`, `private_overrides`
- [ ] `AdminPanel.tsx`: floating drawer, toggle featured/private
- [ ] Deploy trigger via CF Pages API
- [ ] Private note access: session cookie → full content index

## Phase 8 — Polish + Performance

- [ ] `document.startViewTransition()` on route changes
- [ ] CSS: Stabilise `LinkPreview` positioning and safe-zones
- [ ] UI: Add "EXPAND" button to hover previews for direct navigation
- [ ] Fix: Ensure consistent monospace styling across all terminal-themed elements
- [x] **Clean MDX**: Committed fully to MDX pipeline, removed runtime markdown fetching
- [ ] **Store Refactor**: Slice Zustand store for better performance/organisation
- [ ] **Search Index Optimization**: Move FlexSearch index to Web Worker or warm Singleton
- [ ] Pre-render all notes to HTML at build time (SSG optimization)
- [ ] `sharp` image optimization: WebP variants + `<picture>` srcsets
- [ ] Typography: dropcaps for essays, pull quotes
- [ ] Terminal mode: CSS `--terminal-active` drives phosphor glow
- [ ] Code splitting: lazy chunks per page, dynamic imports for heavy features
- [ ] Lighthouse CI in GitHub Actions (target: 95+ desktop)
- [ ] OG image endpoint via CF Worker + `satori`
- [ ] RSS feed + sitemap in prebuild

---

## Design Specifications

### Terminal Title Animation
Source inspiration: `Avatar/boot.js` — SGI/NeXT/PlayStation boot aesthetic.

Animation bank includes:
- Vector converge (geometric lines forming logo)
- Raster scan (horizontal stripes building silhouette)
- ASCII scope pulse (box-drawing character oscilloscope)
- Branch tree (growing tree structure)
- Echo text ("INITIALISING" with reverb fade)
- BIOS POST-style system info
- Loading bars with progress percentages
- Site-themed outputs ("loading thought-graph...", "mapping territories...")
- Real site loading outputs (content index stats, etc.)
- Easter eggs and ASCII art

Behavior: animate once on load → settle → re-trigger randomly every 1–5 min. Hover → smooth morph to "Sub-Surface Territories". Realtime clock beside title.

### Article Layout (Tufte-style)
```
┌──────────────────────────────────────────┐
│ [Terminal Title]              [clock]     │
│                                          │
│    ┌─────────750px──────┬──250px──┐      │
│    │                    │ sidenote│      │
│    │  Article content   │ float   │      │
│    │                    │         │      │
│    │  Body text with    │ sidenote│      │
│    │  footnote refs     │ float   │      │
│    │                    │         │      │
│    └────────────────────┴─────────┘      │
│                                          │
│ [© Sub-Surface] [About] [≡]    [menu]    │
└──────────────────────────────────────────┘
```

### Note Layout (Exploration)
```
┌──────────────────────────────────────────────────┐
│ [Terminal Title]                        [clock]   │
│                                                   │
│  ┌───750px────┬─24─┬───750px────┬─24─┬──750px──┐ │
│  │            │tab │            │tab │          │ │
│  │  Main note │  ↕ │ Panel card │  ↕ │  Card 2 │ │
│  │  content   │    │  content   │    │ content  │ │
│  │            │    │            │    │          │ │
│  └────────────┴────┴────────────┴────┴──────────┘ │
│                                                   │
│ [© Sub-Surface] [About] [≡]             [menu]    │
└──────────────────────────────────────────────────┘
```

### Theme Palettes (cycle order)
1. **Mono** — near black/white, single accent
2. **Complimentary** — vibrant dual accents

### Bottom-Right Menu
```
        [Wiki]
      ⬉
    [Graph]
   ⬉
  [≡] ←── toggle (radial arc fan-out)
  [About]  [© Sub-Surface]
```
Theme Panel floats above the arc items when active.

---

## Dev Workflow

```
npm run dev       # Vite HMR + nodemon watching content/ for changes
npm run build     # prebuild → tsc → vite build → dist/
npm run preview   # serve dist/ locally
npm run prebuild  # manual content index rebuild
```

`/__dev` dashboard available in dev mode — content stats, note browser, store state, frontmatter properties manager, actions.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + Vite 6 |
| Routing | TanStack Router |
| Markdown | remark/rehype (MDX planned) |
| State | Zustand |
| Styles | SCSS modules + CSS custom properties |
| Deployment | Cloudflare Pages |
| Auth/DB | Cloudflare Workers + KV + D1 |
| Graph | D3 + PixiJS |
| Search | FlexSearch |
| Chess | chess.js + Stockfish WASM |

---

## Technical Notes
- **Recursive Previews**: `PreviewStack` manages multiple hover windows with hierarchical culling and depth-aware positioning.
- **Link Preview Bridge**: Transparent pseudo-element `::before` used to allow mouse crossing gap between link and card.
- **Footnote Flattening**: `rehype-sidenotes` unwraps the first `<p>` in footnote content to prevent invalid nesting and browser auto-repair loops.
- **Layout Switching**: Managed by `NoteRenderer` applying `.note-layout` or `.article-layout` to the wrapper `<article>`.
- **Catch-all Route**: Homepage double-rendering fixed by consolidating `indexRoute` into the catch-all `noteRoute` with a default "index" slug.
- **MDX Transition**: All notes are now imported as live MDX components via Vite `import.meta.glob`, allowing custom React components directly in markdown.
- **NoteBody Refactor**: Centralised loading logic in `NoteBody` allows both main pages and side panels to render complex MDX/React content consistently.
- **Ultra-Minimal Music**: Primary controls live in a transparent `MusicBar` top-right, aligned with the clock. Expands to a floating `MusicPlayer` mirroring the `ThemePanel` aesthetic.
- **Panel Tab Refinement**: Tab action buttons (`+`, `x`) moved to the top of the vertical tab for better accessibility and aesthetics.
- **Background & Layering**: `BgCanvas` rendered at `zIndex: 0`. To prevent occlusion, all major layout containers (`.shell`, `.workspace`, `.mainPane`, `.card`) must have `background: transparent`. The global background color is applied only to the `body` element or a bottom-layer container.
