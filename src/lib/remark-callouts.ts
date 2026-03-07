import type { Root, Blockquote, Paragraph, Text } from "mdast"
import { visit, SKIP } from "unist-util-visit"

/**
 * Remark plugin that converts Obsidian-style callouts:
 *   > [!NOTE] Title
 *   > Content
 *
 * Into HTML:
 *   <div class="callout callout-note">
 *     <div class="callout-title">Note: Title</div>
 *     <div class="callout-content">Content</div>
 *   </div>
 */

const CALLOUT_REGEX = /^\[!(\w+)\]\s*([^\n]*)?/

export function remarkCallouts() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote, index, parent) => {
      if (!parent || index === undefined) return
      if (node.children.length === 0) return

      // Check if the first child paragraph starts with [!TYPE]
      const firstChild = node.children[0]
      if (firstChild.type !== "paragraph") return

      const firstText = firstChild.children[0]
      if (!firstText || firstText.type !== "text") return

      const match = firstText.value.match(CALLOUT_REGEX)
      if (!match) return

      const type = match[1].toLowerCase()
      const title = match[2]?.trim() || type.charAt(0).toUpperCase() + type.slice(1)

      // Content may arrive as one text node with \n separating title from body
      // (remark-gfm collapses single-line blockquote continuations into one node)
      const newlineIdx = firstText.value.indexOf("\n")
      const bodyText = newlineIdx !== -1 ? firstText.value.slice(newlineIdx + 1).trim() : ""

      // Remaining inline nodes after the text node (e.g. bold, links)
      const remainingInline = firstChild.children.slice(1)

      // Build content: everything after the [!TYPE] line
      const contentChildren = node.children.slice(1)
      if (bodyText || remainingInline.length > 0) {
        const restParagraph: Paragraph = {
          type: "paragraph",
          children: [],
        }
        if (bodyText) {
          restParagraph.children.push({ type: "text", value: bodyText })
        }
        restParagraph.children.push(...remainingInline)
        if (restParagraph.children.length > 0) {
          contentChildren.unshift(restParagraph)
        }
      }

      // Replace with HTML
      const htmlOpen = `<div class="callout callout-${type}"><div class="callout-title">${escapeHtml(title)}</div><div class="callout-content">`
      const htmlClose = `</div></div>`

      // We inject HTML wrappers around the existing content nodes
      parent.children.splice(
        index,
        1,
        { type: "html", value: htmlOpen } as any,
        ...contentChildren,
        { type: "html", value: htmlClose } as any,
      )

      return SKIP
    })
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
