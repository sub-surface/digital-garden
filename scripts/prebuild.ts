import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import matter from "gray-matter"

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
  links: string[]
  backlinks: string[]
  folder?: string
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
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim())
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

  const files = walkDir(CONTENT_DIR).filter((f) => !shouldIgnore(f))
  const index: ContentIndex = {}
  const linkMap: Map<string, string[]> = new Map() // slug → raw link targets

  // Pass 1: parse all notes
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8")
    const { data, content } = matter(raw)
    const slug = slugify(file)
    const folder = slug.includes("/") ? slug.split("/").slice(0, -1).join("/") : undefined

    const links = extractWikiLinks(content)
    linkMap.set(slug, links)

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
      links: [], // resolved in pass 2
      backlinks: [],
      folder,
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

  // Copy markdown files to public/content/ so they can be fetched at runtime
  const publicContent = path.join(PUBLIC_DIR, "content")
  for (const file of files) {
    const rel = path.relative(CONTENT_DIR, file).replace(/\\/g, "/")
    const dest = path.join(publicContent, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(file, dest)
  }
  console.log(`  public/content/: ${files.length} files copied`)

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

  console.log("Prebuild complete.")
}

main()
