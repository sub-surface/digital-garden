import { useEffect, useRef } from "react"

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

interface Options {
  /** Whether the trap is active (e.g. the overlay is open). */
  active: boolean
  /** Called when Escape is pressed inside the trap. */
  onEscape?: () => void
  /**
   * Focus this on activation instead of the first focusable child. Pass a ref
   * to e.g. a search input that should receive focus rather than a close button.
   */
  initialFocus?: React.RefObject<HTMLElement | null>
}

/**
 * Accessible focus trap for modal overlays. While `active`:
 * - remembers the element focused before opening and restores it on close,
 * - moves focus into the container (the `initialFocus` target, else the first
 *   focusable child, else the container itself),
 * - keeps Tab / Shift+Tab cycling within the container,
 * - calls `onEscape` on the Escape key.
 *
 * Returns a ref to attach to the overlay container.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>({
  active,
  onEscape,
  initialFocus,
}: Options) {
  const containerRef = useRef<T>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    // Remember what to restore focus to when the overlay closes.
    restoreRef.current = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )

    // Move focus in. Defer a tick so the overlay has painted (and any
    // autoFocus/initialFocus element is mounted).
    const focusId = window.setTimeout(() => {
      const target = initialFocus?.current ?? focusables()[0] ?? container
      target.focus()
    }, 10)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onEscape?.()
        return
      }
      if (e.key !== "Tab") return

      const items = focusables()
      if (items.length === 0) {
        // Nothing tabbable — keep focus on the container.
        e.preventDefault()
        container.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement

      // Wrap at the edges, and pull focus back in if it has escaped the trap.
      if (e.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (activeEl === last || !container.contains(activeEl))) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.clearTimeout(focusId)
      document.removeEventListener("keydown", onKeyDown, true)
      // Restore focus to the trigger, if it's still in the document.
      const restore = restoreRef.current
      if (restore && document.contains(restore)) restore.focus()
    }
  }, [active, onEscape, initialFocus])

  return containerRef
}
