# Spec: shared layout classification, three-branch link handling, reader-mode sidenotes

**Covers:** ROADMAP §19 (both symptoms), §21, §23, and the §22 test seed that guards them.
**Status:** shipped and archived 2026-07-12 in commit `37cbbd6`.
**Prerequisite reading:** the corresponding ROADMAP sections, which carry the root-cause analyses.
The ROADMAP sections are marked shipped; the manual browser checklist below remains useful for visual verification.

These four items form one dependency cluster: the pure-data system-pages split (step 1) feeds the
shared classifier (step 2), which feeds both the click-interceptor rewrite (step 4) and the Query
type pill (step 5); the index changes (step 3) are what make the classifier exact. Steps 6–7
(reader mode) are independent — they can ship separately. All previously-open questions were
settled by Leon 2026-07-12 (see the final section); nothing in this spec is blocked on input.

**Ground rules that apply throughout** (from CLAUDE.md / memory):
- Never edit anything under `content/` without asking Leon.
- Never edit `src/content/` (wiped by prebuild).
- Verify with `npm run check` (test + worker typecheck + full build), not `vite build` alone —
  and not the dev preview server (expensive; see memory note).
- No emojis in file content; match surrounding comment density.

---

## Step 1 — Split system-page metadata from components

**Problem being solved:** `scripts/prebuild.ts` (Node, run via `tsx`) needs system-page metadata
(§21), but `src/config/system-pages.ts` values embed `lazy(() => import("...Page"))` React
components whose modules import `.scss` — unimportable from a script. Precedent for scripts
importing pure `src/` modules exists: `src/lib/slug.ts` (CLAUDE.md gotcha #15).

**New file `src/config/system-pages-meta.ts`** — zero imports:

```ts
export interface SystemPageMeta {
  layout: "article" | "note" | "game"
  title: string
  loading: string
  /** Ship date, YYYY-MM-DD — powers "recently added" (Query/-date). Set when a page ships. */
  since?: string
}

export const SYSTEM_PAGE_META: Record<string, SystemPageMeta> = { /* one line per page */ }
```

**Rework `src/config/system-pages.ts`:** keep only a `Record<string, LazyExoticComponent<...>>`
of components and build the existing `SYSTEM_PAGES` export by joining onto `SYSTEM_PAGE_META`,
so **no consumer of `SYSTEM_PAGES` changes** (NoteRenderer, useRandomNote, etc. keep working
untouched). Add a module-scope key-parity check that throws in dev if the two records' key sets
diverge — a page added to one map but not the other must fail loudly, not classify as "note".

**`since` dates for existing pages** (from ROADMAP shipped-dates; approximate is fine, they only
order a "recently added" list): chess/hexo/graph/bookshelf/movieshelf/music-library — early
build (use 2026-03-01 or leave `since` unset so they don't appear as "recent"); snake, blackjack
2026-06-17; tetris, 2048, hex-mines, murmuration, sandbox, ant-farm, arcade ~2026-06-17–20;
hex-life, life, progressions, persian-carpet 2026-06-20; sigil, collider 2026-07-03; apparatus
2026-07-05; inbox 2026-07-12. Leaving `since` unset is always safe — the entry is then
synthesized without a `date` and simply never sorts into date-ordered lists.

## Step 2 — `classifyLayout()` in `src/lib/layout.ts`

The single source of truth for "what layout does this slug get", replacing the logic private to
`NoteRenderer.resolveLayout()` (`src/components/ui/reader/NoteRenderer.tsx:30-47`).

```ts
import { SYSTEM_PAGE_META } from "@/config/system-pages-meta"

export type Layout = "article" | "note" | "game"

/** opts is satisfiable by full frontmatter OR a bare content-index entry. */
export function classifyLayout(slug: string, opts: { layout?: string; type?: string } = {}): Layout {
  if (opts.layout === "article" || opts.layout === "note" || opts.layout === "game") return opts.layout
  if (opts.type && ["book", "movie", "chatter", "philosopher"].includes(opts.type)) return "article"
  const s = slug.toLowerCase()
  if (s === "wiki" || s.startsWith("wiki/")) return "article"
  if (s.startsWith("writing/")) return "article"
  const sys = SYSTEM_PAGE_META[s]
  if (sys) return sys.layout
  return "note"
}
```

Rule order must exactly mirror the current `resolveLayout()` — do not "improve" it in the same
change. Then `resolveLayout()` in NoteRenderer becomes a thin adapter:

```ts
const layout = classifyLayout(slug, { layout: fm.layout, type: (fm.type as string) ?? meta?.type })
```

## Step 3 — Content-index changes (prebuild)

Three changes in `scripts/prebuild.ts` + `src/types/content.ts`:

1. **`layout` frontmatter passthrough.** Add `layout?: string` to prebuild's `NoteMeta` and to
   `NoteMetadata` (`src/types/content.ts`), copied in `scan()` next to `type`
   (~`prebuild.ts:186`). Without this, classifying a *destination* slug from index data misses
   explicit `layout:` overrides — the classifier would be approximately right and drift later.
2. **`system` marker.** Add `system?: boolean` to both types. Only synthesized entries set it.
3. **Synthesize system-page entries.** After `scan()`, for each `[slug, meta]` of
   `SYSTEM_PAGE_META` not shadowed by a real content file: push a `NoteMeta` with
   `{ slug, title: meta.title, tags: [], type: meta.layout === "game" ? "game" : "system",
   date: meta.since, links: [], backlinks: [], system: true }` (no `contentPath`, no raw copy —
   nothing is written to `public/content/` for these).

**Consumer decisions — every one of these is a required part of this step, not a follow-up**
(each is a regression if skipped; rationale in ROADMAP §21):

| Consumer | Decision |
|---|---|
| `emitGraph` (prebuild) | **Exclude** `system` entries — no orphan stars in the Constellation. |
| `emitRss` (prebuild) | Already safe — promotion is opt-in (`published`/`Writing/`). Verify, don't change. |
| Sitemap emitter (prebuild) | **Include** system entries (confirmed by Leon, 2026-07-12). |
| `InboxPage` | **Filter out** `system` entries before every triage bucket (untagged/orphaned/etc.). |
| `LinkPreview` / hover excerpt | **Guard**: skip preview when the entry has no `contentPath` (nothing to fetch). |
| `RecentPage`, `<Query>` | **No filter** — games appearing in date-ordered lists is the point of §21. |
| `useRandomNote` | Should be unaffected (it excludes by `SYSTEM_PAGES` keys, not index shape) — verify, add to tests. |
| BootPage / anything fetching `public/content/*.md` | Same guard class as LinkPreview — grep for `contentPath` consumers and check each. |

## Step 4 — `usePanelClick` three-branch rewrite

File: `src/components/panel/usePanelClick.ts`. Root causes in ROADMAP §19. Target behaviour:

1. **Special-case bails stay first and identical**: `shell !== "main"`, no anchor/href, `music:`,
   `#` hash, Ctrl/Cmd (browser handles — must still open new tabs), Alt, `data-panel-ignore`,
   `target="_blank"`, external origins. These run BEFORE any classification so they behave the
   same in every branch.
2. **Classify the destination**: after extracting `slug` (already done, line 64),
   `const dest = classifyLayout(slug, contentIndex?.[slug] ?? {})`.
3. **Branch A — client-side navigate (`preventDefault` + `clearStack()` + `navigate({ to })` +
   `setActiveGraphSlug(slug)`)** when ANY of:
   - `dest` is `"article"` or `"game"` (fixes games opening inside the 750px panel card);
   - current `activeLayout` is `"article"` or `"game"` (fixes the full-reload / music-wipe bug —
     this check moves from "bail" to "navigate", it does not disappear);
   - `window.innerWidth <= 800` (mobile currently full-reloads on every internal link — same
     music-wipe bug; the mobile check likewise moves from "bail" to "navigate").
4. **Branch B — panel card** (existing behaviour, unchanged) otherwise.

**Mechanics:**
- Get `navigate` via `useNavigate()` from `@tanstack/react-router` at the top of the hook.
  **Do NOT** `import { router } from "@/router"` — circular import (`router.tsx` → `AppShell` →
  `usePanelClick`). `AppShell` is the root route's component, so router context exists.
- Add `navigate` to the click-effect dep array.
- `clearStack` already exists (`src/store/index.ts:359`).
- Navigate with the pathname (`url.pathname`), not the raw href — wikilink hrefs may be
  root-relative already, but the URL object is already constructed at line 56; reuse it.
- Preserve hash/search if present on the URL (rare in content links, cheap to pass through).

**Deliberate non-goal:** no game gets a "panel peek" affordance — games always navigate
full-page (confirmed by Leon, 2026-07-12).

## Step 5 — Query type pill

File: `src/components/mdx/Query.tsx`. With steps 1–3 done this is display-only:
`classifyLayout(note.slug, note)` per row (the index entry now carries `layout` + `type`), render
a small pill next to the title in list/grid/table modes. Suggested labels: `game` / `article` /
`note` — lowercase, muted, using existing tag-pill styling if there is one (check how tags render
on TagPage for the idiom rather than inventing a new pill). Games' entries have `type: "game"` so
the pill needs no special-casing.

## Step 6 — Reader-mode sidenotes (SETTLED — Leon picked option (b), 2026-07-12: keep the floats)

Root cause in ROADMAP §23: reader mode collapses the article grid (`reader-mode.scss:46-48`) but
`sidenotes.scss`'s wide-viewport float rules (`float: right; margin-right: -290px` above
`$article-narrow`) don't check `data-reader`, so sidenotes float into a margin column that no
longer exists → off-canvas.

**Decision: preserve the floating margin sidenotes in reader mode** by keeping the grid track
they float into, rather than switching them to inline toggle cards. This is the larger of the two
options — it touches the layout system, not just sidenote styling — so the shape below matters:

1. **Scope the reader-mode grid collapse to notes only.** `reader-mode.scss:46-48`'s
   `.article-layout { display: block }` is the line that breaks the float math. Articles keep
   `display: grid` in reader mode; the `.note-body` centring rules (lines 49-56) can stay as-is
   (notes have no grid or sidenotes). Check whether `.article-body`'s
   `grid-column: 1; margin: auto; max-width: 100%` overrides in the same block fight the grid
   once it's restored — they were written for block mode and will likely need to be
   note-scoped too.
2. **Reconcile three things that reader mode currently assumes are gone** (this is the real work;
   the exact `grid-template-columns` value lives in `article.scss` — read it first, don't work
   from this spec's paraphrase):
   - **The prose track vs `--reader-measure`.** Reader width is applied via vars on
     `.mainPane`/`.mainContent` (`AppShell.module.scss`) and assumed a single block column. With
     the grid alive, the *prose track* must follow `--reader-measure` instead — e.g. a reader-
     scoped `grid-template-columns` override whose prose column uses the var and whose margin
     column keeps its original `calc(4rem + 250px)` width (the `-290px` float offset and `250px`
     sidenote width depend on that track size — do not shrink it).
   - **The hidden TOC.** `.article-toc` / `.body-side-group` stay `display: none` (that part of
     reader mode is wanted) — verify hiding the *contents* of the margin column doesn't collapse
     the *track* (it shouldn't if the track has a fixed width, but confirm in devtools).
   - **Total width at max measure.** At the largest `--reader-measure` step (100ch) plus the
     ~290px margin track, the combined grid may exceed the pane on mid-width screens. Clamp with
     `minmax()`/`min()` on the prose track, or accept that above some measure the layout behaves
     like the narrow breakpoint. Decide by looking, not in the abstract.
3. **Narrow viewports need no work**: below `$article-narrow` the sidenotes already switch to
   inline toggle cards independent of reader mode, and that interaction is correct today. Option
   (b) only changes wide-viewport reader mode. After the change, sanity-check the boundary
   (~1300px) with reader mode on — the handoff between "floating in reader grid" and "inline
   cards" should be clean in both directions.
4. **No `sidenotes.scss` changes should be needed** if the grid + track survive — the float math
   becomes valid again on its own. If you find yourself patching sidenote rules, the grid
   restoration is incomplete; fix that instead.

## Step 7 — Reader controls into ThemePanel

File: `src/components/layout/ThemePanel.tsx`. Widen `activeTab` union (line 100) to
`"system" | "dev" | "reader"`, add the tab button beside System/Dev (lines 174-180 idiom). Move
`ReaderControls`' width/scale steppers + exit button into the new tab's content; delete the
fixed pill component + its `.module.scss`. The System tab's existing Reader on/off button
(line 235) stays and additionally auto-selects the reader tab on enable. The steppers must keep
writing the same persisted store keys / CSS vars (`--reader-measure`/`--reader-scale`) — this is
a re-homing, not a rebuild. Check `PERSISTED_KEYS` untouched.

## Step 8 — Tests (§22 seed)

New `scripts/test-layout.ts` following the existing pure-logic script-test idiom (`test-slugs.ts`,
`test-sigil.ts`): table-test `classifyLayout` — explicit layout override wins; each special type;
`wiki`/`wiki/x`/`writing/x` prefixes; a known system slug per layout kind; unknown slug → note;
case-insensitivity. Plus: assert `SYSTEM_PAGE_META` and the component map have identical key
sets (the parity check, exercised in CI, not just at runtime). Add to the `test` script chain in
`package.json` — note `scripts/test-package-scripts.mjs` guards package-script strings, so run
`npm test` after editing and fix its expectations if it trips.

Full React-hook testing (Vitest + RTL for `usePanelClick` itself) remains §22's separate item —
don't stand up the harness in this pass unless it's going smoothly; the pure classifier test is
the cheap 80%.

## Verification checklist (manual, after `npm run check` passes)

- From the **home page**, click a link to `/hex-life` → full-page game layout, not a 750px card.
- From a **note**, click another note link → panel card (unchanged behaviour).
- From an **article** (e.g. the A&D essay), start music, click any internal link → SPA
  transition, **music keeps playing**, no full reload (watch the Network tab: no document fetch).
- **Mobile width** (≤800px): internal links client-navigate; music survives.
- Ctrl+click any internal link → new tab (bail preserved).
- `/inbox` counts unchanged vs before (no synthetic-entry flood).
- `/graph` has no new disconnected orphan nodes.
- Hover a link to a game (LinkPreview) → no broken preview / console 404.
- `index.md`'s `<Query sort="-date">` shows games with pills and correct dates.
- Reader mode ON at a wide viewport on the A&D essay → sidenotes still **float in the right
  margin**, fully visible, none clipped off-canvas; step every `--reader-measure` width
  (70/80/90/100ch) and confirm the floats survive each. Reader controls reachable via the
  ThemePanel reader tab. Around the ~1300px `$article-narrow` boundary with reader mode on,
  sidenotes hand off cleanly between margin floats and inline toggle cards.
- `curl`/view-source spot-check unaffected: OG/meta injection (worker) doesn't read the index
  fields added here, but confirm the site builds and deep routes still get meta tags.

## Decisions (settled by Leon, 2026-07-12 — nothing here is open)

1. §23: **option (b)** — keep the floating margin sidenotes in reader mode (preserve the grid).
2. Sitemap: **include** system/game pages.
3. Games **always navigate full-page** — no panel-card "peek" for any game.
