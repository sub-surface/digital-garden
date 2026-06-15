import { useCallback, useEffect, useState } from "react"

/**
 * Pop the music player out into a floating, always-on-top window using the
 * Document Picture-in-Picture API (Chromium 116+).
 *
 * We do NOT relocate the existing DOM node (that breaks React's event
 * delegation — native events in the PiP document never reach the listeners on
 * the main-document root, so buttons go dead). Instead the hook just opens and
 * owns the PiP window and hands it back; the component renders its content into
 * it with `createPortal`, which preserves the React tree — context, state, and
 * handlers all keep working because React bubbles synthetic events through the
 * component tree, not the DOM tree.
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

// Copy the host document's stylesheets into the PiP window so portaled content
// renders identically. Inline rules are cloned; cross-origin sheets re-linked.
function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules).map((r) => r.cssText).join("")
      const style = target.document.createElement("style")
      style.textContent = rules
      target.document.head.appendChild(style)
    } catch {
      if (sheet.href) {
        const link = target.document.createElement("link")
        link.rel = "stylesheet"
        link.href = sheet.href
        target.document.head.appendChild(link)
      }
    }
  }
  // Carry over theme/accent attributes + the live accent custom properties.
  for (const attr of Array.from(document.documentElement.attributes)) {
    target.document.documentElement.setAttribute(attr.name, attr.value)
  }
  const root = getComputedStyle(document.documentElement)
  for (const v of ["--color-accent-base", "--color-primary", "--color-bg", "--color-text"]) {
    const val = root.getPropertyValue(v)
    if (val) target.document.documentElement.style.setProperty(v, val)
  }
  target.document.body.style.margin = "0"
}

export function usePopoutPlayer() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const pipSupported = typeof window !== "undefined" && !!getPiP()

  const popOut = useCallback(async () => {
    const pip = getPiP()
    if (!pip) return
    if (pip.window) { pip.window.close(); return }   // toggle off if already open
    const win = await pip.requestWindow({ width: 280, height: 460 })
    copyStyles(win)
    win.addEventListener("pagehide", () => setPipWindow(null), { once: true })
    setPipWindow(win)
  }, [])

  // Close the PiP window if the component unmounts while popped.
  useEffect(() => {
    return () => { getPiP()?.window?.close() }
  }, [])

  return { popOut, pipWindow, isPopped: !!pipWindow, pipSupported }
}
