# systemPages Registry + heXO + Arcade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse scattered system-page wiring into one registry, then add a heXO Connect-6 game and an /arcade index page that plug into it — without breaking any existing page.

**Architecture:** A `SYSTEM_PAGES` registry object becomes the single source of truth for slug→component+layout, consumed by `NoteRenderer`. heXO is pure logic (`src/lib/hexo.ts`) + an SVG board component. The arcade is a static card grid. Existing system pages (chess/graph/shelves/music) must render identically through the registry.

**Tech Stack:** React 19, TypeScript, Vite, inline SVG, Zustand (not needed for heXO — local component state), SCSS modules.

**Verification note:** No test runner exists. Verification = `npx tsc --noEmit` + `npm run build` + `npx tsx` logic checks + browser render via Playwright (heXO is SVG/pointer-driven so Playwright CAN place stones, unlike react-chessboard). Per the user's explicit ask, verify EXTENSIVELY — especially registry parity.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/config/system-pages.ts` | Registry: slug → {component, layout, loading} | Create |
| `src/components/ui/NoteRenderer.tsx` | Consume registry (remove scattered wiring) | Modify |
| `src/lib/hexo.ts` | Pure heXO game logic | Create |
| `src/components/ui/HexoPage.tsx` | SVG board + interaction | Create |
| `src/components/ui/HexoPage.module.scss` | Board styling + win flourish | Create |
| `content/heXO.md` | Content stub | Create |
| `src/components/ui/ArcadePage.tsx` | Game index grid | Create |
| `src/components/ui/ArcadePage.module.scss` | Card styling | Create |
| `content/Arcade.md` | Content stub | Create |
| `docs/future.md`, `docs/garden.md` | Deferred org review + shipped record | Modify |

---

## Task 1: systemPages registry (pure refactor)

**Files:**
- Create: `src/config/system-pages.ts`
- Modify: `src/components/ui/NoteRenderer.tsx`

- [ ] **Step 1: Capture baseline behaviour BEFORE changes**

Run: `npx tsc --noEmit` → confirm clean (exit 0). This is the baseline; the refactor must keep it clean. Note the current system-page slugs that must keep working: `graph`, `chess`, `bookshelf`, `movieshelf`, `music-library`.

- [ ] **Step 2: Create the registry**

Create `src/config/system-pages.ts`:

```ts
import { lazy, type LazyExoticComponent, type ComponentType } from "react"

export interface SystemPage {
  component: LazyExoticComponent<ComponentType>
  layout: "article" | "note"
  loading: string
}

export const SYSTEM_PAGES: Record<string, SystemPage> = {
  graph:           { component: lazy(() => import("@/components/ui/GraphView").then(m => ({ default: m.GraphView }))),         layout: "article", loading: "Loading map..." },
  chess:           { component: lazy(() => import("@/components/ui/ChessPage").then(m => ({ default: m.ChessPage }))),         layout: "article", loading: "Loading board..." },
  hexo:            { component: lazy(() => import("@/components/ui/HexoPage").then(m => ({ default: m.HexoPage }))),           layout: "article", loading: "Loading board..." },
  bookshelf:       { component: lazy(() => import("@/components/ui/BookshelfPage").then(m => ({ default: m.BookshelfPage }))),   layout: "article", loading: "Loading shelf..." },
  movieshelf:      { component: lazy(() => import("@/components/ui/MovieshelfPage").then(m => ({ default: m.MovieshelfPage }))), layout: "article", loading: "Loading shelf..." },
  "music-library": { component: lazy(() => import("@/components/ui/MusicPage").then(m => ({ default: m.MusicPage }))),         layout: "article", loading: "Loading library..." },
  arcade:          { component: lazy(() => import("@/components/ui/ArcadePage").then(m => ({ default: m.ArcadePage }))),       layout: "article", loading: "Loading arcade..." },
}
```

NOTE: `hexo` and `arcade` reference components that don't exist yet (Tasks 3 & 4). That is fine — `lazy()` imports are not resolved until the slug is visited, so typecheck and build of the registry itself will pass as long as the import path is syntactically valid. BUT `npm run build` may try to resolve the dynamic import targets. To avoid a build break between tasks, **do Task 1's build verification with only the existing entries**, and add the `hexo`/`arcade` lines in Tasks 3/4 when those components exist. So for THIS task, omit the `hexo` and `arcade` lines; add them later.

Corrected registry for Task 1 (no hexo/arcade yet):

```ts
export const SYSTEM_PAGES: Record<string, SystemPage> = {
  graph:           { component: lazy(() => import("@/components/ui/GraphView").then(m => ({ default: m.GraphView }))),         layout: "article", loading: "Loading map..." },
  chess:           { component: lazy(() => import("@/components/ui/ChessPage").then(m => ({ default: m.ChessPage }))),         layout: "article", loading: "Loading board..." },
  bookshelf:       { component: lazy(() => import("@/components/ui/BookshelfPage").then(m => ({ default: m.BookshelfPage }))),   layout: "article", loading: "Loading shelf..." },
  movieshelf:      { component: lazy(() => import("@/components/ui/MovieshelfPage").then(m => ({ default: m.MovieshelfPage }))), layout: "article", loading: "Loading shelf..." },
  "music-library": { component: lazy(() => import("@/components/ui/MusicPage").then(m => ({ default: m.MusicPage }))),         layout: "article", loading: "Loading library..." },
}
```

- [ ] **Step 3: Remove the scattered lazy imports in NoteRenderer.tsx**

Delete lines 15–19 (the `GraphView`, `ChessPage`, `BookshelfPage`, `MovieshelfPage`, `MusicPage` `lazy()` declarations) and the `// Lazy system pages` comment. Add to the imports:

```ts
import { SYSTEM_PAGES } from "@/config/system-pages"
```

Keep `lazy, Suspense` in the React import (Suspense still used).

- [ ] **Step 4: Replace the system-page block in resolveLayout()**

Replace these two lines (currently 37–38):

```ts
  if (slug.toLowerCase() === "chess") return "article"
  if (["graph", "bookshelf", "movieshelf", "music-library"].includes(slug.toLowerCase())) return "article"
```

with:

```ts
  const sysPage = SYSTEM_PAGES[slug.toLowerCase()]
  if (sysPage) return sysPage.layout
```

Leave the `wiki`, `wiki/`, `writing/`, and `type`-based lines above and below EXACTLY as they are — they are not system pages.

- [ ] **Step 5: Replace the system-page block in renderContent()**

Replace these lines (currently 98–103):

```ts
    if (s === "graph") return <Suspense fallback={<div>Loading map...</div>}><GraphView /></Suspense>
    if (s === "chess") return <Suspense fallback={<div>Loading board...</div>}><ChessPage /></Suspense>
    // photography is no longer a system page — Photography.md renders normally with <PhotoAlbums />
    if (s === "bookshelf") return <Suspense fallback={<div>Loading shelf...</div>}><BookshelfPage /></Suspense>
    if (s === "movieshelf") return <Suspense fallback={<div>Loading shelf...</div>}><MovieshelfPage /></Suspense>
    if (s === "music-library") return <Suspense fallback={<div>Loading library...</div>}><MusicPage /></Suspense>
```

with:

```ts
    // photography is no longer a system page — Photography.md renders normally with <PhotoAlbums />
    const sysPage = SYSTEM_PAGES[s]
    if (sysPage) {
      const SysComponent = sysPage.component
      return <Suspense fallback={<div>{sysPage.loading}</div>}><SysComponent /></Suspense>
    }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (exit 0). If errors reference removed `GraphView`/`ChessPage`/etc. names, ensure all usages now go through `SYSTEM_PAGES`.

- [ ] **Step 7: Full build (parity gate)**

Run: `npm run build`
Expected: green, exit 0. This confirms the dynamic imports resolve.

- [ ] **Step 8: Browser parity check (CRITICAL)**

Run: `npm run dev`. In a browser (Playwright), visit each and confirm it renders its component (not a 404 / blank):
- `/chess` → chess board + "A small handmade machine..." header
- `/graph` → graph view (or "Mapping territories..." then graph)
- `/bookshelf` → bookshelf
- `/movieshelf` → movieshelf
- `/music-library` → music library
- `/graph` dedicated route still works (it's separate in router.tsx)

If any fails, STOP and fix before committing.

- [ ] **Step 9: Commit**

```bash
git add src/config/system-pages.ts src/components/ui/NoteRenderer.tsx
git commit -m "refactor: systemPages registry as single source of truth for system pages"
```

---

## Task 2: heXO game logic (pure, unit-checked)

**Files:**
- Create: `src/lib/hexo.ts`

- [ ] **Step 1: Write the logic module**

Create `src/lib/hexo.ts`:

```ts
export type Player = 1 | 2

export interface HexoState {
  stones: Map<string, Player>   // key "q,r" → player
  turn: Player
  placedThisTurn: number
  stonesPerTurn: number         // 1 on first turn, 2 after
  moveNumber: number
  winner: Player | null
  winningLine: string[] | null
}

export function key(q: number, r: number): string {
  return `${q},${r}`
}

export function initialState(): HexoState {
  return {
    stones: new Map(),
    turn: 1,
    placedThisTurn: 0,
    stonesPerTurn: 1,
    moveNumber: 1,
    winner: null,
    winningLine: null,
  }
}

// The 3 hex axes as direction pairs (axial coords, pointy-top).
const AXES: Array<[[number, number], [number, number]]> = [
  [[1, 0], [-1, 0]],
  [[0, 1], [0, -1]],
  [[1, -1], [-1, 1]],
]

/** From the just-placed cell, return the keys of a ≥6 same-player line, else null. */
export function checkWin(
  stones: Map<string, Player>,
  q: number,
  r: number,
  player: Player,
): string[] | null {
  for (const [dirA, dirB] of AXES) {
    const line: string[] = [key(q, r)]
    // extend in dirA
    let cq = q + dirA[0], cr = r + dirA[1]
    while (stones.get(key(cq, cr)) === player) { line.push(key(cq, cr)); cq += dirA[0]; cr += dirA[1] }
    // extend in dirB
    cq = q + dirB[0]; cr = r + dirB[1]
    while (stones.get(key(cq, cr)) === player) { line.unshift(key(cq, cr)); cq += dirB[0]; cr += dirB[1] }
    if (line.length >= 6) return line
  }
  return null
}

/** Pure: place a stone for the current turn's player. Illegal moves return state unchanged. */
export function placeStone(state: HexoState, q: number, r: number): HexoState {
  if (state.winner !== null) return state
  const k = key(q, r)
  if (state.stones.has(k)) return state

  const stones = new Map(state.stones)
  stones.set(k, state.turn)

  const winningLine = checkWin(stones, q, r, state.turn)
  if (winningLine) {
    return { ...state, stones, placedThisTurn: state.placedThisTurn + 1, winner: state.turn, winningLine }
  }

  const placedThisTurn = state.placedThisTurn + 1
  if (placedThisTurn >= state.stonesPerTurn) {
    // turn complete
    return {
      ...state,
      stones,
      turn: state.turn === 1 ? 2 : 1,
      placedThisTurn: 0,
      stonesPerTurn: 2,
      moveNumber: state.moveNumber + 1,
    }
  }
  return { ...state, stones, placedThisTurn }
}

/** Stones remaining to place this turn. */
export function stonesLeft(state: HexoState): number {
  return state.stonesPerTurn - state.placedThisTurn
}
```

- [ ] **Step 2: Write a logic check script**

Create a temp file `hexocheck.ts` in the repo root:

```ts
import { initialState, placeStone, checkWin, key, stonesLeft, type HexoState } from "./src/lib/hexo"

function assert(cond: boolean, msg: string) { console.log((cond ? "PASS" : "FAIL!!!") + " — " + msg) }

// First turn places exactly 1 then passes to player 2
let s: HexoState = initialState()
assert(s.turn === 1 && s.stonesPerTurn === 1, "first turn: player 1, 1 stone")
s = placeStone(s, 0, 0)
assert(s.turn === 2 && s.stonesPerTurn === 2, "after 1 stone, turn → player 2 with 2/turn")

// Player 2 must place 2 before passing
s = placeStone(s, 5, 5)
assert(s.turn === 2 && stonesLeft(s) === 1, "player 2 placed 1 of 2, still their turn")
s = placeStone(s, 6, 6)
assert(s.turn === 1, "player 2 placed 2, turn → player 1")

// Occupied cell rejected
const before = s.stones.size
s = placeStone(s, 0, 0)
assert(s.stones.size === before, "occupied cell rejected")

// Win detection on axis 1: build 6 player-1 stones in a row (q axis)
const stones = new Map<string, 1 | 2>()
for (let i = 0; i < 5; i++) stones.set(key(i, 0), 1)
let w = checkWin(stones, 4, 0, 1)
assert(w === null, "5 in a row is not a win")
stones.set(key(5, 0), 1)
w = checkWin(stones, 5, 0, 1)
assert(w !== null && w.length >= 6, "6 in a row (q-axis) is a win")

// Win on axis 3 (diagonal q-r): (0,0)(1,-1)(2,-2)...(5,-5)
const diag = new Map<string, 1 | 2>()
for (let i = 0; i < 6; i++) diag.set(key(i, -i), 2)
const wd = checkWin(diag, 5, -5, 2)
assert(wd !== null && wd.length >= 6, "6 in a row (q-r axis) is a win")

// Post-win placement rejected
let s2 = initialState()
const big = new Map<string, 1 | 2>()
for (let i = 0; i < 6; i++) big.set(key(i, 0), 1)
s2 = { ...s2, stones: big, winner: 1, winningLine: [...big.keys()] }
const s3 = placeStone(s2, 9, 9)
assert(s3.stones.size === s2.stones.size, "no placement after win")

console.log("done")
```

- [ ] **Step 3: Run the logic check**

Run: `npx tsx hexocheck.ts`
Expected: every line prints `PASS`. If any `FAIL!!!`, fix `hexo.ts` before continuing.

- [ ] **Step 4: Typecheck + clean up**

Run: `npx tsc --noEmit` → clean.
Run: `rm hexocheck.ts` (don't commit the throwaway).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hexo.ts
git commit -m "feat(hexo): pure Connect-6 hex game logic"
```

---

## Task 3: heXO board component + styling

**Files:**
- Create: `src/components/ui/HexoPage.tsx`
- Create: `src/components/ui/HexoPage.module.scss`
- Modify: `src/config/system-pages.ts` (add the `hexo` entry)
- Create: `content/heXO.md`

- [ ] **Step 1: Create the component**

Create `src/components/ui/HexoPage.tsx`:

```tsx
import { useState, useMemo, useRef, useCallback } from "react"
import { initialState, placeStone, key, stonesLeft, type HexoState } from "@/lib/hexo"
import styles from "./HexoPage.module.scss"

const HEX_SIZE = 22 // px radius
const MARGIN_RING = 3 // empty hexes drawn beyond placed stones

// axial → pixel (pointy-top)
function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2)
  const y = HEX_SIZE * (3 / 2) * r
  return { x, y }
}

// polygon points for a pointy-top hex centred at (cx,cy)
function hexPoints(cx: number, cy: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    pts.push(`${(cx + HEX_SIZE * Math.cos(angle)).toFixed(2)},${(cy + HEX_SIZE * Math.sin(angle)).toFixed(2)}`)
  }
  return pts.join(" ")
}

export function HexoPage() {
  const [state, setState] = useState<HexoState>(initialState())
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  // Visible cell set: all placed cells ∪ neighbours ∪ margin ring, min 9×9 patch at origin.
  const cells = useMemo(() => {
    const set = new Set<string>()
    let minQ = -4, maxQ = 4, minR = -4, maxR = 4
    for (const k of state.stones.keys()) {
      const [q, r] = k.split(",").map(Number)
      minQ = Math.min(minQ, q - MARGIN_RING); maxQ = Math.max(maxQ, q + MARGIN_RING)
      minR = Math.min(minR, r - MARGIN_RING); maxR = Math.max(maxR, r + MARGIN_RING)
    }
    for (let r = minR; r <= maxR; r++)
      for (let q = minQ; q <= maxQ; q++)
        set.add(key(q, r))
    return [...set].map((k) => {
      const [q, r] = k.split(",").map(Number)
      return { q, r, k }
    })
  }, [state.stones])

  const onCellClick = useCallback((q: number, r: number) => {
    if (dragRef.current?.moved) return // ignore click that ended a drag
    setState((s) => placeStone(s, q, r))
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const nx = e.clientX - dragRef.current.x
    const ny = e.clientY - dragRef.current.y
    if (Math.abs(nx - pan.x) > 2 || Math.abs(ny - pan.y) > 2) dragRef.current.moved = true
    setPan({ x: nx, y: ny })
  }
  const onPointerUp = () => { setTimeout(() => { dragRef.current = null }, 0) }

  const winningSet = useMemo(
    () => new Set(state.winningLine ?? []),
    [state.winningLine],
  )

  const status = state.winner
    ? `Player ${state.winner} wins!`
    : `Player ${state.turn} — place ${state.stonesPerTurn} stone${state.stonesPerTurn > 1 ? "s" : ""} (${stonesLeft(state)} left)`

  return (
    <div className={styles.hexoContainer}>
      <header className={styles.header}>
        <h1>heXO</h1>
        <p>Connect six on an endless field of hexes.</p>
      </header>

      <div className={styles.layout}>
        <div className={styles.boardWrapper} data-win={state.winner ? "true" : undefined}>
          <svg
            className={styles.board}
            viewBox="0 0 600 480"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <g transform={`translate(${300 + pan.x}, ${240 + pan.y}) scale(${zoom})`}>
              {cells.map(({ q, r, k }) => {
                const { x, y } = hexToPixel(q, r)
                const owner = state.stones.get(k)
                const isWin = winningSet.has(k)
                return (
                  <g key={k}>
                    <polygon
                      points={hexPoints(x, y)}
                      className={styles.cell}
                      onClick={() => onCellClick(q, r)}
                    />
                    {owner && (
                      <circle
                        cx={x}
                        cy={y}
                        r={HEX_SIZE * 0.62}
                        className={`${styles.stone} ${owner === 1 ? styles.stoneP1 : styles.stoneP2} ${isWin ? styles.stoneWin : ""}`}
                      />
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>

        <div className={styles.controls}>
          <div className={styles.statusBox}>
            <div className={styles.statusText}>{status}</div>
            <button className={styles.resetBtn} onClick={() => { setState(initialState()); setPan({ x: 0, y: 0 }); setZoom(1) }}>
              New Game
            </button>
          </div>
          <div className={styles.zoomRow}>
            <button className={styles.zoomBtn} onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} title="Zoom out">−</button>
            <button className={styles.zoomBtn} onClick={() => setZoom((z) => Math.min(2, z + 0.15))} title="Zoom in">+</button>
            <button className={styles.zoomBtn} onClick={() => setPan({ x: 0, y: 0 })} title="Recenter">⌖</button>
          </div>
          <div className={styles.legend}>
            <span><span className={`${styles.swatch} ${styles.stoneP1}`} /> Player 1</span>
            <span><span className={`${styles.swatch} ${styles.stoneP2}`} /> Player 2</span>
          </div>
          <p className={styles.rules}>
            Player 1 places one stone to open. After that, each player places two stones per
            turn. First to six in a row — along any of the three directions — wins. Drag to
            pan.
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the SCSS module**

Create `src/components/ui/HexoPage.module.scss`:

```scss
.hexoContainer {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-8) 0;
  font-family: var(--font-code);
}

.header {
  text-align: center;
  margin-bottom: var(--space-12);

  h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
  p { opacity: 0.5; font-size: 0.9rem; letter-spacing: 1px; }
}

.layout {
  display: flex;
  gap: var(--space-12);
  align-items: flex-start;

  @media (max-width: 800px) {
    flex-direction: column;
    align-items: center;
  }
}

.boardWrapper {
  flex: 1;
  max-width: 600px;
  width: 100%;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.02);
  overflow: hidden;
  touch-action: none;

  &[data-win="true"] {
    animation: hexoWinGlow 0.6s ease-out;
    box-shadow: 0 0 24px 4px color-mix(in srgb, var(--color-accent-base) 50%, transparent);
  }
}

.board {
  width: 100%;
  height: auto;
  display: block;
  cursor: grab;
  &:active { cursor: grabbing; }
}

.cell {
  fill: transparent;
  stroke: color-mix(in srgb, var(--color-border) 80%, transparent);
  stroke-width: 1;
  cursor: pointer;
  &:hover { fill: color-mix(in srgb, var(--color-accent-base) 12%, transparent); }
}

.stone {
  pointer-events: none;
  stroke: var(--color-border);
  stroke-width: 1;
}
.stoneP1 { fill: var(--color-accent-base); }
.stoneP2 { fill: var(--color-text); }
.stoneWin { stroke: var(--color-accent-base); stroke-width: 2.5; }

.controls {
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.statusBox {
  background: rgba(255, 255, 255, 0.02);
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.statusText {
  font-size: 0.85rem;
  margin-bottom: 1rem;
  color: var(--color-primary);
}

.resetBtn {
  width: 100%;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--color-text-muted);
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-code);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  &:hover { background: rgba(255, 255, 255, 0.05); color: var(--color-text); }
}

.zoomRow { display: flex; gap: 0.5rem; }
.zoomBtn {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: var(--color-text-muted);
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-code);
  &:hover { background: rgba(255, 255, 255, 0.06); color: var(--color-text); }
}

.legend {
  display: flex;
  gap: 1rem;
  font-size: 0.7rem;
  opacity: 0.7;
  span { display: inline-flex; align-items: center; gap: 0.35rem; }
}
.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
}

.rules {
  font-size: 0.7rem;
  opacity: 0.5;
  line-height: 1.5;
}

@keyframes hexoWinGlow {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
}

@media (prefers-reduced-motion: reduce) {
  .boardWrapper[data-win="true"] { animation: none; }
}
```

- [ ] **Step 3: Register hexo in the registry**

In `src/config/system-pages.ts`, add to `SYSTEM_PAGES` (after the `chess` entry):

```ts
  hexo:            { component: lazy(() => import("@/components/ui/HexoPage").then(m => ({ default: m.HexoPage }))),           layout: "article", loading: "Loading board..." },
```

- [ ] **Step 4: Create the content stub**

Create `content/heXO.md`:

```markdown
---
title: heXO
tags: [games]
---
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → green (this also runs prebuild, which picks up `content/heXO.md`).

- [ ] **Step 6: Browser check**

Run: `npm run dev`, open `/hexo` (Playwright, SVG IS clickable):
- Place first stone (click a hex) → status shows "Player 2 — place 2 stones (2 left)".
- Place 2 player-2 stones → turn returns to Player 1.
- Build 6 in a row → "Player N wins!" + flourish + winning stones highlighted.
- Drag to pan; +/− zoom; ⌖ recenters; New Game resets.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/HexoPage.tsx src/components/ui/HexoPage.module.scss src/config/system-pages.ts content/heXO.md
git commit -m "feat(hexo): SVG board, pan/zoom, win flourish; register as system page"
```

---

## Task 4: /arcade index page

**Files:**
- Create: `src/components/ui/ArcadePage.tsx`
- Create: `src/components/ui/ArcadePage.module.scss`
- Modify: `src/config/system-pages.ts` (add `arcade` entry)
- Create: `content/Arcade.md`

- [ ] **Step 1: Create the component**

Create `src/components/ui/ArcadePage.tsx`:

```tsx
import { Link } from "@tanstack/react-router"
import styles from "./ArcadePage.module.scss"

interface GameCard {
  slug: string | null
  name: string
  blurb: string
  live: boolean
}

const GAMES: GameCard[] = [
  { slug: "chess", name: "Chess", blurb: "Play a small handmade machine.", live: true },
  { slug: "hexo", name: "heXO", blurb: "Connect six on endless hexes.", live: true },
  { slug: null, name: "Snake", blurb: "Coming soon.", live: false },
  { slug: null, name: "Blackjack", blurb: "Coming soon.", live: false },
]

export function ArcadePage() {
  return (
    <div className={styles.arcadeContainer}>
      <header className={styles.header}>
        <h1>Arcade</h1>
        <p>A small cabinet of simple games.</p>
      </header>
      <div className={styles.grid}>
        {GAMES.map((g) =>
          g.live && g.slug ? (
            <Link key={g.name} to="/$" params={{ _splat: g.slug }} className={styles.card}>
              <span className={styles.cardName}>{g.name}</span>
              <span className={styles.cardBlurb}>{g.blurb}</span>
            </Link>
          ) : (
            <div key={g.name} className={`${styles.card} ${styles.cardDisabled}`}>
              <span className={styles.cardName}>{g.name}</span>
              <span className={styles.cardBlurb}>{g.blurb}</span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
```

NOTE on the `Link`: the catch-all route is `path: "$"`. TanStack's splat param is `_splat`. If `to="/$" params={{ _splat: g.slug }}` fails typecheck, fall back to a plain anchor `<a href={`/${g.slug}`}>` — internal navigation still works because `usePanelClick` / the router intercept it on the main shell. Prefer the `Link`; use the anchor only if the typed route API rejects it.

- [ ] **Step 2: Create the SCSS module**

Create `src/components/ui/ArcadePage.module.scss`:

```scss
.arcadeContainer {
  max-width: 760px;
  margin: 0 auto;
  padding: var(--space-8) 0;
  font-family: var(--font-code);
}

.header {
  text-align: center;
  margin-bottom: var(--space-12);

  h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
  p { opacity: 0.5; font-size: 0.9rem; letter-spacing: 1px; }
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;

  @media (max-width: 600px) { grid-template-columns: 1fr; }
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  text-decoration: none;
  color: var(--color-text);
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-accent-base);
    background: color-mix(in srgb, var(--color-accent-base) 8%, transparent);
  }
}

.cardDisabled {
  opacity: 0.4;
  pointer-events: none;
  &:hover { border-color: var(--color-border); background: rgba(255, 255, 255, 0.02); }
}

.cardName {
  font-size: 1.1rem;
  color: var(--color-primary);
}

.cardBlurb {
  font-size: 0.75rem;
  opacity: 0.6;
}
```

- [ ] **Step 3: Register arcade**

In `src/config/system-pages.ts`, add:

```ts
  arcade:          { component: lazy(() => import("@/components/ui/ArcadePage").then(m => ({ default: m.ArcadePage }))),       layout: "article", loading: "Loading arcade..." },
```

- [ ] **Step 4: Content stub**

Create `content/Arcade.md`:

```markdown
---
title: Arcade
tags: [games]
---
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit` → clean. If the `Link` typing fails, switch to the `<a href>` fallback noted in Step 1 and re-run.
Run: `npm run build` → green.

- [ ] **Step 6: Browser check**

`npm run dev`, open `/arcade`:
- Chess and heXO cards render and link (clicking navigates to `/chess`, `/hexo`).
- Snake and Blackjack render greyed and are not clickable.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/ArcadePage.tsx src/components/ui/ArcadePage.module.scss src/config/system-pages.ts content/Arcade.md
git commit -m "feat(arcade): /arcade index page listing games"
```

---

## Task 5: Docs

**Files:**
- Modify: `docs/future.md`
- Modify: `docs/garden.md`

- [ ] **Step 1: File the deferred org review in docs/future.md**

Under the "Refactoring & Technical Debt" section (Tier headings), add a new entry:

```markdown
### Tier: Deferred org review (reviewed 2026-06-09)

- [ ] **Split `src/worker.ts`** (1888 lines, ~55 functions) into `worker/{chat,auth,wiki,stonks,admin,meta}.ts` + a thin dispatcher. Highest manageability win; needs a verification deploy to confirm CF handles a multi-file Worker entry. Deliberately deferred.
- [ ] **Group `src/components/ui/`** (56 flat files) into `ui/{chat,wiki,games,shelves}/`. Pure tidiness, no functional gain, churns every import path. Low priority.
- [x] **systemPages registry**: `src/config/system-pages.ts` is now the single source of truth for system-page slug → component + layout, consumed by `NoteRenderer`. (2026-06-09)
```

- [ ] **Step 2: Record shipped items in docs/garden.md**

In the feature list, add:

```markdown
- [x] heXO: Connect-6 on an "infinite" hex grid (SVG board, pan/zoom, hotseat 2-player)
- [x] Arcade: `/arcade` index page listing games (Chess, heXO; Snake/Blackjack coming soon)
```

- [ ] **Step 3: Commit**

```bash
git add docs/future.md docs/garden.md
git commit -m "docs: record systemPages registry + heXO + arcade; file deferred org review"
```

---

## Final verification (whole feature)

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` green.
- [ ] Browser: every EXISTING system page (`/chess`, `/graph`, `/bookshelf`, `/movieshelf`, `/music-library`) still renders (registry parity).
- [ ] Browser: `/hexo` fully playable (place, turn alternation, win + flourish, pan/zoom/reset).
- [ ] Browser: `/arcade` lists games and links work.
- [ ] No stray throwaway files committed (`hexocheck.ts` removed).

---

## Self-Review (completed)

- **Spec coverage:** registry (T1), heXO logic (T2), heXO board (T3), arcade (T4), docs incl. deferred org review (T5). All spec parts mapped.
- **Type consistency:** `HexoState`, `placeStone`, `checkWin`, `key`, `stonesLeft`, `initialState`, `Player` defined in T2 and used identically in T3. `SystemPage`/`SYSTEM_PAGES` consistent T1↔T3↔T4. `HEX_SIZE`, `hexToPixel`, `hexPoints` internal to T3.
- **Placeholder scan:** no TBD/TODO. heXO header/copy concrete. Registry-between-tasks build hazard explicitly handled (hexo/arcade lines added only when their components exist).
- **Parity emphasis:** T1 has explicit baseline + build + browser gates before commit, per the user's "verify extensively" ask.
- **Out of scope:** worker.ts split, ui/ folder grouping (filed to docs), Snake/Blackjack impls.
