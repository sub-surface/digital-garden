import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { useShell } from "@/hooks/useShell"
import { SYSTEM_PAGES } from "@/config/system-pages"

/**
 * Slugs that live in the content index but aren't "notes" you'd want to land on
 * when rolling the dice: the system/game/shelf pages and the landing/index page.
 * Compared case-insensitively because content-index keys preserve casing
 * (`heXO`, `Arcade`) while SYSTEM_PAGES keys are lowercase route slugs.
 */
export const EXCLUDED_SLUGS = new Set(
  [...Object.keys(SYSTEM_PAGES), "index", "recent", "tags", "folder"].map((s) =>
    s.toLowerCase()
  )
)

/**
 * Whether a content-index entry is a "landable" note — i.e. a real note you'd
 * want to surface in a random pick / "on this day", not a system/shelf/landing
 * page or a private note. Shared by `useRandomNote` and the MDX query components.
 */
export function isLandableNote(slug: string, meta: { private?: boolean }): boolean {
  if (EXCLUDED_SLUGS.has(slug.toLowerCase())) return false
  return !meta.private
}

/**
 * Returns a callback that jumps to a random note. On the main shell it opens the
 * note as a panel card (matching search/link behaviour); on wiki it navigates.
 * Returns a no-op until the content index has loaded.
 *
 * Pass `candidateSlugs` to pick from a narrower pool (e.g. the Inbox's current
 * filtered view) instead of every landable note in the garden.
 */
export function useRandomNote(candidateSlugs?: string[]) {
  const contentIndex = useStore((s) => s.contentIndex)
  const pushCard = useStore((s) => s.pushCard)
  const navigate = useNavigate()
  const shell = useShell()

  return useCallback(() => {
    // Chat shell has no notes to land on; the dice is a garden/wiki affordance.
    if (!contentIndex || shell === "chat") return

    const slugs = candidateSlugs ?? Object.keys(contentIndex).filter((slug) =>
      isLandableNote(slug, contentIndex[slug])
    )
    if (slugs.length === 0) return

    const slug = slugs[Math.floor(Math.random() * slugs.length)]
    const title = contentIndex[slug]?.title ?? slug

    if (shell === "wiki") {
      navigate({ to: `/${slug}` })
    } else {
      pushCard(
        {
          url: `/${slug}`,
          slug,
          title,
          html: `<div class="note-loading">Loading...</div>`,
        },
        -1 // from main body
      )
    }
  }, [contentIndex, pushCard, navigate, shell, candidateSlugs])
}
