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
export function remarkWikilinks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return

      const regex = /\[\[([^\[\]\|#\\]+)?(#[^\[\]\|#\\]+)?(\|[^\[\]#]*)?\]\]/g
      const value = node.value
      let match: RegExpExecArray | null
      let lastIndex = 0
      const newNodes: (Text | Link)[] = []

      while ((match = regex.exec(value)) !== null) {
        // Text before the match
        if (match.index > lastIndex) {
          newNodes.push({
            type: "text",
            value: value.slice(lastIndex, match.index),
          })
        }

        const rawSlug = (match[1] ?? "").trim()
        const anchor = (match[2] ?? "").trim() // e.g. #heading
        const alias = match[3] ? match[3].slice(1).trim() : "" // remove leading |

        const displayText = alias || rawSlug
        const href = `/${encodeURIComponent(rawSlug).replace(/%20/g, " ")}${anchor}`

        const linkNode: Link = {
          type: "link",
          url: href,
          children: [{ type: "text", value: displayText }],
          data: {
            hProperties: { className: "internal-link" },
          },
        }
        newNodes.push(linkNode)

        lastIndex = match.index + match[0].length
      }

      if (newNodes.length === 0) return // no wikilinks found

      // Text after the last match
      if (lastIndex < value.length) {
        newNodes.push({ type: "text", value: value.slice(lastIndex) })
      }

      // Replace the text node with our new nodes
      parent.children.splice(index, 1, ...newNodes)
    })
  }
}
