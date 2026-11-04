# FILAMENT — the descent

Living doc for `src/features/filament` (route `/filament`, arcade "featured").
Status as of 2026-11-04: M1–M3 landed in 0aaeca1 (formation redshift and
the Lab drawer still open). Tick boxes as milestones land; each milestone ends
green on `npm run check` and is committed on its own.

**Testing rule:** the owner's PC overheats. Never verify FILAMENT in a browser
or preview server. Physics goes in `scripts/test-fmm.ts`
(`FORCE_FILAMENT=1 npx tsx scripts/test-fmm.ts`); looks go through headless
PNG renders in `scratch/` (`scratch/render-cosmos.ts` is the template).

---

## What exists (d88ca9f)

| Module | Role |
|---|---|
| `cosmos.ts` | Periodic 180 Mpc box. Lagrangian lattice, σ₈-normalised Zel'dovich ICs, FastPM KDK in ln D, displacement-integrated (float32 precision). |
| `sheet.ts` | Phase-space sheet renderer: triangle deposits, top-left scanline, mass-conserving Gouraud, periodic tiling, stream count. |
| `particle-mesh.ts` | Spectral, deconvolved PM force (2 FFTs/solve). |
| `universe.ts` + `fmm.ts` + `presets.ts` | Isolated worlds on the FMM (symmetric near field). |
| `cosmology.ts` | Friedmann backgrounds, `CosmicHistory` (D, G_p, G_f, age tables). |
| `analysis.ts` | P(k), T-web, potential, flow, PDF, isolated virial/rotation curve. |
| `sim.worker.ts` | Loop, playback clock, events, rasters. `protocol.ts` is the contract. |

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
- [ ] The old presets become the "Lab" drawer (controlled experiments).

### M3 — The descent
- [x] Camera dive: exponential zoom on the halo over ~1.5 s while the level-2
      world spins up; reverse on ascend. Cosmos keeps its state.
- [x] Breadcrumb (Web › Halo 17 › Nucleus) replaces the world picker as the
      primary navigation; URL state; Escape ascends.

Lessons: FMM must never evaluate a local expansion outside its cell
(escapers on the Hubble flow did, Q → 10¹⁰); a zoom with a dense disc
costs ~20 ms/step at 5k particles — keep budgets ≈ profile nMass.

### M4 — GEODESIC (level 3)
Equatorial Schwarzschild, G = c = 1, units of M.
- [ ] Timelike orbits: integrate (dr/dτ)² = E² − V_eff, dφ/dτ = L/r² (RK4 in τ
      on u = 1/r form for stability). Draggable launch; V_eff plot beside it
      with the particle's E marked. ISCO, marginally bound orbit marked.
- [ ] Shadow: deflection LUT α(b) from the photon orbit equation; every pixel
      maps through it to the background (the level-2 halo render, so the black
      hole lenses the galaxy you came from). Photon ring at b = 3√3M.
- [ ] Two clocks: infall from rest at r₀ — proper time vs coordinate time,
      plus the redshift of signals sent outward.
- [ ] Tests: periapsis precession 6πM/(a(1−e²)) in the weak field, photon
      capture at b = 3√3M, ISCO at 6M, marginally bound at 4M, proper infall
      time from r₀ to 0 = π·√(r₀³/8M).
- [ ] Arcade entry "GEODESIC" → `/filament?level=nucleus`.

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
