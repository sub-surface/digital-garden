# FILAMENT — the descent

Living doc for `src/features/filament` (route `/filament`, arcade "featured").
Status as of 2026-11-04: M1–M4 landed, and the whole feature was reframed as
one continuous zoom (below). Tick boxes as milestones land; each milestone
ends green on `npm run check` and is committed on its own.

**Testing rule:** the owner's PC runs hot. Physics goes in
`scripts/test-fmm.ts` (`FORCE_FILAMENT=1 npx tsx scripts/test-fmm.ts`); looks
go through headless PNG renders first — `scratch/drive-filament.ts` runs the
real worker in Node with stubbed `postMessage` and writes frames along a
scripted descent (`descent` or `lone` mode). A browser pass is allowed, but
only once, at the end of a piece of work.

---

## Architecture (the reframe, 2026-11-04)

FILAMENT is **one camera moving through a stack of nested layers**. There
are no separate worlds, flights or level switches: the zoom is the
navigation.

```
src/features/filament/
  engine/   physics, DOM-free and tested: cosmology, cosmos (FastPM),
            particle-mesh, fmm, universe (a galaxy's FMM world), halos (FoF),
            zoom (resimulation ICs), geodesic (Schwarzschild), analysis,
            spectrum, ics (shared cloud/IC vocabulary)
  render/   pixels: sheet (phase-space sheet), density-raster, palettes,
            draw (rings, sprites, crossfade), events (quasars, starbursts)
  layers/   layer.ts (Layer, View, Camera, Stack), web.ts, galaxy.ts,
            nucleus.ts — each layer owns its state, clock, render, analysis
  ui/       FilamentPage, Hud, Instruments, Plot, quality, styles
  sim.worker.ts   camera + stack manager + compositor + messages
  protocol.ts     page ↔ worker contract (gestures in, frames out)
```

**Frames, not absolute coordinates.** Each child layer sits at an anchor in
its parent with a fixed ratio of units (web unit = half the box; galaxy unit
= the halo radius, origin at the halo centre; nucleus unit = M, origin at
the galaxy's stellar centre). The camera is held in the deepest frame it has
entered (`Camera.normalise`, enter at fill 0.5, leave below 0.35), so its
position never needs more than float64 gives one frame. Web → horizon is ~15
decades; the camera test flies it and round-trips to 0.04 px.

**Only the branch under the camera exists** (the quadtree idea, as nesting).
A galaxy is built when the halo under the screen centre would fill 6% of the
screen, dropped below 2.5% or once off screen (one is cached for a quick
return); a black hole is built when the galaxy is magnified ×3 about its
heart. Zooming in near a child pulls the camera toward its anchor, so a
descent stays on course; between the galaxy's softening length and the
S-stars the zoom runs 6× faster (nothing lives at those scales in the model).

**Crossfades** over about an octave of each child's fill (galaxy 0.3–0.85,
nucleus 0.12–0.5), with a brightness-preserving blend.

**The clock runs only in the deepest layer on screen.** The web holds still
while a galaxy is visible; the galaxy while its hole is. Returning to the web
resumes it; if the web then moves on, its cached galaxy is stale and dropped.
The hole's own clock is *Keplerian*: coordinate time per wall second goes as
(view radius)^3/2, so S-stars and the innermost orbits both turn at a
watchable pace.

**The nucleus is one honest top-down view** (the ray-traced 3D camera was
too slow and did not look good; it was removed): S-stars after the real ones
around Sgr A* (in one plane), a zoo of relativistic orbits, a Novikov–Thorne
gas ring (face-on: g = √(1−3/r); Doppler lens: g/(1 + Ωx)), and the sky
behind bent through the exact α(b) — black shadow at 3√3 M, photon ring, the
host galaxy's portrait drawn into an Einstein ring at 2√D = 50 M (a thin-lens
stylisation, documented in the file). Clocks and V_eff are instrument cards.

**Removed:** the lab presets (disc / encounter / stream / collapse — they live
on as test fixtures in `scripts/filament-fixtures.ts`), level flights and
fades, the three nucleus modes, the 3D tracer.

**Entry points:** `/filament` (the web); `?seed&z&halo[&level=nucleus]` runs
the web to z, then flies down (≈15 s fast-forward to z = 0 at grid 256);
`?level=nucleus` alone is GEODESIC — Sgr A* on its own, instantly (the
breadcrumb links back to the web).

## The idea

One page, three nested scales, entered by diving rather than by menu — a
Powers of Ten through structure formation. Each level is *seeded by
measurements of the level above*, so the descent is physics, not a cut:

1. **The web** (180 Mpc, Cosmos). Haloes are found and ringed on the sky.
2. **The halo** (~100 kpc). A zoom-in resimulation of one chosen halo.
3. **The nucleus** (a few to a few hundred r_g). GEODESIC: Schwarzschild
   geometry around the halo's black hole.
4. **Coda: the boundary.** An optional holographic view (AdS/CFT toy) —
   explicitly a different kind of model, not a deeper zoom.

Every state has a URL (`/filament?seed=…&halo=…&level=…`), so "this halo in
this universe" can be shared. The arcade gets a GEODESIC entry that deep-links
to `/filament?level=nucleus`.

## Milestones

### M1 — Halo catalogue (level 1)
- [x] Friends-of-friends on the lattice particles (b = 0.2 × mean spacing,
      cell-hashed), min 32 members. Halo = lattice indices, so identity is
      Lagrangian and survives across snapshots.
- [x] Per halo: mass (3D-equivalent M☉), centre (shrinking circle), velocity,
      dispersion, rotational support |J|/(N·R·σ). Formation a waits for M7.
- [x] Rings drawn on the sky (sized by r_200-ish), hover card, click to dive.
- [x] Tests: FoF on a synthetic two-blob field; mass sums; IDs stable.

### M2 — Zoom-in resimulation (level 2)
Seed an isolated FMM world from the halo as measured:
- [x] Dark matter: the halo's own particles (plus everything within ~3 r_h,
      so infalling neighbours come along — the Encounter emerges by itself),
      in the halo frame, resampled ×k with phase-space jitter.
- [x] A baryonic disc (f_b ≈ 0.16 of halo mass) laid in the measured
      potential, oriented by the measured spin. 2D: the disc *is* the plane.
- [x] External tidal field from the cosmos potential at the halo centre
      (tidal tensor from `analysis.ts`), applied as a linear force T·x.
- [x] Units: code ↔ kpc/Myr from the halo's mass and radius; scale bar
      continuous across the descent. Velocity unit fixed by the 2D virial
      theorem ⟨v²⟩ = GM/2 on the halo's members. Disc scale 0.1 R — about 3×
      a real disc, so it is resolved; say so wherever sizes are quoted.
- [x] ~~The old presets become the "Lab" drawer~~ — dropped in the reframe;
      they survive as test fixtures.

### M3 — The descent
- [x] Camera dive and breadcrumb — superseded by the continuous zoom: the
      breadcrumb now lists the layers built under the camera, and a crumb
      (or Escape) flies the camera back up.

Lessons: FMM must never evaluate a local expansion outside its cell
(escapers on the Hubble flow did, Q → 10¹⁰); a zoom with a dense disc
costs ~20 ms/step at 5k particles — keep budgets ≈ profile nMass.

### M4 — GEODESIC (level 3)
Equatorial Schwarzschild, G = c = 1, units of M.
- [x] Timelike orbits: integrate (dr/dτ)² = E² − V_eff, dφ/dτ = L/r² (RK4 in τ
      on u = 1/r form for stability). Draggable launch; V_eff plot beside it
      with the particle's E marked. ISCO, marginally bound orbit marked.
- [x] Shadow: deflection LUT α(b) from the photon orbit equation; every pixel
      maps through it to the background (the level-2 halo render, so the black
      hole lenses the galaxy you came from). Photon ring at b = 3√3M.
- [x] Two clocks: infall from rest at r₀ — proper time vs coordinate time,
      plus the redshift of signals sent outward.
- [x] Tests: periapsis precession 6πM/(a(1−e²)) in the weak field, photon
      capture at b = 3√3M, ISCO at 6M, marginally bound at 4M, proper infall
      time from r₀ to 0 = π·√(r₀³/8M).
- [x] Arcade entry "GEODESIC" → `/filament?level=nucleus`.

### M5 — Light-cone timeline (idea 1)
- [ ] Conformal time η(a) and comoving distance χ(z) from `CosmicHistory`.
- [ ] Small conformal diagram replaces the bar: our past light cone, the
      particle horizon, the box size as a tick; "you are here" dot. Click to
      seek (forward runs; backward replays the deterministic run at speed).
- [ ] Readout: χ, angular-diameter and luminosity distance at the current z.

### M6 — Observer's survey (idea 2)
- [ ] Store ~24 density-mesh snapshots across the run (256² × 4 B each).
- [ ] Place an observer; render the replicated box as seen down the past
      light cone: radius ↔ χ (log-scaled), each annulus from the snapshot at
      a(χ). Younger, smoother shells at large radius. Optional RSD.

### M7 — Merger trees (idea 3)
- [ ] FoF catalogues at each snapshot; progenitor = the earlier halo holding
      the most of a halo's lattice IDs. Tree drawn in the hover card / level 2.

### M8 — Lensing at every scale (idea 4)
- [ ] Weak: shear γ and convergence κ from the potential (second derivatives
      by FFT — the T-web already builds the tidal tensor). Overlay of sheared
      background-galaxy ellipses; κ as a lens.
- [ ] Strong: the M4 shadow. One deflection idea, two scales.

### M9 — Holographic coda (idea 5)
From `../math/ads-cft.md`. Poincaré disc, {5,4} (HaPPY-like) tiling drawn as
the tensor network. Drag a boundary interval; the Ryu–Takayanagi geodesic
(circle orthogonal to the boundary) follows; S = (c/3)·ln(L/ε) beside the
geodesic length. Labelled as a model of a *different* universe (AdS, not ours).

### M10 — Recombination and BAO
**Scope decision:** the sound horizon is r_s ≈ 147 Mpc, and the box is
180 Mpc — the BAO's first wiggle sits at the box fundamental, unresolvable.
So:
- [ ] A "Survey" box option (720 Mpc; `PATCH_MPC` becomes per-run) where the
      transfer function carries 2D baryon wiggles ∝ J₀(k·r_s)·e^{−(k/k_Silk)^1.4}.
- [ ] Correlation function ξ(r) instrument (2D Hankel transform of P(k)) with
      the BAO bump marked at r_s.
- [ ] Acoustic prelude: a few seconds before recombination showing the
      photon–baryon plasma ringing — δ_γ(k,t) ∝ cos(k·r_s(t)) on the same phases
      — freezing into the CMB afterglow, then the sheet takes over.

### Later
- Celestrium bridge (ROADMAP): Gaia streams / quasar dipole overlays.
- Sonification (owner: optional, off by default).

## Dream list (owner asked to note these)
- Kerr: spin parameter a; frame dragging, asymmetric shadow, prograde/
  retrograde ISCO (1–9M), ergosphere; geodesics via Carter constant.
- Lensing detail: higher-order photon rings (n = 1, 2 subrings), Einstein
  ring of the halo, time delays between images, magnification maps.
- Accretion: thick/ADAF torus, relativistic jets, polarisation (EVPA
  ticks like the EHT images), variability hot-spot orbiting at ISCO.
- Tidal disruption: a star stretched into a stream on a plunging orbit.
- Gravitational waves: binary black-hole inspiral with chirp audio.
- Penrose diagram view for the infall clocks; Kruskal coordinates.
- Back up the descent: merger trees (M7), light-cone survey (M6), BAO (M10),
  holographic coda (M9) — still open.
