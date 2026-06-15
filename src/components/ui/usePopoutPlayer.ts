import { useCallback, useEffect, useState } from "react"

/**
 * Pop the music player out into a floating, always-on-top window using the
 * Document Picture-in-Picture API (Chromium 116+). The player's DOM is *moved*
 * into the PiP window — not duplicated — so the audio element (which lives in
 * MusicProvider, outside this subtree) keeps playing uninterrupted and all the
 * existing React state/handlers continue to work across the window boundary.
 *
 * On unsupported browsers `pipSupported` is false and the UI hides the button.
 */

interface DocumentPiP {
  requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window>
  window: Window | null
}

function getPiP(): DocumentPiP | null {
  return (window as unknown as { documentPictureInPicture?: DocumentPiP })
    .documentPictureInPicture ?? null
}

// Copy the host document's stylesheets into the PiP window so the moved DOM
// renders identically. Inline <style> and same-origin <link> sheets both handled.
function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules).map((r) => r.cssText).join("")
      const style = target.document.createElement("style")
      style.textContent = rules
      target.document.head.appendChild(style)
    } catch {
      // Cross-origin sheet: re-link it instead of reading rules.
      if (sheet.href) {
        const link = target.document.createElement("link")
        link.rel = "stylesheet"
        link.href = sheet.href
        target.document.head.appendChild(link)
      }
    }
  }
  // Carry over theme/accent attributes set on <html>.
  for (const attr of Array.from(document.documentElement.attributes)) {
    target.document.documentElement.setAttribute(attr.name, attr.value)
  }
  // Mirror the accent/theme CSS custom properties from the live :root.
  const root = getComputedStyle(document.documentElement)
  const carry = ["--color-accent-base", "--color-primary", "--color-bg", "--color-text"]
  for (const v of carry) {
    const val = root.getPropertyValue(v)
    if (val) target.document.documentElement.style.setProperty(v, val)
  }
  target.document.body.style.margin = "0"
  target.document.body.style.background = "transparent"
}

export function usePopoutPlayer(panelRef: React.RefObject<HTMLElement | null>) {
  const [isPopped, setIsPopped] = useState(false)
  const pipSupported = typeof window !== "undefined" && !!getPiP()

  const popOut = useCallback(async () => {
    const pip = getPiP()
    const panel = panelRef.current
    if (!pip || !panel) return
    if (pip.window) {
      // already open → focus / close toggle
      pip.window.close()
      return
    }
    const pipWin = await pip.requestWindow({ width: 280, height: 440 })
    copyStyles(pipWin)
    // remember where the panel was, then move it into the PiP window
    const placeholder = document.createComment("music-player-popout")
    panel.parentNode?.insertBefore(placeholder, panel)
    pipWin.document.body.appendChild(panel)
    setIsPopped(true)

    const restore = () => {
      placeholder.parentNode?.insertBefore(panel, placeholder)
      placeholder.remove()
      setIsPopped(false)
    }
    pipWin.addEventListener("pagehide", restore, { once: true })
  }, [panelRef])

  // Safety: if the component unmounts while popped, close the PiP window.
  useEffect(() => {
    return () => {
      const pip = getPiP()
      if (pip?.window) pip.window.close()
    }
  }, [])

  return { popOut, isPopped, pipSupported }
}
