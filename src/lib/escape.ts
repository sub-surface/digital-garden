/**
 * Shared HTML escaping — ROADMAP §28.7. Four near-identical escapers used to
 * live in remark-callouts.ts, remark-telescopic.ts, remark-wikilinks.ts, and
 * worker/meta.ts, each covering a different subset of `& < > "`. Because all
 * four build raw HTML strings by string concatenation rather than a DOM API,
 * that divergence was the actual hazard, not just duplication — an escaper
 * that drops `"` next to an attribute interpolation is a broken-out-of-quotes
 * bug waiting to happen. One module, two functions, used everywhere HTML is
 * built by hand.
 *
 * Must stay dependency-free: it is imported by Node (prebuild's remark
 * plugins), the Cloudflare Worker (meta.ts), and the browser bundle alike.
 */

/** Escape for text content: `&` `<` `>`. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Escape for attribute values: `&` `<` `>` `"`. */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
