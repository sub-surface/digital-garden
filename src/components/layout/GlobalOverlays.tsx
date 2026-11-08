import { lazy, Suspense } from "react"
import { LazyCheatSheet, LazyCommandPalette } from "./lazyOverlay"
import { ContentIndexErrorBanner } from "@/components/ui/ContentIndexErrorBanner"
import { useStore } from "@/store"

const TerminalOverlay = lazy(() =>
  import("@/features/terminal/TerminalOverlay").then((module) => ({ default: module.TerminalOverlay })),
)

function LazyTerminalOverlay() {
  const open = useStore((state) => state.isTerminalOpen)
  if (!open) return null
  return <Suspense fallback={null}><TerminalOverlay /></Suspense>
}

/**
 * Overlays available on every shell (garden / wiki / chat): the `?` keyboard
 * cheat sheet, command palette, shared terminal, and content-index failure
 * banner. Each self-gates on its store flag, so mounting them unconditionally
 * is free until invoked.
 */
export function GlobalOverlays() {
  return (
    <>
      <LazyCheatSheet />
      <LazyCommandPalette />
      <LazyTerminalOverlay />
      <ContentIndexErrorBanner />
    </>
  )
}
