import type { Root, FootnoteDefinition, FootnoteReference, Parent } from "mdast"
import { visit, SKIP } from "unist-util-visit"
import { toHast } from "mdast-util-to-hast"
import { toHtml } from "hast-util-to-html"
import { toRoman } from "./roman-numerals"

/**
 * Remark plugin that converts GFM footnotes ([^1]) into Tufte-style sidenotes.
 * Runs at the mdast level so it works inside MDX (where rehype-level footnote
 * sections are never emitted).
 *
 * For wide viewports (.article-layout): floats aside into the right margin.
 * For narrow viewports: checkbox toggle shows/hides inline.
 *
 * The checkbox/label/aside triplet must land as siblings of the nearest
 * block-level ancestor (paragraph/heading/etc.), not inline within it — an
 * <aside> can't legally nest inside a <p>, so the HTML parser silently hoists
 * it out during parsing, which breaks the CSS `:checked + label + aside`
 * sibling chain the narrow-viewport toggle depends on. Only the <sup> marker
 * stays inline at the reference site.
 */
const INLINE_WRAPPER_TYPES = new Set(["emphasis", "strong", "delete", "link", "linkReference"])
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

    // 3. Assign sequential display numbers by order of first reference.
    // The identifier (e.g. [^bateson]) is just an internal key for authoring
    // convenience — readers should always see 1, 2, 3..., not the name.
    const numberOf = new Map<string, number>()
    let nextNumber = 1
    visit(tree, "footnoteReference", (node: FootnoteReference) => {
      const id = String(node.identifier)
      if (defs.has(id) && !numberOf.has(id)) {
        numberOf.set(id, nextNumber++)
      }
    })

    // 4. Build a parent-map so we can walk up from a footnoteReference to
    // its nearest block-level ancestor (mirrors rehype-sidenotes-runtime.ts's
    // approach for the same problem on the hast side).
    const parentMap = new Map<object, { parent: Parent; index: number }>()
    visit(tree, (node, index, parent) => {
      if (parent && index !== undefined) {
        parentMap.set(node, { parent, index })
      }
    })

    // 5. Replace each footnoteReference's inline marker, and queue the
    // block-level checkbox/label/aside triplet to insert after the
    // containing block. Track insertion order for the footnotes-section.
    const ordered: string[] = []
    const pendingInsertions: Array<{ parent: Parent; index: number; html: string }> = []

    visit(tree, "footnoteReference", (node: FootnoteReference, index, parent) => {
      if (!parent || index === undefined) return

      const id = String(node.identifier)
      const content = defs.get(id)
      if (!content) return

      const displayNum = numberOf.get(id)!
      const displayLabel = toRoman(displayNum)
      if (!ordered.includes(id)) ordered.push(id)

      const domId = `sn-${id}`

      // Inline: just the superscript marker — safe to nest inside a <p>/<h2>.
      const supHtml = `<sup class="footnote-marker" data-content="${content
        .replace(/<[^>]*>/g, "")
        .replace(/"/g, "&quot;")
        .trim()}"><a href="#fn-${id}">${displayLabel}</a></sup>`
      parent.children.splice(index, 1, { type: "html", value: supHtml } as any)

      // Block-level: walk up through inline wrappers (emphasis/strong/link/...)
      // to the nearest block ancestor, then insert as a sibling right after it.
      let blockNode: object = parent
      let entry = parentMap.get(blockNode)
      while (entry && INLINE_WRAPPER_TYPES.has((blockNode as any).type)) {
        blockNode = entry.parent
        entry = parentMap.get(blockNode)
      }
      if (!entry) return // block is the tree root itself — shouldn't happen

      const asideHtml = [
        `<input type="checkbox" id="${domId}" class="sidenote-checkbox" />`,
        `<label for="${domId}" class="sidenote-toggle">${displayLabel}</label>`,
        `<aside class="sidenote" data-number="${displayLabel}">${content}</aside>`,
      ].join("")

      pendingInsertions.push({ parent: entry.parent, index: entry.index, html: asideHtml })
      return SKIP
    })

    // Apply insertions highest-index-first per parent so earlier splices
    // don't shift the indexes of later ones.
    const insertionsByParent = new Map<Parent, Map<number, string[]>>()
    for (const ins of pendingInsertions) {
      let byIndex = insertionsByParent.get(ins.parent)
      if (!byIndex) {
        byIndex = new Map()
        insertionsByParent.set(ins.parent, byIndex)
      }
      byIndex.set(ins.index, [...(byIndex.get(ins.index) ?? []), ins.html])
    }
    for (const [parent, byIndex] of insertionsByParent) {
      const indexes = [...byIndex.keys()].sort((a, b) => b - a)
      for (const idx of indexes) {
        const htmlNodes = (byIndex.get(idx) ?? []).map(
          (html) => ({ type: "html", value: html }) as any,
        )
        parent.children.splice(idx + 1, 0, ...htmlNodes)
      }
    }

    // 6. Append a .footnotes-section for note layout (CSS hides it in article layout)
    if (ordered.length > 0) {
      const items = ordered
        .map((id) => `<li id="fn-${id}">${defs.get(id)}</li>`)
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
