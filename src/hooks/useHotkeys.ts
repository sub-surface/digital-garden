import { useEffect } from "react"
import { useStore } from "@/store"
import { useMusic } from "@/components/ui/music/MusicContext"
import { useRandomNote } from "@/hooks/useRandomNote"

/**
 * Global hotkey listener. Bindings are declared canonically in
 * `src/config/hotkeys.ts` (rendered by the `?` cheat sheet); this hook is the
 * dispatch half. Single-key shortcuts are suppressed while a text field is
 * focused or a modal overlay is open. Modifier combos (Ctrl/Cmd+P) fire
 * regardless so they can toggle their own surface closed.
 */
export function useHotkeys() {
  const toggleThemePanel = useStore((s) => s.toggleThemePanel)
  const cycleBgMode = useStore((s) => s.cycleBgMode)
  const toggleCheatSheet = useStore((s) => s.toggleCheatSheet)
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette)
  const isSearchOpen = useStore((s) => s.isSearchOpen)
  const isCheatSheetOpen = useStore((s) => s.isCheatSheetOpen)
  const isCommandPaletteOpen = useStore((s) => s.isCommandPaletteOpen)
  const { togglePlay } = useMusic()
  const goRandom = useRandomNote()

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // Ctrl/Cmd+P — command palette. Handled first so it works from anywhere
      // (and so it can toggle itself closed). Overrides the browser print dialog.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault()
        toggleCommandPalette()
        return
      }

      // Beyond this point: single-key shortcuts only.
      // Don't trigger while typing in a field or when a modal owns the keyboard.
      const target = e.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return
      }
      if (isSearchOpen || isCommandPaletteOpen) return

      // `?` (Shift+/) — the cheat sheet. Allowed even while it's open (toggles).
      if (e.key === "?") {
        e.preventDefault()
        toggleCheatSheet()
        return
      }
      if (isCheatSheetOpen) return

      switch (e.key.toLowerCase()) {
        case "\\":
          e.preventDefault()
          toggleThemePanel()
          break
        case "b":
          e.preventDefault()
          cycleBgMode()
          break
        case "m":
          e.preventDefault()
          togglePlay()
          break
        case "r":
          e.preventDefault()
          goRandom()
          break
      }
    }

    document.addEventListener("keydown", handleKeydown)
    return () => {
      document.removeEventListener("keydown", handleKeydown)
    }
  }, [
    toggleThemePanel,
    cycleBgMode,
    toggleCheatSheet,
    toggleCommandPalette,
    togglePlay,
    goRandom,
    isSearchOpen,
    isCheatSheetOpen,
    isCommandPaletteOpen,
  ])
}
