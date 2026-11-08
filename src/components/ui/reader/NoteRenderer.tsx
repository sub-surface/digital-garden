import { useState, useMemo, useEffect, useCallback, Suspense, lazy } from "react"
import { useStore } from "@/store"
import { ArticleLayout } from "./ArticleLayout"
import { NoteLayout } from "./NoteLayout"
import { NoteFooter } from "./NoteFooter"
import { NoteBody } from "./NoteBody"
import { WikiInfobox } from "../wiki/WikiInfobox"
import { NoteHeader, resolveArticleKind } from "./NoteHeader"
import type { PrerenderSeed } from "./StaticArticle"
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
const CopyWikilinkButton = lazy(() => import("../CopyWikilinkButton").then((m) => ({ default: m.CopyWikilinkButton })))

/** Top-level collection folders whose breadcrumb crumb routes to a shelf page
 * instead of a (non-existent) /Folder page. Keyed lowercase. */
/** The edge-injected seed, if it belongs to this slug (first page view only). */
function usePrerenderSeed(slug: string): PrerenderSeed | null {
  const [seed] = useState<PrerenderSeed | null>(() => {
    const cache = typeof window !== "undefined" ? (window as any).__PRERENDER_CACHE__ : null
    const candidate = cache?.seed as PrerenderSeed | null | undefined
    return candidate && candidate.slug.toLowerCase() === slug.toLowerCase() ? candidate : null
  })
  return seed && seed.slug.toLowerCase() === slug.toLowerCase() ? seed : null
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
  
  // The Worker's first paint carries a seed (frontmatter, header, headings)
  // for the page it rendered. Starting from it means the app's first render
  // matches the static page exactly, instead of a bare header that fills in
  // once the content index and note JSON arrive.
  const seed = usePrerenderSeed(slug)

  // State is tagged with the slug it belongs to and reset DURING render on
  // navigation. The old reset-in-an-effect ran after the first paint, which
  // would have wiped the seed one frame late (and showed stale data a frame).
  type NoteData = {
    forSlug: string
    frontmatter: Record<string, any>
    headings: { id: string; text: string; level: number }[]
  }
  const [stored, setData] = useState<NoteData>(() => ({
    forSlug: slug,
    frontmatter: seed?.frontmatter ?? {},
    headings: seed?.headings ?? [],
  }))
  const data: NoteData = stored.forSlug === slug ? stored : { forSlug: slug, frontmatter: {}, headings: [] }

  const contentIndex = useStore((s) => s.contentIndex)
  const sessionOverrides = useStore((s) => s.sessionOverrides)

  const handleLoad = useCallback((loaded: any) => {
    setData((prev) => {
      const base = prev.forSlug === slug ? prev : { forSlug: slug, frontmatter: {}, headings: [] }
      return {
        forSlug: slug,
        frontmatter: { ...base.frontmatter, ...loaded.frontmatter },
        headings: (loaded.headings && loaded.headings.length > 0) ? loaded.headings : base.headings,
      }
    })
  }, [slug])

  const resolvedKey = contentIndex ? (resolveSlug(slug, contentIndex) ?? slug) : slug
  const meta = contentIndex?.[resolvedKey]
  const override = sessionOverrides[resolvedKey] || sessionOverrides[slug] || {}
  const fm = { ...data.frontmatter, ...override }
  
  const seeded = seed?.header
  const title = (fm.title as string) ?? meta?.title ?? seeded?.title ?? resolvedKey.split("/").pop()
  const growth = (fm.growth as string) ?? meta?.growth ?? seeded?.growth
  const date = (fm.date as string) ?? meta?.date ?? seeded?.date
  const tags = meta?.tags ?? seeded?.tags ?? []
  const readingTime = meta?.readingTime ?? seeded?.readingTime
  const layout = resolveLayout(fm, meta, resolvedKey)
  const type = (fm.type as string) ?? meta?.type
  const isWiki = useIsWiki()

  // Opt-in opening epigraph, set from frontmatter rather than hand-authored
  // MDX so it renders in the header (below title/growth/tags, above the
  // body) regardless of content. Reuses the same <Epigraph> the MDX authors
  // use inline, for one shared visual language.
  const quote = (fm as Record<string, any>).quote as string | undefined
  const quoteAuthor = (fm as Record<string, any>)["quote-author"] as string | undefined

  // Show edit button on wiki article pages (not index, about, submit, admin, style-guide)
  const editableWikiSlugs = isWiki && layout === "article" && resolvedKey.toLowerCase().startsWith("wiki/")
    && !["wiki", "wiki/about", "wiki/submit", "wiki/style-guide"].includes(resolvedKey.toLowerCase())

  // Update global layout state
  const setActiveLayout = useStore((s) => s.setActiveLayout)
  useEffect(() => {
    setActiveLayout(layout)
  }, [layout, setActiveLayout])

  // System Page Fallback Logic
  const renderContent = () => {
    const s = resolvedKey.toLowerCase()
    // photography is no longer a system page — Photography.md renders normally with <PhotoAlbums />
    const sysPage = SYSTEM_PAGES[s]
    if (sysPage) {
      const SysComponent = sysPage.component
      return <Suspense fallback={<div>{sysPage.loading}</div>}><SysComponent /></Suspense>
    }

    // The poster for movie/book notes is rendered inside NoteBody (so panel
    // cards / note-mode views get it too).
    return <NoteBody slug={resolvedKey} onLoad={handleLoad} />
  }

  const infobox = (type === "chatter" || type === "philosopher") ? (
    <WikiInfobox type={type} data={{ ...fm, title }} slug={resolvedKey} />
  ) : null

  const header = (
    <NoteHeader
      slug={resolvedKey}
      layout={layout}
      title={title ?? ""}
      growth={growth}
      date={date}
      readingTime={readingTime}
      tags={tags}
      quote={quote}
      quoteAuthor={quoteAuthor}
      tools={
        <Suspense fallback={null}>
          {editableWikiSlugs && <WikiEditButton slug={resolvedKey} />}
          <CopyWikilinkButton slug={resolvedKey} title={title} />
          <BookmarkButton slug={resolvedKey} title={title} />
        </Suspense>
      }
    />
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
  const articleKind = resolveArticleKind(fm as Record<string, unknown>, slug, type)

  const isWikiIndex = resolvedKey.toLowerCase() === "wiki" || resolvedKey.toLowerCase() === "wiki/index"

  return (
    <article
      className={`${layout}-layout ${isWikiIndex ? "wiki-index-layout" : ""}`}
      data-article-kind={layout === "article" ? articleKind : undefined}
      data-wiki-index={isWikiIndex ? "true" : undefined}
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
      <NoteFooter slug={resolvedKey} meta={meta} />
    </article>
  )
}
