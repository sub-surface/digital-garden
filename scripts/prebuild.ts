import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import matter from "gray-matter"
import { execSync } from "child_process"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONTENT_DIR = path.resolve(__dirname, "../content")
const PUBLIC_DIR = path.resolve(__dirname, "../public")

const IGNORE_PATTERNS = ["private", "templates", ".obsidian", "Misc", "Daily"]

interface NoteMeta {
  slug: string
  title: string
  tags: string[]
  type?: string
  date?: string
  description?: string
  excerpt?: string
  growth?: string
  featured?: boolean
  private?: boolean
  readingTime?: number
  aliases?: string[]
  published?: boolean
  image?: string
  cover?: string
  poster?: string
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

  // Strip wikilinks to plain text
  paragraph = paragraph.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, slug, alias) => alias || slug,
  )
  // Strip markdown formatting
  paragraph = paragraph.replace(/[*_`~]/g, "")

  if (paragraph.length > maxLen) {
    paragraph = paragraph.slice(0, maxLen).replace(/\s\S*$/, "") + "..."
  }
  return paragraph
}

function calcReadingTime(content: string): number {
  const words = content.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

interface ContentIndex {
  [slug: string]: NoteMeta
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
    // Normalise the target to match our slug system (hyphenated)
    const normalized = rawTarget.replace(/\s+/g, "-")
    links.push(normalized)
  }
  return links
}

function slugify(filePath: string): string {
  const rel = path.relative(CONTENT_DIR, filePath)
  // Remove .md / .mdx extension, normalise separators
  return rel
    .replace(/\\/g, "/")
    .replace(/\.mdx?$/, "")
    .replace(/\/index$/, "")
    .replace(/\s+/g, "-")
}

function walkDir(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkDir(full))
    } else if (/\.mdx?$/.test(entry.name)) {
      results.push(full)
    }
  }
  return results
}

function main() {
  console.log("Prebuild: scanning content directory...")

  if (!fs.existsSync(CONTENT_DIR)) {
    console.warn("No content/ directory found. Creating empty manifests.")
    fs.writeFileSync(path.join(PUBLIC_DIR, "content-index.json"), "{}")
    fs.writeFileSync(
      path.join(PUBLIC_DIR, "graph.json"),
      '{"nodes":[],"links":[]}',
    )
    fs.writeFileSync(path.join(PUBLIC_DIR, "music.json"), "[]")
    return
  }

  const files = walkDir(CONTENT_DIR).filter((f) => !shouldIgnore(f) && !path.basename(f).startsWith("_"))
  const index: ContentIndex = {}
  const linkMap: Map<string, string[]> = new Map() // slug → raw link targets

  // Pass 1: parse all notes
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8")
    const { data, content } = matter(raw)
    const slug = slugify(file)
    const folder = slug.includes("/") ? slug.split("/").slice(0, -1).join("/") : undefined
    const contentPath = path.relative(CONTENT_DIR, file).replace(/\\/g, "/")

    const links = extractWikiLinks(content)
    linkMap.set(slug, links)

    const aliases = Array.isArray(data.aliases)
      ? (data.aliases as string[]).map((a) => String(a).replace(/\s+/g, "-"))
      : []

    index[slug] = {
      slug,
      title: (data.title as string) ?? slug.split("/").pop() ?? slug,
      tags: Array.isArray(data.tags) ? data.tags : [],
      type: data.type as string | undefined,
      date: data.date ? String(data.date) : undefined,
      description: data.description as string | undefined,
      excerpt: (data.description as string) || extractExcerpt(content),
      growth: data.growth as string | undefined,
      featured: data.featured === true,
      private: false,
      readingTime: calcReadingTime(content),
      aliases: aliases.length ? aliases : undefined,
      published: data.published === true,
      image: (data.image || data.cover || data.poster) as string | undefined,
      cover: (data.cover || data.poster) as string | undefined,
      poster: (data.poster || data.cover) as string | undefined,
      author: data.author as string | undefined,
      director: data.director as string | undefined,
      year: data.year != null ? Number(data.year) : undefined,
      rating: data.rating != null ? Number(data.rating) : undefined,
      status: data.status as string | undefined,
      links: [], // resolved in pass 2
      backlinks: [],
      folder,
      contentPath,
    }
  }

  // Build slug lookup for resolution
  const allSlugs = Object.keys(index)
  const slugByBasename = new Map<string, string>()
  for (const s of allSlugs) {
    const base = s.split("/").pop()!.toLowerCase()
    slugByBasename.set(base, s)
  }

  function resolveLink(raw: string): string | null {
    // Direct match
    if (index[raw]) return raw
    // Case-insensitive
    const lower = raw.toLowerCase()
    const direct = allSlugs.find((s) => s.toLowerCase() === lower)
    if (direct) return direct
    // Basename match
    return slugByBasename.get(lower) ?? null
  }

  // Pass 2: resolve links and compute backlinks
  for (const [slug, rawLinks] of linkMap) {
    const resolved = rawLinks
      .map(resolveLink)
      .filter((s): s is string => s !== null)
    index[slug].links = [...new Set(resolved)]

    // Register backlinks
    for (const target of resolved) {
      if (index[target] && target !== slug) {
        index[target].backlinks.push(slug)
      }
    }
  }

  // Deduplicate backlinks
  for (const meta of Object.values(index)) {
    meta.backlinks = [...new Set(meta.backlinks)]
  }

  // Write content index
  fs.writeFileSync(
    path.join(PUBLIC_DIR, "content-index.json"),
    JSON.stringify(index, null, 2),
  )
  console.log(`  content-index.json: ${Object.keys(index).length} notes`)

  // Write slug map for link resolution (includes aliases)
  const slugMap: Record<string, string> = {}
  for (const s of allSlugs) {
    const base = s.split("/").pop()!.toLowerCase()
    slugMap[base] = s
    slugMap[s.toLowerCase()] = s
    // Register aliases
    const meta = index[s]
    if (meta.aliases) {
      for (const alias of meta.aliases) {
        slugMap[alias.toLowerCase()] = s
      }
    }
  }
  fs.writeFileSync(
    path.join(PUBLIC_DIR, "slug-map.json"),
    JSON.stringify(slugMap, null, 2),
  )
  console.log(`  slug-map.json generated`)

  // Broken link detection (skip media files — they aren't in the slug-map by design)
  const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|mp3|mp4|wav|pdf|gif)$/i
  let brokenCount = 0
  for (const [slug, rawLinks] of linkMap) {
    for (const raw of rawLinks) {
      if (MEDIA_EXT.test(raw)) continue
      if (!resolveLink(raw)) {
        console.warn(`  [broken link] ${slug} → [[${raw}]]`)
        brokenCount++
      }
    }
  }
  if (brokenCount > 0) {
    console.warn(`  ${brokenCount} broken wikilink(s) found`)
  }

  // Write graph data
  const nodes = Object.values(index).map((n) => ({
    id: n.slug,
    title: n.title,
    tags: n.tags,
  }))
  const links: { source: string; target: string }[] = []
  for (const meta of Object.values(index)) {
    for (const target of meta.links) {
      links.push({ source: meta.slug, target })
    }
  }
  fs.writeFileSync(
    path.join(PUBLIC_DIR, "graph.json"),
    JSON.stringify({ nodes, links }, null, 2),
  )
  console.log(`  graph.json: ${nodes.length} nodes, ${links.length} links`)

  // Write music manifest
  const tracks = Object.values(index)
    .filter((n) => n.type === "music")
    .map((n) => {
      // Re-read frontmatter for audio/cover fields
      const file = files.find((f) => slugify(f) === n.slug)!
      const { data } = matter(fs.readFileSync(file, "utf-8"))
      return {
        title: n.title,
        artist: (data.artist as string) ?? "Unknown",
        audio: (data.audio as string) ?? "",
        cover: (data.cover as string) ?? "",
        slug: n.slug,
      }
    })
  fs.writeFileSync(
    path.join(PUBLIC_DIR, "music.json"),
    JSON.stringify(tracks, null, 2),
  )
  console.log(`  music.json: ${tracks.length} tracks`)

  // Generate folders manifest
  const folders: Record<string, string[]> = {}
  for (const meta of Object.values(index)) {
    if (meta.folder) {
      const parts = meta.folder.split("/")
      let current = ""
      for (const part of parts) {
        current = current ? `${current}/${part}` : part
        if (!folders[current]) folders[current] = []
      }
      folders[meta.folder].push(meta.slug)
    }
  }
  fs.writeFileSync(
    path.join(PUBLIC_DIR, "folders.json"),
    JSON.stringify(folders, null, 2),
  )
  console.log(`  folders.json: ${Object.keys(folders).length} folders`)

  // Generate albums manifest from content/Photos/*.md
  const PHOTOS_DIR = path.join(CONTENT_DIR, "Photos")
  interface AlbumPhoto { file: string; caption?: string }
  interface Album {
    slug: string
    title: string
    description?: string
    date?: string
    cover?: string
    photos: AlbumPhoto[]
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
  fs.writeFileSync(
    path.join(PUBLIC_DIR, "albums.json"),
    JSON.stringify(albums, null, 2),
  )
  console.log(`  albums.json: ${albums.length} albums`)

  // Copy markdown files to public/content/ for potential runtime fallback
  const publicContent = path.join(PUBLIC_DIR, "content")
  for (const file of files) {
    const rel = path.relative(CONTENT_DIR, file).replace(/\\/g, "/")
    const dest = path.join(publicContent, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(file, dest)
  }
  console.log(`  public/content/: ${files.length} files copied`)

  // Ensure src/content exists and sync there too for Vite/MDX imports
  const srcContent = path.resolve(__dirname, "../src/content")
  if (fs.existsSync(srcContent)) {
    fs.rmSync(srcContent, { recursive: true, force: true })
  }
  fs.mkdirSync(srcContent, { recursive: true })
  
  for (const file of files) {
    const slug = slugify(file)
    const ext = path.extname(file)
    const dest = path.join(srcContent, `${slug}${ext}`)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(file, dest)
  }
  console.log(`  src/content/: ${files.length} files synced for MDX (slugified names)`)

  // Copy media assets (images, audio, etc.)
  const mediaDir = path.join(CONTENT_DIR, "Media")
  if (fs.existsSync(mediaDir)) {
    function copyDirRecursive(src: string, dest: string) {
      fs.mkdirSync(dest, { recursive: true })
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)
        if (entry.isDirectory()) {
          copyDirRecursive(srcPath, destPath)
        } else {
          fs.copyFileSync(srcPath, destPath)
        }
      }
    }
    copyDirRecursive(mediaDir, path.join(publicContent, "Media"))
    console.log("  public/content/Media/: media assets copied")
  }

  // Generate RSS feeds (opt-in, curated)
  const SITE_URL = "https://subsurfaces.net"
  const WIKI_URL = "https://wiki.subsurfaces.net"

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

  const allNotes = Object.values(index)

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

  // Generate sitemap
  const sitemapUrls = Object.keys(index).map((slug) =>
    `  <url><loc>${SITE_URL}/${slug}</loc></url>`
  ).join("\n")

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls}
</urlset>`

  fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemap.trim())
  console.log(`  sitemap.xml: ${Object.keys(index).length} urls`)

  // Generate OG images (opt-in: set PROCESS_OG=true)
  if (process.env.PROCESS_OG === "true") {
    try {
      execSync("tsx scripts/og-gen.ts", { stdio: "inherit" })
    } catch (err) {
      console.error("Failed to generate OG images:", err)
    }
  }

  console.log("Prebuild complete.")
}

main()
