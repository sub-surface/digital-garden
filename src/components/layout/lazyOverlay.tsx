import { lazy, Suspense, useState, type ComponentType } from "react"
import { useStore } from "@/store"

type StoreState = ReturnType<typeof useStore.getState>

/**
 * An overlay whose code is downloaded the first time it opens.
 *
 * ThemePanel, MusicPlayer, Search, the command palette and the cheat sheet
 * were always mounted (each returning null while closed), so all of them sat
 * in the main chunk every visitor parses before anything is interactive.
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
export const LazySearchOverlay = lazyOverlay(
  (s) => s.isSearchOpen,
  () => import("@/components/ui/overlays/SearchOverlay").then((m) => m.SearchOverlay),
)
export const LazyCommandPalette = lazyOverlay(
  (s) => s.isCommandPaletteOpen,
  () => import("@/components/ui/overlays/CommandPalette").then((m) => m.CommandPalette),
)
export const LazyCheatSheet = lazyOverlay(
  (s) => s.isCheatSheetOpen,
  () => import("@/components/ui/overlays/KeyboardCheatSheet").then((m) => m.KeyboardCheatSheet),
)
