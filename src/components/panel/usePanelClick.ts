import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { useShell } from "@/hooks/useShell"
import { slugFromPathname } from "@/lib/slug"
import { classifyLayout } from "@/lib/layout"
import { isPhoneViewport } from "@/config/breakpoints"

/**
 * Global capture-phase click interceptor for internal links. Three outcomes:
 *  1. Panel card — note-mode exploration (unchanged legacy behaviour).
 *  2. Client-side navigate, no panel — destination (or current page) is
 *     article/game, or we're on mobile. Keeps the SPA transition alive so
 *     state (music playback, etc.) survives instead of a full page reload.
 *  3. True no-op — special cases below (hash, music:, modifier keys, etc.)
 *     let the browser/other handlers take it.
 */
export function usePanelClick() {
  const pushCard = useStore((s) => s.pushCard)
  const popCard = useStore((s) => s.popCard)
  const contentIndex = useStore((s) => s.contentIndex)
  const setActiveGraphSlug = useStore((s) => s.setActiveGraphSlug)
  const shell = useShell()
  const navigate = useNavigate()

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      // Wiki and chat have no PanelStack — let all clicks navigate normally
      if (shell !== "main") return
      const target = event.target as Element
      if (!target?.closest) return

      const anchor = target.closest("a") as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute("href")
      if (!href) return

      // music: links are handled by NoteBody (works in every layout); don't
      // also intercept them here or open them as panel cards.
      if (href.startsWith("music:")) return

      // Skip hash links (they should scroll within the page)
      if (href.startsWith("#")) return

      // Modifier keys: let browser handle (new tab etc.) — must win regardless
      // of destination classification.
      if (event.ctrlKey || event.metaKey) return
      // Alt+click: bypass panel, let router handle
      if (event.altKey) return
      // Don't intercept clicks on toolbar, search, etc.
      if (target.closest("[data-panel-ignore]")) return
      if (anchor.getAttribute("target") === "_blank") return

      // Skip special protocols (already handled music: above)
      if (href.includes("://") && !href.startsWith(window.location.origin)) return

      try {
        const url = new URL(anchor.href)
        if (url.origin !== window.location.origin) return
        if (url.protocol !== "http:" && url.protocol !== "https:") return

        // Extract slug from URL path
        const slug = slugFromPathname(url.pathname)
        if (!slug) return

        const al = useStore.getState().activeLayout
        const dest = classifyLayout(slug, contentIndex?.[slug] ?? {})
        const isMobile = isPhoneViewport()

        event.preventDefault()
        event.stopPropagation()

        setActiveGraphSlug(slug)

        // Branch 2: client-side navigate, no panel card — destination or
        // current page is article/game, or mobile (no panel UI there anyway).
        // Either way a full reload would wipe React state (music, reader mode).
        if (dest === "article" || dest === "game" || al === "article" || al === "game" || isMobile) {
          useStore.getState().clearStack()
          navigate({ to: url.pathname + url.search + url.hash })
          return
        }

        // Branch 1: panel card (note-mode exploration, unchanged)
        const cardEl = target.closest("[data-index]")
        const fromDepth = cardEl
          ? parseInt(cardEl.getAttribute("data-index")!, 10)
          : -1 // -1 = from main body

        const title = contentIndex?.[slug]?.title ?? slug.split("/").pop() ?? slug
        pushCard({ url: `/${slug}`, slug, title, html: "" }, fromDepth)
      } catch {
        return
      }
    }

    // Capture phase to intercept before normal click handlers
    document.addEventListener("click", handleClick, true)

    return () => {
      document.removeEventListener("click", handleClick, true)
    }
  }, [pushCard, contentIndex, shell, setActiveGraphSlug, navigate])

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
