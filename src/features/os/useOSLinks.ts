/**
 * Internal-link interception for the OS shell.
 *
 * Without this, an `<a href="/some-note">` inside a rendered note does what
 * anchors do: a full navigation to os.subsurfaces.net/some-note. Since AppShell
 * returns OSShell for *every* path on that host, the result is the desktop
 * remounting from scratch — boot sequence, lost windows, no note.
 *
 * `usePanelClick` deliberately bails on `shell !== "main"` (CLAUDE.md gotcha #2),
 * so the OS needs its own. This is that, with the OS's meaning of "open": a new
 * window, not a navigation.
 */

import { useEffect } from "react"
import { slugFromPathname } from "@/lib/slug"

type OpenSlug = (slug: string, title?: string) => void

export function useOSLinks(openSlug: OpenSlug) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // Let the browser handle modified clicks — someone asking for a new tab
      // should get one.
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest?.("a")
      if (!anchor) return

      const href = anchor.getAttribute("href")
      if (!href) return

      // NoteBody owns `music:` links (CLAUDE.md gotcha #12) — don't duplicate it.
      if (href.startsWith("music:")) return
      // In-page anchors, mail, tel, downloads and explicit new tabs pass through.
      if (href.startsWith("#")) return
      if (/^(mailto|tel|blob|data):/i.test(href)) return
      if (anchor.hasAttribute("download")) return
      if (anchor.target && anchor.target !== "_self") return

      // Absolute URLs to another host are real navigations — wiki, chat, the
      // main garden. Only same-origin paths become windows.
      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return

      const slug = slugFromPathname(url.pathname)
      if (!slug) return

      event.preventDefault()
      event.stopPropagation()
      openSlug(slug)
    }

    // Capture phase, on document: the click must be caught before React's own
    // handlers inside the rendered note get a chance to act on it.
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [openSlug])
}
