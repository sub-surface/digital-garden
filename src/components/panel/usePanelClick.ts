import { useEffect } from "react"
import { useStore } from "@/store"
import { parseMarkdown } from "@/lib/markdown"

/**
 * Global capture-phase click interceptor for internal links.
 * Opens clicked links as panel cards instead of navigating.
 *
 * - From main body: pushCard at depth 0
 * - From a panel card at depth N: pushCard at depth N+1 (trims right)
 * - Alt+click: bypass panel, navigate main body
 * - Ctrl/Cmd+click: new tab (browser default)
 */
export function usePanelClick() {
  const pushCard = useStore((s) => s.pushCard)
  const popCard = useStore((s) => s.popCard)
  const panelStack = useStore((s) => s.panelStack)
  const contentIndex = useStore((s) => s.contentIndex)

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      // Mobile: no panel
      if (window.innerWidth <= 800) return
      // Modifier keys: let browser handle
      if (event.ctrlKey || event.metaKey) return
      // Alt+click: bypass panel, let router handle
      if (event.altKey) return

      const target = event.target as Element
      if (!target?.closest) return

      // Don't intercept clicks on toolbar, search, etc.
      if (target.closest("[data-panel-ignore]")) return

      const anchor = target.closest("a") as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.getAttribute("target") === "_blank") return

      const href = anchor.href
      if (!href) return

      // Skip external links and special protocols
      try {
        const url = new URL(href)
        if (url.origin !== window.location.origin) return
        if (url.protocol !== "http:" && url.protocol !== "https:") return

        event.preventDefault()
        event.stopPropagation()

        // Extract slug from URL path
        const slug = decodeURIComponent(url.pathname.replace(/^\//, "")).replace(/\/$/, "")
        if (!slug) return

        // Determine depth: are we clicking from within a panel card?
        const cardEl = target.closest("[data-index]")
        const fromDepth = cardEl
          ? parseInt(cardEl.getAttribute("data-index")!, 10)
          : -1 // -1 = from main body

        // Fetch the note content for the card
        fetchNoteForCard(slug, fromDepth)
      } catch {
        return
      }
    }

    async function fetchNoteForCard(slug: string, fromDepth: number) {
      const title = contentIndex?.[slug]?.title ?? slug.split("/").pop() ?? slug

      // Push a loading placeholder immediately
      pushCard(
        { url: `/${slug}`, slug, title, html: `<div class="note-loading">Loading...</div>` },
        fromDepth,
      )

      try {
        // Fetch markdown source
        const paths = [`/content/${slug}.md`, `/content/${slug}/index.md`]
        let source: string | null = null

        for (const path of paths) {
          const res = await fetch(path)
          if (res.ok) {
            source = await res.text()
            break
          }
        }

        if (!source) {
          // Update the card with error
          updateTopCard(slug, title, `<div class="note-error">Note not found: ${slug}</div>`)
          return
        }

        const parsed = await parseMarkdown(source)
        const resolvedTitle = (parsed.frontmatter.title as string) ?? title
        updateTopCard(slug, resolvedTitle, parsed.html)
      } catch (err) {
        updateTopCard(slug, title, `<div class="note-error">${String(err)}</div>`)
      }
    }

    function updateTopCard(slug: string, title: string, html: string) {
      // Replace the top card's content (it was a loading placeholder)
      const stack = useStore.getState().panelStack
      const cardIndex = stack.findIndex((c) => c.slug === slug)
      if (cardIndex === -1) return

      // Direct state mutation via set — update the card in place
      useStore.setState((s) => {
        const newStack = [...s.panelStack]
        newStack[cardIndex] = { ...newStack[cardIndex], title, html }
        return { panelStack: newStack }
      })
    }

    // Capture phase to intercept before normal click handlers
    document.addEventListener("click", handleClick, true)

    return () => {
      document.removeEventListener("click", handleClick, true)
    }
  }, [pushCard, contentIndex])

  // Escape key: pop rightmost card
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape" && useStore.getState().panelStack.length > 0) {
        e.preventDefault()
        popCard()
      }
    }

    document.addEventListener("keydown", handleKeydown)
    return () => document.removeEventListener("keydown", handleKeydown)
  }, [popCard])
}
