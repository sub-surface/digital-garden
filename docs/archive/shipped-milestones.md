# Shipped Milestones Archive

Historical rationale, design decisions, and implementation records for completed architectural sweeps.
Archived from `ROADMAP.md` to keep the active roadmap concise, scannable, and focused on current priorities.

---

## §2. Worker Split (Shipped 2026-06-24)

- **Status**: Completed.
- **Summary**: `src/worker.ts` was ~1,900 lines / ~50 handlers in one monolithic file. It was refactored into a one-line re-export (`export { default } from "./worker/index"`) with domain modules in `src/worker/*` (`index, lib, meta, auth, wiki, chat, stonks, keys, admin, security, types`).
- **Safety**: Multi-file Worker bundling verified on Cloudflare Workers via esbuild; route ordering preserved (`/api/keys` before `/api/admin/`); typed and guarded via `npm run typecheck:worker`.
- **Architecture**:
  ```
  src/worker/
    index.ts     # fetch() entry: route table -> delegates, then ASSETS + meta injection
    lib.ts       # jsonResponse, corsHeaders, supabaseRest, ghApi, verifyAuth, buildAuthUser
    meta.ts      # getContentIndex, injectMetaTags, slugFromPathname, esc* (SSR meta tags)
    auth.ts      # handleAuthMe, handleUpdateProfile, handleAvatarUpload, handleRegister
    wiki.ts      # handleSubmit, handleEdit, createEditPR, handleNew, handleLockStatus, handleUserProfile
    chat.ts      # handleChat{Rooms,Messages,Reactions,Search,Pins,Pin,Ban,Claim,UserMini}
    stonks.ts    # legacy stonks handling (subsequently deprecated and removed)
    keys.ts      # handleApiKeys, hashApiKey
    admin.ts     # handleAdmin
    security.ts  # addSecurityHeaders
  ```

---

## §3. Group `src/components/ui/` (Shipped 2026-07-03)

- **Status**: Completed.
- **Summary**: Reduced directory clutter by organizing ~50 loose UI components into eight domain subdirectories:
  - `chat/`: `ChatRoom`, `MessageRow`, `MessageInput`, `ChatSettings`, `TerminalChatView`, `TerminalBootScreen`, `SideChat`, `MiniProfilePopup`, `GifPicker`, `EmotePicker`, `ChatAutocomplete`...
  - `wiki/`: `WikiSubmitPage`, `WikiEditPage`, `WikiNewPage`, `WikiAdminPage`, `WikiProfilePage`, `WikiAuthModal`, `WikiInfobox`...
  - `games/`: `ChessPage`, `HexoPage`, `ArcadePage`, `GameCabinet`, and arcade implementations (`Snake`, `Tetris`, `Game2048`, `Blackjack`, `HexMines`, `Boids`, `Sand`, `AntFarm`, `HexLife`, `Progressions`, `PersianCarpetPage`).
  - `shelves/`: `BookshelfPage`, `MovieshelfPage`, `MusicPage`, `PhotographyPage`.
  - `reader/`: `NoteRenderer`, `NoteBody`, `NoteFooter`, `ArticleLayout`, `NoteLayout`, `LinkPreview`, `TagPage`, `FolderPage`...
  - `graph/`: `ConstellationPage`, `LocalGraph`, `GraphOverlay`.
  - `music/`: `MusicBar`, `MobileMusicBar`, `MusicPlayer`, `MusicContext`, `usePopoutPlayer`.
  - `overlays/`: `SearchOverlay`, `CommandPalette`, `KeyboardCheatSheet`.
- Truly cross-cutting singletons (`ErrorBoundary`, `NotFound`, buttons, banners) intentionally remained flat in `ui/`.

---

## §4 & §4b. a11y, Keyboard, and Theme Consistency Audit (Shipped 2026-07-03 / 2026-07-12)

- **Status**: Completed.
- **Summary**:
  - **Keyboard Shortcuts**: `?` opens `KeyboardCheatSheet` overlay from canonical declarations in `src/config/hotkeys.ts`.
  - **Focus Management**: `useFocusTrap` wraps `SearchOverlay`, `WikiAuthModal`, `ThemePanel`, `GameCabinet` zen mode, and `EmotePicker`. Capture, restore, and Esc lifecycle guarded with stable refs to prevent torn traps.
  - **Motion & Accessibility**:
    - Global `:focus-visible` ring in `base.scss` (2px accent, 2px offset).
    - Skip-to-content link implemented.
    - `prefers-reduced-motion` honored across `BgCanvas` (one static frame), telescopic transitions (blur dropped), reaction glow, and chat terminal boot sequences.
  - **Light/Dark Parity Audit**:
    - `ConstellationPage` and `LocalGraph` resolve star/line/label colours dynamically from the active theme once per frame.
    - Added `--color-overlay-tint` (`#fff` dark / `#000` light) to `tokens.scss` and converted hardcoded `rgba(255,255,255,N)` to `color-mix(in srgb, var(--color-overlay-tint) N%, transparent)` across `ThemePanel`, `CommandPalette`, `KeyboardCheatSheet`, `NotificationBanner`, `QuickControls`, `LocalGraph`, `MDXComponents`, and `ChatSettings`.
    - `ProgressionsPage` canvas fill updated from hardcoded white literal to computed `--color-overlay-tint`.

---

## §16. Chamber & SIGIL Follow-ons (Shipped 2026-07-03)

- **Status**: Completed.
- **Summary**: Delivered four ambient background modes and the Collider aiming toy:
  - `schematic`: Leader lines from drifting anchors, right-angle dimension brackets, edge ruler ticks, and sparse asemic glyph clusters.
  - `isometric`: Faint wireframe isometric cubes drifting/rotating with glyph columns and cursor parallax.
  - `orrery`: Nested rotating astrolabe/armillary rings (thin arcs + tick radials) slowly precessing.
  - `plate-scan`: Single Atkinson-dithered generative still rendered once with slow scanline sweep.
  - `Collider` (`/collider`): Bubble-chamber aiming toy reusing `drawChamber` flow field and particle advection for specimen targeting.

---

## §17. Codebase Hygiene Sweep (Shipped 2026-07-12)

- **Status**: Completed.
- **Summary**:
  - Deleted dead code `src/lib/mdx-loader.ts`.
  - Fixed `BgModeToggle.tsx` tooltip switch to recognize all background modes.
  - Replaced stale `scripts/test-slugs.mjs` with `scripts/test-slugs.ts` testing actual `src/lib/slug.ts` functions.
  - Updated `scripts/audit-site.mjs` route list to include all modern shells and toys.
  - Enriched `docs/wiki.md` with Admin Panel and Chatter Profile Claiming documentation.
  - Separated chat API reference into `CHAT-API.md` and updated README.
  - Cleaned up stale items in `docs/future.md` and reconciled Supabase RLS documentation.

---

## §19. `usePanelClick` & SPA Navigation Rewrite (Shipped 2026-07-12)

- **Status**: Completed.
- **Reference**: Full design spec archived at `docs/archive/specs/2026-07-12-classify-layout-nav-reader-spec.md`.
- **Root Cause**:
  - `usePanelClick` decided whether to intercept clicks based solely on the *current* page's layout, rather than classifying the *destination* slug. Consequently:
    1. Clicking any game link from an ordinary note or home page stuffed the game into a 750px fixed-width `PanelCard`.
    2. Clicking an internal link on an article page bypassed client-side routing entirely, executing a hard browser reload that destroyed React state and paused the music player.
- **Resolution**:
  - Created `classifyLayout(slug, opts)` in `src/lib/layout.ts` as the canonical classifier shared between `NoteRenderer` and `usePanelClick`.
  - Added prebuild frontmatter `layout` passthrough so content index metadata accurately reflects custom layouts.
  - Updated `usePanelClick` to branch cleanly:
    1. Panel-card creation for note exploration.
    2. Client-side `navigate()` (via TanStack Router `useNavigate`, clearing the panel stack) for article/game destinations and all mobile navigation.
    3. Unintercepted passthrough only for hash links, `music:` protocol links, modifier keys, and external origins.

---

## §21. Query "Type" Display & System Pages Index Integration (Shipped 2026-07-12)

- **Status**: Completed.
- **Root Cause**: System pages (arcade toys, graph, apparatus, etc.) had no content-index entries. Therefore `<Query sort="-date">` could not surface new games alongside content notes, and could not display layout pills.
- **Resolution**:
  - Created `src/config/system-pages-meta.ts` (`SYSTEM_PAGE_META`) decoupling metadata (`layout`, `title`, `since`, `loading`) from React component imports, allowing Node scripts (`prebuild.ts`) to import page metadata safely without compiling SCSS.
  - `prebuild.ts` synthesizes `NoteMetadata` entries tagged with `system: true`.
  - Filtered `system: true` entries out of `InboxPage` (preventing orphan/untagged triage noise), excluded them from `graph.json` (preventing disconnected stars), and guarded `LinkPreview` against missing markdown source.
  - Updated `Query.tsx` to render layout pills (`game`, `article`, `note`) driven by `classifyLayout()`.

---

## §23. Reader Mode: Sidenotes & Settings Consolidation (Shipped 2026-07-12)

- **Status**: Completed.
- **Root Cause**: `reader-mode.scss` previously forced `.article-layout { display: block }`, destroying the right-hand CSS grid track (`calc(4rem + 250px)`) that `sidenotes.scss` relied on for floating margin placement (`margin-right: -290px; width: 250px`), causing sidenotes to clip offscreen.
- **Resolution**:
  - Preserved `.article-layout` CSS Grid in reader mode while driving the prose track from `--reader-measure` and maintaining the margin track.
  - Retired standalone floating `ReaderControls` pill; integrated measure/scale steppers and toggles into a dedicated "Reader" tab inside `ThemePanel` (`\`).

---

## §28. Desloppification Sweep (Shipped 2026-07-25 / 2026-08-02)

- **Status**: Completed across 16 numbered tasks.
- **Key Milestones**:
  - **28.1**: `public/og/` unignored and protected by `scripts/test-og.ts` to ensure all content notes have committed social preview cards.
  - **28.2**: Added `npm run check` pipeline to GitHub Actions (`lighthouse.yml`), validating test suites, Worker types, and build output.
  - **28.3**: Installed ESLint with `eslint-plugin-react-hooks`, achieving a zero-warning ratchet (`--max-warnings 0`).
  - **28.4 / 28.6**: Extracted `src/styles/_breakpoints.scss` partial, injected globally via Vite SCSS config, eliminating bare px literals.
  - **28.5**: Unified mobile viewport detection into `usePhoneViewport` over `PHONE_BREAKPOINT` (`$bp-phone: 800px`).
  - **28.7**: Consolidated divergent HTML escaping into `src/lib/escape.ts` (`escapeHtml`, `escapeAttr`).
  - **28.8 / 28.9**: Deduplicated RNG algorithms (`hashStr`, `mulberry32`), date formatting, and frontmatter stripping (`src/lib/frontmatter.ts`).
  - **28.10**: Purged unused components (`ChatSearch.tsx`, `BackToArcade.tsx`, `BgModeToggle.module.scss`).
  - **28.11**: Synchronized background mode labels and metadata in `src/store/index.ts` (`BG_META`).
  - **28.12**: Enforced strict typing for `BackgroundsConfig` over `Exclude<BgMode, "chess" | "hexo">`, eliminating 29 `any` types.
  - **28.13 / 28.14**: Untracked volatile generated artifacts (`src/content/`, `folders.json`, etc.) to eliminate working tree diff churn.
  - **28.15**: Created typed client API helper `src/lib/api.ts` (`apiGet`, `apiPost`, `apiDelete`) with explicit error handling.
  - **28.16**: Unified OG card filenames to lowercase via `ogCardName()` in `src/lib/slug.ts`, preventing casing-dependent 404s on Cloudflare Workers.
