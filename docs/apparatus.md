# Apparatus (generative plate composer, `/apparatus`)

A seeded, curatable engine for 1-bit/low-bit dithered "plates" in a nostalgic-mystical-technical idiom
(isometric 80s computer art, survey plates, occult diagrams, manuscript pages, exploded schematics).
Primary use is album covers (square by default, other ratios supported). Shipped M0-M6 on 2026-07-05;
it began life as "PLATE", so internal directories are named `composer` while the public name, slug and
system page are `apparatus`. The full original design spec (including the sections below in much
longer form) is archived at [`archive/specs/composer-spec.md`](archive/specs/composer-spec.md).
Outstanding ideas are ROADMAP section 13.

## Principles that still govern the code

1. **Three decoupled layers**: grammar (pick an armature, fill slots with motif requests) to layout solver (geometry, anchors, routed connectors) to renderer (IR to SVG; optional era pass to dithered PNG). The IR (`src/lib/composer/types.ts`, plain serialisable `Plate`) is the contract; nothing downstream bakes upstream decisions.
2. **Vector first, dither as finish.** SVG is the master; the era pass quantises/dithers it to a device. Pens are semantic roles (structure, annotation, highlight, shadow, apparatus), so re-rolling the palette or switching era is an instant re-skin that never regenerates geometry.
3. **Determinism.** One seeded `mulberry32` rng is threaded through everything in fixed order; the same `(seed, salt, overrides)` yields an identical plate. `serialize.ts` packs the plate into the URL hash (`/apparatus#<code>`), so every plate is shareable.
4. **Conducted randomness.** Lock any node/connector/apparatus item, then regenerate (salt++), step seeds, re-roll one node, re-roll layout, re-roll palette, or change era; locked boxes act as fixed obstacles for the solver. Editor state is the IR plus an undo stack (60 deep).
5. **Config-driven expansion.** A new kind of image is one armature file; a motif is one generator in the registry; an era is one preset entry.
6. **Render on demand**, never a persistent rAF loop (the animated BgCanvas is already costly). Full-bleed shell (`data-fullbleed`), not `GameCabinet`'s capped stage. No glow artefacts by default. Failure is visible (an unroutable connector falls back to a marked straight leader).

## Where things are

```
src/lib/composer/           pure, headless-testable core (scripts/test-composer.ts, in npm test)
  types.ts rng.ts noise.ts generate.ts layout.ts realize.ts connectors.ts apparatus.ts
  lexicon.ts pens.ts eras.ts serialize.ts
  armatures/   8: centered-radial, specimen-grid, exploded-axis, hero-annotated,
               survey-field, manuscript-page, cascade-stream, constellation-web
  motifs/      15: voxel-mass, chamber, orrery-rings, node-graph, contour-field, specimen-panel,
               geometer, instrument, asemic-script, glyph-seal, lattice, polyhedron, sunburst,
               waveform, zodiac-wheel
  render/      svg.ts, raster.ts (canvas, era pass), dither.ts (Bayer/Atkinson/Floyd/blue-noise)
src/components/ui/composer/ ComposerPage (owns IR + undo), ComposerStage, ComposerRail,
                            Inspector, ContactSheet, selection.ts
```

- **Armature** = slots (role, region, count, motif classes, scale) + connector and apparatus intents + a layout strategy (radial, grid, axis, hero, free/relaxation) + tags that feed the vibe filter.
- **Motif** = pure `(rng, box, params, ctx) => { primitives, anchors }`; it never picks colour or dither. Param schemas drive the inspector, mirroring `BG_CONTROLS`.
- **Connectors**: leader, manhattan (A* over an occupancy grid), arc, dotted, stream, text-path. **Apparatus**: frame, corner-reg, ruler/scale-bar, legend, seal, caption, compass, colophon, with a themable lexicon (roman numerals, catalog codes, invented units, plate numbers).
- **Eras** (`eras.ts`): plotter-ink, mac-1bit, phosphor, newsprint, gameboy-dmg, cga, ega, c64, hi-res. **Palettes** (`pens.ts`): named sets plus an accent-derived palette that follows the site theme.
- **Export**: SVG (plotter/print-ready) and PNG via the era pass at chosen scale; permalink code; ContactSheet renders N seeds for curation.
- Plate state lives in the component and URL hash, not the Zustand store; the composer does not hijack the global `bgMode`.

## Extending

Add an armature file and register it in `armatures/index.ts`; add a motif and register it in `motifs/index.ts`; add an era entry in `eras.ts`; add a palette in `pens.ts`. Then run `scripts/test-composer.ts` (determinism, slot-fill validity, anchor resolution, serialize round-trip). Not yet implemented: a real Hershey single-stroke font (types allow `font: "hershey"` but the renderer uses mono), which is why plotter text is still approximate.
