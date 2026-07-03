# Subsurface — build spec: `chamber` background mode + `SIGIL` arcade page

Two independent deliverables in the "1-bit techno-occult blueprint" register, built to match the
existing `BgCanvas.tsx` conventions. Deliverable 1 (background) is near-paste-in. Deliverable 2
(arcade page) is a full design + algorithms; integration points that aren't visible in the shared
file are flagged **[LOCATE]** for you to resolve by analogy to the existing `chess` / `hexo` games.

Everything here is client-side. No Cloudflare Worker, no server, no build-step changes.

---

## Conventions this must honour (from BgCanvas.tsx)

- A mode is a `drawX(ctx, state, config)` fn, dispatched from the `if/else` chain in `draw()`.
- Colour comes **only** from `state.colorCache`: `.secondary` (a single pen; primary colour) and
  `.palette` (array of 5 CSS-var colours). Never hardcode colours.
- **Every** alpha is multiplied by `state.readerAlpha` (reader-mode dimming).
- Per-mode params live in `config.backgrounds.<mode>`.
- Reduced motion paints **one** static frame with no loop — a mode must look composed on frame 0.
- The cursor (`state.mx`, `state.my`, init `-9999`) is a soft actor, never a hard controller.
- Mutable per-frame state hangs off `stateRef.current`.
- `simplex(x, y)` is available module-scope.
- Perf ethos in this file: avoid `ctx.save/restore` in hot loops; prefer `fillRect` for many dots.

---

# DELIVERABLE 1 — `chamber` background mode

**Concept.** A bubble/cloud-chamber particle field. A few emitters drift on a slow Lissajous;
each periodically fires a *track* — a particle advected through the `simplex` flow field with a
constant curl (so tracks arc/spiral like charged particles), leaving a stippled trail that lingers
then fades. Mostly monochrome (`palette[0]`), with a small fraction of "signal" tracks in an accent
pen. The cursor renders as a drafting reticle + live coordinate readout. Tracks are **integrated
once at spawn** (cheap to redraw; only their alpha ages), pooled and capped.

### 1.1 Edit: `stateRef.current` initial object (~lines 97–114)
Add two fields:
```ts
    emitters: [] as any[],
    tracks: [] as any[],
```

### 1.2 Edit: dispatch in `draw()` (~lines 213–225)
Add a branch:
```ts
      } else if (bgMode === "chamber") {
        drawChamber(ctx, state, config)
```

### 1.3 Edit: `resize()` (~line 157, next to `stateRef.current.boids = []`)
Optional but tidy — reposition emitters after a viewport change:
```ts
      stateRef.current.emitters = []
```

### 1.4 New module-scope code (place near `drawMurmuration`)
```ts
// ── Bubble-chamber background ──
// Drifting emitters fire particle "tracks" that curve through the simplex flow
// field (plus a constant curl for spiral arcs), leaving stippled trails that
// linger then fade — the particle-track / annotation-stream motif of plotter-era
// scientific plates. Tracks are integrated once at spawn (only alpha ages), so
// redraw is a flat loop of fillRects; the pool is capped. Mostly monochrome with
// a small fraction of accent "signal" tracks.
const CHAMBER_GLYPHS = "⊕⊗⊙∮∇∂≡·°"

function spawnTrack(state: any, p: any, now: number) {
  const e = state.emitters[(Math.random() * state.emitters.length) | 0]
  const charge = Math.random() < 0.5 ? 1 : -1
  let x = e.x, y = e.y
  let ang = Math.random() * Math.PI * 2
  const pts: { x: number; y: number }[] = [{ x, y }]
  for (let i = 0; i < p.steps; i++) {
    const fa = simplex(x * p.fieldScale, y * p.fieldScale + now * p.drift) * Math.PI * 2
    ang += Math.sin(fa - ang) * 0.35 + charge * p.curl   // steer toward field + curl
    x += Math.cos(ang) * p.stepLen
    y += Math.sin(ang) * p.stepLen
    pts.push({ x, y })
  }
  // mostly monochrome (palette[0]); occasional accent "signal" track
  const spot = p.spot ?? 0.15
  const ci = Math.random() < spot ? 1 + ((Math.random() * 3) | 0) : 0
  const head = pts[pts.length - 1]
  state.tracks.push({
    pts,
    life: 1 + Math.random() * 0.6,
    ci,
    glyph: Math.random() < p.glyphChance ? CHAMBER_GLYPHS[(Math.random() * CHAMBER_GLYPHS.length) | 0] : null,
    gx: head.x + 4,
    gy: head.y,
  })
}

function drawChamber(ctx: CanvasRenderingContext2D, state: any, config: any) {
  const p = config.backgrounds.chamber
  const W = state.w, H = state.h
  const now = performance.now() / 1000

  // lazy-init emitters + pre-warm a full-ish set of tracks so the very first
  // frame (and the reduced-motion one-shot) already looks composed.
  if (!state.emitters || state.emitters.length !== p.emitters) {
    state.emitters = Array.from({ length: p.emitters }, () => ({ x: W / 2, y: H / 2 }))
    state.tracks = []
    for (let i = 0; i < p.maxTracks * 0.6; i++) spawnTrack(state, p, now - Math.random() * 4)
  }

  // emitters wander on slow Lissajous curves → the convergence points drift
  for (let i = 0; i < state.emitters.length; i++) {
    const e = state.emitters[i]
    e.x = W * (0.5 + 0.34 * Math.sin(now * 0.05 + i * 2.1))
    e.y = H * (0.5 + 0.30 * Math.cos(now * 0.041 + i * 1.7))
  }

  if (state.tracks.length < p.maxTracks && Math.random() < p.spawnRate) spawnTrack(state, p, now)

  const pal = state.colorCache.palette
  state.tracks = state.tracks.filter((tr: any) => {
    tr.life -= p.fade
    if (tr.life <= 0) return false
    const a = Math.min(1, tr.life) * p.opacity * state.readerAlpha
    if (a < 0.008) return true
    ctx.fillStyle = pal[tr.ci] || state.colorCache.secondary
    ctx.globalAlpha = a
    for (let i = 0; i < tr.pts.length; i += p.gap) {
      const pt = tr.pts[i]
      const s = p.dot * (0.5 + 0.5 * (i / tr.pts.length))   // taper toward head
      ctx.fillRect(pt.x, pt.y, s, s)
    }
    // bright origin vertex (the convergence node)
    ctx.globalAlpha = Math.min(1, a * 1.6)
    ctx.fillRect(tr.pts[0].x - 1, tr.pts[0].y - 1, 2.4, 2.4)
    if (tr.glyph) {
      ctx.globalAlpha = a
      ctx.textAlign = "left"
      ctx.font = "10px 'IBM Plex Mono', monospace"
      ctx.fillText(tr.glyph, tr.gx, tr.gy)
    }
    return true
  })

  // drafting-terminal reticle + live coordinate readout at the cursor
  if (p.reticle && state.mx > -9000) {
    const r = 9
    ctx.globalAlpha = 0.5 * state.readerAlpha
    ctx.strokeStyle = state.colorCache.secondary
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(state.mx - r, state.my); ctx.lineTo(state.mx - 3, state.my)
    ctx.moveTo(state.mx + 3, state.my); ctx.lineTo(state.mx + r, state.my)
    ctx.moveTo(state.mx, state.my - r); ctx.lineTo(state.mx, state.my - 3)
    ctx.moveTo(state.mx, state.my + 3); ctx.lineTo(state.mx, state.my + r)
    ctx.stroke()
    ctx.globalAlpha = 0.35 * state.readerAlpha
    ctx.fillStyle = state.colorCache.secondary
    ctx.textAlign = "left"
    ctx.font = "9px 'IBM Plex Mono', monospace"
    const pad = (n: number) => n.toFixed(0).padStart(4, "0")
    ctx.fillText(`${pad(state.mx)}·${pad(state.my)}`, state.mx + 12, state.my - 8)
  }
  ctx.globalAlpha = 1
}
```

### 1.5 New config block — **[LOCATE]** the `config.backgrounds` object (in the store / config module)
```ts
chamber: {
  emitters: 3,       // convergence points
  spawnRate: 0.18,   // P(fire) per frame per call
  maxTracks: 90,     // pool cap
  steps: 34,         // integration steps per track
  stepLen: 7,        // px per step
  fieldScale: 0.0016,
  drift: 0.12,       // temporal drift of the field
  curl: 0.06,        // constant curl → spiral arcs
  fade: 0.006,       // life lost per frame
  dot: 1.3,          // stipple size
  gap: 2,            // draw every gap-th trail point
  opacity: 0.5,      // base track alpha (pre readerAlpha)
  spot: 0.15,        // fraction of accent "signal" tracks
  glyphChance: 0.15, // chance of an asemic head-annotation
  reticle: true,
},
```

### 1.6 Register in the mode picker — **[LOCATE]**
Wherever the user chooses `bgMode` (settings menu / cycler / the string union type), add
`"chamber"` with a label like **Chamber**. If `bgMode` is a TS union, extend it.

### 1.7 Notes
- Monochrome-first (`palette[0]`) keeps it ambient; `spot` sprinkles the signature signal-colour arcs.
- The pre-warm loop makes reduced-motion and frame-0 look intentional.
- Cost/frame ≈ `maxTracks × steps/gap` fillRects (~1.5k) — trivial, in line with other modes.
- Tuning for "more diagram, less physics": raise `curl`, lower `fade` (longer-lived arcs),
  raise `glyphChance`. For "denser telemetry": raise `maxTracks` + `spawnRate`, lower `stepLen`.

---

# DELIVERABLE 2 — `SIGIL` arcade page

**Concept.** A non-crossing path-routing puzzle (Numberlink / "flow" family) reskinned as an
inscribed occult diagram. Pairs of instrument-terminals sit on a plate; the player draws leader
lines connecting each pair; lines may not cross or overlap. A completed board reads as a drawn
sigil. On solve, the finished figure is "plotted" in one bright pen pass and the plate emits a seal
glyph + seed code. Abstract, generatable, think-y — the same family as `chess`/`hexo`, deliberately
different in look from `chamber`.

Name candidates if `SIGIL` clashes: `PLOTTER`, `LEADER`, `VELLUM`, `ASTROLABE`. Spec assumes slug
`sigil`.

### 2.1 Board model
```ts
type Cell = { x: number; y: number }
type Pair = { id: number; pen: number; glyph: string; a: Cell; b: Cell }
type Board = {
  n: number                     // grid is n×n
  pairs: Pair[]
  // player state:
  paths: Map<number, Cell[]>    // pairId -> ordered cells (a … b)
  owner: Int16Array             // n*n, cell -> pairId or -1
}
```
Two win modes via a `requireFill` flag:
- **connect** (default, approachable): every pair connected, no crossings.
- **fill** (classic Numberlink): the above **and** every cell covered.

### 2.2 Generator (guaranteed solvable)
Generate the solution first, then hand the player the endpoints.

1. Partition the whole grid into `K` contiguous simple paths (snakes) that tile every cell:
   - `owner` all `-1`. Repeat while unassigned cells remain: pick a random unassigned cell; do a
     self-avoiding random walk into unassigned 4-neighbours for a random length
     (`3 … 2·n`), assigning each stepped cell to the current pair id.
   - **Leftover absorption:** any unassigned cell with an assigned orthogonal neighbour is appended
     to that neighbour's path (extends an endpoint). Repeat to fixpoint.
   - If a stranded cell can't be absorbed (rare), **retry** the whole generation with the next seed
     (cheap). Cap ~20 retries before falling back to a smaller `K`.
2. Each resulting snake's two ends become a `Pair` (`a`, `b`); interior cells are cleared to empty.
   Because the generating snakes are themselves a legal solution, the board is solvable (and, in the
   partition, fillable).
3. Assign `pen = id % palette.length` and a distinct instrument `glyph` per pair.
4. Difficulty: `n` from 5→8 across levels; `K ≈ round(n * 0.9)`; seed via `hashStr(seedString)` for
   reproducible / daily plates.

Determinism: use a small seeded PRNG (mulberry32) keyed by the seed string so a given seed always
yields the same plate; **daily seed** = `YYYY-MM-DD` hashed (purely client-side).

### 2.3 Interaction
- **Draw:** pointer-down on a terminal (or the live end of its partial path) → drag across
  orthogonally-adjacent empty cells to extend; entering the matching terminal completes the pair;
  entering a cell owned by another pair **blocks** (path stops there); backtracking over your own
  path retracts it. Pointer-up commits the current partial.
- **Clear:** tap a completed/partial path (or its terminal) to erase it.
- **Undo/redo** stack of path edits. **New plate** re-generates (same difficulty). **Reset** clears
  all paths on the current plate.
- Touch: same gestures via pointer events; cell hit-testing with a generous radius.

### 2.4 Rendering (the look)
Canvas (matches repo). Colours from CSS vars, same as backgrounds. Draw order:
1. **Plate chrome:** ruler-tick frame + two corner registration blocks (barcode / segmented LED),
   reused from the composer aesthetic. Faint.
2. **Grid:** thin isometric *or* flat lattice (flat is easier to route on; offer iso as a skin).
3. **Terminals:** filled node + the pair's instrument glyph, in the pair's pen.
4. **Paths:** leader-line polylines through cell centres — rounded corners, 1px stipple overlay,
   a hair of hand-drawn jitter (deterministic per cell so it doesn't shimmer). Live path draws with
   a short "ink-flow" head animation.
5. **HUD:** par (min total length), moves, elapsed, level, seed. Monospace, cornered like telemetry.

**Solve flourish:** on win, run a ~700ms "PLOT" pass that re-strokes every path once in bright ink
head-to-tail (pen-plotter feel), stamp a generated **seal glyph** in the plate margin, and reveal
`SIGIL-<seed>`. Persist best (fewest moves / fastest / optimal-length) to `localStorage`
(`sigil.best.<n>`), and daily completion to `localStorage` (`sigil.daily.<date>`).

### 2.5 Scoring / loop
- **Par** = sum of Manhattan-ish minimum lengths of the generator solution (a true lower bound is
  NP-ish; the generator length is a fine "par" proxy — label it "plate length").
- Score surfaces: `moves`, `time`, and `length vs plate` (optimality %). Levels advance on solve;
  optional endless with rising `n`. Daily plate = one fixed seed/day with a shareable result string
  (client-only; no network).

### 2.6 Integration — **[LOCATE]** by analogy to `chess` / `hexo`
- **Page/route + component:** create the SIGIL game page the same way the existing games are wired
  (find the `chess` / `hexo` page components and their route registration; clone the pattern).
- **Slug registration:** register slug `sigil` in the games list / navigation so
  `activeGraphSlug === "sigil"` becomes reachable (same place `chess`/`hexo` are listed).
- **Themed background auto-switch — visible in BgCanvas.tsx (~lines 116–131):** extend the
  slug→bg map so entering the SIGIL page sets a fitting ambient bg. Suggested edit:
  ```ts
  const gameMode =
    slug === "chess" ? "chess" :
    slug === "hexo"  ? "hexo"  :
    slug === "sigil" ? "chamber" : null   // or a future "schematic" mode
  ```
  and add `"chamber"` (and any future themed mode) to the revert guard alongside `chess`/`hexo`:
  ```ts
  if (bgMode === "chess" || bgMode === "hexo" || bgMode === "chamber") { … }
  ```
  (Only include `chamber` in the revert guard if you want it treated as a page-scoped bg rather than
  a user-selectable one. If `chamber` should also be freely selectable, instead give SIGIL its own
  dedicated static plate mode and revert-guard that instead.)
- **Store:** SIGIL holds its own game state locally (no need to pollute the global store) beyond the
  existing `activeGraphSlug` navigation the other games already use.

### 2.7 Build order
1. Generator + solver-check (headless, unit-test the "always solvable" claim over many seeds).
2. Static render of a generated plate (chrome + grid + terminals).
3. Pointer routing + win detection (connect mode).
4. Chrome, HUD, undo, new/reset, fill mode toggle.
5. Solve flourish + seal glyph + localStorage bests + daily seed.
6. Wire route/slug + bg auto-switch.

---

# Appendix — further "looks" in this register (idea bank)

Cheap ambient bg modes, same drop-in shape as `chamber`, for future variety:

- **`schematic`** — leader lines from drifting anchor points to nothing; occasional right-angle
  dimension brackets; edge ruler ticks; sparse asemic glyph clusters fading in/out. The most
  literally "blueprint" mode; pairs naturally with SIGIL as its static themed bg.
- **`isometric`** — faint wireframe iso cubes drifting/rotating slowly, some inscribed with glyph
  columns; cursor parallax. Wireframe-only, so cheap.
- **`orrery`** — nested rotating astrolabe/armillary rings (thin arcs + tick radials) centred and
  slowly precessing; the scribe's instrument as pure geometry.
- **`plate-scan`** — a single Atkinson-dithered generative still (from the composer) rendered once
  and slowly panned/scanline-swept; almost zero per-frame cost.

Non-bg toys later, all client-side: an **oracle** (click to cast → generative plate + asemic
"reading" + seed), a **specimen plate** memory/matching game (image-1 taxonomy box), a **bubble-
chamber aiming** arcade (fire tracks through the field to hit specimen targets — reuses `chamber`
integration as the toy's physics).

Open questions worth settling before the agent starts: (1) is `chamber` a freely user-selectable
mode, a SIGIL-only themed bg, or both; (2) SIGIL default = connect or fill; (3) flat vs iso grid as
the shipping skin; (4) final name if not `SIGIL`.
