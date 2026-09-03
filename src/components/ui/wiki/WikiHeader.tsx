import { useState, useRef, useEffect, useMemo } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { isLandableNote } from "@/hooks/useRandomNote"
import styles from "./WikiHeader.module.scss"

function getWikiCategory(slug: string): string {
  const s = slug.toLowerCase()
  if (s.startsWith("wiki/chatters/")) return "Chatter"
  if (s.startsWith("wiki/concepts/")) return "Concept"
  if (s.startsWith("wiki/events/")) return "Event"
  if (s.startsWith("wiki/philosophers/")) return "Philosopher"
  if (s.startsWith("wiki/")) return "Wiki"
  return "Note"
}

export function WikiHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const contentIndex = useStore((s) => s.contentIndex)
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Derive breadcrumbs
  const segments = location.pathname.replace(/^\//, "").split("/").filter(Boolean)
  const breadcrumbs = useMemo(() => {
    return segments.map((seg, idx) => {
      const path = "/" + segments.slice(0, idx + 1).join("/")
      const label = seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      return { path, label }
    })
  }, [segments])

  // Fast in-memory search for the header
  const results = useMemo(() => {
    if (!contentIndex || !query.trim()) return []
    const q = query.trim().toLowerCase()
    const matches: Array<{ slug: string; title: string; category: string }> = []

    // Search across contentIndex
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

  // Random Wiki article generator
  const handleRandomWiki = () => {
    if (!contentIndex) return
    const wikiSlugs = Object.keys(contentIndex).filter((slug) => {
      const s = slug.toLowerCase()
      if (!s.startsWith("wiki/")) return false
      if (["wiki", "wiki/about", "wiki/submit", "wiki/style-guide"].includes(s)) return false
      return isLandableNote(slug, contentIndex[slug])
    })
    if (wikiSlugs.length === 0) return
    const randomSlug = wikiSlugs[Math.floor(Math.random() * wikiSlugs.length)]
    navigate({ to: `/${randomSlug}` as any })
  }

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
    }
  }

  return (
    <header className={styles.wikiHeader} data-testid="wiki-header">
      <div className={styles.leftGroup}>
        <a href="/wiki" className={styles.brand}>
          <span>Philchat Wiki</span>
        </a>

        {breadcrumbs.length > 0 && (
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <span className={styles.sep}>/</span>
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.path}>
                {idx > 0 && <span className={styles.sep}>/</span>}
                {idx === breadcrumbs.length - 1 ? (
                  <span>{crumb.label}</span>
                ) : (
                  <a href={crumb.path}>{crumb.label}</a>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>

      <div className={styles.centerGroup} ref={containerRef}>
        <div className={styles.searchBox}>
          <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search wiki articles... (/)"
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

      <div className={styles.rightGroup}>
        <button
          className={styles.actionBtn}
          onClick={handleRandomWiki}
          title="Jump to a random Wiki article"
          aria-label="Random Wiki Article"
        >
          <span>Random</span>
        </button>

        <a href="/tags/wiki" className={styles.actionBtn} title="View all Wiki articles">
          <span>Index</span>
        </a>

        <a href="/wiki/submit" className={styles.actionBtn} title="Submit or claim your Philsurvey profile">
          <span>Submit</span>
        </a>
      </div>
    </header>
  )
}
