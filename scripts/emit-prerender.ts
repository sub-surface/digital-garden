/**
 * Pre-render HTML Emitter (ROADMAP §5 / SSG Pipeline Phase 1).
 *
 * Pre-renders markdown source files to semantic HTML fragments at build time,
 * outputting to `public/prerender/<slug>.html`. These fragments are injected
 * by the Cloudflare Worker directly into `<div id="root">`, delivering
 * instant first-contentful-paint (FCP) and full accessibility without client JS.
 */
import * as fs from "fs"
import * as path from "path"
import { parseMarkdown } from "../src/lib/markdown"
import { prerenderFileName, slugifyPath } from "../src/lib/slug"
import { escapeHtml, escapeAttr } from "../src/lib/escape"
import { classifyLayout } from "../src/lib/layout"

export interface PrerenderModel {
  files: string[]
  index: Record<string, any>
}

export async function emitPrerender(
  model: PrerenderModel,
  contentDir: string,
  publicDir: string,
): Promise<{ count: number; totalBytes: number; durationMs: number }> {
  const prerenderDir = path.join(publicDir, "prerender")
  if (fs.existsSync(prerenderDir)) {
    fs.rmSync(prerenderDir, { recursive: true, force: true })
  }
  fs.mkdirSync(prerenderDir, { recursive: true })

  const start = Date.now()
  let count = 0
  let totalBytes = 0
  const manifest: string[] = []

  for (const file of model.files) {
    const rel = path.relative(contentDir, file)
    const slug = slugifyPath(rel)
    const meta = model.index[slug]
    if (!meta) continue

    const raw = fs.readFileSync(file, "utf-8")
    try {
      const parsed = await parseMarkdown(raw)
      const fm = { ...meta, ...parsed.frontmatter }
      const layout = classifyLayout(slug, { layout: fm.layout, type: fm.type })
      const title = (fm.title as string) || meta.title || slug.split("/").pop() || slug
      const date = (fm.date as string) || meta.date
      const readingTime = meta.readingTime || fm.readingTime
      const growth = (fm.growth as string) || meta.growth
      const tags: string[] = Array.isArray(fm.tags) ? fm.tags : (meta.tags || [])
      const quote = fm.quote as string | undefined
      const quoteAuthor = (fm["quote-author"] || fm.quoteAuthor) as string | undefined

      const epigraphHtml = quote
        ? `<div class="epigraph"><blockquote class="epigraph-quote">${escapeHtml(quote)}</blockquote>${
            quoteAuthor ? `<cite class="epigraph-author">— ${escapeHtml(quoteAuthor)}</cite>` : ""
          }</div>`
        : ""

      const metaHtml =
        growth || date || readingTime || tags.length > 0
          ? `<div class="article-meta">
              ${growth ? `<span class="growth-badge">${escapeHtml(growth)}</span>` : ""}
              ${date ? `<span class="article-date">${escapeHtml(String(date))}</span>` : ""}
              ${readingTime ? `<span class="reading-time">${readingTime} min read</span>` : ""}
              ${
                tags.length > 0
                  ? `<div class="article-tags">${tags
                      .map((t) => `<span class="tag">#${escapeHtml(t)}</span>`)
                      .join(" ")}</div>`
                  : ""
              }
            </div>`
          : ""

      const isArticle = layout === "article"
      const layoutClass = isArticle ? "article-layout" : "note-layout"
      const bodyClass = isArticle ? "article-body" : "note-body"
      const headerClass = isArticle ? "article-header" : "note-header"

      const fragment = `<div id="prerender-root" data-prerender-slug="${escapeAttr(slug)}">
  <div class="${layoutClass}" data-layout="${escapeAttr(layout)}">
    <div class="${bodyClass} prose">
      <header class="${headerClass}">
        ${epigraphHtml}
        <div class="article-title-row">
          <h1 class="article-title">${escapeHtml(title)}</h1>
        </div>
        ${metaHtml}
      </header>
      <div class="note-content prerendered-body">
        ${parsed.html}
      </div>
    </div>
  </div>
</div>`

      const outName = prerenderFileName(slug)
      const dest = path.join(prerenderDir, outName)
      fs.writeFileSync(dest, fragment, "utf-8")

      manifest.push(slug)
      count++
      totalBytes += Buffer.byteLength(fragment, "utf-8")
    } catch (err) {
      console.warn(`[prerender] skipped ${slug}:`, err)
    }
  }

  // Write prerender manifest for runtime/worker discovery
  fs.writeFileSync(
    path.join(prerenderDir, "manifest.json"),
    JSON.stringify(manifest),
    "utf-8",
  )

  const durationMs = Date.now() - start
  return { count, totalBytes, durationMs }
}
