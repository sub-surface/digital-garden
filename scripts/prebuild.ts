/**
 * Prebuild — content pipeline.
 *
 * Shape: scan() → resolve() → emitters. Each emitter is a small function over
 * the resolved model that writes one artifact; adding an output means adding
 * one emitter, and content-policy rules (private/draft) live in exactly one
 * place (the scan filter / feed predicates).
 *
 * Content policy:
 *  - `private: true` frontmatter → excluded ENTIRELY (no index entry, no copy
 *    to public/content — its raw source stays unpublished).
 *  - `draft: true` → indexed & rendered (wiki submissions rely on this), but
 *    excluded from RSS feeds and the sitemap (not promoted).
 */
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import matter from "gray-matter"
import { execFileSync } from "child_process"
import { slugifyPath, buildSlugResolver, normalizeSlug } from "../src/lib/slug"
import { SYSTEM_PAGE_META } from "../src/config/system-pages-meta"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONTENT_DIR = path.resolve(__dirname, "../content")
const PUBLIC_DIR = path.resolve(__dirname, "../public")
const SRC_CONTENT_DIR = path.resolve(__dirname, "../src/content")

const IGNORE_PATTERNS = ["private", "templates", ".obsidian", "Misc", "Daily"]
const SITE_URL = "https://subsurfaces.net"
const WIKI_URL = "https://wiki.subsurfaces.net"

// ─── Types ───────────────────────────────────────────────────────────────────

interface NoteMeta {
  slug: string
  title: string
  tags: string[]
  type?: string
  layout?: string
  system?: boolean
  date?: string
  description?: string
  excerpt?: string
  growth?: string
  featured?: boolean
  draft?: boolean
  readingTime?: number
  aliases?: string[]
  published?: boolean
  image?: string
  cover?: string
  poster?: string
  username?: string
  author?: string
  director?: string
  year?: number
  rating?: number
  status?: string
  links: string[]
  backlinks: string[]
  folder?: string
  contentPath?: string
}

interface Model {
  index: Record<string, NoteMeta>
  files: string[]           // absolute paths of included content files
  linkMap: Map<string, string[]>
  resolveLink: (raw: string) => string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractExcerpt(content: string, maxLen = 200): string {
  const lines = content.split("\n")
  let paragraph = ""
  let inParagraph = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("!") ||
      trimmed.startsWith(">") ||
      trimmed.startsWith("```") ||
      trimmed.startsWith("---")
    ) {
      if (inParagraph && paragraph) break
      continue
    }
    inParagraph = true
    paragraph += (paragraph ? " " : "") + trimmed
  }

  // Strip wikilinks to plain text, then markdown formatting
  paragraph = paragraph
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, slug, alias) => alias || slug)
    .replace(/[*_`~]/g, "")

  if (paragraph.length > maxLen) {
    paragraph = paragraph.slice(0, maxLen).replace(/\s\S*$/, "") + "..."
  }
  return paragraph
}

function calcReadingTime(content: string): number {
  const words = content.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

function shouldIgnore(filePath: string): boolean {
  const rel = path.relative(CONTENT_DIR, filePath)
  return IGNORE_PATTERNS.some(
    (p) => rel.startsWith(p) || rel.includes(`${path.sep}${p}`),
  )
}

function extractWikiLinks(content: string): string[] {
  const links: string[] = []
  // Strip code blocks and inline backtick spans before extracting links
  const stripped = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
  // Matches [[target]] or [[target|alias]]
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(stripped)) !== null) {
    const rawTarget = match[1].trim()
    const targetWithoutFragment = rawTarget.replace(/#.*$/, "").trim()
    if (!targetWithoutFragment) continue
    links.push(normalizeSlug(targetWithoutFragment))
  }
  return links
}

function walkDir(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkDir(full))
    else if (/\.mdx?$/.test(entry.name)) results.push(full)
  }
  return results
}

function writeJson(relPath: string, data: unknown) {
  fs.writeFileSync(path.join(PUBLIC_DIR, relPath), JSON.stringify(data, null, 2))
}

// ─── Scan + resolve ──────────────────────────────────────────────────────────

function scan(): Model {
  const allFiles = walkDir(CONTENT_DIR).filter(
    (f) => !shouldIgnore(f) && !path.basename(f).startsWith("_"),
  )

  const index: Record<string, NoteMeta> = {}
  const files: string[] = []
  const linkMap = new Map<string, string[]>()
  let privateCount = 0

  for (const file of allFiles) {
    const raw = fs.readFileSync(file, "utf-8")
    const { data, content } = matter(raw)

    // Content policy: `private: true` frontmatter excludes the note entirely.
    if (data.private === true) { privateCount++; continue }

    const slug = slugifyPath(path.relative(CONTENT_DIR, file))
    const folder = slug.includes("/") ? slug.split("/").slice(0, -1).join("/") : undefined
    const contentPath = path.relative(CONTENT_DIR, file).replace(/\\/g, "/")

    files.push(file)
    linkMap.set(slug, extractWikiLinks(content))

    const aliases = Array.isArray(data.aliases)
      ? (data.aliases as string[]).map((a) => normalizeSlug(String(a)))
      : []

    index[slug] = {
      slug,
      // Coerce to string — YAML parses bare-number titles (e.g. `title: 2048`)
      // as numbers, which breaks downstream consumers like FlexSearch (.normalize).
      title: data.title != null ? String(data.title) : (slug.split("/").pop() ?? slug),
      tags: Array.isArray(data.tags) ? data.tags : [],
      type: data.type as string | undefined,
      layout: data.layout as string | undefined,
      date: data.date ? String(data.date) : undefined,
      description: data.description as string | undefined,
      excerpt: (data.description as string) || extractExcerpt(content),
      growth: data.growth as string | undefined,
      featured: data.featured === true,
      draft: data.draft === true || undefined,
      readingTime: calcReadingTime(content),
      aliases: aliases.length ? aliases : undefined,
      published: data.published === true,
      image: (data.image || data.cover || data.poster) as string | undefined,
      cover: (data.cover || data.poster) as string | undefined,
      poster: (data.poster || data.cover) as string | undefined,
      username: data.username as string | undefined,
      author: data.author as string | undefined,
      director: data.director as string | undefined,
      year: data.year != null ? Number(data.year) : undefined,
      rating: data.rating != null ? Number(data.rating) : undefined,
      status: data.status as string | undefined,
      links: [], // resolved below
      backlinks: [],
      folder,
      contentPath,
    }
  }

  if (privateCount > 0) console.log(`  ${privateCount} note(s) excluded via private: true`)

  // Shared slug semantics (same module the SPA and Worker use)
  const resolver = buildSlugResolver(Object.keys(index))
  for (const [base, slugs] of resolver.collisions) {
    console.warn(`  [ambiguous basename] "${base}" → ${slugs.join(", ")} — bare [[${base}]] links resolve to ${slugs[0]}; qualify with the folder`)
  }
  const resolveLink = (raw: string) => resolver.resolve(raw)

  // Resolve links and compute backlinks
  for (const [slug, rawLinks] of linkMap) {
    const resolved = rawLinks.map(resolveLink).filter((s): s is string => s !== null)
    index[slug].links = [...new Set(resolved)]
    for (const target of resolved) {
      if (index[target] && target !== slug) index[target].backlinks.push(slug)
    }
  }
  for (const meta of Object.values(index)) {
    meta.backlinks = [...new Set(meta.backlinks)]
  }

  return { index, files, linkMap, resolveLink }
}

// System pages (arcade games, HeXO, SIGIL, Collider, Apparatus, chess, graph…)
// have no content file — synthesize a lightweight index entry per
// SYSTEM_PAGE_META so <Query>/RecentPage/sitemap can list them. No date =
// never sorts into date-ordered lists (safe default for unset `since`).
function synthesizeSystemPages(model: Model) {
  const existingLower = new Set(Object.keys(model.index).map((s) => s.toLowerCase()))
  let count = 0
  for (const [slug, meta] of Object.entries(SYSTEM_PAGE_META)) {
    if (existingLower.has(slug.toLowerCase())) continue
    model.index[slug] = {
      slug,
      title: meta.title,
      tags: [],
      type: meta.layout === "game" ? "game" : "system",
      date: meta.since,
      links: [],
      backlinks: [],
      system: true,
    }
    count++
  }
  console.log(`  ${count} system-page entr${count === 1 ? "y" : "ies"} synthesized into content-index`)
}

// ─── Emitters ────────────────────────────────────────────────────────────────

function emitContentIndex({ index }: Model) {
  writeJson("content-index.json", index)
  console.log(`  content-index.json: ${Object.keys(index).length} notes`)
}

function emitSlugMap({ index }: Model) {
  const slugMap: Record<string, string> = {}
  for (const s of Object.keys(index)) {
    const base = s.split("/").pop()!.toLowerCase()
    slugMap[base] = s
    slugMap[s.toLowerCase()] = s
    for (const alias of index[s].aliases ?? []) {
      slugMap[alias.toLowerCase()] = s
    }
  }
  writeJson("slug-map.json", slugMap)
  console.log(`  slug-map.json generated`)
}

function emitBrokenLinks({ linkMap, resolveLink }: Model) {
  const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|mp3|mp4|wav|pdf)$/i
  const brokenBySlug: Record<string, string[]> = {}
  let brokenCount = 0
  for (const [slug, rawLinks] of linkMap) {
    for (const raw of rawLinks) {
      if (MEDIA_EXT.test(raw)) continue
      if (!resolveLink(raw)) {
        console.warn(`  [broken link] ${slug} → [[${raw}]]`)
        ;(brokenBySlug[slug] ??= []).push(raw)
        brokenCount++
      }
    }
  }
  writeJson("broken-links.json", {
    total: brokenCount,
    bySlug: Object.fromEntries(
      Object.entries(brokenBySlug).sort(([a], [b]) => a.localeCompare(b)),
    ),
  })
  if (brokenCount > 0) {
    console.warn(`  ${brokenCount} broken wikilink(s) found — see public/broken-links.json`)
  } else {
    console.log(`  broken-links.json generated (0 broken)`)
  }
}

function emitGraph({ index }: Model) {
  // System-page entries (synthesized, no real links) would show up as orphan
  // stars — exclude them from the Constellation.
  const graphable = Object.values(index).filter((n) => !n.system)
  const nodes = graphable.map((n) => ({ id: n.slug, title: n.title, tags: n.tags }))
  const links: { source: string; target: string }[] = []
  for (const meta of graphable) {
    for (const target of meta.links) links.push({ source: meta.slug, target })
  }
  writeJson("graph.json", { nodes, links })
  console.log(`  graph.json: ${nodes.length} nodes, ${links.length} links`)
}

function emitMusicSeed() {
  // music.json is owned by `npm run sync:music` (SoundCloud -> R2), NOT by
  // prebuild. Only seed an empty manifest on a fresh checkout; never overwrite.
  const musicPath = path.join(PUBLIC_DIR, "music.json")
  if (!fs.existsSync(musicPath)) {
    fs.writeFileSync(musicPath, "[]")
    console.log("  music.json: seeded empty (run `npm run sync:music`)")
  } else {
    const count = (() => {
      try { return JSON.parse(fs.readFileSync(musicPath, "utf-8")).length } catch { return "?" }
    })()
    console.log(`  music.json: left as-is (${count} tracks, managed by sync:music)`)
  }
}

function emitFolders({ index }: Model) {
  const folders: Record<string, string[]> = {}
  for (const meta of Object.values(index)) {
    if (!meta.folder) continue
    const parts = meta.folder.split("/")
    let current = ""
    for (const part of parts) {
      current = current ? `${current}/${part}` : part
      folders[current] ??= []
    }
    folders[meta.folder].push(meta.slug)
  }
  writeJson("folders.json", folders)
  console.log(`  folders.json: ${Object.keys(folders).length} folders`)
}

function emitAlbums() {
  const PHOTOS_DIR = path.join(CONTENT_DIR, "Photos")
  interface Album {
    slug: string; title: string; description?: string; date?: string; cover?: string
    photos: { file: string; caption?: string }[]
  }
  const albums: Album[] = []
  if (fs.existsSync(PHOTOS_DIR)) {
    const albumFiles = fs.readdirSync(PHOTOS_DIR)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    for (const albumFile of albumFiles) {
      const raw = fs.readFileSync(path.join(PHOTOS_DIR, albumFile), "utf-8")
      const { data } = matter(raw)
      albums.push({
        slug: albumFile.replace(/\.md$/, "").toLowerCase().replace(/\s+/g, "-"),
        title: data.title ?? albumFile.replace(/\.md$/, ""),
        description: data.description,
        date: data.date ? String(data.date) : undefined,
        cover: data.cover,
        photos: Array.isArray(data.photos) ? data.photos : [],
      })
    }
    albums.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
  }
  writeJson("albums.json", albums)
  console.log(`  albums.json: ${albums.length} albums`)
}

function emitPublicContentCopies({ files }: Model) {
  // Raw sources are fetched at runtime by LinkPreview, WikiEditPage, BootPage
  // and loadNoteSource — this copy is load-bearing, not a vestige. Private
  // notes never reach `files`, so their raw source is never published.
  const publicContent = path.join(PUBLIC_DIR, "content")
  for (const file of files) {
    const rel = path.relative(CONTENT_DIR, file).replace(/\\/g, "/")
    const dest = path.join(publicContent, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(file, dest)
  }
  console.log(`  public/content/: ${files.length} files copied`)
}

function emitSrcContentCopies({ files }: Model) {
  // Wiped + resynced every run: Vite/MDX imports compiled copies from here.
  if (fs.existsSync(SRC_CONTENT_DIR)) {
    fs.rmSync(SRC_CONTENT_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(SRC_CONTENT_DIR, { recursive: true })

  for (const file of files) {
    const slug = slugifyPath(path.relative(CONTENT_DIR, file))
    const ext = path.extname(file)
    const dest = path.join(SRC_CONTENT_DIR, `${slug}${ext}`)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(file, dest)
  }
  console.log(`  src/content/: ${files.length} files synced for MDX (slugified names)`)
}

function emitMediaAndDimensions() {
  const mediaDir = path.join(CONTENT_DIR, "Media")
  if (!fs.existsSync(mediaDir)) return

  const publicContent = path.join(PUBLIC_DIR, "content")
  function copyDirRecursive(src: string, dest: string) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (entry.isDirectory()) copyDirRecursive(srcPath, destPath)
      else fs.copyFileSync(srcPath, destPath)
    }
  }
  copyDirRecursive(mediaDir, path.join(publicContent, "Media"))
  console.log("  public/content/Media/: media assets copied")

  // Emit intrinsic image dimensions so <img> tags can reserve layout space
  // (fixes Cumulative Layout Shift). Keyed by the same /content/Media/... path
  // that rehype-image-paths produces at runtime.
  // Zero-dependency native image header parser for PNG, JPEG, GIF, WebP, and SVG.
  // Eliminates external image-size dependency and its parser CVEs.
  function getNativeImageDimensions(buf: Buffer): { width: number; height: number } | null {
    if (buf.length < 8) return null

    // PNG: IHDR width at byte 16, height at byte 20
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      if (buf.length >= 24) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
      }
    }

    // GIF: width at byte 6, height at byte 8
    if (buf.toString("ascii", 0, 3) === "GIF") {
      if (buf.length >= 10) {
        return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
      }
    }

    // WebP: RIFF...WEBP
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const chunk = buf.toString("ascii", 12, 16)
      if (chunk === "VP8X" && buf.length >= 30) {
        const width = 1 + buf[24] + (buf[25] << 8) + (buf[26] << 16)
        const height = 1 + buf[27] + (buf[28] << 8) + (buf[29] << 16)
        return { width, height }
      }
      if (chunk === "VP8 " && buf.length >= 30) {
        const width = buf.readUInt16LE(26) & 0x3fff
        const height = buf.readUInt16LE(28) & 0x3fff
        return { width, height }
      }
      if (chunk === "VP8L" && buf.length >= 25) {
        const b1 = buf[21], b2 = buf[22], b3 = buf[23], b4 = buf[24]
        const width = 1 + (((b2 & 0x3f) << 8) | b1)
        const height = 1 + (((b4 & 0xf) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
        return { width, height }
      }
    }

    // JPEG: scan markers for SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2
      while (offset < buf.length - 1) {
        if (buf[offset] !== 0xff) {
          offset++
          continue
        }
        const marker = buf[offset + 1]
        if (marker === 0xd9 || marker === 0xda) break
        if (offset + 4 > buf.length) break
        const len = buf.readUInt16BE(offset + 2)
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          if (offset + 9 <= buf.length) {
            return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
          }
        }
        offset += 2 + len
      }
    }

    // SVG: viewBox or width/height attributes
    const text = buf.toString("utf8", 0, Math.min(buf.length, 4096))
    if (text.includes("<svg")) {
      const vb = text.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)/i)
      if (vb) return { width: Math.round(parseFloat(vb[1])), height: Math.round(parseFloat(vb[2])) }
      const w = text.match(/width=["']([\d.]+)/i)
      const h = text.match(/height=["']([\d.]+)/i)
      if (w && h) return { width: Math.round(parseFloat(w[1])), height: Math.round(parseFloat(h[1])) }
    }

    return null
  }

  const DIMENSION_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"])
  const dimensions: Record<string, { width: number; height: number }> = {}

  function scanDimensions(dir: string, relPrefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        scanDimensions(abs, rel)
      } else if (DIMENSION_EXTS.has(path.extname(entry.name).toLowerCase())) {
        try {
          const dims = getNativeImageDimensions(fs.readFileSync(abs))
          if (dims && dims.width && dims.height) {
            dimensions[`/content/Media/${rel}`] = { width: dims.width, height: dims.height }
          }
        } catch {
          // Unreadable/corrupt image — skip; the <img> simply won't reserve space.
        }
      }
    }
  }

  scanDimensions(mediaDir, "")
  writeJson("image-dimensions.json", dimensions)
  console.log(`  public/image-dimensions.json: ${Object.keys(dimensions).length} images measured`)
}

function emitEmoteIndex() {
  const emotesDir = path.join(PUBLIC_DIR, "emotes")
  if (!fs.existsSync(emotesDir)) return
  const EMOTE_EXTS = new Set([".gif", ".png", ".webp"])
  const rank = (e: string) => (e === "gif" ? 0 : e === "webp" ? 1 : 2)
  const emoteEntries = fs
    .readdirSync(emotesDir)
    .filter((f) => EMOTE_EXTS.has(path.extname(f).toLowerCase()) && f !== "index.json")
    .map((f) => ({ name: path.basename(f, path.extname(f)), ext: path.extname(f).slice(1) }))
    // If same name exists as gif and png/webp, prefer gif then webp then png
    .reduce<Map<string, { name: string; ext: string }>>((map, entry) => {
      const existing = map.get(entry.name)
      if (!existing || rank(entry.ext) < rank(existing.ext)) map.set(entry.name, entry)
      return map
    }, new Map())
  const sorted = [...emoteEntries.values()].sort((a, b) => a.name.localeCompare(b.name))
  fs.writeFileSync(path.join(emotesDir, "index.json"), JSON.stringify(sorted, null, 2))
  console.log(`  emotes/index.json: ${sorted.length} emotes`)
}

// RSS + sitemap share the promotion rule: drafts are never promoted.
const promotable = (n: NoteMeta) => n.draft !== true

function cleanText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[(\^[^\]]+)\]/g, "")
    .replace(/\\([\[\]])/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}

function buildRssItem(n: NoteMeta, baseUrl: string): string {
  const link = `${baseUrl}/${n.slug}`
  const desc = cleanText(n.description || n.excerpt || "")
  const imgTag = n.image
    ? `<img src="${n.image.startsWith("http") ? n.image : `${baseUrl}${n.image}`}" alt="${n.title}" style="max-width:100%;margin-bottom:1em;" />`
    : ""
  const siteName = baseUrl.includes("wiki") ? "wiki.subsurfaces.net" : "subsurfaces.net"
  const body = `${imgTag}${desc ? `<p>${desc}</p>` : ""}<p><a href="${link}">Read on ${siteName} →</a></p>`

  return `
    <item>
      <title><![CDATA[${n.title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(n.date!).toUTCString()}</pubDate>
      <description><![CDATA[${body}]]></description>
      ${n.tags.map((t) => `<category>${t}</category>`).join("")}
    </item>`
}

function buildFeed(title: string, description: string, feedUrl: string, baseUrl: string, items: NoteMeta[]): string {
  const sorted = items
    .filter((n) => n.date && !isNaN(new Date(n.date).getTime()))
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime())
    .slice(0, 40)

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${title}</title>
    <link>${baseUrl}</link>
    <description>${description}</description>
    <language>en-us</language>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
    ${sorted.map((n) => buildRssItem(n, baseUrl)).join("")}
  </channel>
</rss>`.trim()
}

function emitRss({ index }: Model) {
  const allNotes = Object.values(index).filter(promotable)

  // Main feed: Writing/ folder OR published: true, non-wiki
  const mainFeedNotes = allNotes.filter((n) =>
    !n.slug.toLowerCase().startsWith("wiki/") &&
    (n.slug.toLowerCase().startsWith("writing/") || n.published === true)
  )
  fs.writeFileSync(
    path.join(PUBLIC_DIR, "rss.xml"),
    buildFeed("Sub-Surface Territories", "Writing and notes from subsurfaces.net", `${SITE_URL}/rss.xml`, SITE_URL, mainFeedNotes)
  )
  console.log(`  rss.xml: ${mainFeedNotes.filter(n => n.date).length} items`)

  // Wiki feed: wiki/ notes with published: true
  const wikiFeedNotes = allNotes.filter((n) =>
    n.slug.toLowerCase().startsWith("wiki/") && n.published === true
  )
  fs.writeFileSync(
    path.join(PUBLIC_DIR, "wiki-rss.xml"),
    buildFeed("Philchat Wiki", "New articles and profiles from wiki.subsurfaces.net", `${WIKI_URL}/wiki-rss.xml`, WIKI_URL, wikiFeedNotes)
  )
  console.log(`  wiki-rss.xml: ${wikiFeedNotes.filter(n => n.date).length} items`)
}

function emitSitemap({ index }: Model) {
  const notes = Object.values(index).filter(promotable)
  const urls = notes.map((n) => {
    const lastmod = n.date && !isNaN(new Date(n.date).getTime())
      ? `<lastmod>${new Date(n.date).toISOString().slice(0, 10)}</lastmod>`
      : ""
    return `  <url><loc>${SITE_URL}/${n.slug}</loc>${lastmod}</url>`
  }).join("\n")

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemap.trim())
  console.log(`  sitemap.xml: ${notes.length} urls`)
}

function emitOgImages() {
  // Opt-in: set PROCESS_OG=true (slow; PNGs are committed — CF doesn't run this)
  if (process.env.PROCESS_OG !== "true") return
  try {
    execFileSync("tsx", ["scripts/og-gen.ts"], { stdio: "inherit", shell: process.platform === "win32" })
  } catch (err) {
    console.error("Failed to generate OG images:", err)
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log("Prebuild: scanning content directory...")

  if (!fs.existsSync(CONTENT_DIR)) {
    console.warn("No content/ directory found. Creating empty manifests.")
    writeJson("content-index.json", {})
    writeJson("graph.json", { nodes: [], links: [] })
    emitMusicSeed()
    return
  }

  const model = scan()
  synthesizeSystemPages(model)

  const emitters = [
    emitContentIndex,
    emitSlugMap,
    emitBrokenLinks,
    emitGraph,
    emitFolders,
    emitPublicContentCopies,
    emitSrcContentCopies,
    emitRss,
    emitSitemap,
  ]
  for (const emit of emitters) emit(model)

  // Model-independent emitters
  emitMusicSeed()
  emitAlbums()
  emitMediaAndDimensions()
  emitEmoteIndex()
  emitOgImages()

  console.log("Prebuild complete.")
}

main()
