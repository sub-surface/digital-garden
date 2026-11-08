import { LazyDock } from "./lazyOverlay"
import { ContentIndexErrorBanner } from "@/components/ui/ContentIndexErrorBanner"

/**
 * Surfaces shared by every shell: the dock (prompt + philchat; downloaded the
 * first time it opens) and the content-index failure banner.
 */
export function GlobalOverlays() {
  return (
    <>
      <LazyDock />
      <ContentIndexErrorBanner />
    </>
  )
}
