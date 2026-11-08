import type { ContentIndex, GraphData, BrokenLinksManifest } from "@/types/content"
import { buildSlugResolver, type SlugResolver } from "./slug"

let cachedGraph: GraphData | null = null
let cachedBrokenLinks: BrokenLinksManifest | null = null

export async function loadGraphData(): Promise<GraphData> {
  if (cachedGraph) return cachedGraph
  const res = await fetch("/graph.json")
  cachedGraph = await res.json()
  return cachedGraph!
}

export async function loadBrokenLinks(): Promise<BrokenLinksManifest> {
  if (cachedBrokenLinks) return cachedBrokenLinks
  const res = await fetch("/broken-links.json")
  cachedBrokenLinks = await res.json()
  return cachedBrokenLinks!
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
