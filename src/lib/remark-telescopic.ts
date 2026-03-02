import type { Root, Code, Html } from "mdast"
import { visit, SKIP } from "unist-util-visit"

/**
 * Remark plugin that converts ```telescopic code blocks into
 * interactive progressive-disclosure HTML.
 *
 * Ported from the Quartz TelescopicText transformer.
 * Uses an ADDITIVE model — clicking a label reveals children after it.
 */

interface ParsedNode {
  text: string
  children: ParsedNode[]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function applyInlineFormatting(text: string): string {
  let s = escapeHtml(text)
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>")
  // Wikilinks
  s = s.replace(
    /\[\[([^\]|]+)\|([^\]]+)\]\]/g,
    '<a href="/$1" class="internal-link">$2</a>',
  )
  s = s.replace(
    /\[\[([^\]]+)\]\]/g,
    '<a href="/$1" class="internal-link">$1</a>',
  )
  // Standard markdown links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return s
}

function parseNodes(raw: string): ParsedNode[] {
  const lines = raw.split("\n")
  const root: ParsedNode[] = []
  const stack: { indent: number; children: ParsedNode[] }[] = [
    { indent: -1, children: root },
  ]
  const prefixParts: string[] = []
  let bulletStarted = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const match = line.match(/^(\s*)[-*+]\s(.*)$/)
    if (!match) {
      if (!bulletStarted) prefixParts.push(trimmed)
      continue
    }

    bulletStarted = true
    const indent = match[1].replace(/\t/g, "  ").length
    const text = match[2].trim()

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    const node: ParsedNode = { text, children: [] }
    stack[stack.length - 1].children.push(node)
    stack.push({ indent, children: node.children })
  }

  if (prefixParts.length > 0 && root.length > 0) {
    return [{ text: prefixParts.join(" "), children: root }]
  }

  return root
}

function renderNode(node: ParsedNode, separator = " "): string {
  if (node.children.length === 0) {
    return applyInlineFormatting(node.text)
  }

  const label = applyInlineFormatting(node.text)
  const childrenHtml = node.children
    .map((child) => renderNode(child, separator))
    .join(separator)

  return (
    `<span class="telescopic-node closed">` +
    `<span class="telescopic-label">${label}</span>` +
    `<span class="telescopic-children">${separator}${childrenHtml}</span>` +
    `</span>`
  )
}

function telescopicToHtml(raw: string): string {
  const nodes = parseNodes(raw)
  if (nodes.length === 0) return ""

  const html = nodes.map((n) => renderNode(n)).join(" ")

  return (
    `<div class="telescopic-container">` +
    `<div class="telescopic-controls">` +
    `<button class="telescopic-expand" aria-label="Expand all" title="Expand all">+</button>` +
    `<button class="telescopic-replay" aria-label="Collapse all" title="Collapse all">&middot;</button>` +
    `</div>` +
    `<div class="telescopic-content">${html}</div>` +
    `</div>`
  )
}

export function remarkTelescopic() {
  return (tree: Root) => {
    visit(tree, "code", (node: Code, index, parent) => {
      if (node.lang !== "telescopic" || !parent || index === undefined) return

      const html = telescopicToHtml(node.value)
      if (!html) return

      const htmlNode: Html = { type: "html", value: html }
      parent.children.splice(index, 1, htmlNode as any)
      return SKIP
    })
  }
}
