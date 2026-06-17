import { NoteMeta } from "./types"

// In-memory cache — survives for the lifetime of the Worker instance
let contentIndexCache: Record<string, NoteMeta> | null = null

export async function getContentIndex(assetsFetcher: any): Promise<Record<string, NoteMeta>> {
  if (!assetsFetcher) return {};
  if (contentIndexCache) return contentIndexCache
  try {
    const res = await assetsFetcher.fetch("https://assets.internal/content-index.json")
    if (res.ok) {
      contentIndexCache = await res.json()
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

export function slugFromPathname(pathname: string): string {
  // Strip leading slash, decode, normalise spaces to hyphens
  return decodeURIComponent(pathname.replace(/^\//, "").replace(/\/$/, "") || "index")
    .replace(/\s+/g, "-")
}

export function resolveMetaCaseInsensitive(index: Record<string, NoteMeta>, slug: string): NoteMeta | null {
  if (index[slug]) return index[slug]
  const lower = slug.toLowerCase()
  const key = Object.keys(index).find(k => k.toLowerCase() === lower)
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
  const ogSlug = slug.replace(/\//g, "-")
  const thumbnail = meta.image || meta.cover || meta.poster
  const ogImage = thumbnail
    ? (thumbnail.startsWith("http") ? thumbnail : `${origin}${thumbnail}`)
    : `${origin}/og/${ogSlug}.png`
  const canonical = `${origin}/${slug === "index" ? "" : slug}`

  const tags = [
    `<meta name="description" content="${escAttr(description)}" />`,
    `<meta property="og:title" content="${escAttr(title)}" />`,
    `<meta property="og:description" content="${escAttr(description)}" />`,
    `<meta property="og:image" content="${escAttr(ogImage)}" />`,
    `<meta property="og:url" content="${escAttr(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escAttr(title)}" />`,
    `<meta name="twitter:description" content="${escAttr(description)}" />`,
    `<meta name="twitter:image" content="${escAttr(ogImage)}" />`,
    `<title>${escText(title)}</title>`,
  ].join("\n    ")

  // Replace the static <title> and inject before </head>
  return html
    .replace(/<title>[^<]*<\/title>/, "")
    .replace("</head>", `    ${tags}\n  </head>`)
}

export function escAttr(s: string) { return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;") }
export function escText(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;") }
