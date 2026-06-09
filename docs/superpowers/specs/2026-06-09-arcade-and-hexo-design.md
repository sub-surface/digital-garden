# systemPages Registry + heXO + Arcade — Design

Date: 2026-06-09

Two workstreams from a review + content request, plus a deferred-work writeup.

1. **systemPages registry** — collapse the scattered system-page wiring in `NoteRenderer`
   into a single source of truth. Pure refactor, no behaviour change. Also the foundation
   the arcade plugs into.
2. **heXO** — a Connect-6 game on an "infinite" hex grid (no bot), styled like the chess
   page.
3. **/arcade** — a cute index page listing games (Chess + heXO live; Snake/Blackjack
   "coming soon").
4. **Docs** — file the broader org review (worker.ts split, ui/ folder grouping) into
   `docs/future.md` as deferred; record what shipped.

**Overriding constraint:** do not break existing pages. The registry refactor touches the
render path for chess/graph/shelves/music — these must render identically before and after.
Verify extensively (typecheck + full build + browser render of every existing system page).

---

## Part A: systemPages registry

### Problem

Adding a system page today requires editing two scattered spots in
`src/components/ui/NoteRenderer.tsx`:
- `resolveLayout()` — `chess` on its own line (37) PLUS a separate array (38).
- `renderContent()` — a parallel `if (s === "...")` chain (98–103).

Plus a `lazy()` import at the top (15–19). Three places, copy-paste, fragile as the arcade
grows.

### Solution

New file `src/config/system-pages.tsx`:

```tsx
import { lazy, type LazyExoticComponent, type ComponentType } from "react"

export interface SystemPage {
  component: LazyExoticComponent<ComponentType>
  layout: "article" | "note"
  loading: string
}

export const SYSTEM_PAGES: Record<string, SystemPage> = {
  graph:           { component: lazy(() => import("@/components/ui/GraphView").then(m => ({ default: m.GraphView }))),       layout: "article", loading: "Loading map..." },
  chess:           { component: lazy(() => import("@/components/ui/ChessPage").then(m => ({ default: m.ChessPage }))),       layout: "article", loading: "Loading board..." },
  hexo:            { component: lazy(() => import("@/components/ui/HexoPage").then(m => ({ default: m.HexoPage }))),         layout: "article", loading: "Loading board..." },
  bookshelf:       { component: lazy(() => import("@/components/ui/BookshelfPage").then(m => ({ default: m.BookshelfPage }))), layout: "article", loading: "Loading shelf..." },
  movieshelf:      { component: lazy(() => import("@/components/ui/MovieshelfPage").then(m => ({ default: m.MovieshelfPage }))), layout: "article", loading: "Loading shelf..." },
  "music-library": { component: lazy(() => import("@/components/ui/MusicPage").then(m => ({ default: m.MusicPage }))),       layout: "article", loading: "Loading library..." },
  arcade:          { component: lazy(() => import("@/components/ui/ArcadePage").then(m => ({ default: m.ArcadePage }))),     layout: "article", loading: "Loading arcade..." },
}
```

`.tsx` extension because `lazy()`/JSX types are involved (the file itself holds no JSX, but
keep it `.tsx` for consistency with component config; `.ts` also works — use `.ts` since
there is no JSX literal). **Decision: use `.ts`** (no JSX in the file).

In `NoteRenderer.tsx`:
- Remove the five `lazy()` system-page imports (15–19).
- Import `SYSTEM_PAGES`.
- `resolveLayout()` system-page block becomes:
  ```ts
  if (SYSTEM_PAGES[slug.toLowerCase()]) return SYSTEM_PAGES[slug.toLowerCase()].layout
  ```
  replacing both line 37 (chess) and line 38 (the array). **Note:** keep the explicit
  `wiki`, `wiki/`, `writing/`, and `type`-based rules — those are NOT system pages and stay
  exactly as they are. Only the chess line + the graph/bookshelf/movieshelf/music-library
  array are replaced.
- `renderContent()` system-page block becomes:
  ```ts
  const sp = SYSTEM_PAGES[s]
  if (sp) {
    const C = sp.component
    return <Suspense fallback={<div>{sp.loading}</div>}><C /></Suspense>
  }
  ```
  replacing lines 98–103. The `photography is no longer a system page` comment is preserved
  above it.

**Behaviour parity requirements (verify):**
- `graph`, `chess`, `bookshelf`, `movieshelf`, `music-library` all still resolve to
  `article` layout and render their component.
- The dedicated `/graph` route (router.tsx) is unaffected — it imports `GraphView`
  directly, not through the registry.
- `GraphView` and `ChessPage` are ALSO lazy-imported in `router.tsx` — that is independent
  and stays. The registry only replaces NoteRenderer's copies.

---

## Part B: heXO game

### Files
- `src/lib/hexo.ts` — pure game logic (no React).
- `src/components/ui/HexoPage.tsx` — SVG board + interaction + state.
- `src/components/ui/HexoPage.module.scss` — styling.
- `content/heXO.md` — content stub: `title: heXO`, `tags: [games]`.

### Game logic (`src/lib/hexo.ts`)

Axial hex coordinates `{ q: number, r: number }`. Pointy-top hexes. The three axes for
6-in-a-row are the three pairs of opposite hex directions:
- axis 1: direction `(+1, 0)` / `(-1, 0)`
- axis 2: direction `(0, +1)` / `(0, -1)`
- axis 3: direction `(+1, -1)` / `(-1, +1)`

```ts
export type Player = 1 | 2          // 1 = "black"/player-1, 2 = "white"/player-2
export type Stone = { q: number; r: number; player: Player }
export type HexoState = {
  stones: Map<string, Player>       // key = "q,r"
  turn: Player
  placedThisTurn: number            // stones placed in the current turn
  stonesPerTurn: number             // 1 on the very first turn, else 2
  moveNumber: number                // increments each completed turn
  winner: Player | null
  winningLine: string[] | null      // keys of the 6+ line, for highlight
}

export function key(q: number, r: number): string
export function initialState(): HexoState                 // turn=1, stonesPerTurn=1
export function placeStone(s: HexoState, q: number, r: number): HexoState  // pure; ignores illegal
export function checkWin(stones: Map<string, Player>, q: number, r: number, player: Player): string[] | null
```

Rules (standard Connect6):
- `initialState`: `turn=1`, `stonesPerTurn=1`, `placedThisTurn=0`.
- `placeStone`: rejected (returns state unchanged) if cell occupied, or `winner !== null`.
  On valid placement: add stone, `placedThisTurn++`. Run `checkWin` from the placed cell —
  if a line of length ≥6 (same player) exists, set `winner` + `winningLine`. When
  `placedThisTurn === stonesPerTurn`: flip `turn`, reset `placedThisTurn=0`,
  `moveNumber++`, set `stonesPerTurn=2` (always 2 after the first turn).
- `checkWin`: from the placed cell, for each of the 3 axes, count contiguous same-player
  stones in both directions (+ the cell itself). If total ≥6, collect and return those
  keys; else null.

### Board rendering (`HexoPage.tsx`)

- Inline SVG. A `<g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>` wraps all
  hexes and stones.
- **Visible cell set:** compute the bounding axial region = (all placed stones' coords) ∪
  (their neighbours) ∪ a margin ring of N=3 hexes, with a sane minimum (e.g. a 9×9 axial
  patch centred on origin when the board is empty). Render an empty clickable `<polygon>`
  for each cell in that set; render a `<circle>` stone on occupied cells. This is what makes
  the board "grow as needed."
- **Pan:** pointer-drag on the SVG background updates `pan` (track pointerdown/move/up;
  distinguish a drag from a click via a small movement threshold so placing a stone still
  works). **Zoom:** two buttons (`+`/`−`) adjust `zoom` within clamped bounds (e.g.
  0.5–2.0). No scroll-wheel zoom (avoids hijacking page scroll).
- **Axial → pixel** (pointy-top, hex size `S`):
  `x = S * sqrt(3) * (q + r/2)`, `y = S * 3/2 * r`.
- **Click placement:** clicking an empty hex `<polygon>` calls `placeStone`. After a win,
  clicks are ignored.

### State + UI

- `useState<HexoState>(initialState())`. `pan`, `zoom` separate state.
- Stone colours from CSS variables: player-1 = `--color-accent-base`; player-2 = a light
  contrasting token (e.g. `--color-text` or `--color-bg-surface` border) — themeable, like
  the chess board.
- Status line: e.g. `"Player 1 — place 2 stones (1 left)"`; on win:
  `"Player 1 wins!"`.
- Reset button (back to `initialState()`).
- Win flourish: add `data-win` to the board wrapper and reuse a pulse/glow keyframe
  (accent-aware, `prefers-reduced-motion`-safe), mirroring the chess flourish. Highlight the
  `winningLine` stones (e.g. a ring/stroke).
- Header copy: short and cute, e.g. "Connect six on an endless field of hexes."

### Not included (YAGNI)
- No bot/AI. No online/multiplayer. No move history export. No undo (can add later).
  Hotseat two-player on one device only.

---

## Part C: /arcade index page

### Files
- `src/components/ui/ArcadePage.tsx` + reuse/extend a small SCSS module (or inline module).
- `content/Arcade.md` — `title: Arcade`, `tags: [games]`.

### Content
A small local array of game cards (NOT a manifest yet — YAGNI until more games exist):

```ts
const GAMES = [
  { slug: "chess", name: "Chess", blurb: "Play a small handmade machine.", live: true },
  { slug: "hexo",  name: "heXO",  blurb: "Connect six on endless hexes.",   live: true },
  { slug: null,    name: "Snake", blurb: "Coming soon.",                    live: false },
  { slug: null,    name: "Blackjack", blurb: "Coming soon.",               live: false },
]
```

Live cards link to `/{slug}`; `live: false` cards render greyed/disabled. Visual style
matches the existing system-page aesthetic (mono font, subtle borders, accent on hover —
like the chess controls). Registered in `SYSTEM_PAGES` under `arcade`.

---

## Part D: Docs

- `docs/future.md` — add a "Refactoring & Technical Debt" entry capturing the deferred org
  review: **worker.ts split** (1888 lines → modules + dispatcher; needs verification deploy)
  and **ui/ folder grouping** (56 flat components → `ui/{chat,wiki,games,shelves}/`; churn,
  no functional gain). Note these were reviewed 2026-06-09 and deliberately deferred.
- Record shipped items: systemPages registry, heXO, /arcade.
- `docs/garden.md` — add heXO + arcade to the feature list.

---

## Verification (extensive — per user's explicit ask)

1. `npx tsc --noEmit` clean after each part.
2. **Registry parity (critical):** before touching anything, note current behaviour; after
   the refactor run full `npm run build` AND browser-render each existing system page
   (`/chess`, `/graph`, `/bookshelf`, `/movieshelf`, `/music-library`) confirming they load
   their component and use article layout. The dedicated `/graph` route must also still work.
3. **heXO logic:** unit-check `src/lib/hexo.ts` via `npx tsx` — first turn places 1 then
   passes; subsequent turns require 2; a constructed 6-in-a-row on each of the 3 axes is
   detected; an occupied/post-win placement is rejected; turn/stone counters advance
   correctly.
4. **heXO UI:** `npm run dev`, open `/hexo` — place stones (1 then 2-per-turn), confirm turn
   alternation and status text, build a 6-line and see the win + flourish, pan and zoom work,
   reset works.
5. **/arcade:** renders, Chess/heXO cards link correctly, Snake/Blackjack greyed.
6. Full `npm run build` green at the end.

Note: heXO interaction is SVG click/pointer (not react-chessboard DnD), so Playwright CAN
drive it headlessly — verify stone placement and win in-browser, unlike chess.

## Out of scope
- worker.ts split, ui/ folder grouping (deferred to docs).
- Snake, Blackjack implementations (arcade lists them as coming soon only).
- heXO bot, undo, online play, export.
