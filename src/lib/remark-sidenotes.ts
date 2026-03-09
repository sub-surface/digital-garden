import type { Root, FootnoteDefinition, FootnoteReference } from "mdast"
import { visit, SKIP } from "unist-util-visit"
import { toHast } from "mdast-util-to-hast"
import { toHtml } from "hast-util-to-html"

/**
 * Remark plugin that converts GFM footnotes ([^1]) into Tufte-style sidenotes.
 * Runs at the mdast level so it works inside MDX (where rehype-level footnote
 * sections are never emitted).
 *
 * For wide viewports (.article-layout): floats aside into the right margin.
 * For narrow viewports: checkbox toggle shows/hides inline.
 */
export function remarkSidenotes() {
  return (tree: Root) => {
    // 1. Collect all footnote definitions — convert children to HTML directly
    const defs = new Map<string, string>()

    visit(tree, "footnoteDefinition", (node: FootnoteDefinition) => {
      // Convert each child mdast node to HTML individually
      const html = node.children
        .map((child) => {
          const hast = toHast(child as any)
          if (!hast) return ""
          const raw = toHtml(hast as any)
          // Strip wrapping <p> tags so content sits inline in the sidenote
          return raw.replace(/^<p>([\s\S]*?)<\/p>$/, "$1").trim()
        })
        .filter(Boolean)
        .join(" ")
      defs.set(String(node.identifier), html)
    })

    if (defs.size === 0) return

    // 2. Remove footnote definition nodes from tree (they render as the
    //    bottom section otherwise)
    tree.children = tree.children.filter(
      (n) => n.type !== "footnoteDefinition"
    )

    // 3. Replace each footnoteReference with raw HTML sidenote markup
    // Track insertion order for the footnotes-section
    const ordered: string[] = []

    visit(tree, "footnoteReference", (node: FootnoteReference, index, parent) => {
      if (!parent || index === undefined) return

      const num = String(node.identifier)
      const content = defs.get(num)
      if (!content) return

      if (!ordered.includes(num)) ordered.push(num)

      const id = `sn-${num}`

      // Inline: superscript marker + checkbox toggle for narrow viewports
      // Wide: the <aside> floats into the right margin via CSS
      // Strip tags from content for the tooltip (plain text only)
      const plainContent = content.replace(/<[^>]*>/g, "").replace(/"/g, "&quot;").trim()

      const html = [
        `<sup class="footnote-marker" data-content="${plainContent}"><a href="#fn-${num}">${num}</a></sup>`,
        `<input type="checkbox" id="${id}" class="sidenote-checkbox" />`,
        `<label for="${id}" class="sidenote-toggle">${num}</label>`,
        `<aside class="sidenote" data-number="${num}">${content}</aside>`,
      ].join("")

      const htmlNode: any = { type: "html", value: html }

      // Replace the footnoteReference node with our raw HTML
      parent.children.splice(index, 1, htmlNode)
      return SKIP
    })

    // 4. Append a .footnotes-section for note layout (CSS hides it in article layout)
    if (ordered.length > 0) {
      const items = ordered
        .map((num) => `<li id="fn-${num}">${defs.get(num)}</li>`)
        .join("")
      const footnotesHtml = [
        `<section class="footnotes-section">`,
        `<h2 id="footnote-label">Footnotes</h2>`,
        `<ol>${items}</ol>`,
        `</section>`,
      ].join("")
      tree.children.push({ type: "html", value: footnotesHtml } as any)
    }
  }
}
