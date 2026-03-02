import type { ContentIndex, GraphData, Track } from "@/types/content"

let cachedIndex: ContentIndex | null = null
let cachedGraph: GraphData | null = null
let cachedMusic: Track[] | null = null

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

export async function loadNoteHtml(slug: string): Promise<string> {
  const res = await fetch(`/notes/${slug}.html`)
  if (!res.ok) throw new Error(`Note not found: ${slug}`)
  return res.text()
}

export async function loadNoteSource(slug: string): Promise<string> {
  // Try .md first (most common)
  const res = await fetch(`/content/${slug}.md`)
  if (res.ok) return res.text()
  // Try .mdx
  const res2 = await fetch(`/content/${slug}.mdx`)
  if (res2.ok) return res2.text()
  throw new Error(`Note source not found: ${slug}`)
}

export function resolveSlug(raw: string, contentIndex: ContentIndex): string | null {
  // Direct match
  if (contentIndex[raw]) return raw

  // Case-insensitive match
  const lower = raw.toLowerCase()
  const match = Object.keys(contentIndex).find(
    (k) => k.toLowerCase() === lower,
  )
  if (match) return match

  // Basename match (e.g. "foo" matches "Books/foo")
  const baseMatch = Object.keys(contentIndex).find((k) => {
    const base = k.split("/").pop()?.toLowerCase()
    return base === lower
  })
  return baseMatch ?? null
}
