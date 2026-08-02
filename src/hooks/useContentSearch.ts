import { useEffect, useMemo, useRef, useState } from "react"
import type { Document } from "flexsearch"
import { useStore } from "@/store"
import { useRestoredNotes } from "./useRestoredNotes"

export type SearchDocumentKind = "garden" | "local"

export interface ContentSearchDocument {
  id: string
  title: string
  excerpt: string
  kind: SearchDocumentKind
  /** Slug for garden documents; persisted file id for local documents. */
  target: string
  [key: string]: string
}

export type ContentSearchResult = ContentSearchDocument

interface Options {
  enabled: boolean
  query: string
  extraDocuments?: ContentSearchDocument[]
  limit?: number
}

interface EnrichedSearchGroup {
  result: Array<{ id: string; doc: ContentSearchDocument }>
}

const NO_EXTRA_DOCUMENTS: ContentSearchDocument[] = []

/**
 * The shared client-side search backend used by both the garden overlay and
 * SUBSURFACES 95. FlexSearch stays lazy, drafts obey the recovery boundary,
 * and callers may add namespaced browser-local documents to the same index.
 */
export function useContentSearch({
  enabled,
  query,
  extraDocuments = NO_EXTRA_DOCUMENTS,
  limit = 10,
}: Options) {
  const contentIndex = useStore((state) => state.contentIndex)
  const { slugs: restoredSlugs } = useRestoredNotes()
  const restoredKey = restoredSlugs.slice().sort().join("\u0000")
  const extraKey = useMemo(
    () => extraDocuments
      .map((doc) => `${doc.id}\u0000${doc.title}\u0000${doc.excerpt}`)
      .join("\u0001"),
    [extraDocuments],
  )
  const buildKey = `${restoredKey}\u0002${extraKey}`
  const indexRef = useRef<Document<ContentSearchDocument> | null>(null)
  const builtKeyRef = useRef("")
  const builtContentRef = useRef(contentIndex)
  const [indexVersion, setIndexVersion] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ContentSearchResult[]>([])

  useEffect(() => {
    if (!enabled || !contentIndex) return
    if (builtKeyRef.current === buildKey && builtContentRef.current === contentIndex) return

    let cancelled = false
    setReady(false)
    setError(null)
    setResults([])

    async function buildIndex() {
      try {
        // FlexSearch 0.8 has shipped several compatible module shapes. Resolve
        // all of them once here so every search surface inherits the fix.
        const mod = (await import("flexsearch")) as unknown as {
          Document?: typeof Document
          default?: { Document?: typeof Document } & typeof Document
        }
        const DocumentCtor = mod.Document ?? mod.default?.Document ?? mod.default
        if (!DocumentCtor) throw new Error("flexsearch: Document constructor not found")
        if (cancelled || !contentIndex) return

        const index = new DocumentCtor<ContentSearchDocument>({
          document: {
            id: "id",
            index: ["title", "excerpt"],
            store: ["title", "excerpt", "kind", "target"],
          },
          tokenize: "forward",
        })
        const restored = new Set(restoredSlugs)

        Object.entries(contentIndex).forEach(([slug, meta]) => {
          if (meta.draft && !restored.has(slug)) return
          try {
            index.add({
              id: `garden:${slug}`,
              title: String(meta.title ?? ""),
              excerpt: String(meta.excerpt ?? ""),
              kind: "garden",
              target: slug,
            })
          } catch (error) {
            console.warn(`Search: skipped indexing "${slug}":`, error)
          }
        })

        extraDocuments.forEach((document) => {
          try {
            index.add(document)
          } catch (error) {
            console.warn(`Search: skipped indexing "${document.id}":`, error)
          }
        })

        if (!cancelled) {
          indexRef.current = index
          builtKeyRef.current = buildKey
          builtContentRef.current = contentIndex
          setReady(true)
          setIndexVersion((version) => version + 1)
        }
      } catch (error) {
        if (!cancelled) {
          setReady(false)
          setError("The search index could not be prepared.")
          console.error("Search: failed to build index:", error)
        }
      }
    }

    void buildIndex()
    return () => { cancelled = true }
  }, [buildKey, contentIndex, enabled, extraDocuments, restoredSlugs])

  useEffect(() => {
    const term = query.trim()
    if (!enabled || !ready || !term || !indexRef.current) {
      setResults([])
      return
    }

    const grouped = indexRef.current.search(term, {
      enrich: true,
      limit,
    }) as unknown as EnrichedSearchGroup[]
    const found: ContentSearchResult[] = []
    const seen = new Set<string>()

    grouped.forEach((field) => {
      field.result.forEach((entry) => {
        const id = String(entry.id)
        if (seen.has(id)) return
        seen.add(id)
        // FlexSearch returns the document id beside the stored fields rather
        // than inside `doc`; restore it so callers have a stable row key.
        found.push({ ...entry.doc, id })
      })
    })
    setResults(found)
  }, [enabled, indexVersion, limit, query, ready])

  return { results, ready, error }
}
