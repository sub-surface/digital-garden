import { noteDataFileName } from "./slug"

/**
 * A note as the reader renders it: its own frontmatter and the body HTML from
 * THE note pipeline, with `data-island` placeholders for components.
 * Emitted per note by scripts/emit-prerender.ts into public/notes/.
 */
export interface NoteData {
  slug: string
  frontmatter: Record<string, unknown>
  html: string
  /** h2–h4 with ids, extracted at build time (for the TOC). */
  headings?: { id: string; text: string; level: number }[]
}

export class NoteMissingError extends Error {}

// One request per note per page session; in-flight requests are shared, so a
// note open in a panel and the main pane costs one fetch.
const cache = new Map<string, Promise<NoteData>>()

export function loadNote(slug: string): Promise<NoteData> {
  const key = slug.toLowerCase()
  const hit = cache.get(key)
  if (hit) return hit

  const request = fetch(`/notes/${noteDataFileName(slug)}`)
    .then(async (res) => {
      // The SPA fallback answers unknown paths with index.html and a 200; a
      // note file is always JSON.
      const type = res.headers.get("content-type") ?? ""
      if (res.status === 404 || (res.ok && !type.includes("json"))) throw new NoteMissingError(slug)
      if (!res.ok) throw new Error(`note ${slug}: HTTP ${res.status}`)
      return (await res.json()) as NoteData
    })
    .catch((err) => {
      cache.delete(key) // let a later visit retry a transient failure
      throw err
    })
  cache.set(key, request)
  return request
}
