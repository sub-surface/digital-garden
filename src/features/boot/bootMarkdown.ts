/**
 * Minimal Markdown → boot-terminal line parser.
 *
 * The boot feed is a stream of `(text, tone)` lines, not HTML — so we render a
 * note as styled monospace lines rather than reusing the site's MDX pipeline
 * (which produces React/HTML and would be wrong here). This is a deliberately
 * small block-level parser: headings, lists, blockquotes, rules, fenced code,
 * and inline-formatting stripped to plain text. It is not CommonMark-complete;
 * it just has to read a garden note cleanly in a terminal.
 */

import type { BootTone } from "./bootTypes"

export interface BootMdLine {
  text: string
  tone: BootTone
}

/** Strip inline markdown/wikilink syntax down to readable plain text. */
function stripInline(s: string): string {
  return s
    // images: ![alt](url) and ![[file]] → drop entirely
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // wikilinks: [[target|alias]] / [[target]] → alias or target
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => (alias || target).trim())
    // markdown links: [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // bold / italic / strikethrough markers
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    // inline code: keep the contents, drop the backticks
    .replace(/`([^`]+)`/g, "$1")
    .trim()
}

const INDENT = "  "

/**
 * Parse a raw markdown string into boot lines. `maxLines` caps the output so a
 * long essay can't flood the feed (the caller appends a "truncated" notice).
 */
export function parseMarkdownToBootLines(
  raw: string,
  maxLines = 120,
): { lines: BootMdLine[]; truncated: boolean } {
  // strip frontmatter
  const body = raw.replace(/^---[\s\S]*?\n---\s*\n?/, "")
  const out: BootMdLine[] = []
  let inFence = false
  let prevBlank = false

  const push = (text: string, tone: BootTone) => {
    out.push({ text, tone })
    prevBlank = text.trim() === ""
  }

  for (const rawLine of body.split("\n")) {
    if (out.length >= maxLines) {
      return { lines: out, truncated: true }
    }

    const line = rawLine.replace(/\s+$/, "")

    // fenced code block — render verbatim, muted
    const fence = line.match(/^\s*(```|~~~)/)
    if (fence) {
      inFence = !inFence
      push(`${INDENT}${"─".repeat(20)}`, "muted")
      continue
    }
    if (inFence) {
      push(`${INDENT}${line}`, "muted")
      continue
    }

    const trimmed = line.trim()

    // blank line — collapse runs to a single blank
    if (trimmed === "") {
      if (!prevBlank) push("", "normal")
      continue
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      push(`${INDENT}${"·".repeat(24)}`, "muted")
      continue
    }

    // headings
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const text = stripInline(h[2])
      const prefix = level <= 1 ? "## " : level === 2 ? "# " : "» "
      push(`${INDENT}${prefix}${text}`, level <= 2 ? "accent" : "tender")
      continue
    }

    // blockquote
    const q = trimmed.match(/^>\s?(.*)$/)
    if (q) {
      push(`${INDENT}│ ${stripInline(q[1])}`, "tender")
      continue
    }

    // list item (bullet or ordered) — preserve nesting via leading whitespace
    const indentMatch = line.match(/^(\s*)/)
    const depth = Math.floor((indentMatch?.[1].length ?? 0) / 2)
    const bullet = trimmed.match(/^[-*+]\s+(.*)$/)
    if (bullet) {
      push(`${INDENT}${"  ".repeat(depth)}• ${stripInline(bullet[1])}`, "normal")
      continue
    }
    const ordered = trimmed.match(/^(\d+)\.\s+(.*)$/)
    if (ordered) {
      push(`${INDENT}${"  ".repeat(depth)}${ordered[1]}. ${stripInline(ordered[2])}`, "normal")
      continue
    }

    // plain paragraph line
    push(`${INDENT}${stripInline(trimmed)}`, "normal")
  }

  return { lines: out, truncated: false }
}
