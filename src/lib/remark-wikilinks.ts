import type { Root, Text } from "mdast"
import { visit } from "unist-util-visit"
import { stripFrontmatter } from "./frontmatter"
import * as fs from "fs"
import * as path from "path"
import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { gfm } from "micromark-extension-gfm"
import { toHast } from "mdast-util-to-hast"
import { toHtml } from "hast-util-to-html"
import { escapeAttr } from "./escape"
import { slug as headingSlug } from "github-slugger"

/**
 * Prebuild-generated manifests, re-read whenever prebuild rewrites them. The
 * old module-level cache held the first slug-map for the life of the Vite
 * process, so notes added while `npm run dev` was running never resolved.
 */
const manifestCache = new Map<string, { mtimeMs: number; data: unknown }>()

function readManifest<T>(file: string, fallback: T): T {
  const abs = path.resolve(process.cwd(), "public", file)
  try {
    const { mtimeMs } = fs.statSync(abs)
    const hit = manifestCache.get(abs)
    if (hit && hit.mtimeMs === mtimeMs) return hit.data as T
    const data = JSON.parse(fs.readFileSync(abs, "utf-8")) as T
    manifestCache.set(abs, { mtimeMs, data })
    return data
  } catch {
    console.warn(`[remark-wikilinks] could not load public/${file} — run prebuild`)
    return fallback
  }
}

const getSlugMap = () => readManifest<Record<string, string>>("slug-map.json", {})

const MEDIA_EXTS = /\.(png|jpe?g|gif|svg|webp|avif|mp4|webm|mp3|wav|pdf)$/i
const WIKILINK_RE = /(!)?\[\[([^\[\]\|#\\]+)?(#[^\[\]\|#\\]+)?(\|[^\[\]#]*)?\]\]/g
const VIDEO_ID_RE = /^[\w-]{6,20}$/

/**
 * Read the source of a resolved slug via its index `contentPath`. Slugs are
 * not paths: spaces become hyphens (`Double Bind.md` → `Double-Bind`), and the
 * Linux build is case-sensitive, so joining a slug onto content/ missed every
 * note whose filename had a space, and every lowercased target in production.
 */
function readNoteSource(slug: string): string | null {
  const index = readManifest<Record<string, { contentPath?: string }>>("content-index.json", {})
  const contentPath = index[slug]?.contentPath
  if (!contentPath) return null
  try {
    return fs.readFileSync(path.resolve(process.cwd(), "content", contentPath), "utf-8")
  } catch {
    return null
  }
}

/**
 * Extract content under a specific heading (inclusive of heading, stops at next same-level heading).
 * Returns null if heading not found.
 */
function extractSection(src: string, heading: string): string | null {
  const lines = src.split("\n")
  const target = heading.toLowerCase().trim()
  let depth = 0
  let started = false
  const result: string[] = []

  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)/)
    if (m) {
      const d = m[1].length
      const text = m[2].trim().toLowerCase()
      if (!started) {
        if (text === target) {
          depth = d
          started = true
          result.push(line)
        }
      } else {
        if (d <= depth) break // hit next same/higher level heading
        result.push(line)
      }
    } else if (started) {
      result.push(line)
    }
  }

  return started ? result.join("\n") : null
}

/**
 * Remark plugin that converts [[wikilinks]] and ![[embeds]] to standard links/media.
 * Note embeds (![[Note]] or ![[Note#Section]]) are injected as HTML blockquote/aside insets.
 * Media embeds (![[file.jpg]]) remain as <img> tags.
 * Depth tracked to prevent recursive embed chains beyond depth 2.
 */
export function remarkWikilinks(opts: { embedDepth?: number } = {}) {
  const currentDepth = opts.embedDepth ?? 0

  return (tree: Root) => {
    const map = getSlugMap()

    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return

      const regex = WIKILINK_RE
      regex.lastIndex = 0
      const value = node.value
      let match: RegExpExecArray | null
      let lastIndex = 0
      const newNodes: any[] = []

      while ((match = regex.exec(value)) !== null) {
        if (match.index > lastIndex) {
          newNodes.push({ type: "text", value: value.slice(lastIndex, match.index) })
        }

        const isEmbed = !!match[1]
        const rawTarget = (match[2] ?? "").trim()
        const anchor = (match[3] ?? "").trim()         // e.g. "#Introduction"
        const alias = match[4] ? match[4].slice(1).trim() : ""

        if (isEmbed) {
          // ── Media embed (has known extension) ──
          if (MEDIA_EXTS.test(rawTarget)) {
            const src = rawTarget.startsWith("http") ? rawTarget : `/content/Media/${rawTarget}`
            newNodes.push({
              type: "html",
              value: `<img src="${src}" alt="${escapeAttr(alias || rawTarget)}" class="note-image" />`,
            })
          } else if (rawTarget.includes("youtube.com") || rawTarget.includes("youtu.be")) {
            const videoId = rawTarget.includes("v=")
              ? rawTarget.split("v=")[1].split("&")[0]
              : rawTarget.split("/").pop()?.split("?")[0] ?? ""
            newNodes.push(VIDEO_ID_RE.test(videoId)
              ? { type: "html", value: `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>` }
              : { type: "text", value: match[0] })
          } else if (rawTarget.includes("vimeo.com")) {
            const videoId = rawTarget.split("/").pop()?.split("?")[0] ?? ""
            newNodes.push(/^\d+$/.test(videoId)
              ? { type: "html", value: `<div class="video-embed"><iframe src="https://player.vimeo.com/video/${videoId}" frameborder="0" allowfullscreen></iframe></div>` }
              : { type: "text", value: match[0] })
          } else {
            // ── Note embed ──
            const lookup = rawTarget.toLowerCase().replace(/\s+/g, "-")
            const resolvedSlug = map[lookup] || lookup
            const displayTitle = alias || rawTarget
            const href = `/${resolvedSlug}`

            if (currentDepth >= 2) {
              // Depth limit — render as a plain link instead
              newNodes.push({
                type: "link",
                url: href,
                children: [{ type: "text", value: displayTitle }],
                data: { hProperties: { className: "internal-link" } },
              })
            } else {
              // Try to read and embed content
              let embedHtml = ""
              const source = readNoteSource(resolvedSlug)

              if (source) {
                const body = stripFrontmatter(source)
                const sectionName = anchor ? anchor.slice(1) : null // strip leading #
                const content = sectionName ? (extractSection(body, sectionName) ?? body) : body

                // Strip wikilinks to plain links in embedded content (no recursion)
                const safeContent = content
                  .replace(/!\[\[([^\]]+)\]\]/g, "")  // drop nested embeds
                  .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, a) => `[${a || t}](/${(map[t.toLowerCase().replace(/\s+/g, "-")] || t.replace(/\s+/g, "-"))})`)

                const mdast = fromMarkdown(safeContent.trim().slice(0, 2000), {
                  extensions: [gfm()],
                  mdastExtensions: [gfmFromMarkdown()],
                })
                const hast = toHast(mdast)
                const renderedHtml = hast ? toHtml(hast as any) : safeContent.trim().slice(0, 2000)

                embedHtml = `<aside class="note-embed" data-slug="${escapeAttr(resolvedSlug)}">
  <div class="note-embed__header">
    <span class="note-embed__label">embedded</span>
    <a class="note-embed__title internal-link" href="${escapeAttr(href)}">${escapeAttr(displayTitle)}</a>
  </div>
  <div class="note-embed__body">${renderedHtml}</div>
  <a class="note-embed__source internal-link" href="${escapeAttr(href)}">↗ open note</a>
</aside>`
              } else {
                // Target not found — broken embed
                console.warn(`[remark-wikilinks] broken embed: ![[${rawTarget}]] → could not resolve "${resolvedSlug}"`)
                embedHtml = `<aside class="note-embed note-embed--broken" data-slug="${escapeAttr(resolvedSlug)}">
  <span class="note-embed__label">embed not found</span>
  <a class="internal-link" href="${escapeAttr(href)}">${escapeAttr(displayTitle)}</a>
</aside>`
              }

              newNodes.push({ type: "html", value: embedHtml })
            }
          }
        } else {
          // ── Internal link ──
          const lookup = rawTarget.toLowerCase().replace(/\s+/g, "-")
          const resolvedSlug = map[lookup] || lookup
          const displayText = alias || rawTarget
          // rehype-slug ids are github-slugger output ("Some Heading" → "some-heading");
          // a raw `#Some Heading` anchor never matched one.
          const href = `/${resolvedSlug.replace(/\s+/g, "-")}${anchor ? `#${headingSlug(anchor.slice(1))}` : ""}`

          newNodes.push({
            type: "link",
            url: href,
            children: [{ type: "text", value: displayText }],
            data: { hProperties: { className: "internal-link" } },
          })
        }

        lastIndex = match.index + match[0].length
      }

      if (newNodes.length === 0) return

      if (lastIndex < value.length) {
        newNodes.push({ type: "text", value: value.slice(lastIndex) })
      }

      parent.children.splice(index, 1, ...newNodes)
    })
  }
}
