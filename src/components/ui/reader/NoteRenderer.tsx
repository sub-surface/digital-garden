import { useState, useMemo, useEffect, Suspense, lazy } from "react"
import { useStore } from "@/store"
import { ArticleLayout } from "./ArticleLayout"
import { NoteLayout } from "./NoteLayout"
import { NoteFooter } from "./NoteFooter"
import { NoteBody } from "./NoteBody"
import { WikiInfobox } from "../wiki/WikiInfobox"
import { resolveSlug } from "@/lib/content-loader"
import { useIsWiki } from "@/hooks/useIsWiki"
import { SYSTEM_PAGES } from "@/config/system-pages"
import type { NoteMetadata } from "@/types/content"

interface Props {
  slug: string
}

const WikiEditButton = lazy(() => import("../WikiEditButton").then((m) => ({ default: m.WikiEditButton })))
const BookmarkButton = lazy(() => import("../BookmarkButton").then((m) => ({ default: m.BookmarkButton })))

function resolveLayout(
  frontmatter: Record<string, any>,
  meta: NoteMetadata | undefined,
  slug: string,
): "article" | "note" | "game" {
  if (frontmatter.layout === "article") return "article"
  if (frontmatter.layout === "note") return "note"
  if (frontmatter.layout === "game") return "game"

  const type = (frontmatter.type as string) ?? meta?.type
  if (type && ["book", "movie", "chatter", "philosopher"].includes(type)) return "article"
  if (slug.toLowerCase() === "wiki" || slug.toLowerCase().startsWith("wiki/")) return "article"
  if (slug.toLowerCase().startsWith("writing/")) return "article"
  const sysPage = SYSTEM_PAGES[slug.toLowerCase()]
  if (sysPage) return sysPage.layout

  return "note"
}

export function NoteRenderer({ slug: rawSlug }: Props) {
  const slug = useMemo(() => 
    decodeURIComponent(rawSlug)
      .replace(/\.mdx?$/, "")
      .replace(/\s+/g, "-"),
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

  const handleLoad = (loaded: any) => {
    setData(prev => ({
      frontmatter: { ...prev.frontmatter, ...loaded.frontmatter },
      headings: (loaded.headings && loaded.headings.length > 0) ? loaded.headings : prev.headings
    }))
  }

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
              const href = "/" + breadcrumbParts.slice(0, i + 1).join("/")
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
  // off this so the two kinds can differ (links, tables, epigraph, dropcap)
  // without duplicating layout. Wiki = wiki/ slugs or person infoboxes.
  const articleKind =
    slug.toLowerCase().startsWith("wiki/") || type === "chatter" || type === "philosopher"
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
