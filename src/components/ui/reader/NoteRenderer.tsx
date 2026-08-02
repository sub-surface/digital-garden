import { useState, useMemo, useEffect, useCallback, Suspense, lazy } from "react"
import { useStore } from "@/store"
import { ArticleLayout } from "./ArticleLayout"
import { NoteLayout } from "./NoteLayout"
import { NoteFooter } from "./NoteFooter"
import { NoteBody } from "./NoteBody"
import { WikiInfobox } from "../wiki/WikiInfobox"
import { Epigraph } from "@/components/mdx/Epigraph"
import { resolveSlug } from "@/lib/content-loader"
import { normalizeSlug } from "@/lib/slug"
import { useIsWiki } from "@/hooks/useShell"
import { SYSTEM_PAGES } from "@/config/system-pages"
import { classifyLayout } from "@/lib/layout"
import type { NoteMetadata } from "@/types/content"

interface Props {
  slug: string
}

const WikiEditButton = lazy(() => import("../WikiEditButton").then((m) => ({ default: m.WikiEditButton })))
const BookmarkButton = lazy(() => import("../BookmarkButton").then((m) => ({ default: m.BookmarkButton })))

/** Top-level collection folders whose breadcrumb crumb routes to a shelf page
 * instead of a (non-existent) /Folder page. Keyed lowercase. */
const CRUMB_ALIASES: Record<string, string> = {
  movies: "/movieshelf",
  books: "/bookshelf",
  music: "/music-library",
}

function resolveLayout(
  frontmatter: Record<string, any>,
  meta: NoteMetadata | undefined,
  slug: string,
): "article" | "note" | "game" {
  return classifyLayout(slug, { layout: frontmatter.layout, type: (frontmatter.type as string) ?? meta?.type })
}

export function NoteRenderer({ slug: rawSlug }: Props) {
  const slug = useMemo(
    () => normalizeSlug(decodeURIComponent(rawSlug).replace(/\.mdx?$/, "")),
    [rawSlug]
  )
  
  const [data, setData] = useState<{
    frontmatter: Record<string, any>
    headings: { id: string; text: string; level: number }[]
  }>({ frontmatter: {}, headings: [] })

  // Reset frontmatter when slug changes so stale type/infobox don't persist
  useEffect(() => {
    setData({ frontmatter: {}, headings: [] })
  }, [slug])

  const contentIndex = useStore((s) => s.contentIndex)
  const sessionOverrides = useStore((s) => s.sessionOverrides)

  const handleLoad = useCallback((loaded: any) => {
    setData(prev => ({
      frontmatter: { ...prev.frontmatter, ...loaded.frontmatter },
      headings: (loaded.headings && loaded.headings.length > 0) ? loaded.headings : prev.headings
    }))
  }, [])

  const resolvedKey = contentIndex ? (resolveSlug(slug, contentIndex) ?? slug) : slug
  const meta = contentIndex?.[resolvedKey]
  const override = sessionOverrides[slug] || {}
  const fm = { ...data.frontmatter, ...override }
  
  const title = (fm.title as string) ?? meta?.title ?? slug.split("/").pop()
  const growth = (fm.growth as string) ?? meta?.growth
  const date = (fm.date as string) ?? meta?.date
  const tags = meta?.tags ?? []
  const readingTime = meta?.readingTime
  const layout = resolveLayout(fm, meta, slug)
  const type = (fm.type as string) ?? meta?.type
  const isWiki = useIsWiki()

  // Opt-in opening epigraph, set from frontmatter rather than hand-authored
  // MDX so it renders in the header (below title/growth/tags, above the
  // body) regardless of content. Reuses the same <Epigraph> the MDX authors
  // use inline, for one shared visual language.
  const quote = (fm as Record<string, any>).quote as string | undefined
  const quoteAuthor = (fm as Record<string, any>)["quote-author"] as string | undefined

  // Show edit button on wiki article pages (not index, about, submit, admin, style-guide)
  const editableWikiSlugs = isWiki && layout === "article" && slug.toLowerCase().startsWith("wiki/")
    && !["wiki", "wiki/about", "wiki/submit", "wiki/style-guide"].includes(slug.toLowerCase())

  // Update global layout state
  const setActiveLayout = useStore((s) => s.setActiveLayout)
  useEffect(() => {
    setActiveLayout(layout)
  }, [layout, setActiveLayout])

  // System Page Fallback Logic
  const renderContent = () => {
    const s = slug.toLowerCase()
    // photography is no longer a system page — Photography.md renders normally with <PhotoAlbums />
    const sysPage = SYSTEM_PAGES[s]
    if (sysPage) {
      const SysComponent = sysPage.component
      return <Suspense fallback={<div>{sysPage.loading}</div>}><SysComponent /></Suspense>
    }

    // The poster for movie/book notes is rendered inside NoteBody (so panel
    // cards / note-mode views get it too).
    return <NoteBody slug={slug} onLoad={handleLoad} />
  }

  const infobox = (type === "chatter" || type === "philosopher") ? (
    <WikiInfobox type={type} data={{ ...fm, title }} slug={resolvedKey} />
  ) : null

  // Breadcrumb: derive from slug parts
  const breadcrumbParts = slug.includes("/")
    ? slug.split("/").slice(0, -1)
    : []

  const header = (
    <>
      <div className="note-header">
        {layout === "article" && (
          <div className="note-header__bar">
            <div className="note-header__tools">
              <Suspense fallback={null}>
                {editableWikiSlugs && <WikiEditButton slug={slug} />}
                <BookmarkButton slug={slug} title={title} />
              </Suspense>
            </div>
            <div className="note-header__crumbs">
              {breadcrumbParts.map((part, i) => {
                // Top-level collection folders have dedicated shelf pages; route
                // their crumb there instead of /Movies (which has no page).
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
        {growth && (
          <span className={`growth-badge growth-${growth}`}>{growth}</span>
        )}
        <h1 className="note-header__title">{title}</h1>
        {(date || readingTime) && (
          <div className="note-date note-header__meta">
            {date && <span>{new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
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

  // Game layout: bare, wide, centered — no header chrome, TOC, infobox or
  // backlink footer. Just the interactive component, room to breathe.
  if (layout === "game") {
    return (
      <article className="game-layout">
        <div className="game-stage">{renderContent()}</div>
      </article>
    )
  }

  // Essays read literary; wiki articles read reference. Style divergence keys
  // off this so the two kinds can differ (links, tables, epigraph) without
  // duplicating layout. Frontmatter-first (mirrors resolveLayout): an explicit
  // `kind: essay|wiki` wins; otherwise default from slug/type (wiki/ slugs and
  // person infoboxes read as reference, everything else as essay).
  const fmKind = ((fm as Record<string, any>).kind as string | undefined)?.toLowerCase()
  const articleKind =
    fmKind === "essay" || fmKind === "wiki"
      ? fmKind
      : slug.toLowerCase().startsWith("wiki/") || type === "chatter" || type === "philosopher"
        ? "wiki"
        : "essay"

  return (
    <article
      className={`${layout}-layout`}
      data-article-kind={layout === "article" ? articleKind : undefined}
    >
      {/* Layout-wrapped content (Header is passed inside to align with grid column 2) */}
      {layout === "article" ? (
        <ArticleLayout headings={data.headings} infobox={infobox} header={header}>
          {renderContent()}
        </ArticleLayout>
      ) : (
        <NoteLayout headings={data.headings} infobox={infobox} header={header}>
          {renderContent()}
        </NoteLayout>
      )}

      {/* Shared footer: backlinks + local graph */}
      <NoteFooter slug={slug} meta={meta} />
    </article>
  )
}
