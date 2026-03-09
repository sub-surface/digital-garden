import { useEffect } from "react"
import { useStore } from "@/store"
import { useMusic } from "@/components/ui/MusicContext"

/**
 * Global hotkey listener for:
 * - \ (backslash) to open theme menu
 * - b to change background
 * - m to play/pause music
 * All hotkeys are disabled while search is open.
 */
export function useHotkeys() {
  const toggleThemePanel = useStore((s) => s.toggleThemePanel)
  const cycleBgMode = useStore((s) => s.cycleBgMode)
  const isSearchOpen = useStore((s) => s.isSearchOpen)
  const { togglePlay } = useMusic()

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // Don't trigger if search is open
      if (isSearchOpen) return

      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return
      }

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
      }
    }

    document.addEventListener("keydown", handleKeydown)
    return () => {
      document.removeEventListener("keydown", handleKeydown)
    }
  }, [toggleThemePanel, cycleBgMode, togglePlay, isSearchOpen])
}
