import { visit } from "unist-util-visit"
import type { Root, Element } from "hast"

/**
 * Rehype plugin that transforms relative image paths to /content/Media/
 */
export function rehypeImagePaths() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "img" && node.properties) {
        const src = node.properties.src as string
        if (src && !src.startsWith("http") && !src.startsWith("/") && !src.startsWith("data:")) {
          node.properties.src = `/content/Media/${src}`
        }
      }
    })
  }
}
