# FILAMENT — moved

FILAMENT (the cosmic-web-to-black-hole zoom) was extracted from this repo on 2026-11-08
and now lives as its own project:

- Source: `../filament` in the Psychograph hub (sibling of this repo; README, `CLAUDE.md`
  and the full design doc / milestones M1-M10 in its `docs/filament.md`).
- Planned URL: `filament.subsurfaces.net` (a Cloudflare assets-only Worker named `filament`;
  not deployed yet).
- What stays here: the `/filament` system-page slug, which renders `FilamentMovedPage`
  (`src/components/ui/games/FilamentMovedPage.tsx`) so old links land on a "FILAMENT has moved"
  notice that forwards the deep-link query (`?seed&z&halo&level`) to the new address.
  The OG card `public/og/filament.png` is kept for that slug.
- What was removed: `src/features/filament/**`, `scripts/test-fmm.ts` (physics suite) and
  `scripts/filament-fixtures.ts` (both moved with it), the arcade FILAMENT and GEODESIC cards,
  and the "immersive page" plumbing that existed only for FILAMENT (AppShell / QuickControls
  `data-immersive`, BgCanvas suppression, OS `data-program="filament"` rules).

The pre-extraction design doc is in git history (`git log -- docs/filament.md`).
