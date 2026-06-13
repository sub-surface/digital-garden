import type { Root, Element, ElementContent } from "hast"
import { visit, SKIP } from "unist-util-visit"

/**
 * Rehype plugin that converts GFM footnotes into Tufte-style sidenotes.
 */

export function rehypeSidenotes() {
  return (tree: Root) => {
    const footnoteMap = new Map<string, ElementContent[]>()

    // 1. Tag and extract footnotes
    for (const node of tree.children) {
      if (
        node.type === "element" &&
        node.tagName === "section" &&
        node.properties?.dataFootnotes !== undefined
      ) {
        node.properties.className = ["footnotes-section"]
        
        const ol = node.children.find(
          (c): c is Element => c.type === "element" && c.tagName === "ol",
        )
        if (ol) {
          for (const li of ol.children) {
            if (li.type !== "element" || li.tagName !== "li") continue
            const id = li.properties?.id as string | undefined
            if (!id) continue
            const num = id.replace("user-content-fn-", "")
            // Clone children, removing backrefs and flattening <p>
            const content = flattenContent(filterBackref(li.children))
            footnoteMap.set(num, content)
          }
        }
        break
      }
    }

    if (footnoteMap.size === 0) return

    // Build a parent-map so we can walk up from <sup> → <p> → block container
    const parentMap = new Map<Element, { parent: Element; index: number }>()

    visit(tree, "element", (node, index, parent) => {
      if (parent && index !== undefined) {
        parentMap.set(node, { parent: parent as Element, index })
      }
    })

    const pendingInsertions: Array<{
      parent: Element
      index: number
      nodes: Element[]
    }> = []

    // 2. Inject sidenotes after the containing block of each <sup>
    visit(tree, "element", (node, index, parent) => {
      if (
        node.tagName === "section" &&
        node.properties?.className &&
        (node.properties.className as string[]).includes("footnotes-section")
      ) {
        return SKIP
      }

      if (node.tagName !== "sup" || !parent || index === undefined) return

      const refLink = node.children.find(
        (c): c is Element =>
          c.type === "element" &&
          c.tagName === "a" &&
          c.properties?.dataFootnoteRef !== undefined,
      )
      if (!refLink) return

      node.properties = { ...node.properties, className: ["footnote-marker"] }

      const href = refLink.properties?.href as string | undefined
      if (!href) return
      const num = href.replace("#user-content-fn-", "")
      const content = footnoteMap.get(num)
      if (!content) return

      const sidenotId = `sn-${num}`

      const checkbox: Element = {
        type: "element",
        tagName: "input",
        properties: { type: "checkbox", id: sidenotId, className: ["sidenote-checkbox"] },
        children: [],
      }

      const label: Element = {
        type: "element",
        tagName: "label",
        properties: { htmlFor: sidenotId, className: ["sidenote-toggle"] },
        children: [{ type: "text", value: num }],
      }

      const sidenote: Element = {
        type: "element",
        tagName: "aside",
        properties: { className: ["sidenote"], dataNumber: num },
        children: content,
      }

      // Walk up to find the nearest block-level ancestor (not <p> or <span>)
      // and inject after the child that contains our <sup>
      let blockParent = parent as Element
      let blockIndex = index

      while (["p", "span", "em", "strong", "a", "sup"].includes(blockParent.tagName)) {
        const entry = parentMap.get(blockParent)
        if (!entry) break
        blockParent = entry.parent
        blockIndex = entry.index
      }

      pendingInsertions.push({
        parent: blockParent,
        index: blockIndex,
        nodes: [checkbox, label, sidenote],
      })
      return SKIP
    })

    const insertionsByParent = new Map<Element, Map<number, Element[]>>()
    for (const insertion of pendingInsertions) {
      let byIndex = insertionsByParent.get(insertion.parent)
      if (!byIndex) {
        byIndex = new Map()
        insertionsByParent.set(insertion.parent, byIndex)
      }
      byIndex.set(insertion.index, [...(byIndex.get(insertion.index) ?? []), ...insertion.nodes])
    }

    for (const [parent, byIndex] of insertionsByParent) {
      const indexes = [...byIndex.keys()].sort((a, b) => b - a)
      for (const insertionIndex of indexes) {
        parent.children.splice(insertionIndex + 1, 0, ...(byIndex.get(insertionIndex) ?? []))
      }
    }
  }
}

/** 
 * Unwraps the first <p> in footnote content to avoid invalid nesting
 * (<span><p>...</p></span> inside a <p>).
 */
function flattenContent(content: ElementContent[]): ElementContent[] {
  // Find first non-whitespace node
  const firstIdx = content.findIndex(c => !(c.type === "text" && /^\s*$/.test(c.value)))
  if (firstIdx === -1) return content

  const first = content[firstIdx]
  if (first.type === "element" && first.tagName === "p") {
    // Return children of P plus any subsequent siblings
    return [...first.children, ...content.slice(firstIdx + 1)]
  }
  return content
}

function filterBackref(children: ElementContent[]): ElementContent[] {
  return children
    .filter((c) => {
      if (c.type !== "element") return true
      return c.properties?.dataFootnoteBackref === undefined
    })
    .map((c) => {
      if (c.type === "element" && c.children) {
        return { ...c, children: filterBackref(c.children) }
      }
      return c
    })
}
