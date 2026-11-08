import { lazy, Suspense, useState, type ComponentType } from "react"
import { useStore } from "@/store"

type StoreState = ReturnType<typeof useStore.getState>

/**
 * An overlay whose code is downloaded the first time it opens.
 *
 * ThemePanel, MusicPlayer and the dock's predecessors were always mounted
 * (each returning null while closed), so all of them sat in the main chunk
 * every visitor parses before anything is interactive.
 * Once opened, the overlay stays mounted, so its own close animation and
 * internal state behave exactly as before.
 */
export function lazyOverlay(
  isOpen: (state: StoreState) => boolean,
  load: () => Promise<ComponentType>,
): ComponentType {
  const Component = lazy(() => load().then((component) => ({ default: component })))
  return function LazyOverlay() {
    const open = useStore(isOpen)
    const [wanted, setWanted] = useState(open)
    if (open && !wanted) setWanted(true) // render-phase update: fine for a latch
    if (!wanted) return null
    return (
      <Suspense fallback={null}>
        <Component />
      </Suspense>
    )
  }
}

export const LazyThemePanel = lazyOverlay(
  (s) => s.isThemePanelOpen,
  () => import("./ThemePanel").then((m) => m.ThemePanel),
)
export const LazyMusicPlayer = lazyOverlay(
  (s) => s.isMusicExpanded,
  () => import("@/components/ui/music/MusicPlayer").then((m) => m.MusicPlayer),
)
export const LazyDock = lazyOverlay(
  (s) => s.dock !== null,
  () => import("@/features/dock/Dock").then((m) => m.Dock),
)
