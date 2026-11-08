import type { ReactNode } from "react"
import { Epigraph } from "@/components/mdx/Epigraph"

/**
 * The note/article header: one component, two render targets.
 *
 * NoteRenderer renders it in the app; scripts/emit-prerender.ts renders it
 * with renderToStaticMarkup for the Worker's first paint. Being literally the
 * same component is what makes the hand-off from static page to app
 * invisible. The old prerender header was a hand-written copy that drifted:
 * left-aligned title, ISO dates, a doubled "— —" in the epigraph.
 *
 * Must stay pure (no store, no hooks with effects, no CSS modules, no lazy
 * imports) so it can render in Node at build time.
 */

/** Top-level folders whose crumb should route to their shelf page. */
export const CRUMB_ALIASES: Record<string, string> = {
  movies: "/movieshelf",
  books: "/bookshelf",
  music: "/music-library",
}

// UTC: frontmatter dates are calendar dates ("2026-07-10" parses as UTC
// midnight). Formatting in the reader's zone showed 9 Jul west of Greenwich,
// and would make the build-time render disagree with the browser's.
const NOTE_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

export function formatNoteDate(date: string): string {
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? date : NOTE_DATE.format(parsed)
}

export interface NoteHeaderProps {
  slug: string
  layout: string
  title: string
  growth?: string
  date?: string
  readingTime?: number
  tags: string[]
  quote?: string
  quoteAuthor?: string
  /** Article tools (wikilink, bookmark, edit). The row keeps its height while
   *  they load, so the title doesn't jump when they arrive. */
  tools?: ReactNode
}

export function NoteHeader({ slug, layout, title, growth, date, readingTime, tags, quote, quoteAuthor, tools }: NoteHeaderProps) {
  const breadcrumbParts = slug.includes("/") ? slug.split("/").slice(0, -1) : []
  return (
    <>
      <div className="note-header">
        {layout === "article" && (
          <div className="note-header__bar">
            <div className="note-header__tools">{tools}</div>
            <div className="note-header__crumbs">
              {breadcrumbParts.map((part, i) => {
                const href =
                  i === 0 && CRUMB_ALIASES[part.toLowerCase()]
                    ? CRUMB_ALIASES[part.toLowerCase()]
                    : "/" + breadcrumbParts.slice(0, i + 1).join("/")
                return (
                  <span key={i}>
                    {i > 0 && <span className="sep">/</span>}
                    <a href={href}>{part.replace(/-/g, " ")}</a>
                  </span>
                )
              })}
            </div>
          </div>
        )}
        {growth && <span className={`growth-badge growth-${growth}`}>{growth}</span>}
        <h1 className="note-header__title">{title}</h1>
        {(date || readingTime) && (
          <div className="note-date note-header__meta">
            {date && <span>{formatNoteDate(date)}</span>}
            {readingTime && <span>{readingTime} min read</span>}
          </div>
        )}
        {tags.length > 0 && (
          <div className="tag-list note-header__tags">
            {tags.map((tag) => (
              <a key={tag} href={`/tags/${tag}`} className="tag-pill">#{tag}</a>
            ))}
          </div>
        )}
      </div>
      {quote && <Epigraph cite={quoteAuthor}>{quote}</Epigraph>}
    </>
  )
}

/**
 * Essays read literary, wiki articles read reference. Frontmatter `kind`
 * wins; otherwise wiki/ slugs and person infoboxes are "wiki". Shared by
 * NoteRenderer and the build-time render so both pick the same styling.
 */
export function resolveArticleKind(frontmatter: Record<string, unknown>, slug: string, type?: string): "essay" | "wiki" {
  const kind = String(frontmatter.kind ?? "").toLowerCase()
  if (kind === "essay" || kind === "wiki") return kind
  return slug.toLowerCase().startsWith("wiki/") || type === "chatter" || type === "philosopher" ? "wiki" : "essay"
}
