# Sub-Surface Territories v2 Technical Specification

## System Overview
Sub-Surface Territories v2 is a high-performance, minimalist digital garden architecture built on React 19 and Vite 6. The system prioritizes a "Terminal-Monospace" aesthetic, a non-linear horizontal stacking panel system, and a performance-optimized background rendering engine.

## Core Architecture

### 1. Unified MDX Pipeline
The system utilizes a build-time content transformation pipeline. 
- **Source:** Raw Markdown and MDX files reside in the root `/content` directory.
- **Processing:** The `scripts/prebuild.ts` execution handles metadata extraction (gray-matter), link resolution, and manifest generation (`content-index.json`, `graph.json`, `photography.json`).
- **Synchronization:** Content is mirrored to `src/content` to enable Vite-native dynamic imports.
- **Resolution:** `src/lib/mdx-loader.ts` utilizes `import.meta.glob` to resolve slugs to live React components. Slugs are normalized: spaces are converted to dashes, and special characters are URI-decoded.

### 2. Rendering Engine
Note rendering is managed by a hierarchical layout system:
- **NoteRenderer.tsx:** Determines the high-level layout (Article vs. Note) based on frontmatter metadata or directory location.
- **NoteBody.tsx:** The primary component for content resolution. It handles the dynamic loading of MDX components and handles "System Slugs" (e.g., /Chess, /Photography) by injecting the relevant specialized page components.
- **Embed Pipeline:** Custom Remark/Rehype plugins (`src/lib/`) transform wikilink syntax (`![[image.jpg]]`) and standard markdown embeds into optimized HTML elements. This includes automatic path-mapping to `/content/Media` and `<iframe>` generation for YouTube/Vimeo URLs.

### 3. Navigation and Panel System
The "Note Mode" layout implements a recursive horizontal stacking interface.
- **Capture-Phase Interception:** `usePanelClick.ts` intercepts all internal anchor clicks. Instead of standard navigation, it pushes note metadata into the Zustand `panelStack`.
- **Depth Management:** The `pushCard` action automatically trims the stack to the right of the current interaction point to maintain a logical navigation trail.
- **Layout Persistence:** State is managed via `zustand` to ensure that side-panels and current reading positions are preserved during background operations.

### 4. Background Engine (BgCanvas)
Visual effects are rendered on a dedicated HTML5 Canvas layer.
- **Threading:** Animations are driven by `requestAnimationFrame`. To prevent React-induced frame drops, all animation state (nodes, link maps, particle life) is stored in a `useRef` object (`stateRef`).
- **Layering Constraints:** The canvas is positioned at `zIndex: 0`. All parent containers (`.shell`, `.workspace`, `.mainPane`, `.card`) must maintain `background: transparent`.
- **Mode Logic:**
    - **Graph:** A non-interactive drift visualization of the site's knowledge graph.
    - **Vectors:** A multi-octave flow field utilizing Simplex noise.
    - **Terminal:** A procedural "ASCII Pop" animation engine utilizing random snippets and code fragments.
    - **Chess:** A grid-proximal reactive background triggered specifically by the `/Chess` route.

## Specialized Sub-Systems

### 5. Music & Audio System
- **Context:** `MusicContext.tsx` manages a persistent `<audio>` element and a Web Audio API `AnalyserNode`.
- **Protocol:** A custom `music:` protocol handler in `usePanelClick.ts` allows markdown links to trigger track playback (e.g., `[Play Track](music:Song%20Title)`).
- **Visualizer:** A real-time FFT (Fast Fourier Transform) canvas visualizer is integrated into the expanded music player header.

### 6. Intelligence & Discovery
- **Global Search:** Powered by `flexsearch`. The index is built from the `content-index.json` manifest and accessible via a global `Ctrl+K` overlay.
- **Telescopic Text:** A specialized interactive component for progressive disclosure of information, implemented via custom code-block parsing in the Remark pipeline.
- **Sidenotes:** Implements Tufte-style marginalia. Footnotes are automatically transformed into side-floats on wide viewports and inline toggles on mobile.

## Data Schema and Configuration

### Site Defaults
Global baseline parameters are centralized in `src/config/site-defaults.ts`. This file defines initial theme states, accent colors, and specific background parameters (speed, density, noise scale).

### Content Manifests
- **content-index.json:** A flat map of all notes, including titles, tags, and resolved backlink arrays.
- **graph.json:** A D3-compatible node/link structure used for graph visualizations.
- **photography.json:** A specialized manifest for the photography gallery, containing resolved paths to media assets.

## Development Workflow

### Build and Deployment
The project is optimized for deployment on Cloudflare Pages.
- **Node Requirement:** Version 20.x or higher.
- **Build Command:** `npm run build` (runs `prebuild`, `tsc`, and `vite build`).
- **Output:** The `dist/` directory, including the `_redirects` file for SPA route handling.

### Commit Workflow
Parameter tuning performed in the "Dev Tab" of the Theme Panel generates a JSON payload. This data must be committed back to `src/config/site-defaults.ts` to update the site's permanent baseline.
