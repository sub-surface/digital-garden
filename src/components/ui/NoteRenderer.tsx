import { useEffect, useRef, useState, useMemo } from "react"
import { parseMarkdown, type ParsedNote } from "@/lib/markdown"
import { useStore } from "@/store"
import { useTelescopicHandlers } from "./TelescopicHandler"
import { ArticleLayout } from "./ArticleLayout"
import { NoteLayout } from "./NoteLayout"
import { NotFound } from "./NotFound"
import type { NoteMetadata } from "@/types/content"

interface Props {
  slug: string
}

function extractHeadings(html: string): { id: string; text: string; level: number }[] {
  const regex = /<h([2-4])\s+id="([^"]+)"[^>]*>(.*?)<\/h\1>/gi
  const headings: { id: string; text: string; level: number }[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const text = match[3].replace(/<[^>]+>/g, "")
    headings.push({ id: match[2], text, level: parseInt(match[1]) })
  }
  return headings
}

function resolveLayout(
  frontmatter: Record<string, unknown>,
  meta: NoteMetadata | undefined,
  slug: string,
): "article" | "note" {
  // 1. Explicit frontmatter
  if (frontmatter.layout === "article") return "article"
  if (frontmatter.layout === "note") return "note"

  // 2. Type-based inference
  const type = (frontmatter.type as string) ?? meta?.type
  if (type && ["book", "movie"].includes(type)) return "article"

  // 3. Wiki pages
  if (slug.toLowerCase().startsWith("wiki/")) return "article"

  // 4. Default
  return "note"
}

export function NoteRenderer({ slug }: Props) {
  const [note, setNote] = useState<ParsedNote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const contentIndex = useStore((s) => s.contentIndex)
  const contentRef = useRef<HTMLDivElement>(null)

  useTelescopicHandlers(contentRef)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const paths = [`/content/${slug}.md`, `/content/${slug}/index.md`]
        let source: string | null = null

        for (const path of paths) {
          const res = await fetch(path)
          if (res.ok) {
            source = await res.text()
            break
          }
        }

        if (!source) {
          if (!cancelled) setError("Note not found")
          return
        }

        const parsed = await parseMarkdown(source)
        if (!cancelled) setNote(parsed)
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [slug])

  const headings = useMemo(() => {
    if (!note) return []
    return extractHeadings(note.html)
  }, [note])

  if (loading) return <div className="note-loading">Loading...</div>
  if (error === "Note not found") return <NotFound />
  if (error) return <div className="note-error">{error}</div>
  if (!note) return null

  const meta = contentIndex?.[slug]
  const title = (note.frontmatter.title as string) ?? meta?.title ?? slug.split("/").pop()
  const growth = (note.frontmatter.growth as string) ?? meta?.growth
  const date = (note.frontmatter.date as string) ?? meta?.date
  const tags = meta?.tags ?? []
  const layout = resolveLayout(note.frontmatter, meta, slug)

  const contentDiv = (
    <div
      ref={contentRef}
      className="note-content"
      dangerouslySetInnerHTML={{ __html: note.html }}
    />
  )

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
        <ArticleLayout headings={headings}>
          {contentDiv}
        </ArticleLayout>
      ) : (
        <NoteLayout headings={headings}>
          {contentDiv}
        </NoteLayout>
      )}

      {/* Shared footer: backlinks */}
      {meta?.backlinks && meta.backlinks.length > 0 && (
        <footer className="note-footer">
          <hr />
          <section className="backlinks">
            <h3>Backlinks</h3>
            <ul>
              {meta.backlinks.map((bl) => (
                <li key={bl}>
                  <a href={`/${bl}`}>{contentIndex?.[bl]?.title ?? bl}</a>
                </li>
              ))}
            </ul>
          </section>
        </footer>
      )}
    </article>
  )
}
