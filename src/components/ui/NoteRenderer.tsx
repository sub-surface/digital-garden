import { useState, useMemo, useEffect, lazy, Suspense } from "react"
import { useStore } from "@/store"
import { ArticleLayout } from "./ArticleLayout"
import { NoteLayout } from "./NoteLayout"
import { NoteFooter } from "./NoteFooter"
import { NoteBody } from "./NoteBody"
import { WikiInfobox } from "./WikiInfobox"
import { resolveSlug } from "@/lib/content-loader"
import type { NoteMetadata } from "@/types/content"

// Lazy system pages
const GraphView = lazy(() => import("./GraphView").then(m => ({ default: m.GraphView })))
const ChessPage = lazy(() => import("./ChessPage").then(m => ({ default: m.ChessPage })))
const PhotographyPage = lazy(() => import("./PhotographyPage").then(m => ({ default: m.PhotographyPage })))
const BookshelfPage = lazy(() => import("./BookshelfPage").then(m => ({ default: m.BookshelfPage })))
const MovieshelfPage = lazy(() => import("./MovieshelfPage").then(m => ({ default: m.MovieshelfPage })))
const MusicPage = lazy(() => import("./MusicPage").then(m => ({ default: m.MusicPage })))

interface Props {
  slug: string
}

function resolveLayout(
  frontmatter: Record<string, any>,
  meta: NoteMetadata | undefined,
  slug: string,
): "article" | "note" {
  if (frontmatter.layout === "article") return "article"
  if (frontmatter.layout === "note") return "note"

  const type = (frontmatter.type as string) ?? meta?.type
  if (type && ["book", "movie", "chatter", "philosopher"].includes(type)) return "article"
  if (slug.toLowerCase() === "wiki" || slug.toLowerCase().startsWith("wiki/")) return "article"
  if (slug.toLowerCase() === "chess") return "article"
  if (["graph", "photography", "bookshelf", "movieshelf", "music-library", "tags", "folder"].includes(slug.toLowerCase())) return "article"

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

  // Update global layout state
  const setActiveLayout = useStore((s) => s.setActiveLayout)
  useEffect(() => {
    setActiveLayout(layout)
  }, [layout, setActiveLayout])

  // System Page Fallback Logic
  const renderContent = () => {
    const s = slug.toLowerCase()
    if (s === "graph") return <Suspense fallback={<div>Loading map...</div>}><GraphView /></Suspense>
    if (s === "chess") return <Suspense fallback={<div>Loading board...</div>}><ChessPage /></Suspense>
    if (s === "photography") return <Suspense fallback={<div>Loading gallery...</div>}><PhotographyPage /></Suspense>
    if (s === "bookshelf") return <Suspense fallback={<div>Loading shelf...</div>}><BookshelfPage /></Suspense>
    if (s === "movieshelf") return <Suspense fallback={<div>Loading shelf...</div>}><MovieshelfPage /></Suspense>
    if (s === "music-library") return <Suspense fallback={<div>Loading library...</div>}><MusicPage /></Suspense>
    
    return <NoteBody slug={slug} onLoad={handleLoad} />
  }

  const infobox = (type === "chatter" || type === "philosopher") ? (
    <WikiInfobox type={type} data={{ ...fm, title }} />
  ) : null

  // Breadcrumb: derive from slug parts
  const breadcrumbParts = slug.includes("/")
    ? slug.split("/").slice(0, -1)
    : []

  const header = (
    <div className="note-header" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 'var(--space-12)' }}>
      {breadcrumbParts.length > 0 && layout === "article" && (
        <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.75rem', opacity: 0.45, marginBottom: 'var(--space-2)', display: 'flex', gap: '0.4em', alignItems: 'center' }}>
          {breadcrumbParts.map((part, i) => {
            const href = "/" + breadcrumbParts.slice(0, i + 1).join("/")
            return (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4em' }}>
                {i > 0 && <span style={{ opacity: 0.5 }}>/</span>}
                <a href={href} style={{ color: 'inherit', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {part.replace(/-/g, " ")}
                </a>
              </span>
            )
          })}
        </div>
      )}
      {growth && (
        <span className={`growth-badge growth-${growth}`}>{growth}</span>
      )}
      <h1 style={{ margin: 'var(--space-2) 0' }}>{title}</h1>
      {(date || readingTime) && (
        <div className="note-date" style={{ fontFamily: 'var(--font-code)', fontSize: '0.8rem', opacity: 0.6, display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          {date && <span>{date}</span>}
          {readingTime && <span>{readingTime} min read</span>}
        </div>
      )}
      {tags.length > 0 && (
        <div className="tag-list" style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          {tags.map((tag) => (
            <a key={tag} href={`/tags/${tag}`} className="tag-pill" style={{ fontFamily: 'var(--font-code)', fontSize: '0.7rem', opacity: 0.8 }}>#{tag}</a>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <article className={`${layout}-layout`}>
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
