# Architecture

## Four-Shell System

The codebase serves four distinct shells from a single React SPA entry point. `useShell()` in `src/hooks/useShell.ts` returns `"main" | "wiki" | "chat" | "os"` based on hostname (and optional `VITE_*` mode overrides). `useIsWiki()`, `useIsChat()`, and `useIsOS()` are thin wrappers.

`AppShell.tsx` dispatches early:
```
if (shell === "wiki") return <WikiShell />;
if (shell === "chat") return <ChatShell />;
if (shell === "os") return <OSShell />;
// else render main AppShell
```

All hooks run before the conditional return (React rules of hooks). Any hook that must bail on non-main shells (e.g. `usePanelClick`) must check `shell !== "main"` internally.

### Shell Capabilities

| Shell | Domain | Has | Does not have |
|---|---|---|---|
| AppShell | `subsurfaces.net` | BgCanvas, music, panels, graph, QuickControls | — |
| WikiShell | `wiki.subsurfaces.net` | MDXProvider, ThemePanel, SearchOverlay, LinkPreview, breadcrumb, BgCanvas, QuickControls | Music, panels, graph |
| ChatShell | `chat.subsurfaces.net` | BgCanvas, ThemePanel, QuickControls (chat variant), auth menu, TerminalTitle "Philchat" | Music, panels, graph |
| OSShell | `os.subsurfaces.net` | BootPage (endless procedural TUI) | Garden, wiki, and chat chrome |

### Strict Layering Rule

Dependencies flow one way only. A chat outage must not affect the wiki. A wiki outage must not affect the garden.

```
subsurfaces.net        (no Supabase dependency — must load if Supabase is down)
       ↓
wiki.subsurfaces.net   (Supabase auth + GitHub API)
       ↓
chat.subsurfaces.net   (Supabase Realtime)
```

Nothing flows upward. The garden has no Supabase dependency. Bookmarks must not import Supabase into `AppShell`. If a module must be Supabase-aware, it belongs in wiki or chat.

OSShell is a standalone presentation surface and does not participate in the community-platform dependency chain.

---

## Domain Routing

One Worker (`src/worker.ts`) serves all four domains intentionally. A clear partition comment is kept at the top of the routing block:

```
// garden:  subsurfaces.net        → static assets + OG meta injection
// wiki:    wiki.subsurfaces.net   → auth, editing, profiles, bookmarks
// chat:    chat.subsurfaces.net   → realtime, bans, GIF search
// os:      os.subsurfaces.net     → dedicated BootPage shell
```

---

## Community Platform Phase Order

Chat and Identity & Avatar share the existing Supabase auth and `profiles` table. (Stonks was removed 2026-07 — never matured.)

**Phase order is strict — do not skip ahead:**
`shared cookie auth` → `chat` → `identity`.

---

## Build Pipeline

1. `scripts/prebuild.ts` scans `content/` → generates manifests in `public/` + syncs MDX copies to `src/content/`
2. Vite compiles MDX to JS at build time via `@mdx-js/rollup`
3. At runtime, `NoteBody` uses `import.meta.glob` to dynamically import compiled MDX
4. `src/content/` is auto-generated — never edit directly; wiped on every prebuild

**MDX plugin order:**
- Remark: frontmatter → mdx-frontmatter → gfm → wikilinks → telescopic → callouts → sidenotes
- Rehype: slug → raw → imagePaths

---

## Key Architectural Notes

- `src/worker.ts` is the CF Worker entry point — excluded from the SPA `tsconfig.json`, compiled by Wrangler independently, and typechecked by `tsconfig.worker.json` via `npm run typecheck:worker`.
- `functions/` directory removed — API handled directly in `src/worker.ts`.
- SPA routing: `wrangler.toml` `[assets]` + `not_found_handling = "single-page-application"` (not `_redirects`).
- `VITE_WIKI_MODE` must never be `true` in CF build env vars.
- Wiki submit route must appear before catch-all in `routeTree.addChildren()`.
- `BgCanvas` at z-index 0 — all layout containers must be `background: transparent`.
- MDX custom components (`Query`, `WikiSubmitForm`, `BookCard`, etc.) must be passed via `components` prop on `<MDXComponent>` in `NoteBody` as well as registered in `MDXProvider` — context alone is insufficient.
- `contentPath` in content-index preserves original filename casing for `public/content/` fetches on CF's Linux filesystem.
- GitHub API calls use `master` not `main` (repo default branch).
- System pages use paired registries: pure metadata in `src/config/system-pages-meta.ts` (safe for prebuild) and lazy React components in `src/config/system-pages.ts`; their key sets must match.
- `classifyLayout()` in `src/lib/layout.ts` is the source of truth for frontmatter/type/slug/system-page article vs note vs game rules. `NoteRenderer`, `usePanelClick`, and `<Query>` share it.
- Prebuild synthesizes `system: true` content-index entries for registered pages without companion notes; graph emission excludes them, while recent queries and the sitemap include them.
