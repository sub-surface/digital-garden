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
