import { useEffect, useRef, useState } from "react"
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

interface SearchIndexPayload {
  slugs: string[]
  index: Record<string, number[]>
}

const NO_EXTRA_DOCUMENTS: ContentSearchDocument[] = []

// Module-level singleton cache so search-index.json is loaded at most once per page session
let cachedIndexPayload: SearchIndexPayload | null = null
let indexFetchPromise: Promise<SearchIndexPayload | null> | null = null

function loadSearchIndexPayload(): Promise<SearchIndexPayload | null> {
  if (cachedIndexPayload) return Promise.resolve(cachedIndexPayload)
  if (indexFetchPromise) return indexFetchPromise

  indexFetchPromise = fetch("/search-index.json")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<SearchIndexPayload>
    })
    .then((data) => {
      cachedIndexPayload = data
      return data
    })
    .catch((err) => {
      console.warn("Search: failed to load pre-computed search-index.json, falling back to in-memory:", err)
      indexFetchPromise = null
      return null
    })

  return indexFetchPromise
}

/**
 * The shared client-side search backend used by both the garden overlay and
 * SUBSURFACES 95. Backed by the pre-computed build-time inverted search index
 * (ROADMAP §5 / SSG Pipeline Phase 3a) with full-text scoring, instant title
 * boosting, and graceful fallback to local contentIndex metadata.
 */
export function useContentSearch({
  enabled,
  query,
  extraDocuments = NO_EXTRA_DOCUMENTS,
  limit = 10,
}: Options) {
  const contentIndex = useStore((state) => state.contentIndex)
  const { slugs: restoredSlugs } = useRestoredNotes()
  const [ready, setReady] = useState(Boolean(cachedIndexPayload))
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ContentSearchResult[]>([])
  const tokensRef = useRef<string[] | null>(null)

  // Pre-load the inverted index when search is enabled or mounted
  useEffect(() => {
    if (!enabled) return
    if (cachedIndexPayload) {
      if (!ready) setReady(true)
      return
    }

    let cancelled = false
    loadSearchIndexPayload()
      .then((data) => {
        if (cancelled) return
        if (data) {
          tokensRef.current = Object.keys(data.index)
          setReady(true)
        } else {
          // In-memory fallback is still ready
          setReady(true)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError("The search index could not be prepared.")
          console.error("Search index preparation error:", err)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, ready])

  useEffect(() => {
    const term = query.trim()
    if (!enabled || !term) {
      setResults([])
      return
    }

    const q = term.toLowerCase()
    const terms = q
      .replace(/[^\w\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((t) => t.length >= 2)

    const restored = new Set(restoredSlugs)
    const seen = new Set<string>()
    const found: Array<{ doc: ContentSearchResult; score: number }> = []

    // 1. Extra documents match (local files, etc.)
    extraDocuments.forEach((doc) => {
      const titleLower = doc.title.toLowerCase()
      const excerptLower = doc.excerpt.toLowerCase()
      let score = 0
      if (titleLower === q) score += 100
      else if (titleLower.startsWith(q)) score += 50
      else if (titleLower.includes(q)) score += 25

      for (const t of terms) {
        if (titleLower.includes(t)) score += 10
        if (excerptLower.includes(t)) score += 2
      }

      if (score > 0 && !seen.has(doc.id)) {
        seen.add(doc.id)
        found.push({ doc, score })
      }
    })

    // 2. Pre-computed inverted full-text search index (Phase 3a)
    if (cachedIndexPayload && contentIndex) {
      const payload = cachedIndexPayload
      if (!tokensRef.current) tokensRef.current = Object.keys(payload.index)
      const allTokens = tokensRef.current

      const docScores = new Map<number, number>()
      const termHits = new Map<number, number>()

      for (const t of terms) {
        // Exact token postings
        const postings = payload.index[t]
        if (postings) {
          for (let i = 0; i < postings.length; i += 2) {
            const id = postings[i]
            const weight = postings[i + 1]
            docScores.set(id, (docScores.get(id) || 0) + weight)
            termHits.set(id, (termHits.get(id) || 0) + 1)
          }
        }

        // Prefix match for terms with length >= 3
        if (t.length >= 3) {
          for (let i = 0; i < allTokens.length; i++) {
            const cand = allTokens[i]
            if (cand !== t && cand.startsWith(t)) {
              const prefixPostings = payload.index[cand]
              if (prefixPostings) {
                for (let j = 0; j < prefixPostings.length; j += 2) {
                  const id = prefixPostings[j]
                  const weight = Math.round(prefixPostings[j + 1] * 0.7)
                  docScores.set(id, (docScores.get(id) || 0) + weight)
                }
              }
            }
          }
        }
      }

      // Multi-term intersection bonus
      for (const [id, hits] of termHits.entries()) {
        if (hits > 1) {
          const current = docScores.get(id) || 0
          docScores.set(id, current * Math.pow(1.5, hits - 1))
        }
      }

      // Add ranked garden documents
      for (const [id, score] of docScores.entries()) {
        const slug = payload.slugs[id]
        if (!slug) continue
        const meta = contentIndex[slug]
        if (!meta) continue
        if (meta.draft && !restored.has(slug)) continue
        if (meta.private) continue

        const docId = `garden:${slug}`
        if (seen.has(docId)) continue

        // Extra boost if title or slug matches user query directly
        const titleLower = (meta.title || "").toLowerCase()
        const slugLower = slug.toLowerCase()
        let bonus = 0
        if (titleLower === q || slugLower === q) bonus += 120
        else if (titleLower.startsWith(q) || slugLower.startsWith(q)) bonus += 60
        else if (titleLower.includes(q)) bonus += 30

        seen.add(docId)
        found.push({
          doc: {
            id: docId,
            title: String(meta.title ?? ""),
            excerpt: String(meta.excerpt ?? ""),
            kind: "garden",
            target: slug,
          },
          score: score + bonus,
        })
      }
    } else if (contentIndex) {
      // 3. Fallback: direct in-memory search over contentIndex metadata
      Object.entries(contentIndex).forEach(([slug, meta]) => {
        if (meta.draft && !restored.has(slug)) return
        if (meta.private) return

        const docId = `garden:${slug}`
        if (seen.has(docId)) return

        const title = String(meta.title ?? "")
        const excerpt = String(meta.excerpt ?? "")
        const titleLower = title.toLowerCase()
        const slugLower = slug.toLowerCase()
        const excerptLower = excerpt.toLowerCase()
        const tags = Array.isArray(meta.tags) ? meta.tags.map((t) => String(t).toLowerCase()) : []

        let score = 0
        if (titleLower === q || slugLower === q) score += 100
        else if (titleLower.startsWith(q) || slugLower.startsWith(q)) score += 50
        else if (titleLower.includes(q) || slugLower.includes(q) || tags.some((t) => t.includes(q))) score += 25
        else if (excerptLower.includes(q)) score += 10

        if (score > 0) {
          seen.add(docId)
          found.push({
            doc: {
              id: docId,
              title,
              excerpt,
              kind: "garden",
              target: slug,
            },
            score,
          })
        }
      })
    }

    found.sort((a, b) => b.score - a.score)
    setResults(found.slice(0, limit).map((f) => f.doc))
  }, [contentIndex, enabled, extraDocuments, limit, query, ready, restoredSlugs])

  return { results, ready, error }
}
