import { SYSTEM_PAGE_META } from "../config/system-pages-meta"

export type Layout = "article" | "note" | "game"

/**
 * Single source of truth for "what layout does this slug get". `opts` is
 * satisfiable by either full frontmatter (NoteRenderer) or a bare
 * content-index entry (usePanelClick) — same shape, either source.
 * Rule order mirrors the old NoteRenderer.resolveLayout() exactly.
 */
export function classifyLayout(slug: string, opts: { layout?: string; type?: string } = {}): Layout {
  if (opts.layout === "article") return "article"
  if (opts.layout === "note") return "note"
  if (opts.layout === "game") return "game"

  if (opts.type && ["book", "movie", "chatter", "philosopher"].includes(opts.type)) return "article"
  const s = slug.toLowerCase()
  if (s === "wiki" || s.startsWith("wiki/")) return "article"
  if (s.startsWith("writing/")) return "article"
  const sysPage = SYSTEM_PAGE_META[s]
  if (sysPage) return sysPage.layout

  return "note"
}
