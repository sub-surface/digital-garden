import { NoteHeader, type NoteHeaderProps } from "./NoteHeader"
import { TableOfContents } from "./TableOfContents"

/**
 * The first-paint article, rendered at build time (renderToStaticMarkup in
 * scripts/emit-prerender.ts) and injected by the Worker.
 *
 * It reuses NoteHeader and TableOfContents themselves and mirrors only the
 * wrapper divs of ArticleLayout / NoteLayout (which can't render in Node:
 * ArticleLayout's ReadingProgress imports a CSS module). If you change those
 * wrappers, change these: the point is that the app's first render lands on
 * identical markup, so the swap from static page to app is invisible.
 */

export interface Heading {
  id: string
  text: string
  level: number
}

/** What NoteRenderer needs to render its first frame without the content index. */
export interface PrerenderSeed {
  slug: string
  header: Omit<NoteHeaderProps, "tools">
  headings: Heading[]
  articleKind?: "essay" | "wiki"
  frontmatter: Record<string, unknown>
}

export function StaticArticle({ seed, bodyHtml }: { seed: PrerenderSeed; bodyHtml: string }) {
  const { header, headings, articleKind } = seed
  const isArticle = header.layout === "article"
  const body = <div className="note-content prerendered-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

  return (
    <article className={`${header.layout}-layout`} data-article-kind={isArticle ? articleKind : undefined}>
      {isArticle ? (
        <div className="article-layout-wrapper" style={{ display: "contents" }}>
          <div className="article-body">
            <NoteHeader {...header} />
            <div className="body-side-group">
              <TableOfContents headings={headings} className="article-toc-inline" />
            </div>
            {body}
          </div>
        </div>
      ) : (
        <div className="note-layout-wrapper" style={{ display: "contents" }}>
          <div className="note-body">
            <NoteHeader {...header} />
            <div className="body-side-group">
              <TableOfContents headings={headings} className="toc-inline" />
            </div>
            {body}
          </div>
        </div>
      )}
    </article>
  )
}

/** h2–h4 with ids, in document order: the same set NoteBody extracts in the browser. */
export function extractHeadings(html: string): Heading[] {
  const out: Heading[] = []
  for (const m of html.matchAll(/<h([234])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const text = m[3]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
      .trim()
    out.push({ id: m[2], text, level: Number(m[1]) })
  }
  return out
}
