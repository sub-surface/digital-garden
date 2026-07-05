import type { ContentIndex, GraphData, Track, BrokenLinksManifest } from "@/types/content"
import { normalizeSlug, buildSlugResolver, type SlugResolver } from "./slug"

let cachedIndex: ContentIndex | null = null
let cachedGraph: GraphData | null = null
let cachedMusic: Track[] | null = null
let cachedBrokenLinks: BrokenLinksManifest | null = null

export async function loadContentIndex(): Promise<ContentIndex> {
  if (cachedIndex) return cachedIndex
  const res = await fetch("/content-index.json")
  cachedIndex = await res.json()
  return cachedIndex!
}

export async function loadGraphData(): Promise<GraphData> {
  if (cachedGraph) return cachedGraph
  const res = await fetch("/graph.json")
  cachedGraph = await res.json()
  return cachedGraph!
}

export async function loadMusicManifest(): Promise<Track[]> {
  if (cachedMusic) return cachedMusic
  const res = await fetch("/music.json")
  cachedMusic = await res.json()
  return cachedMusic!
}

export async function loadBrokenLinks(): Promise<BrokenLinksManifest> {
  if (cachedBrokenLinks) return cachedBrokenLinks
  const res = await fetch("/broken-links.json")
  cachedBrokenLinks = await res.json()
  return cachedBrokenLinks!
}

export async function loadNoteSource(slug: string): Promise<string> {
  const normalized = normalizeSlug(slug)

  // Try .md first (most common)
  const res = await fetch(`/content/${normalized}.md`)
  if (res.ok) return res.text()

  // Try .mdx
  const res2 = await fetch(`/content/${normalized}.mdx`)
  if (res2.ok) return res2.text()

  throw new Error(`Note source not found: ${normalized}`)
}

// Resolver memoized per index instance — shared slug semantics (src/lib/slug.ts),
// O(1) lookups instead of scanning every key per call.
let resolverFor: ContentIndex | null = null
let resolver: SlugResolver | null = null

export function resolveSlug(raw: string, contentIndex: ContentIndex): string | null {
  if (resolverFor !== contentIndex) {
    resolver = buildSlugResolver(Object.keys(contentIndex))
    resolverFor = contentIndex
  }
  return resolver!.resolve(raw)
}
