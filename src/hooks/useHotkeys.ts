import { useEffect } from "react"
import { useStore } from "@/store"
import { useMusic } from "@/components/ui/music/MusicContext"
import { useRandomNote } from "@/hooks/useRandomNote"
import { useShell } from "@/hooks/useShell"

/**
 * Global hotkey listener. Bindings are declared canonically in
 * `src/config/hotkeys.ts` (rendered by the `?` cheat sheet); this hook is the
 * dispatch half. Single-key shortcuts are suppressed while a text field is
 * focused or a modal overlay is open. Ctrl/Cmd+P owns the terminal;
 * Ctrl/Cmd+Shift+P keeps the older command palette available.
 */
export function useHotkeys() {
  const shell = useShell()
  const toggleThemePanel = useStore((s) => s.toggleThemePanel)
  const cycleBgMode = useStore((s) => s.cycleBgMode)
  const toggleCheatSheet = useStore((s) => s.toggleCheatSheet)
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette)
  const toggleTerminal = useStore((s) => s.toggleTerminal)
  const isSearchOpen = useStore((s) => s.isSearchOpen)
  const isCheatSheetOpen = useStore((s) => s.isCheatSheetOpen)
  const isCommandPaletteOpen = useStore((s) => s.isCommandPaletteOpen)
  const { togglePlay } = useMusic()
  const goRandom = useRandomNote()

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // The OS owns its keyboard surface. Letting these global bindings continue
      // underneath Desktop would cycle B twice and resurrect browser-level keys.
      if (shell === "os") return

      // Ctrl/Cmd+P — shared terminal. Handled first so it works from anywhere;
      // Shift keeps the older command palette available.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault()
        if (e.shiftKey) {
          useStore.getState().setTerminal(false)
          toggleCommandPalette()
        }
        else toggleTerminal()
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

      // Reader mode (main + wiki). Size/width keys only act while reading, and
      // never with a modifier — Ctrl/Cmd +/- must stay the browser's zoom.
      const readerShell = shell === "main" || shell === "wiki"
      if (readerShell && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const store = useStore.getState()
        const key = e.key
        if (key === "f" || key === "F") {
          e.preventDefault()
          store.toggleReaderMode()
          return
        }
        if (store.isReaderMode) {
          const action =
            key === "=" || key === "+" ? () => store.cycleReaderScale(1)
            : key === "-" || key === "_" ? () => store.cycleReaderScale(-1)
            : key === "]" ? () => store.cycleReaderMeasure(1)
            : key === "[" ? () => store.cycleReaderMeasure(-1)
            : null
          if (action) {
            e.preventDefault()
            action()
            return
          }
        }
      }

      switch (e.key.toLowerCase()) {
        case "/":
          e.preventDefault()
          useStore.getState().setSearchOpen(true)
          break
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
    toggleTerminal,
    togglePlay,
    goRandom,
    isSearchOpen,
    isCheatSheetOpen,
    isCommandPaletteOpen,
    shell,
  ])
}
