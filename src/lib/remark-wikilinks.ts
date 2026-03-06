import type { Root, Link, Text } from "mdast"
import { visit } from "unist-util-visit"

/**
 * Remark plugin that converts [[wikilinks]] to standard markdown links.
 *
 * Supports:
 *   [[slug]]           → <a href="/slug">slug</a>
 *   [[slug|alias]]     → <a href="/slug">alias</a>
 *   [[slug#heading]]   → <a href="/slug#heading">slug</a>
 *
 * Resolution uses the content index (slugByBasename lookup) when available.
 */
/**
 * Remark plugin that converts [[wikilinks]] and ![[embeds]] to standard links/media.
 *
 * Supports:
 *   [[slug]]           → <a href="/slug">slug</a>
 *   ![[image.jpg]]     → <img src="/content/Media/image.jpg" />
 *   ![[youtube-url]]   → <iframe src="..."></iframe>
 */
export function remarkWikilinks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return

      // Regex matches optional ! then [[ contents ]]
      const regex = /(!)?\[\[([^\[\]\|#\\]+)?(#[^\[\]\|#\\]+)?(\|[^\[\]#]*)?\]\]/g
      const value = node.value
      let match: RegExpExecArray | null
      let lastIndex = 0
      const newNodes: any[] = []

      while ((match = regex.exec(value)) !== null) {
        // Text before the match
        if (match.index > lastIndex) {
          newNodes.push({
            type: "text",
            value: value.slice(lastIndex, match.index),
          })
        }

        const isEmbed = !!match[1]
        const rawSlug = (match[2] ?? "").trim()
        const anchor = (match[3] ?? "").trim()
        const alias = match[4] ? match[4].slice(1).trim() : ""

        if (isEmbed) {
          // Handle Embeds
          if (rawSlug.includes("youtube.com") || rawSlug.includes("youtu.be")) {
            const videoId = rawSlug.includes("v=") 
              ? rawSlug.split("v=")[1].split("&")[0] 
              : rawSlug.split("/").pop()
            newNodes.push({
              type: "html",
              value: `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`
            })
          } else if (rawSlug.includes("vimeo.com")) {
            const videoId = rawSlug.split("/").pop()
            newNodes.push({
              type: "html",
              value: `<div class="video-embed"><iframe src="https://player.vimeo.com/video/${videoId}" frameborder="0" allowfullscreen></iframe></div>`
            })
          } else {
            // Assume image/media
            const src = rawSlug.startsWith("http") ? rawSlug : `/content/Media/${rawSlug}`
            newNodes.push({
              type: "html",
              value: `<img src="${src}" alt="${alias || rawSlug}" class="note-image" />`
            })
          }
        } else {
          // Handle Links
          const displayText = alias || rawSlug
          const slugified = rawSlug.replace(/\s+/g, "-")
          const href = `/${encodeURIComponent(slugified)}${anchor}`
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
