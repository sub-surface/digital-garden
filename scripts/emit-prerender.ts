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
import { noteDataFileName, prerenderFileName, slugifyPath } from "../src/lib/slug"
import { escapeAttr } from "../src/lib/escape"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { StaticArticle, extractHeadings, type PrerenderSeed } from "../src/components/ui/reader/StaticArticle"
import { resolveArticleKind } from "../src/components/ui/reader/NoteHeader"
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
  // Client note data: what NoteBody renders (the note's own frontmatter + the
  // body HTML with island placeholders). Replaces the per-note MDX chunks.
  const notesDir = path.join(publicDir, "notes")
  if (fs.existsSync(notesDir)) fs.rmSync(notesDir, { recursive: true, force: true })
  fs.mkdirSync(notesDir, { recursive: true })

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
      // Build problems are already rendered in-page as visible red blocks;
      // say so in the build log too, rather than letting them ship quietly.
      for (const message of parsed.errors) console.warn(`[prerender] ${slug}: ${message}`)
      // Same inputs NoteRenderer uses: the note's own frontmatter first, then
      // the content index (tags come from the index only, as in the app).
      const fm = parsed.frontmatter as Record<string, any>
      const type = (fm.type as string | undefined) ?? meta.type
      const layout = classifyLayout(slug, { layout: fm.layout ?? meta.layout, type })
      const bodyHtml = parsed.html
      const headings = extractHeadings(bodyHtml)
      const seed: PrerenderSeed = {
        slug,
        frontmatter: fm,
        headings,
        articleKind: resolveArticleKind(fm, slug, type),
        header: {
          slug,
          layout,
          title: (fm.title as string) ?? meta.title ?? slug.split("/").pop() ?? slug,
          growth: (fm.growth as string) ?? meta.growth,
          date: (fm.date as string) ?? meta.date,
          readingTime: meta.readingTime,
          tags: meta.tags ?? [],
          quote: fm.quote as string | undefined,
          quoteAuthor: fm["quote-author"] as string | undefined,
        },
      }
      // The real components, rendered once at build time: the app's first
      // render produces identical markup, so the hand-off doesn't jump.
      const article = renderToStaticMarkup(createElement(StaticArticle, { seed, bodyHtml }))
      // JSON inside <script>: escape "<" so note text can never close the tag.
      const seedJson = JSON.stringify(seed).replace(/</g, "\\u003c")

      const fragment = `<div id="prerender-root" data-prerender-slug="${escapeAttr(slug)}" data-layout="${escapeAttr(layout)}"><script type="application/json" id="prerender-seed">${seedJson}</script><div class="prerender-pane"><div class="prerender-content">${article}</div></div></div>`

      fs.writeFileSync(
        path.join(notesDir, noteDataFileName(slug)),
        JSON.stringify({ slug, frontmatter: parsed.frontmatter, html: parsed.html, headings: extractHeadings(parsed.html) }),
        "utf-8",
      )

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
