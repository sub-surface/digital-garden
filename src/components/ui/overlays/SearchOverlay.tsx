import { useState, useEffect, useRef } from "react"
import { useStore } from "@/store"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { useIsWiki } from "@/hooks/useShell"
import { useNavigate } from "@tanstack/react-router"
import type { Document } from "flexsearch"
import styles from "./SearchOverlay.module.scss"

interface SearchResult {
  id: string
  title: string
  excerpt: string
  [key: string]: any
}

export function SearchOverlay() {
  const isOpen = useStore((s) => s.isSearchOpen)
  const setIsOpen = useStore((s) => s.setSearchOpen)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [indexVersion, setIndexVersion] = useState(0)
  const contentIndex = useStore((s) => s.contentIndex)
  const pushCard = useStore((s) => s.pushCard)
  const isWiki = useIsWiki()
  const navigate = useNavigate()
  
  const searchIndexRef = useRef<Document<SearchResult> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Trap focus within the overlay and restore it to the trigger on close. Esc
  // is already handled by the keydown effect below; initialFocus keeps the
  // search input as the landing focus rather than the first tabbable child.
  const trapRef = useFocusTrap<HTMLDivElement>({ active: isOpen, initialFocus: inputRef })

  // Build index lazily — only when search opens for the first time
  useEffect(() => {
    if (!isOpen || !contentIndex || searchIndexRef.current) return

    let cancelled = false
    async function buildIndex() {
      try {
        // FlexSearch 0.8 changed its module shape: depending on the bundler,
        // `Document` may sit on the namespace, on `.default`, or BE `.default`.
        // Resolve all three so the index never silently fails to build.
        const mod = (await import("flexsearch")) as unknown as {
          Document?: typeof Document
          default?: { Document?: typeof Document } & typeof Document
        }
        const DocumentCtor = mod.Document ?? mod.default?.Document ?? mod.default
        if (!DocumentCtor) throw new Error("flexsearch: Document constructor not found")

        if (cancelled || !contentIndex) return

        const index = new DocumentCtor<SearchResult>({
          document: {
            id: "id",
            index: ["title", "excerpt"],
            store: ["title", "excerpt"],
          },
          tokenize: "forward",
        })

        Object.entries(contentIndex).forEach(([slug, meta]) => {
          // Coerce to strings — FlexSearch calls .normalize() on indexed fields,
          // so a non-string title/excerpt (e.g. a bare-number YAML title) would
          // otherwise throw and abort the entire index build.
          try {
            index.add({
              id: slug,
              title: String(meta.title ?? ""),
              excerpt: String(meta.excerpt ?? ""),
            })
          } catch (err) {
            console.warn(`SearchOverlay: skipped indexing "${slug}":`, err)
          }
        })

        if (!cancelled) {
          searchIndexRef.current = index
          setIndexVersion((v) => v + 1)
        }
      } catch (error) {
        console.error("SearchOverlay: Failed to build search index:", error)
      }
    }

    buildIndex()
    return () => { cancelled = true }
  }, [isOpen, contentIndex])

  // Ctrl+K handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        setIsOpen(!isOpen)
      } else if (e.key === "Escape") {
        setIsOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 10)
      setQuery("")
      setResults([])
      setActiveIndex(0)
    }
  }, [isOpen])

  // Perform search
  useEffect(() => {
    if (!query || !searchIndexRef.current) {
      setResults([])
      return
    }

    const searchResults = searchIndexRef.current.search(query, {
      enrich: true,
      limit: 10,
    })

    const flattened: SearchResult[] = []
    if (searchResults.length > 0) {
      // FlexSearch returns results grouped by field
      const seen = new Set<string>()
      searchResults.forEach((fieldResult: any) => {
        fieldResult.result.forEach((res: any) => {
          if (!seen.has(res.id)) {
            seen.add(res.id)
            flattened.push({
              id: res.id,
              title: res.doc.title,
              excerpt: res.doc.excerpt,
            })
          }
        })
      })
    }

    setResults(flattened)
    setActiveIndex(0)
  }, [query, indexVersion])

  const handleSelect = (result: SearchResult) => {
    if (isWiki) {
      navigate({ to: `/${result.id}` })
    } else {
      pushCard(
        { url: `/${result.id}`, slug: result.id, title: result.title, html: `<div class="note-loading">Loading...</div>` },
        -1 // from main body
      )
    }
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      if (results.length === 0) return
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      if (results.length === 0) return
      e.preventDefault()
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length)
    } else if (e.key === "Enter") {
      if (results[activeIndex]) {
        handleSelect(results[activeIndex])
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={() => setIsOpen(false)}>
      <div
        className={styles.modal}
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search notes"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.searchBox}>
          <svg className={styles.searchIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={styles.input}
          />
          <div className={styles.shortcut}>ESC</div>
        </div>

        <div className={styles.results}>
          {results.length > 0 ? (
            results.map((res, i) => (
              <div
                key={res.id}
                className={`${styles.resultItem} ${i === activeIndex ? styles.active : ""}`}
                onClick={() => handleSelect(res)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <div className={styles.resultTitle}>{res.title}</div>
                <div className={styles.resultExcerpt}>{res.excerpt}</div>
              </div>
            ))
          ) : query ? (
            <div className={styles.noResults}>No matches found.</div>
          ) : (
            <div className={styles.emptyState}>Type to search the garden...</div>
          )}
        </div>
      </div>
    </div>
  )
}
