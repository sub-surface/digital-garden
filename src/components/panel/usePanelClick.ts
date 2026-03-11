import { useEffect } from "react"
import { useStore } from "@/store"
import { parseMarkdown } from "@/lib/markdown"
import { useMusic } from "@/components/ui/MusicContext"
import { useShell } from "@/hooks/useShell"

/**
 * Global capture-phase click interceptor for internal links.
 * Opens clicked links as panel cards instead of navigating.
 */
export function usePanelClick() {
  const pushCard = useStore((s) => s.pushCard)
  const popCard = useStore((s) => s.popCard)
  const contentIndex = useStore((s) => s.contentIndex)
  const toggleMusic = useStore((s) => s.toggleMusic)
  const setActiveGraphSlug = useStore((s) => s.setActiveGraphSlug)
  const { tracks, playTrack } = useMusic()
  const shell = useShell()

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

      // In article mode, we don't want to open side panels.
      // We check the store for the active layout.
      if (useStore.getState().activeLayout === "article") return

      // Handle music: protocol
// ...
      if (href.startsWith("music:")) {
        event.preventDefault()
        event.stopPropagation()

        const trackTitle = decodeURIComponent(href.slice(6))
        const trackIndex = tracks.findIndex(t => t.title.toLowerCase() === trackTitle.toLowerCase())

        if (trackIndex !== -1) {
          playTrack(trackIndex)
          // Ensure player is open
          if (!useStore.getState().isMusicOpen) {
            toggleMusic()
          }
        }
        return
      }

      // Skip hash links (they should scroll within the page)
      if (href.startsWith("#")) return

      // Mobile: no panel
      if (window.innerWidth <= 800) return
      // Modifier keys: let browser handle
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

        event.preventDefault()
        event.stopPropagation()

        // Extract slug from URL path, normalise spaces→hyphens
        const slug = decodeURIComponent(url.pathname.replace(/^\//, "")).replace(/\/$/, "").replace(/\s+/g, "-")
        if (!slug) return

        // Update active graph target
        setActiveGraphSlug(slug)

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

      pushCard(
        { url: `/${slug}`, slug, title, html: "" },
        fromDepth,
      )
    }

    // Capture phase to intercept before normal click handlers
    document.addEventListener("click", handleClick, true)

    return () => {
      document.removeEventListener("click", handleClick, true)
    }
  }, [pushCard, contentIndex, tracks])

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
