import type { Root, Text } from "mdast"
import { visit } from "unist-util-visit"
import * as fs from "fs"
import * as path from "path"

let slugMap: Record<string, string> | null = null

function getSlugMap() {
  if (slugMap) return slugMap
  try {
    const mapPath = path.resolve(process.cwd(), "public/slug-map.json")
    if (fs.existsSync(mapPath)) {
      slugMap = JSON.parse(fs.readFileSync(mapPath, "utf-8"))
    }
  } catch {
    console.warn("Failed to load slug-map.json for wikilink resolution")
  }
  return slugMap || {}
}

const MEDIA_EXTS = /\.(png|jpe?g|gif|svg|webp|avif|mp4|webm|mp3|wav|pdf)$/i

/** Read source markdown for a slug, trying common path patterns. */
function readNoteSource(slug: string): string | null {
  const contentDir = path.resolve(process.cwd(), "content")
  const candidates = [
    path.join(contentDir, `${slug}.md`),
    path.join(contentDir, `${slug}.mdx`),
    path.join(contentDir, `${slug}/index.md`),
    path.join(contentDir, `${slug}/index.mdx`),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8")
  }
  return null
}

/** Strip YAML frontmatter from markdown source. */
function stripFrontmatter(src: string): string {
  return src.replace(/^---[\s\S]*?---\n?/, "")
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

/** Escape HTML special chars for safe injection into attribute values. */
function escAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
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

      const regex = /(!)?\[\[([^\[\]\|#\\]+)?(#[^\[\]\|#\\]+)?(\|[^\[\]#]*)?\]\]/g
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
              value: `<img src="${src}" alt="${escAttr(alias || rawTarget)}" class="note-image" />`,
            })
          } else if (rawTarget.includes("youtube.com") || rawTarget.includes("youtu.be")) {
            const videoId = rawTarget.includes("v=")
              ? rawTarget.split("v=")[1].split("&")[0]
              : rawTarget.split("/").pop()
            newNodes.push({
              type: "html",
              value: `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`,
            })
          } else if (rawTarget.includes("vimeo.com")) {
            const videoId = rawTarget.split("/").pop()
            newNodes.push({
              type: "html",
              value: `<div class="video-embed"><iframe src="https://player.vimeo.com/video/${videoId}" frameborder="0" allowfullscreen></iframe></div>`,
            })
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

                embedHtml = `<aside class="note-embed" data-slug="${escAttr(resolvedSlug)}">
  <div class="note-embed__header">
    <span class="note-embed__label">embedded</span>
    <a class="note-embed__title internal-link" href="${escAttr(href)}">${escAttr(displayTitle)}</a>
  </div>
  <div class="note-embed__body">${safeContent.trim().slice(0, 2000)}</div>
  <a class="note-embed__source internal-link" href="${escAttr(href)}">↗ open note</a>
</aside>`
              } else {
                // Target not found — broken embed
                console.warn(`[remark-wikilinks] broken embed: ![[${rawTarget}]] → could not resolve "${resolvedSlug}"`)
                embedHtml = `<aside class="note-embed note-embed--broken" data-slug="${escAttr(resolvedSlug)}">
  <span class="note-embed__label">embed not found</span>
  <a class="internal-link" href="${escAttr(href)}">${escAttr(displayTitle)}</a>
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
          const href = `/${encodeURIComponent(resolvedSlug)}${anchor}`

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
