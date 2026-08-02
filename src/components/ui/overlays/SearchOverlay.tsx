import { useState, useEffect, useRef } from "react"
import { useStore } from "@/store"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { useShell } from "@/hooks/useShell"
import { useContentSearch, type ContentSearchResult } from "@/hooks/useContentSearch"
import { useNavigate } from "@tanstack/react-router"
import styles from "./SearchOverlay.module.scss"

export function SearchOverlay() {
  const isOpen = useStore((s) => s.isSearchOpen)
  const setIsOpen = useStore((s) => s.setSearchOpen)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const pushCard = useStore((s) => s.pushCard)
  const shell = useShell()
  const isWiki = shell === "wiki"
  const navigate = useNavigate()
  const { results } = useContentSearch({ enabled: isOpen, query })
  const inputRef = useRef<HTMLInputElement>(null)

  // Trap focus within the overlay and restore it to the trigger on close. Esc
  // is already handled by the keydown effect below; initialFocus keeps the
  // search input as the landing focus rather than the first tabbable child.
  const trapRef = useFocusTrap<HTMLDivElement>({ active: isOpen, initialFocus: inputRef })

  // Ctrl+K handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shell !== "os" && (e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        setIsOpen(!isOpen)
      } else if (e.key === "Escape") {
        setIsOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, setIsOpen, shell])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 10)
      setQuery("")
      setActiveIndex(0)
    }
  }, [isOpen])

  // Search results are shared with the OS Find app; only list navigation is
  // surface-specific here.
  useEffect(() => {
    setActiveIndex(0)
  }, [results])

  const handleSelect = (result: ContentSearchResult) => {
    if (isWiki) {
      navigate({ to: `/${result.target}` })
    } else {
      pushCard(
        { url: `/${result.target}`, slug: result.target, title: result.title, html: `<div class="note-loading">Loading...</div>` },
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
