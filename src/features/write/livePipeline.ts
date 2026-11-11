/**
 * The desk's live preview: THE note pipeline (src/lib/note-pipeline.ts), run in
 * the browser. Same plugins as the build, so sidenotes, callouts, KaTeX,
 * wikilinks (missing ones marked), telescopic text and islands come out as the
 * published page will.
 *
 * The pipeline's data (slug map, content index, image sizes, embedded notes'
 * sources) comes from a browser host (src/lib/pipeline-host.ts) filled from the
 * site's own manifests. Embeds are fetched ahead of each render, because the
 * pipeline reads them synchronously.
 *
 * Loaded lazily with the /write page: none of this reaches readers.
 */
import { renderNoteHtml } from "@/lib/note-pipeline"
import { setPipelineHost } from "@/lib/pipeline-host"
import { buildSlugResolver } from "@/lib/slug"
import type { ContentIndex } from "@/types/content"

const manifests = new Map<string, unknown>()
const sources = new Map<string, string>()
let index: ContentIndex = {}

setPipelineHost({
  manifest<T>(file: string, fallback: T): T {
    if (file === "content-index.json") return (Object.keys(index).length ? index : fallback) as T
    return (manifests.get(file) as T | undefined) ?? fallback
  },
  noteSource: (contentPath) => sources.get(contentPath) ?? null,
})

let ready: Promise<void> | null = null
/** Fetch the manifests once (failures leave a manifest empty, never block the preview). */
export function primePreview(): Promise<void> {
  ready ??= Promise.all(["slug-map.json", "image-dimensions.json"].map(async (file) => {
    try {
      const res = await fetch(`/${file}`)
      if (res.ok) manifests.set(file, await res.json())
    } catch { /* the preview still renders; links just aren't checked */ }
  })).then(() => undefined)
  return ready
}

const EMBED_RE = /!\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?\]\]/g
const MEDIA_EXT = /\.(png|jpe?g|gif|svg|webp|avif|mp4|webm|mp3|wav|pdf)$/i

async function fetchEmbeds(source: string): Promise<void> {
  const keys = Object.keys(index)
  if (!keys.length) return
  const resolver = buildSlugResolver(keys)
  const wanted = new Set<string>()
  for (const m of source.matchAll(EMBED_RE)) {
    const target = m[1].trim()
    if (MEDIA_EXT.test(target) || /^https?:/i.test(target)) continue
    const slug = resolver.resolve(target)
    const path = slug ? index[slug]?.contentPath : undefined
    if (path && !sources.has(path)) wanted.add(path)
  }
  await Promise.all([...wanted].map(async (path) => {
    try {
      const res = await fetch(`/content/${path.split("/").map(encodeURIComponent).join("/")}`)
      const text = await res.text()
      // An SPA fallback means the raw copy isn't there; don't cache the app shell as a note.
      if (res.ok && !(res.headers.get("content-type") ?? "").includes("text/html")) sources.set(path, text)
    } catch { /* the embed renders as missing */ }
  }))
}

export interface PreviewResult { html: string; errors: string[] }

/**
 * Render a draft. `media` maps image names still waiting in storage to their
 * URLs, so they show before they are committed to content/Media/.
 */
export async function renderPreview(source: string, contentIndex: ContentIndex | null, media: { name: string; url: string }[]): Promise<PreviewResult> {
  if (contentIndex) index = contentIndex
  await primePreview()
  await fetchEmbeds(source)
  let { html, errors } = await renderNoteHtml(source)
  for (const m of media) if (m.url) html = html.split(`/content/Media/${m.name}`).join(m.url)
  return { html, errors }
}
