import { useState, useRef, useEffect, useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import styles from "./WikiSearchBox.module.scss"

function getWikiCategory(slug: string): string {
  const s = slug.toLowerCase()
  if (s.startsWith("wiki/chatters/")) return "Chatter"
  if (s.startsWith("wiki/concepts/")) return "Concept"
  if (s.startsWith("wiki/events/")) return "Event"
  if (s.startsWith("wiki/philosophers/")) return "Philosopher"
  if (s.startsWith("wiki/")) return "Wiki"
  return "Note"
}

export function WikiSearchBox() {
  const navigate = useNavigate()
  const contentIndex = useStore((s) => s.contentIndex)
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fast in-memory search
  const results = useMemo(() => {
    if (!contentIndex || !query.trim()) return []
    const q = query.trim().toLowerCase()
    const matches: Array<{ slug: string; title: string; category: string }> = []

    for (const [slug, meta] of Object.entries(contentIndex)) {
      if (meta.private) continue
      const title = String(meta.title ?? slug)
      const titleLower = title.toLowerCase()
      const slugLower = slug.toLowerCase()

      if (titleLower.includes(q) || slugLower.includes(q)) {
        matches.push({
          slug,
          title,
          category: getWikiCategory(slug),
        })
      }
      if (matches.length >= 8) break
    }
    return matches
  }, [contentIndex, query])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Global '/' key trigger
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleSelect = (slug: string) => {
    navigate({ to: `/${slug}` as any })
    setQuery("")
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
      e.preventDefault()
      if (results[activeIndex]) {
        handleSelect(results[activeIndex].slug)
      } else if (results.length > 0) {
        handleSelect(results[0].slug)
      }
    } else if (e.key === "Escape") {
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }

  return (
    <div className={styles.searchContainer} ref={containerRef} data-testid="wiki-search-box">
      <div className={styles.searchBox}>
        <svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Search wiki... (/)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
            setActiveIndex(0)
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          aria-label="Search Philchat Wiki"
        />
        <span className={styles.searchKbd}>/</span>
      </div>

      {isOpen && results.length > 0 && (
        <div className={styles.dropdown} role="listbox">
          {results.map((item, idx) => (
            <div
              key={item.slug}
              className={`${styles.dropdownItem} ${idx === activeIndex ? styles.active : ""}`}
              onClick={() => handleSelect(item.slug)}
              onMouseEnter={() => setActiveIndex(idx)}
              role="option"
              aria-selected={idx === activeIndex}
            >
              <span className={styles.itemTitle}>{item.title}</span>
              <span className={styles.itemBadge}>{item.category}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
