import { useState, useMemo } from "react"
import { useStore } from "@/store"
import { ArticleLayout } from "./ArticleLayout"
import { NoteLayout } from "./NoteLayout"
import { NoteFooter } from "./NoteFooter"
import { NoteBody } from "./NoteBody"
import type { NoteMetadata } from "@/types/content"

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
  if (type && ["book", "movie"].includes(type)) return "article"
  if (slug.toLowerCase().startsWith("wiki/")) return "article"

  return "note"
}

export function NoteRenderer({ slug }: Props) {
  const [data, setData] = useState<{
    frontmatter: Record<string, any>
    headings: { id: string; text: string; level: number }[]
  }>({ frontmatter: {}, headings: [] })
  
  const contentIndex = useStore((s) => s.contentIndex)
  const sessionOverrides = useStore((s) => s.sessionOverrides)

  const handleLoad = (loaded: any) => {
    setData(prev => ({
      frontmatter: { ...prev.frontmatter, ...loaded.frontmatter },
      headings: loaded.headings.length > 0 ? loaded.headings : prev.headings
    }))
  }

  const meta = contentIndex?.[slug]
  const override = sessionOverrides[slug] || {}
  const fm = { ...data.frontmatter, ...override }
  
  const title = (fm.title as string) ?? meta?.title ?? slug.split("/").pop()
  const growth = (fm.growth as string) ?? meta?.growth
  const date = (fm.date as string) ?? meta?.date
  const tags = meta?.tags ?? []
  const layout = resolveLayout(fm, meta, slug)

  return (
    <article className={`${layout}-layout`}>
      {/* Shared header */}
      <div className="note-header" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 'var(--space-12)' }}>
        {growth && (
          <span className={`growth-badge growth-${growth}`}>{growth}</span>
        )}
        <h1 style={{ margin: 'var(--space-2) 0' }}>{title}</h1>
        {date && <div className="note-date" style={{ fontFamily: 'var(--font-code)', fontSize: '0.8rem', opacity: 0.6 }}>{date}</div>}
        {tags.length > 0 && (
          <div className="tag-list" style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            {tags.map((tag) => (
              <a key={tag} href={`/tags/${tag}`} className="tag-pill" style={{ fontFamily: 'var(--font-code)', fontSize: '0.7rem', opacity: 0.8 }}>#{tag}</a>
            ))}
          </div>
        )}
      </div>

      {/* Layout-wrapped content */}
      {layout === "article" ? (
        <ArticleLayout headings={data.headings}>
          <NoteBody slug={slug} onLoad={handleLoad} />
        </ArticleLayout>
      ) : (
        <NoteLayout headings={data.headings}>
          <NoteBody slug={slug} onLoad={handleLoad} />
        </NoteLayout>
      )}

      {/* Shared footer: backlinks + local graph */}
      <NoteFooter slug={slug} meta={meta} />
    </article>
  )
}
