import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { useShell } from "@/hooks/useShell"
import { useRandomNote } from "@/hooks/useRandomNote"
import { useMusic } from "@/components/ui/MusicContext"
import styles from "./CommandPalette.module.scss"

interface Command {
  id: string
  label: string
  hint?: string
  /** Lowercased haystack for matching (label + keywords). */
  keywords: string
  run: () => void
}

/** Slugs in the content index that are pages, not notes you'd "go to" as text. */
const NOTE_EXCLUDE = new Set(["index"])

/**
 * Ctrl/Cmd+P command palette — fuzzy over actions + notes. Actions toggle store
 * surfaces (theme, bg, search, graph, music) or navigate to system pages; notes
 * open as panel cards (garden) or navigate (wiki). Keyboard-first.
 */
export function CommandPalette() {
  const isOpen = useStore((s) => s.isCommandPaletteOpen)
  const setOpen = useStore((s) => s.setCommandPalette)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const navigate = useNavigate()
  const shell = useShell()
  const goRandom = useRandomNote()
  const { togglePlay } = useMusic()

  const contentIndex = useStore((s) => s.contentIndex)
  const pushCard = useStore((s) => s.pushCard)
  const setTheme = useStore((s) => s.setTheme)
  const cycleAccent = useStore((s) => s.cycleAccent)
  const cycleBgMode = useStore((s) => s.cycleBgMode)
  const toggleSearch = useStore((s) => s.toggleSearch)
  const toggleThemePanel = useStore((s) => s.toggleThemePanel)
  const toggleCheatSheet = useStore((s) => s.toggleCheatSheet)
  const toggleReaderMode = useStore((s) => s.toggleReaderMode)

  const openNote = (slug: string, title: string) => {
    if (shell === "wiki") {
      navigate({ to: `/${slug}` })
    } else {
      pushCard({ url: `/${slug}`, slug, title, html: `<div class="note-loading">Loading...</div>` }, -1)
    }
  }

  // Static actions. `run` closes the palette via the dispatcher below.
  const actions = useMemo<Command[]>(() => {
    const theme = useStore.getState().theme
    const base: Command[] = [
      { id: "search", label: "Search notes", hint: "Ctrl+K", keywords: "search find notes", run: toggleSearch },
      { id: "random", label: "Random note", hint: "R", keywords: "random surprise lucky note", run: goRandom },
      { id: "shortcuts", label: "Keyboard shortcuts", hint: "?", keywords: "help shortcuts keyboard cheat", run: toggleCheatSheet },
      { id: "theme", label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode", keywords: "theme dark light mode toggle appearance", run: () => setTheme(theme === "dark" ? "light" : "dark") },
      { id: "accent", label: "Cycle accent colour", keywords: "accent colour color palette roygbiv", run: cycleAccent },
      { id: "themepanel", label: "Open theme panel", hint: "\\", keywords: "theme panel settings appearance customise", run: toggleThemePanel },
    ]
    if (shell === "main") {
      base.push(
        { id: "bg", label: "Cycle background", hint: "B", keywords: "background bg canvas murmuration graph vectors", run: cycleBgMode },
        { id: "music", label: "Play / pause music", hint: "M", keywords: "music play pause audio track", run: togglePlay },
        { id: "reader", label: "Toggle reader mode", keywords: "reader focus distraction mode", run: toggleReaderMode },
        { id: "nav-graph", label: "Go to Graph", keywords: "graph constellation network map go navigate", run: () => navigate({ to: "/$", params: { _splat: "graph" } as any }) },
        { id: "nav-arcade", label: "Go to Arcade", keywords: "arcade games go navigate play", run: () => openNote("Arcade", "Arcade") },
        { id: "nav-chess", label: "Go to Chess", keywords: "chess game board go navigate", run: () => openNote("Chess", "Chess") },
        { id: "nav-hexo", label: "Go to heXO", keywords: "hexo hex game go navigate", run: () => openNote("heXO", "heXO") },
        { id: "nav-bookshelf", label: "Go to Bookshelf", keywords: "books bookshelf reading go navigate", run: () => openNote("Bookshelf", "Bookshelf") },
        { id: "nav-movieshelf", label: "Go to Movieshelf", keywords: "movies film movieshelf go navigate", run: () => openNote("Movieshelf", "Movieshelf") },
      )
    }
    return base
    // openNote/navigate are stable enough; deps kept minimal to avoid churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell, isOpen])

  // Note results from the content index (only when there's a query).
  const noteCommands = useMemo<Command[]>(() => {
    if (!query.trim() || !contentIndex) return []
    const q = query.toLowerCase()
    const out: Command[] = []
    for (const [slug, meta] of Object.entries(contentIndex)) {
      if (NOTE_EXCLUDE.has(slug.toLowerCase()) || meta.private) continue
      const hay = `${meta.title} ${slug} ${(meta.tags || []).join(" ")}`.toLowerCase()
      if (hay.includes(q)) {
        out.push({
          id: `note:${slug}`,
          label: meta.title || slug,
          hint: meta.folder || "note",
          keywords: hay,
          run: () => openNote(slug, meta.title || slug),
        })
      }
      if (out.length >= 30) break
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, contentIndex])

  // Filter actions by query, then append note matches.
  const results = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase()
    const filteredActions = q
      ? actions.filter((c) => c.keywords.includes(q) || c.label.toLowerCase().includes(q))
      : actions
    return [...filteredActions, ...noteCommands]
  }, [query, actions, noteCommands])

  // Focus management: capture trigger, focus input, restore on close.
  useEffect(() => {
    if (!isOpen) return
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    setQuery("")
    setActiveIndex(0)
    const id = setTimeout(() => inputRef.current?.focus(), 10)
    return () => {
      clearTimeout(id)
      restoreFocusRef.current?.focus?.()
    }
  }, [isOpen])

  useEffect(() => { setActiveIndex(0) }, [query])

  // Keep the active row in view.
  useEffect(() => {
    if (!isOpen) return
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, isOpen])

  if (!isOpen) return null

  const dispatch = (cmd: Command | undefined) => {
    if (!cmd) return
    setOpen(false)
    cmd.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (results.length) setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (results.length) setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      dispatch(results[activeIndex])
    }
  }

  return (
    <div className={styles.overlay} onClick={() => setOpen(false)}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.searchBox}>
          <span className={styles.prompt}>&rsaquo;</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Run a command or jump to a note…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className={styles.input}
            aria-label="Command palette input"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className={styles.shortcut}>ESC</kbd>
        </div>

        <div className={styles.results} ref={listRef}>
          {results.length > 0 ? (
            results.map((cmd, i) => (
              <button
                key={cmd.id}
                data-idx={i}
                className={`${styles.item} ${i === activeIndex ? styles.active : ""}`}
                onMouseMove={() => setActiveIndex(i)}
                onClick={() => dispatch(cmd)}
              >
                <span className={styles.itemLabel}>{cmd.label}</span>
                {cmd.hint && <span className={styles.itemHint}>{cmd.hint}</span>}
              </button>
            ))
          ) : (
            <div className={styles.empty}>No matches</div>
          )}
        </div>
      </div>
    </div>
  )
}
