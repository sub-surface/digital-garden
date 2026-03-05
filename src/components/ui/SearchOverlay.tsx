import { useState, useEffect, useRef } from "react"
import { useStore } from "@/store"
import { useMusic } from "./MusicContext"
import { Document } from "flexsearch"
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
  const contentIndex = useStore((s) => s.contentIndex)
  const pushCard = useStore((s) => s.pushCard)
  
  const searchIndexRef = useRef<Document<SearchResult> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize index
  useEffect(() => {
    if (!contentIndex) return

    const index = new Document<SearchResult>({
      document: {
        id: "id",
        index: ["title", "excerpt"],
        store: ["title", "excerpt"],
      },
      tokenize: "forward",
    })

    Object.entries(contentIndex).forEach(([slug, meta]) => {
      index.add({
        id: slug,
        title: meta.title,
        excerpt: meta.excerpt || "",
      })
    })

    searchIndexRef.current = index
  }, [contentIndex])

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
  }, [query])

  const handleSelect = (result: SearchResult) => {
    // Open in panel
    pushCard(
      { url: `/${result.id}`, slug: result.id, title: result.title, html: `<div class="note-loading">Loading...</div>` },
      -1 // from main body
    )
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % results.length)
    } else if (e.key === "ArrowUp") {
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
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
