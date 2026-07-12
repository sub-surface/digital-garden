/**
 * Pure system-page metadata — zero imports, safe for scripts (prebuild via
 * tsx) as well as the SPA. `system-pages.ts` joins components onto this by
 * key; keep the two key sets identical (see the parity check there).
 */
export interface SystemPageMeta {
  layout: "article" | "note" | "game"
  title: string
  loading: string
  /** Ship date, YYYY-MM-DD — powers "recently added" (Query/-date). Unset if unknown/pre-tracking. */
  since?: string
}

export const SYSTEM_PAGE_META: Record<string, SystemPageMeta> = {
  graph:           { layout: "game",    title: "Constellation", loading: "Charting the sky..." },
  chess:           { layout: "game",    title: "Chess", loading: "Loading board..." },
  hexo:            { layout: "game",    title: "HeXO", loading: "Loading board..." },
  bookshelf:       { layout: "article", title: "Bookshelf", loading: "Loading shelf..." },
  movieshelf:      { layout: "article", title: "Movieshelf", loading: "Loading shelf..." },
  "music-library": { layout: "article", title: "Music Library", loading: "Loading library..." },
  arcade:          { layout: "article", title: "Arcade", loading: "Loading arcade..." },
  inbox:           { layout: "article", title: "Inbox", loading: "Sorting loose threads...", since: "2026-07-12" },
  snake:           { layout: "game",    title: "Snake", loading: "Loading snake...", since: "2026-06-17" },
  blackjack:       { layout: "game",    title: "Blackjack", loading: "Loading table...", since: "2026-06-17" },
  tetris:          { layout: "game",    title: "Tetris", loading: "Loading well...", since: "2026-06-17" },
  "2048":          { layout: "game",    title: "2048", loading: "Loading tiles...", since: "2026-06-17" },
  murmuration:     { layout: "game",    title: "Murmuration", loading: "Loading flock...", since: "2026-06-18" },
  sandbox:         { layout: "game",    title: "Sandbox", loading: "Loading sand...", since: "2026-06-18" },
  "hex-mines":     { layout: "game",    title: "Hex Mines", loading: "Loading minefield...", since: "2026-06-19" },
  "ant-farm":      { layout: "game",    title: "Ant Farm", loading: "Loading colony...", since: "2026-06-20" },
  "hex-life":      { layout: "game",    title: "Hex Life", loading: "Seeding the grid...", since: "2026-06-20" },
  life:            { layout: "game",    title: "Life", loading: "Seeding the grid...", since: "2026-06-20" },
  progressions:    { layout: "game",    title: "Progressions", loading: "Setting the board...", since: "2026-06-20" },
  constellation:   { layout: "game",    title: "Constellation", loading: "Charting the sky..." },
  "persian-carpet": { layout: "game",   title: "The Knotted Field", loading: "Stringing the loom…", since: "2026-06-20" },
  sigil:           { layout: "game",    title: "SIGIL", loading: "Preparing the plate...", since: "2026-07-03" },
  collider:        { layout: "game",    title: "Collider", loading: "Charging the field...", since: "2026-07-03" },
  apparatus:       { layout: "game",    title: "Apparatus", loading: "Warming the plate...", since: "2026-07-05" },
}
