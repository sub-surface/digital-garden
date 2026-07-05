# PLATE — Generative Plate Composer

> **Working title.** `PLATE` dovetails with the vocabulary already in the repo
> (SIGIL renders a "plate", `plate-scan` is a bg mode, the IR's top object is a
> `Plate`). Alternatives to consider at approval: **CODEX**, **ATLAS**,
> **INCUNABULA**, **APPARATUS**, **FRONTISPIECE**, **VELLUM**. The arcade route
> slug is assumed `composer` here but tracks the final name.

Status: **draft for approval** · Owner: Leon · Target: in-repo arcade system page

---

## 0. One-paragraph pitch

A seeded, curatable engine for making **1-bit / low-bit-depth dithered plates** in
a nostalgic-mystical-technical idiom — isometric medieval-80s computer art,
cartographic survey plates, occult diagrams, manuscript pages, exploded
schematics, and everything between and beyond. It is built as a **vector-first
scene graph with a generative grammar over it**: the system proposes whole
compositions, you curate and nudge (lock, re-roll, swap, drag), and it renders to
crisp SVG which an optional **era pass** quantizes and dithers to a chosen
vintage output device (Mac 1-bit, Game Boy, CGA, phosphor terminal, plotter ink,
newsprint halftone…). Primary use is **album covers** (square by default), but it
outputs any ratio. Every plate is deterministic per seed, so every plate is a
shareable, citable artifact.

The single design thesis, learned from the prototype:

> **Variety must come from the top (composition), not just the bottom (texture).**
> The prototype looks samey because its layout is hardcoded and only its density
> sliders vary. We generate the *composition* itself.

---

## 1. Design principles

1. **Three decoupled layers.** An intermediate representation (IR) → a layout
   solver → a renderer. Nothing downstream bakes a decision that belongs
   upstream. The IR is born first and is the contract; the grammar, the editor,
   the serializer and the renderer all just read/write it.
2. **Vector-first, dither as finish.** Render the IR to SVG. Rasterize + quantize
   + dither only as an optional final "era" pass. This is historically correct
   (these originals are pen-plotter / vector-display works), keeps output crisp
   and scalable for the print store, and unlocks a genuine **AxiDraw plotter**
   path later (single-stroke Hershey text; per-seed asemic stroke-alphabets).
3. **Semantic pen registers.** Colour is 3–6 named *pens* assigned by **role**
   (structure / annotation / highlight / shadow / apparatus), never by literal
   hex at motif level. This is why the references feel coherent — they are
   spot-colour works — and it lets a whole plate be re-skinned or re-emulated
   without regenerating.
4. **Conducted randomness.** Generate → curate → override. Lock any element and
   re-roll the rest; re-roll one motif in place; re-roll layout keeping motifs.
   This is the interaction that turns a slot machine into a design tool. It is
   **v1**, not a nicety.
5. **Config-driven expansion.** Adding a *kind of image* = one **armature** JSON.
   Adding a *motif* = one generator function in the registry. Adding an *era* =
   one preset. This mirrors the repo's own "add a bg mode cheaply" pattern
   (`config.backgrounds.<mode>` + one `drawX` + one `BG_CONTROLS` entry).
6. **Determinism.** One seeded PRNG threaded through the whole pipeline. Same
   `(seed, salt, overrides)` → byte-identical IR → identical render. Enables
   permalinks, batch contact-sheets, headless tests, and breeding later.
7. **Render on demand, never a persistent loop.** The composer draws on change
   (like SIGIL), not on a `requestAnimationFrame` loop. The one exception is an
   optional one-shot "plot-in" flourish. (The animated `BgCanvas` is already
   CPU-heavy on this machine — the composer must not add a second always-on
   loop.)
8. **Elegance & house conventions.** `--font-code` chrome, token spacing,
   SIGIL-style ghost buttons (`1px solid var(--color-border)`, accent on hover),
   pens from the site accent system when asked. **The stage is never crushed into
   a centred box** — the composer is full-bleed (`data-fullbleed`).
9. **Failure is visible.** A motif that can't fit its slot, a palette that can't
   satisfy a pen role, an era that can't quantize — surfaces a legible mark or
   message, never a silent blank (design law from the repo).

---

## 2. Architecture — the three layers

```
seed ──▶ [ GRAMMAR ]                       compose the abstract plate
           pick archetype (armature)
           fill slots with motif requests
           declare connector intents + apparatus
              │
              ▼  abstract Plate (slots have requests, not geometry)
         [ LAYOUT SOLVER ]                 turn requests into geometry
           place nodes (grid + jitter / poisson / relaxation)
           resolve anchors
           route connectors (obstacle-aware)
              │
              ▼  concrete Plate (IR: everything has x/y/w/h + anchors)
         [ RENDERER ]
           IR ──▶ SVG            (vector, pen-coloured, self-contained)
           SVG ─▶ raster ─▶ era  (quantize + dither → PNG)   [optional]
```

The **editor** sits beside this: it reads the concrete IR, lets the user select /
lock / re-roll / drag / delete elements, and re-invokes whichever stage is needed
(re-roll-this-motif re-runs one generator; re-roll-layout re-runs the solver;
regenerate re-runs the grammar with a new salt).

---

## 3. The IR (intermediate representation)

Plain, serialisable data. This is the spine — everything else is a function over
it. TypeScript sketch (final types live in `src/lib/composer/types.ts`):

```ts
interface Plate {
  version: 1
  seed: string                 // human seed ("plate-8842" or a word)
  salt: number                 // regenerate counter within a seed
  archetype: string            // armature id, e.g. "centered-radial"
  ratio: [number, number]      // [1,1] album default; [4,5], [2,3], [16,9]…
  palette: Palette             // the pen registers in use
  era: string                  // render/era preset id, e.g. "mac-1bit"
  nodes: Node[]                // motif instances (the "specimens")
  connectors: Connector[]      // routed links between anchors
  apparatus: Apparatus[]       // frame, corners, legend, seal, captions
  post: PostParams             // era-independent tuning (ink bias, contrast…)
  meta: { title?: string; createdWith: string }
}

interface Node {
  id: string
  motif: string                // registry key, e.g. "voxel-mass"
  box: Box                     // resolved by the layout solver
  rotation?: number
  params: Record<string, number | string | boolean>  // motif-specific
  penRole: PenRole             // which register this node draws in
  anchors: Anchor[]            // resolved connection/label points
  locked: boolean              // frozen against re-roll
  z: number                    // painter order
}

type Box = { x: number; y: number; w: number; h: number }  // 0..1 plate-space

interface Anchor {
  id: string
  x: number; y: number         // plate-space 0..1
  kind: "port" | "label" | "mount"
  dir?: number                 // outward normal (radians) — routing hint
}

interface Connector {
  id: string
  from: string                 // anchor id
  to: string                   // anchor id
  route: "leader" | "manhattan" | "arc" | "dotted" | "stream" | "text-path"
  penRole: PenRole
  label?: string               // text ridden along the path (text-path/leader)
  params?: Record<string, number>
  locked: boolean
}

interface Apparatus {
  id: string
  kind: "frame" | "corner-reg" | "ruler" | "legend" | "seal" | "caption"
        | "scale-bar" | "compass" | "colophon"
  box?: Box
  penRole: PenRole
  data?: Record<string, unknown>   // e.g. legend entries, catalog code
  locked: boolean
}

type PenRole = "structure" | "annotation" | "highlight" | "shadow" | "apparatus"

interface Pen { role: PenRole; color: string; name: string }   // color = vector hex
interface Palette { id: string; name: string; pens: Pen[]; source: "named" | "accent" }

interface PostParams {
  inkBias: number      // -0.35..0.35, darken/lighten before threshold
  contrast: number     // 0.5..2.5
  handJitter: number   // 0..1, hand-drawn wobble amount
  lineWeight: number   // global stroke scaling
}
```

Design notes:

- **Everything is plate-space `0..1`**, resolution-independent. The renderer maps
  to whatever internal resolution it wants (default 2048px long edge). This makes
  ratio changes and high-res export trivial.
- **Anchors are resolved geometry**, computed by the motif generator at layout
  time and stored on the node. Connectors reference anchor ids, so re-routing is
  cheap and the editor can show ports.
- **`locked` at every level.** Lock a node, a connector, an apparatus item, or a
  pen. Re-roll only touches unlocked things.
- The IR round-trips to a compact URL code (§12).

---

## 4. Determinism & the re-roll model

A single `mulberry32` PRNG (as in the prototype and in `src/lib/sigil.ts`'s
hashing) seeded from `hash(seed) ^ hash(salt)`. The generator threads **one rng
instance** through grammar → layout → motifs → connectors → apparatus in a fixed
order, so a given `(seed, salt)` fully reproduces a plate.

Re-roll semantics — the heart of "conducted randomness":

| Action | What re-runs | What's preserved |
|---|---|---|
| **Regenerate** (⟳) | grammar + layout + everything, `salt++` | seed, palette, era, ratio, all `locked` elements |
| **Next / Prev seed** | everything, new seed | palette, era, ratio, post |
| **Re-roll this node** | one motif generator, new sub-seed | its box (stays put), everything else |
| **Re-roll layout** | solver only | all motif choices + params, palette |
| **Re-roll palette** | palette pick | geometry (pens are semantic — instant re-skin) |
| **Change era** | render pass only | the whole IR (device swap, not regen) |
| **Lock element** | nothing | freezes that element against all of the above |

Locked elements carry their resolved geometry/params verbatim into the next
generation; the solver treats locked node boxes as fixed obstacles so unlocked
elements arrange *around* them. This is what lets you "pin the good bits and shake
the rest."

---

## 5. Archetypes (armatures) — the variety engine

An **armature** is a JSON description of a top-level composition logic: a set of
**slots** plus constraints and connector intents. The grammar picks an armature
(weighted, seed-driven, or user-chosen), then fills each slot with a motif drawn
from that slot's allowed classes.

```ts
interface Armature {
  id: string
  name: string
  weight: number                      // selection probability
  tags: string[]                      // "mystical","cartographic","schematic"…
  slots: Slot[]
  connectorIntents: ConnectorIntent[] // how slots want to be linked
  apparatusIntents: ApparatusIntent[] // which chrome this composition wears
  layout: "radial" | "grid" | "axis" | "free" | "hero"  // solver strategy
  ratioAffinity?: [number, number][]  // ratios that suit it
}

interface Slot {
  id: string
  role: "focal" | "satellite" | "field" | "margin" | "caption"
  region: Box | RegionFn   // rough area (may be a fn of ratio) — solver jitters within
  count: [number, number]  // min..max instances to place here
  motifClasses: string[]   // e.g. ["voxel-mass","chamber","instrument"]
  penRole?: PenRole        // default register for this slot
  scale: [number, number]  // size range
}

interface ConnectorIntent {
  from: string; to: string          // slot ids (resolved to anchors at layout)
  route: Connector["route"] | "auto"
  density: number                   // 0..1 how many of the possible links to draw
}
```

### Starter armature set (v1)

Chosen to span the axes you named — *mystical-occult ↔ technical-schematic ↔
cartographic-survey ↔ medieval-manuscript* — **and the spaces between/beyond**.
Each is one file under `src/lib/composer/armatures/`.

1. **`centered-radial`** — *(mystical / astrolabe)* one dominant ring/orrery focal
   mass, satellites orbiting on a circle, radial leader lines to margin glyphs.
   Wears: outer frame, seal, corner-reg.
2. **`specimen-grid`** — *(cartographic / catalogue)* a lattice of small labelled
   specimens (2–4 columns), each with a catalog code and a leader to a caption.
   Wears: ruler frame, legend, colophon.
3. **`exploded-axis`** — *(technical / schematic)* one isometric mechanism blown
   apart along a diagonal axis, dotted leader lines to numbered parts, a legend
   keying the numbers. Wears: frame, scale-bar, corner-reg.
4. **`hero-annotated`** — *(between)* a single large motif (figure, chamber, voxel
   mass) off-centre, with a margin column of flowing annotation script and 2–3
   arced leaders. Wears: frame, caption, seal.
5. **`survey-field`** — *(cartographic)* a full-bleed contour/terrain field with
   survey marks, a compass rose, a scale bar and a legend cartouche; sparse nodes
   sit *on* the field. Wears: compass, scale-bar, ruler frame.
6. **`manuscript-page`** — *(medieval)* a two-column asemic text body with an
   illuminated initial (a motif in a decorated box), marginalia motifs, and a
   rubricated header. Wears: frame, drop-cap apparatus, colophon.
7. **`cascade-stream`** — *(beyond)* a diagonal current of nodes joined by
   particle-stream connectors, reading like signal flow or alchemy stages.
   Wears: minimal frame, corner-reg.
8. **`constellation-web`** — *(mystical / technical hybrid)* a node-graph of
   instruments/glyphs joined by thin lines with distance labels, over a faint
   star-field. Wears: frame, legend.

The armature's `tags` feed a **vibe filter** in the UI (§11) so you can bias
generation toward, say, `cartographic` without hand-picking one archetype — which
is exactly your "tune it toward a vibe" ask.

### Layout solver

Per `Armature.layout` strategy:

- **radial** — place satellites on a jittered circle around the focal slot;
  golden-angle spacing to avoid clumping.
- **grid** — poisson-ish jittered lattice within the slot region; snap columns.
- **axis** — distribute along a line with perpendicular offset noise.
- **hero** — one large box by rule-of-thirds; pack margins with the rest.
- **free** — Lloyd-relaxation of node centroids with locked boxes as fixed points;
  a few iterations, cheap.

All strategies honour locked node boxes as fixed obstacles and keep nodes inside
the plate's safe margin. After placement, each motif's generator is asked for its
anchors given its final box; then connectors route.

---

## 6. Motif registry

A motif is a **pure generator**:

```ts
type MotifGen = (rng: Rng, box: Box, params: MotifParams, ctx: MotifCtx)
  => { primitives: Prim[]; anchors: Anchor[] }
```

`Prim` is a small vector vocabulary (`line`, `polyline`, `polygon`, `circle`,
`arc`, `path`, `text`, `hatch`, `iso-cube`) tagged with a `penRole` and stroke/fill
intent. Motifs emit primitives + anchors only; they never pick colour or dither —
the renderer resolves `penRole → pen → era colour`.

Each motif declares metadata for the UI: display name, `motifClasses` it belongs
to, and an editable param schema (labels, ranges, steps) — reused by the inspector
exactly like `ThemePanel`'s `BG_CONTROLS` maps a mode → its sliders.

### Starter motifs (v1)

Lifting heavily from code that already exists in `BgCanvas`:

| Motif | Reuses | Classes |
|---|---|---|
| `voxel-mass` | `drawIsometric` cube projection + prototype's inscribed faces | focal, satellite |
| `chamber` | `drawChamber` wireframe vault | focal |
| `orrery-rings` | `drawOrrery` astrolabe rings | focal |
| `node-graph` | `drawGraph` | field, focal |
| `contour-field` | `buildPlate` simplex octaves | field |
| `specimen-panel` | new — framed small object + label | satellite |
| `geometer` | new — procedural robed figure (from prototype's `drawFigure`, parameterised) | focal, satellite |
| `instrument` | new — dividers / sextant / coil / retort from a small parts kit | satellite |
| `asemic-script` | prototype's `drawGlyph`, upgraded (below) | field, margin, caption |
| `glyph-seal` | SIGIL's radial seal generator | satellite, apparatus |
| `lattice` | new — molecular/crystal node-and-bond | field, focal |

### Per-seed stroke-alphabet (asemic script)

Upgrade the prototype's random-per-glyph drawing to a **coherent invented
alphabet per seed**: at generation time, synthesise ~24 glyph "letterforms" as
stroke sets from the rng, then *reuse* them across the plate so the script looks
like a real writing system rather than noise. This is the detail that most sells
"ancient document." Optionally seed a handful of recurring "words". The alphabet
is stored on the Plate so it's stable across re-renders and eras, and it doubles
as plotter-ready single-stroke text.

---

## 7. Connectors

Routed as a post-layout pass. Given `from`/`to` anchors and a `route` style:

- **leader** — straight line with a short elbow off the anchor normal; optional
  label at the far end. The workhorse annotation line.
- **manhattan** — orthogonal L/Z routing, obstacle-aware on the layout grid
  (simple A* over a coarse occupancy grid built from node boxes).
- **arc** — quadratic/cubic bezier bowed between anchors; the "dotted arc" of the
  references when combined with a dashed stroke.
- **dotted** — any of the above rendered with the plotter stipple (SIGIL's
  `setLineDash` re-trace technique).
- **stream** — a particle spray along the path (denser near source), for signal /
  alchemy-flow feel.
- **text-path** — the label text itself *is* the connector, glyphs laid along the
  curve (the beautiful move from the references).

Routing avoids node interiors via the occupancy grid; if no clean route exists it
falls back to a straight leader and marks it (failure visible, not hidden).

---

## 8. Apparatus & the generative lexicon

Apparatus is the chrome that makes a plate read as a *document*. Generators (in
`src/lib/composer/apparatus.ts`), most already prototyped in SIGIL:

- **frame** — inner/outer rule + tick ruler (SIGIL/`drawFrame`).
- **corner-reg** — segmented registration barcodes from a seed hash (SIGIL).
- **ruler / scale-bar** — measured edge; scale-bar with an invented unit.
- **legend / cartouche** — a small keyed table (number → term) for `exploded-axis`
  and `specimen-grid`.
- **seal** — radial sigil from a seed hash (SIGIL's seal).
- **caption / colophon** — a block of asemic or lexicon text; the "signed and
  dated" mark.
- **compass** — a rose for cartographic armatures.

### Lexicon

A small generative vocabulary that dresses anchors and apparatus and carries the
mood far more than any single motif:

- roman numerals, greek letters, catalog codes (`SPEC. IV·bd`), invented SI-ish
  units (`3.2 kп`, `Δ ourab`), plate numbers (`PL. XVII`), pseudo-coordinates,
  and short asemic captions.
- a themable token set per armature vibe (occult sigils vs survey abbreviations vs
  manuscript rubrics), so `cartographic` plates read survey-ish and `mystical`
  plates read grimoire-ish. Real Latin/label text is rendered with **Hershey
  single-stroke fonts** (plotter-correct, self-contained in the SVG); asemic text
  uses the per-seed alphabet.

---

## 9. Pen registers & palettes

Five semantic roles (§3). A **palette** binds each role to a vector colour. Two
sources:

- **named palettes** (fixed, curated): `phosphor` (green on black), `amber`,
  `manuscript` (sepia/oxblood/gold on cream), `blueprint` (cyan/white on navy),
  `alarm` (red/white/black), `newsprint` (greys), `signal` (yellow/black),
  `oxide`… Each is a JSON entry (`src/lib/composer/pens.ts`).
- **accent-derived**: pull from the site's ROYGBIV accent vars (as SIGIL does),
  so a plate can match the current site theme. Roles map to
  `--color-accent-base` / `--color-secondary` / `--color-text` / muted / border.

Because pens are semantic, **re-roll palette is instant and total** — the geometry
never changes. The palette chip is a rendered `legend`/`colophon` element too, so
the plate self-documents its own registers (functional UI *and* artwork).

Note the interaction with §10: the **vector pen colour** is what SVG export uses.
The **era pass** then maps each pen colour to the nearest colour available on the
target device. So "manuscript palette + Game Boy era" quantizes the sepia pens
into the DMG green ramp — a deliberately wrong, characterful cross that the tool
makes easy.

---

## 10. Era / bit-depth rendering — the emulation pass

This is the new pillar you asked for: **multiple bit-depths for different eras of
emulation.** The clean SVG is device-independent; an **era preset** defines how it
gets quantized and dithered to a vintage output.

Pipeline:

```
IR ──▶ SVG (pen colours, full precision)
        │  export as-is → .svg  (plotter / print / hi-res)
        ▼
   rasterize to internal buffer (2048px long edge, image-rendering: pixelated)
        ▼
   downsample to era.resolution (chunky pixels)
        ▼
   quantize pen/greyscale field → era.palette   (nearest in the device gamut)
        ▼
   dither with era.method (Bayer 2/4/8 · Atkinson · Floyd–Steinberg · blue-noise · none)
        ▼
   upscale nearest-neighbour to display/export size → .png
```

Era preset schema (`src/lib/composer/eras.ts` — one entry each, config-driven):

```ts
interface Era {
  id: string
  name: string
  palette: string[]        // device colours (hex). length encodes bit-depth
  resolution: number       // long-edge px BEFORE nearest-neighbour upscale
  dither: "bayer2" | "bayer4" | "bayer8" | "atkinson" | "floyd" | "bluenoise" | "none"
  pixelAspect?: number     // e.g. CGA non-square pixels
  paperTint?: string       // substrate colour under the ink (cream, black…)
  artifacts?: {            // all OFF by default — no glow (user preference)
    scanline?: number      // subtle row darkening, 0..1
    ntscBleed?: number     // horizontal chroma smear, 0..1
    posterizeChannels?: boolean
  }
}
```

### Starter era set (v1)

Ordered roughly by increasing colour, spanning the "eras of emulation":

1. **`plotter-ink`** — no raster: the SVG itself, single/limited pen, on paper
   tint. The "before pixels" era. (Export = SVG.)
2. **`mac-1bit`** — 1-bit black/white, **Atkinson** dither (Bill Atkinson's own
   algorithm — already in `buildPlate`), chunky ~2px, the QuickDraw look.
3. **`phosphor`** — 1-bit but green (or amber via a variant) on black, ordered
   Bayer, terminal. **No bloom/glow** (honours the repo's no-terminal-glow rule).
4. **`newsprint`** — greyscale, blue-noise / halftone stipple, warm paper tint —
   the manuscript/print-plate register.
5. **`gameboy-dmg`** — 4 shades of olive-green, 160×144 feel, ordered dither,
   fat pixels.
6. **`cga`** — 4 colours (classic cyan/magenta/white/black, plus the alt palette
   as a variant), 320×200, non-square pixels.
7. **`ega`** — 16 colours, 640×350, ordered dither.
8. **`c64`** — the 16-colour hardware palette, characterful mid-depth.
9. **`hi-res`** — full pen colour, light or no dither — the "modern giclée"
   register for when you want the clean vector look rasterized.

Adding an era later (Spectrum, MSX, Teletext, Atari, Hercules mono, Risograph
2-colour…) is one `Era` entry. The UI era picker is generated from the registry.

Key coupling: **pens are semantic, eras are devices.** The same plate can be shot
through any era; the tool makes cross-era re-emulation a single click, which is a
huge and cheap source of "not samey".

---

## 11. The editor UX

**Bespoke full-bleed shell** — deliberately *not* `GameCabinet` (its 680px cap is
the "crushed box" you flagged). The page's root div carries `data-fullbleed` so
`.game-stage` removes the width cap and lets it fill the pane (the
`ConstellationPage` precedent). Layout:

```
┌───────────────────────────────────────────────────────────┐
│  PLATE                              [seed ◀ 8842 ▶] [⤢] [↧] │  ← slim top bar
├───────────────┬───────────────────────────────────────────┤
│  CONTROL RAIL │                                            │
│  (collapsible)│              STAGE                          │
│               │        (the plate, large, centred          │
│  · Archetype  │         on a neutral working surface,       │
│  · Vibe tags  │         drop-shadowed; fills height)        │
│  · Palette    │                                            │
│  · Era        │        selection outlines + anchor ports    │
│  · Ratio      │        appear on hover/select               │
│  · Post       │                                            │
│  ─────────────│                                            │
│  INSPECTOR    │                                            │
│  (selected    │                                            │
│   element)    │                                            │
│  · lock       │                                            │
│  · re-roll    │                                            │
│  · params …   │                                            │
│  · pen role   │                                            │
│  · delete     │                                            │
├───────────────┴───────────────────────────────────────────┤
│  seed 8842 · centered-radial · manuscript · mac-1bit · 1:1 │  ← telemetry
└───────────────────────────────────────────────────────────┘
```

- **Stage** fills available height (`min-height: 0; flex: 1`), plate scaled to fit
  with a comfortable margin, on a subtle surface (not a hard box). Never capped to
  a small square. Zoom/pan optional (v1.1).
- **Control rail** is a left column (collapses to a top drawer under ~800px), using
  the schema-driven control pattern: each section's inputs are generated from a
  schema, same idea as `BG_CONTROLS`. Rail sections: Compose (archetype picker +
  vibe-tag toggles + Regenerate/Next/Prev/Random), Palette, Era, Ratio, Post
  (ink/contrast/jitter/weight sliders).
- **Inspector** appears when an element is selected: lock toggle, "re-roll this",
  motif/param sliders (from the motif's param schema), pen-role selector, delete,
  and z-order nudge. For connectors: route style + label. For apparatus: kind
  options.
- **Selection model.** Click selects the topmost element under the cursor
  (hit-test against node boxes / connector paths / apparatus). Drag moves a node
  (updates `box`, re-routes attached connectors). Shift-click multi-select.
  Everything is on the IR, so undo is just an IR snapshot stack (SIGIL pattern).
- **Fullscreen** via the native Fullscreen API on the stage element (robust;
  avoids the `data-zen` CSS bug on SIGIL/Collider).
- **Keyboard.** `Space`/`R` regenerate, `←/→` seed step, `L` lock selection, `Backspace`
  delete, `E` cycle era, `P` cycle palette, `F` fullscreen, `1..9` pick archetype,
  `Cmd/Ctrl+Z` undo. All discoverable via a `?` cheatsheet.
- **Buttons & type** follow SIGIL's control idiom (`--font-code`, `1px solid
  var(--color-border)`, `data-active` accent state) so it's instantly at home.
- **Accessibility.** Controls are real inputs/buttons with labels; the stage has a
  text summary of the current plate (archetype, motif count, palette, era) for
  screen readers; respects `prefers-reduced-motion` (skips the plot-in flourish).
- **Mobile.** Rail becomes a bottom sheet; stage stays full-width; generation and
  export work; heavy editing is desktop-first (acceptable — this is a studio tool).

---

## 12. Export, permalinks, batch

- **SVG export** — the clean vector plate (pen colours, Hershey text). Plotter- and
  print-ready. Filename `plate_<seed>[_<salt>].svg`.
- **PNG export** — the current era pass, at a chosen export size (1×/2×/4×), nearest
  neighbour so chunky pixels stay crisp. Album default 3000×3000.
- **Copy code / permalink** — the Plate serialises to a compact code (archetype +
  seed + salt + palette + era + ratio + lock/override deltas), packed into the URL
  hash: `/composer#<code>`. Opening the URL reconstructs the exact plate. Because
  generation is deterministic, the code need only store the *deltas* from the
  seed's canonical generation (locks, drags, param overrides), keeping it short.
- **Contact sheet** — render N seeds (e.g. 5×5) as thumbnails in a grid overlay;
  click one to open it in the editor. This is how you actually curate a generative
  system and it feeds the print-store "generate a grid, pick the sellable ones"
  workflow.
- **Ratios** — 1:1 (album, default), 4:5, 2:3, 3:4, 16:9, and a poster mode. The
  armature's `ratioAffinity` biases which compositions suit which ratio.

---

## 13. Code & file layout

```
src/lib/composer/                 ← pure, headlessly testable core (no React)
  types.ts                        IR + registry interfaces
  rng.ts                          mulberry32 + rr/ri/pick + hash (shared w/ sigil style)
  generate.ts                     seed → Plate (grammar → layout → connectors → apparatus)
  layout.ts                       the solver strategies
  connectors.ts                   routing + occupancy grid
  apparatus.ts                    frame/legend/seal/… + lexicon
  pens.ts                         named palettes + accent binding + role map
  eras.ts                         era presets
  hershey.ts                      single-stroke font (label text)
  armatures/                      one file per archetype + index registry
    centered-radial.ts  specimen-grid.ts  exploded-axis.ts  hero-annotated.ts
    survey-field.ts  manuscript-page.ts  cascade-stream.ts  constellation-web.ts
  motifs/                         one file per motif + index registry
    voxel-mass.ts  chamber.ts  orrery-rings.ts  node-graph.ts  contour-field.ts
    specimen-panel.ts  geometer.ts  instrument.ts  asemic-script.ts  glyph-seal.ts  lattice.ts
  render/
    svg.ts                        IR → SVG string/DOM
    raster.ts                     SVG → canvas → quantize + dither (era)
    dither.ts                     Bayer/Atkinson/Floyd/blue-noise kernels (lift buildPlate)
  serialize.ts                    Plate ↔ URL code

src/components/ui/composer/       ← the React shell
  ComposerPage.tsx                full-bleed shell, owns IR state + undo stack
  ComposerStage.tsx               canvas/SVG stage + selection/anchor overlay + fullscreen
  ComposerRail.tsx                archetype/vibe/palette/era/ratio/post controls (schema-driven)
  Inspector.tsx                   per-selection controls
  ContactSheet.tsx                N-seed thumbnail grid
  ComposerPage.module.scss  ComposerStage.module.scss  …

src/config/system-pages.ts        + one line: composer → ComposerPage, layout "game"
src/components/ui/games/ArcadePage.tsx  + one GameCard
scripts/test-composer.ts          headless: determinism, slot-fill validity,
                                   anchor resolution, serialize round-trip  (wired into `npm test`)
```

Notes:

- The core is **pure** and imported by both the page and the test script (SIGIL
  pattern). No DOM in `src/lib/composer/*` except `render/raster.ts` (which needs
  a canvas — guarded so headless tests skip it).
- **No new heavy deps.** Raw Canvas2D + hand-built SVG strings + a small Hershey
  font table. No p5.
- Plate state lives in the component + URL hash, **not** the Zustand store. The
  only things that would go through `PERSISTED_KEYS` are sticky UI prefs (default
  era/palette, reduced-render), and only if we decide we want them to persist.
- The composer **owns its stage surface**; it does not hijack the global `bgMode`
  (unlike SIGIL/Collider's chamber auto-switch). The animated bg simply sits
  behind the working surface. (We can add an optional themed-bg auto-switch later
  if wanted.)

---

## 14. Build sequence (milestones)

Each milestone ends with something on screen, so we're never far from a picture.

- **M0 — skeleton.** Route + arcade card + full-bleed shell + neutral stage that
  renders a hardcoded IR to SVG. Proves layout isn't crushed, SVG pipeline works.
- **M1 — IR + one armature + 3 motifs + solver.** `centered-radial` with
  `orrery-rings` + `voxel-mass` + `asemic-script`; seed/regenerate/next/prev.
  First *generated* plate.
- **M2 — pens + eras.** Semantic pens, 3 named palettes, the raster+dither pass
  with `mac-1bit`/`phosphor`/`hi-res`. First 1-bit output + PNG export.
- **M3 — connectors + apparatus + lexicon.** Leaders/arcs/dotted, frame + corners
  + legend + seal, the token lexicon. Plates start to read as *documents*.
- **M4 — curate.** Selection, inspector, lock, re-roll-this, drag, delete, undo.
  The design-tool turn.
- **M5 — breadth.** Remaining armatures + motifs + eras + per-seed stroke-alphabet;
  vibe-tag biasing; ratios; SVG export; permalink codes; contact sheet.
- **M6 — polish.** Keyboard, fullscreen, a11y, mobile bottom-sheet, empty/edge
  states, headless tests green, docs.

We can ship the arcade card as "live" at M3–M4 and keep expanding the registries;
new armatures/motifs/eras/palettes land continuously without touching the shell.

---

## 15. Future / graduation (not v1)

- **Breeding / lineage** — save plates to a gallery; crossover two IRs (archetype
  from A, palette from B, motifs from both) for evolutionary curation.
- **DSL** — a tiny textual grammar (`radial { orrery; voxel*3 } --dotted--> margin`)
  that compiles to the IR; the IR already *is* the serialization, so the parser is
  additive. Show the compiled DSL read-only first.
- **Node-graph patcher** — the Max/Ableton-rack paradigm (generators → transforms →
  layout → render as patchable modules). This is the main trigger to graduate to
  **`composer.subsurfaces.net`** — the IR contract makes it a lift-and-shift.
- **AxiDraw plotter export** — the SVG is already single-stroke-friendly; add pen
  ordering + travel optimization for physical plotting.
- **Saved galleries backend** — Supabase (`plates` table), if we want cross-device
  collections and a public gallery.
- **Animation** — optional one-shot plot-in on generation (SIGIL already does a
  700ms plot pass); WebM/GIF export of the plot for social.
- **Print-store hookup** — contact-sheet → pick → high-res PNG/SVG → product.

---

## 16. Open questions for approval

1. **Name.** `PLATE` (working) vs CODEX / ATLAS / INCUNABULA / APPARATUS /
   FRONTISPIECE / VELLUM — your call. Arcade blurb copy?
2. **Era set for v1.** The nine above, or a tighter first cut (say `plotter-ink`,
   `mac-1bit`, `phosphor`, `newsprint`, `gameboy-dmg`, `hi-res`) with the rest in
   M5?
3. **Default palette + era** on first open (I'd suggest `manuscript` + `mac-1bit`
   for immediate on-brand character).
4. **Vibe filter** — tag toggles (multi-select bias) as specified, or a single
   vibe slider between the four poles? (I lean tag toggles — more expressive.)
5. **Live-at milestone** — do we flip the arcade card to live at M3 (documents
   read well) or hold until M4 (curation) / M5 (breadth)?
6. **Aspect default** — confirm square (album) as the default, with the ratio set
   in §12.

---

*Once approved, first PR is M0 + M1 (skeleton → first generated plate), then we
iterate the registries.*
