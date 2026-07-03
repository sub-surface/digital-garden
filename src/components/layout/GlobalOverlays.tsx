import { KeyboardCheatSheet } from "@/components/ui/overlays/KeyboardCheatSheet"
import { CommandPalette } from "@/components/ui/overlays/CommandPalette"
import { ContentIndexErrorBanner } from "@/components/ui/ContentIndexErrorBanner"

/**
 * Overlays available on every shell (garden / wiki / chat): the `?` keyboard
 * cheat sheet, the Ctrl/Cmd+P command palette, and the content-index failure
 * banner. Each self-gates on its store flag, so mounting them unconditionally
 * is free until invoked.
 */
export function GlobalOverlays() {
  return (
    <>
      <KeyboardCheatSheet />
      <CommandPalette />
      <ContentIndexErrorBanner />
    </>
  )
}
