import { useCallback, useEffect, useRef, useState } from "react"
import { useStore } from "@/store"

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
 * NOTE: a PiP window is a dependent child of its opener tab. There is no web
 * API to keep it (or its audio) alive after the opener closes — closing the
 * main tab tears the PiP down with it. Persistence/resume + Media Session in
 * MusicContext cover the "feels continuous" need instead.
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

// Carry over theme/accent state into the PiP document so portaled content
// renders with the live palette. Called once at open and again whenever the
// accent/theme changes while popped.
function applyTheme(target: Window) {
  for (const attr of Array.from(document.documentElement.attributes)) {
    target.document.documentElement.setAttribute(attr.name, attr.value)
  }
  const root = getComputedStyle(document.documentElement)
  for (const v of ["--color-accent-base", "--color-primary", "--color-bg", "--color-text"]) {
    const val = root.getPropertyValue(v)
    if (val) target.document.documentElement.style.setProperty(v, val)
  }
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
  applyTheme(target)
  target.document.body.style.margin = "0"
}

export function usePopoutPlayer() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const pipSupported = typeof window !== "undefined" && !!getPiP()

  // Distinguish a window opened automatically (tab hidden) from one the user
  // popped out by hand — only auto-opened ones auto-close on return.
  const autoPoppedRef = useRef(false)

  const accentBase = useStore((s) => s.accentBase)
  const theme = useStore((s) => s.theme)

  const open = useCallback(async () => {
    const pip = getPiP()
    if (!pip || pip.window) return null   // unsupported or already open
    const win = await pip.requestWindow({ width: 300, height: 480 })
    copyStyles(win)
    win.addEventListener(
      "pagehide",
      () => { autoPoppedRef.current = false; setPipWindow(null) },
      { once: true },
    )
    setPipWindow(win)
    return win
  }, [])

  const popOut = useCallback(async () => {
    const pip = getPiP()
    if (!pip) return
    if (pip.window) { pip.window.close(); return }   // toggle off if already open
    autoPoppedRef.current = false
    await open()
  }, [open])

  // Live-sync the palette into the PiP window whenever the user changes accent
  // or theme while popped (styles were only a snapshot at open time).
  useEffect(() => {
    if (pipWindow) applyTheme(pipWindow)
  }, [pipWindow, accentBase, theme])

  // Close the PiP window if the component unmounts while popped.
  useEffect(() => {
    return () => { getPiP()?.window?.close() }
  }, [])

  return { popOut, open, pipWindow, isPopped: !!pipWindow, pipSupported, autoPoppedRef }
}
