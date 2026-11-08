import { useEffect } from "react"
import { useStore } from "@/store"
import { useMusic } from "@/components/ui/music/MusicContext"
import { useRandomNote } from "@/hooks/useRandomNote"
import { useShell } from "@/hooks/useShell"

/**
 * Global hotkey listener. Bindings are declared canonically in
 * `src/config/hotkeys.ts` (listed by the prompt's `keys` command); this hook
 * is the dispatch half. Single-key shortcuts are suppressed while a text field
 * is focused. Ctrl/Cmd+P and Ctrl/Cmd+K both open the dock's prompt.
 */
export function useHotkeys() {
  const shell = useShell()
  const { togglePlay } = useMusic()
  const goRandom = useRandomNote()

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // The OS owns its keyboard surface. Letting these global bindings continue
      // underneath Desktop would cycle B twice and resurrect browser-level keys.
      if (shell === "os") return
      const store = useStore.getState()

      // Ctrl/Cmd+P or K — the prompt, from anywhere (even inside a field).
      // Pressed again while the prompt is up, it closes.
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === "p" || key === "k")) {
        e.preventDefault()
        store.toggleDock("prompt")
        return
      }

      // Esc closes the dock from anywhere outside it (inside, the prompt
      // clears its input first and handles Esc itself).
      if (e.key === "Escape" && store.dock && !e.defaultPrevented) {
        const dock = document.querySelector('aside[aria-label="Dock"]')
        if (!dock?.contains(e.target as Node)) store.closeDock()
        return
      }

      // Beyond this point: single-key shortcuts only.
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) {
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === "?") {
        e.preventDefault()
        store.openDock("prompt", { run: "keys" })
        return
      }
      if (e.key === "/") {
        e.preventDefault()
        store.openDock("prompt", { input: "" })
        return
      }

      // Reader mode (main + wiki). Size/width keys only act while reading.
      const readerShell = shell === "main" || shell === "wiki"
      if (readerShell) {
        if (key === "f") {
          e.preventDefault()
          store.toggleReaderMode()
          return
        }
        if (store.isReaderMode) {
          const action =
            e.key === "=" || e.key === "+" ? () => store.cycleReaderScale(1)
            : e.key === "-" || e.key === "_" ? () => store.cycleReaderScale(-1)
            : e.key === "]" ? () => store.cycleReaderMeasure(1)
            : e.key === "[" ? () => store.cycleReaderMeasure(-1)
            : null
          if (action) {
            e.preventDefault()
            action()
            return
          }
        }
      }

      switch (key) {
        case "\\":
          e.preventDefault()
          store.toggleThemePanel()
          break
        case "b":
          e.preventDefault()
          store.cycleBgMode()
          break
        case "m":
          e.preventDefault()
          togglePlay()
          break
        case "r":
          e.preventDefault()
          goRandom()
          break
        case "c":
          if ((shell === "main" || shell === "wiki") && store.activeLayout !== "game") {
            e.preventDefault()
            store.toggleDock("chat")
          }
          break
      }
    }

    document.addEventListener("keydown", handleKeydown)
    return () => document.removeEventListener("keydown", handleKeydown)
  }, [togglePlay, goRandom, shell])
}
