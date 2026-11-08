# Mobile audit (2026-11-08)

Code-read audit at 360–430px widths; nothing was run, so "likely" marks
inferred rendering. This is the brief for phase 9 of
[`garden-reset.md`](./garden-reset.md). Line numbers are approximate.

## P1 — broken / unusable

1. **(Fixed 2026-11-08: Settings is a bottom sheet on phones; CornerMenu "Reader" toggles reader mode.)** **Theme and Reader do nothing on phones.** `ThemePanel.module.scss:16`
   hides `.floatingPanel` at ≤`$bp-phone`, but CornerMenu's "Reader" and
   "Theme" (`CornerMenu.tsx:44-57`) both just `toggleThemePanel()`, so they
   open an invisible panel and leave a live focus trap. → A phone bottom-sheet
   variant; "Reader" should call `toggleReaderMode`.
2. **Reader controls vanish in reader mode.** `QuickControls.module.scss:282`
   (`[data-variant="full"]:not([data-immersive]) {display:none}`) also hides
   the reader steppers and exit, overriding `reader-mode.scss:35-49`'s
   `data-reader-keep`. → `:not([data-reading])`, or a compact reader bar on
   phones; steppers ≥40px (`reader-mode.scss:121` is 24px).
3. **The "useless footnote header" (Synth).** `remark-sidenotes.ts:106-110`
   places checkbox/label/aside after the block; `sidenotes.scss:182-190,
   228-230` hides the in-text `<sup>` on phones and shows `.sidenote-toggle`
   instead, so the prose has no marker and a stray 0.75em numeral (~8px tap
   target) sits under the paragraph; several in one paragraph run together
   ("iiiiii"). → Keep the inline marker and make *it* the toggle (flip
   `.is-open` on `#sn-aside-<id>`), or emit the label inline in the `<p>`.
4. **`100vh` everywhere** (`AppShell.module.scss:3,11,51,105`,
   `WikiShell.module.scss:3`, `base.scss:60`, `Panel.module.scss:11`): on iOS
   the last ~80–100px of every page is likely unreachable. → `100dvh` with a
   `100vh` fallback.
5. **Wide tables scroll the whole pane** (`base.scss:268`, no wrapper). →
   Wrap tables (rehype) in an `overflow-x:auto` div.

## P2 — clunky

- **Double gutters**: `AppShell.module.scss:174` + `article.scss:327-331`
  leave ~264px of prose at 360px; reader mode (`AppShell.module.scss:152`)
  ~248px.
- **NoteLayout inline float** (`NoteLayout.tsx:15`, `float:right;
  width:300px`) defeats the ≤900px reset; drop the inline style.
- **TOC starts expanded** (`TableOfContents.tsx:38`), pushing prose below
  the fold; 14px links.
- **No space reserved for fixed bottom UI**; CornerMenu's static links sit
  over content. → `padding-bottom: calc(5rem + env(safe-area-inset-bottom))`.
- **MobileMusicBar** ignores `safe-area-inset-bottom`, ~22px buttons;
  CornerMenu reserves 48px for it even where it's absent; MusicPlayer has
  no `max-height` (landscape overflow) and collides with CornerMenu.
- **`@container panel` rules never fire in the main pane** (only panels
  define the container, and panels are hidden on phones): Collections h1,
  Arcade, Tetris, HexLife, GameCabinet, Constellation. → `container-type` on
  `.mainContent` or `@media` twins.
- **iOS focus-zoom** from <16px inputs: the dock prompt, wiki forms
  (0.8rem), EmotePicker, Chat inputs, the 11px terminal input.
- **Overlays use `vh`** (the dock, Settings); the
  keyboard covers results. 27×25 terminal close button.
- **Hover-only affordances**: telescopic controls (`telescopic.scss:12-20`,
  14px), chat message actions (`Chat.module.scss:417-452`, "visible on tap"
  comment but no rule), Constellation labels (tap navigates immediately; no
  pinch zoom), shelves' play buttons and photo captions.
- **Top-bar collisions**: chat QuickControls vs TerminalTitle at 360px;
  the ~700px desktop bar at 801–1100px (iPad portrait) vs the title.
- **Justified + hyphenated text in a 264px column**; no `overflow-wrap`
  anywhere (long URLs / inline code overflow). → left-align on phones,
  `overflow-wrap:anywhere`.

## P3 — polish

- No tap-to-peek for wikilinks (hover previews are correctly disabled).
- Small targets: TerminalTitle button (~11px), CookieConsent (~24px),
  CornerMenu items (~32px), emote tabs.
- CornerMenu: 9 items, clips in landscape; "Reader"/"Theme" duplicate.
- Safe areas only used in Chat, Lightbox, Cookie, Filament.
- `vh` in GameCabinet/Constellation; 2.4rem essay title unclamped; a third
  phone breakpoint (901px) in Chat.
- Raw breakpoints off `$bp-phone`: Chat ×18 at 700px, QuickControls 700px,
  article 900px, NoteFooter 900/768, MDX cards 600/640/768/960.

## Themes (the systemic causes)

1. **Desktop-first margin column**: sidenotes have no phone *design*, only
   a patched fallback.
2. **The phone shell hides controls; the replacements are stubs**
   (QuickControls, ThemePanel, panels → CornerMenu mirrors that don't work).
3. **Unbudgeted padding and fixed chrome**: stacked gutters, colliding
   bottom bars, no `dvh` / safe areas.
4. **Container queries assume a "panel"** the phone never has.
5. **Hover as the only affordance, and too many breakpoints**: no
   `(hover:none)` / `(pointer:coarse)` layer; six raw breakpoints beside
   `$bp-phone`.
