/**
 * Pre-computed Full-Text Search Index Emitter (SSG Pipeline Phase 3a).
 *
 * Compiles an inverted search index over the complete prose corpus at build time,
 * outputting to `public/search-index.json`. This replaces client-side runtime
 * index generation (FlexSearch) with instantaneous O(1) dictionary lookups
 * and extends search capability beyond the first 200 characters to full-body text.
 */
import * as fs from "fs"
import * as path from "path"
import matter from "gray-matter"
import { slugifyPath } from "../src/lib/slug"

export interface SearchIndexModel {
  files: string[]
  index: Record<string, any>
}

export interface SearchIndexPayload {
  slugs: string[]
  index: Record<string, number[]>
}

const STOP_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
  "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
  "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
  "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
  "people", "into", "year", "your", "good", "some", "could", "them", "see", "other",
  "than", "then", "now", "look", "only", "come", "its", "over", "think", "also",
  "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
  "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
])

function stripMarkdown(content: string): string {
  return content
    // Strip code blocks
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    // Resolve wikilinks to text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2 $1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    // Resolve markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Strip markdown formatting symbols
    .replace(/[#>*~_=+\-|\\]/g, " ")
}

export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length >= 2 && w.length <= 30)
}

export function emitSearchIndex(
  model: SearchIndexModel,
  contentDir: string,
  publicDir: string,
): { count: number; totalTokens: number; totalBytes: number; durationMs: number } {
  const start = Date.now()

  const slugList: string[] = []
  const slugToId = new Map<string, number>()
  const invertedIndex: Record<string, number[]> = {}

  for (const file of model.files) {
    const rel = path.relative(contentDir, file)
    const slug = slugifyPath(rel)
    const meta = model.index[slug]
    if (!meta || meta.private) continue

    const id = slugList.length
    slugList.push(slug)
    slugToId.set(slug, id)

    const raw = fs.readFileSync(file, "utf-8")
    const { data, content } = matter(raw)
    const title = String(data.title || meta.title || slug.split("/").pop() || "")
    const tags: string[] = Array.isArray(data.tags)
      ? data.tags.map(String)
      : Array.isArray(meta.tags)
      ? meta.tags.map(String)
      : []

    const cleanBody = stripMarkdown(content)
    const titleTokens = new Set(tokenizeText(title))
    const tagTokens = new Set(tags.flatMap(tokenizeText))
    const bodyTokens = tokenizeText(cleanBody)

    const termFreq = new Map<string, number>()
    for (const t of bodyTokens) {
      termFreq.set(t, (termFreq.get(t) || 0) + 1)
    }

    const allTokens = new Set([...titleTokens, ...tagTokens, ...termFreq.keys()])

    for (const token of allTokens) {
      const isTitle = titleTokens.has(token)
      const isTag = tagTokens.has(token)

      // Skip common stop words if only found in prose body
      if (!isTitle && !isTag && STOP_WORDS.has(token)) {
        continue
      }

      let weight = 0
      if (isTitle) weight += 10
      if (isTag) weight += 5
      const freq = termFreq.get(token) || 0
      weight += Math.min(10, Math.ceil(Math.sqrt(freq)))

      if (!invertedIndex[token]) {
        invertedIndex[token] = []
      }
      invertedIndex[token].push(id, weight)
    }
  }

  // Sort postings for each token by score descending
  for (const token of Object.keys(invertedIndex)) {
    const postings = invertedIndex[token]
    if (postings.length > 2) {
      const pairs: [number, number][] = []
      for (let i = 0; i < postings.length; i += 2) {
        pairs.push([postings[i], postings[i + 1]])
      }
      pairs.sort((a, b) => b[1] - a[1])
      const flattened: number[] = []
      for (const [id, weight] of pairs) {
        flattened.push(id, weight)
      }
      invertedIndex[token] = flattened
    }
  }

  const payload: SearchIndexPayload = {
    slugs: slugList,
    index: invertedIndex,
  }

  const json = JSON.stringify(payload)
  const destPath = path.join(publicDir, "search-index.json")
  fs.writeFileSync(destPath, json, "utf-8")

  const durationMs = Date.now() - start
  const totalBytes = Buffer.byteLength(json, "utf-8")

  return {
    count: slugList.length,
    totalTokens: Object.keys(invertedIndex).length,
    totalBytes,
    durationMs,
  }
}
