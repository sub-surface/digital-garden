# Anticipated Build & Deployment Risks

This document tracks potential failure points identified during the migration to Digital Garden v2.

### 1. Dependency Mismatches (Highest Risk)
*   **Custom Remark/Rehype Plugins**: Plugins in `src/lib/` (e.g., `remark-wikilinks`, `remark-callouts`) import external packages. If `unist-util-visit`, `mdast`, or similar utilities are not explicitly in `package.json`, the build will fail on Cloudflare.
*   **Prebuild Environment**: The `prebuild.ts` script runs via `tsx`. If `tsx`, `gray-matter`, or `fs-extra` (if added) are missing from `devDependencies`, the `prebuild` step will crash before the Vite build begins.

### 2. Case-Sensitivity in CI (Linux vs. Windows)
*   **FileSystem Imports**: Windows is case-insensitive, but Cloudflare's build environment (Linux) is not. If `import.meta.glob` or manual imports reference `on-diagrams` but the file is `On-Diagrams.md`, the build will fail to resolve the module.

### 3. "Asset Too Large" Persistence (25MB Limit)
*   **Media Duplication**: `prebuild.ts` syncs files to both `public/content` and `src/content`. Large binaries (PDFs, high-res images) might be duplicated in the final `dist/` folder, potentially triggering the Cloudflare 25MB asset limit.
*   **WAV files**: Ensure no `.wav` files remain in the content tree; all should be converted to `.mp3` or moved to the external `Archive/` folder.

### 4. TypeScript Strict Mode
*   **Type Alignment**: `tsc --noEmit` is part of the build command. Any misalignment in types (especially in `NoteRenderer`, `NoteBody`, or the `MusicContext` union types) will block the production build even if the dev server runs.

### 5. Cloudflare Environment Limits
*   **Worker/Bundle Size**: PIXI.js, D3, and the new `GraphOverlay` increase the bundle size. If the routing logic (compiled into a Worker) exceeds 1MB compressed, Cloudflare may reject the deployment. Lazy loading is currently mitigating this.

### 6. File System Locks & Permissions
*   **Directory Cleanup**: `prebuild.ts` uses `rmSync` and `mkdirSync`. Restricted permissions or file locks in the CI environment could cause the script to hang or fail when attempting to clear `src/content`.

### 7. CF Pages Functions TypeScript Setup
*   **Missing types**: `@cloudflare/workers-types` and `wrangler` must be in `devDependencies`. Without them, `functions/` TypeScript has no types for the Workers runtime (`ExportedHandler`, env bindings). A syntax error in a function causes a deploy-time silent failure (function returns 500 but deploy succeeds).

### 8. Missing satori + @resvg/resvg-js (RESOLVED in Phase 0)
*   `og-gen.ts` imported both `satori` and `@resvg/resvg-js` but neither was installed. Fixed by adding to devDependencies. Risk remains: `@resvg/resvg-js` uses N-API native bindings — if Cloudflare's build environment changes Node version or OS, the pre-built binary may not match. **Mitigation**: pin the version; regenerate OG images locally if CF build fails for this reason.

### 9. Turnstile Secret Key Must Be Set in CF Pages Dashboard
*   If `TURNSTILE_SECRET_KEY` env var is absent from CF Pages dashboard, every form submission returns `500 Server misconfiguration`. The function has an explicit guard for this. Set the env var before the first deploy of `functions/api/submit.ts`.

### 10. GitHub PAT Expiry
*   Fine-grained PATs expire. If the token expires, all submissions fail silently (GitHub API returns 401). Set a calendar reminder to rotate the PAT before expiry. Consider using a GitHub App token for non-expiring credentials in the future.

### 11. wiki.subsurfaces.net Requires Two Manual Steps, Not Just wrangler.toml
*   The `[[routes]]` entry in `wrangler.toml` alone is insufficient. The subdomain also needs: (a) CNAME record in Cloudflare DNS panel (`wiki` → `digital-garden-v2.pages.dev`), and (b) the custom domain added in CF Pages dashboard. Both must be done before the subdomain resolves.

### 12. Local Dev Wiki Shell Detection
*   `window.location.hostname` is `localhost` during dev, so WikiShell never activates automatically. Set `VITE_WIKI_MODE=true` in `.env.local` to test the wiki shell locally. **This env var must NOT be set to `true` in CF Pages build env vars** — it would make `subsurfaces.net` also show the wiki shell.

### 13. CF Pages Functions Cold Start
*   CF Workers isolate-based runtime has <5ms cold starts typically. The GitHub API sequence (4 calls) should complete in <5s total. If GitHub's API is slow or rate-limited, the function could time out. No issue expected at community scale.

### 14. CORS: wiki.subsurfaces.net → /api/submit
*   The form at `wiki.subsurfaces.net` calls `POST /api/submit`. Since both are on the same CF Pages project, the function is accessible at `wiki.subsurfaces.net/api/submit` — same origin. No CORS headers needed.

### 15. GitHub API Branch Name Collisions
*   Branch name: `submit/{username}-{timestamp}`. If the same username submits twice in the same second, the second branch creation fails (409 Conflict). **Mitigation**: a random 4-hex-char suffix is appended to the timestamp in the function.

### 16. TypeScript: `cover` / `poster` fields on `NoteMeta` in prebuild.ts
*   `prebuild.ts` sets `cover` and `poster` on the index object but these fields are not declared in the `NoteMeta` interface. `tsc --noEmit` may flag this as an implicit property error. **Mitigation**: add `cover?: string; poster?: string` to the `NoteMeta` interface in `prebuild.ts`.

### 17. Triadic Palette — `palette` store slice removed
*   Any code that still reads `s.palette` from the Zustand store (e.g. old snapshots, dev tools, or forgotten references) will get a TypeScript error. `BgCanvas` was updated; verify no other components reference `useStore(s => s.palette)`.

### 18. Link Preview — `fetchBody` hits `public/content/` at runtime
*   Markdown files are copied to `public/content/` during prebuild. If a slug contains special characters or uppercase letters, the fetch path may 404 on CF (case-sensitive Linux filesystem). All slugs are lowercased + hyphenated by `slugify()` so this should be safe, but watch for edge cases with notes using mixed-case filenames.

### 19. RSS / Sitemap date parsing
*   `new Date(n.date!)` in prebuild will produce `Invalid Date` if a frontmatter date is not ISO-parseable (e.g. `"Spring 2024"`). This won't crash the build but will produce a bad `pubDate` in the RSS feed. **Mitigation**: guard with `isNaN(new Date(n.date!).getTime())` before including in dated-notes list.

### 20. `/recent` route conflicts with NoteRenderer catch-all
*   `/recent` is registered as an explicit route before the `$` catch-all, so it should win. If route ordering is ever changed, `/recent` will fall through to NoteRenderer which has no content for that slug. Verify route tree order is maintained.
