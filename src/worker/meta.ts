import { NoteMeta } from "./types"
import { buildSlugResolver, ogCardName, slugFromPathname as sharedSlugFromPathname, type SlugResolver } from "../lib/slug"
import { escapeAttr, escapeHtml } from "../lib/escape"

// In-memory cache — survives for the lifetime of the Worker instance.
// The resolver (lowercase + basename maps) is built once alongside it so
// per-request lookups are O(1) instead of scanning every index key.
let contentIndexCache: Record<string, NoteMeta> | null = null
let resolverCache: SlugResolver | null = null

export async function getContentIndex(assetsFetcher: any): Promise<Record<string, NoteMeta>> {
  if (!assetsFetcher) return {};
  if (contentIndexCache) return contentIndexCache
  try {
    const res = await assetsFetcher.fetch("https://assets.internal/content-index.json")
    if (res.ok) {
      contentIndexCache = await res.json()
      resolverCache = buildSlugResolver(Object.keys(contentIndexCache!))
    } else {
      console.error(`content-index fetch non-ok (${res.status}) — OG meta will be skipped`)
    }
  } catch (e) {
    console.error("content-index fetch failed (OG meta will be skipped):", e)
  }
  return contentIndexCache ?? {}
}

// Look up a chatter page image by username (case-insensitive match on frontmatter `username`)
export function chatterImageForUsername(index: Record<string, NoteMeta>, username: string): string | null {
  const lower = username.toLowerCase()
  for (const meta of Object.values(index)) {
    if (meta.username?.toLowerCase() === lower && meta.image) {
      return meta.image
    }
  }
  return null
}

export const slugFromPathname = sharedSlugFromPathname

/**
 * Resolve a request slug to its *canonical* index key (the casing prebuild wrote),
 * or null. Callers need the key itself — not just the metadata — because static
 * asset paths derived from it (OG cards) are case-SENSITIVE on CF even though
 * routes are case-insensitive at runtime. See ROADMAP §28.16 / CLAUDE.md gotcha #8.
 */
export function resolveSlugCaseInsensitive(index: Record<string, NoteMeta>, slug: string): string | null {
  if (index[slug]) return slug
  // Fast path via the cached resolver; fall back to a scan when the index was
  // passed in without going through getContentIndex (tests, cold errors).
  if (resolverCache && index === contentIndexCache) {
    return resolverCache.resolve(slug)
  }
  const lower = slug.toLowerCase()
  return Object.keys(index).find(k => k.toLowerCase() === lower) ?? null
}

export function resolveMetaCaseInsensitive(index: Record<string, NoteMeta>, slug: string): NoteMeta | null {
  const key = resolveSlugCaseInsensitive(index, slug)
  return key ? index[key] : null
}

export function injectMetaTags(html: string, meta: NoteMeta, slug: string, origin: string): string {
  const isWiki = origin.includes("wiki.subsurfaces.net")
  const siteName = isWiki ? "Philchat Wiki" : "Sub-Surface Territories"
  const title = meta.title ? `${meta.title} — ${siteName}` : siteName
  const rawDesc = meta.description ?? meta.excerpt ?? "A digital garden."
  const description = rawDesc
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[(\^[^\]]+)\]/g, "")
    .replace(/\\([\[\]])/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const ogCard = ogCardName(slug)
  const thumbnail = meta.image || meta.cover || meta.poster
  const ogImage = thumbnail
    ? (thumbnail.startsWith("http") ? thumbnail : `${origin}${thumbnail}`)
    : `${origin}/og/${ogCard}`
  const canonical = `${origin}/${slug === "index" ? "" : slug}`

  const tags = [
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:image" content="${escapeAttr(ogImage)}" />`,
    `<meta property="og:url" content="${escapeAttr(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(ogImage)}" />`,
    `<title>${escapeHtml(title)}</title>`,
  ].join("\n    ")

  // Replace the static <title> and inject before </head>
  return html
    .replace(/<title>[^<]*<\/title>/, "")
    .replace("</head>", `    ${tags}\n  </head>`)
}
