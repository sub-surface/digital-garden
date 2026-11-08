/**
 * Last stop of the note pipeline: strip anything in a note's HTML that could
 * run script. Notes are not only the owner's — wiki edits arrive as pull
 * requests into content/Wiki — and the HTML is set with innerHTML.
 *
 * Under the retired MDX build React silently dropped string event handlers
 * (`<img onError="…">`) and blocked `javascript:` URLs; raw HTML does
 * neither, so this restores (and tightens) that floor:
 *
 * - no executable or plugin elements (script, object, embed, base, meta…);
 * - iframes only from VIDEO_FRAME_HOSTS (the embeds remark-wikilinks emits);
 * - no `on*` attributes, no `srcdoc`, no `formaction`;
 * - URL attributes only with http(s), mailto, tel, or relative/in-page
 *   targets (`data:image/*` allowed for `src`), plus the site's `music:`.
 *
 * Runs after rehype-raw, so it sees raw HTML from markdown and from every
 * remark plugin. Dropped content is replaced with a visible marker.
 */

import { visit, SKIP } from "unist-util-visit"
import { VIDEO_FRAME_HOSTS } from "./videoEmbed"

const BLOCKED_ELEMENTS = new Set([
  "script", "object", "embed", "applet", "base", "meta", "link", "frame", "frameset", "noscript", "template",
])
const URL_PROPS = new Set(["href", "src", "action", "poster", "cite", "background", "xLinkHref", "formAction", "data"])
const SAFE_SCHEME = /^(https?:|mailto:|tel:|music:)/i
const RELATIVE = /^(\/(?!\/)|#|\.{0,2}\/|[^:/?#]+(?:[/?#]|$))/

export function isSafeUrl(raw: string, prop: string): boolean {
  // Browsers ignore whitespace and control characters inside a scheme
  // (`java\tscript:`); compare on the stripped form.
  const value = raw.replace(/[\u0000- \u007f]/g, "")
  if (!value) return true
  if (SAFE_SCHEME.test(value)) return true
  if (prop === "src" && /^data:image\/(png|gif|jpe?g|webp|avif);/i.test(value)) return true
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false // any other scheme
  return RELATIVE.test(value)
}

function allowedFrame(src: unknown): boolean {
  if (typeof src !== "string") return false
  return VIDEO_FRAME_HOSTS.some((host) => src.startsWith(`${host}/`))
}

function marker(what: string) {
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["note-build-error"], role: "alert" },
    children: [{ type: "text", value: `⚠ removed unsafe ${what}` }],
  }
}

export function rehypeNoteSafety() {
  return (tree: any) => {
    visit(tree, "element", (node: any, index, parent: any) => {
      const tag = String(node.tagName).toLowerCase()
      if (BLOCKED_ELEMENTS.has(tag) || (tag === "iframe" && !allowedFrame(node.properties?.src))) {
        parent.children.splice(index!, 1, marker(`<${tag}>`))
        return SKIP
      }
      const props = node.properties ?? {}
      for (const key of Object.keys(props)) {
        const lower = key.toLowerCase()
        if (lower.startsWith("on") || lower === "srcdoc" || lower === "formaction") {
          delete props[key]
          continue
        }
        if (URL_PROPS.has(key) && typeof props[key] === "string" && !isSafeUrl(props[key], key)) {
          delete props[key]
        }
      }
      if (typeof props.srcSet === "string" && /(^|,)\s*[a-z][a-z0-9+.-]*:(?!\/\/)/i.test(props.srcSet)) delete props.srcSet
    })
  }
}
