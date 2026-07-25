import { useSyncExternalStore } from "react"
import { PHONE_BREAKPOINT } from "@/config/breakpoints"

// Module-level MediaQueryList, shared by every consumer. `matchMedia` only
// notifies listeners when the ${PHONE_BREAKPOINT}px boundary is actually
// crossed, unlike a `resize` listener (which fires on every pixel of drag and
// re-renders every consumer accordingly) — this is why AppShell's local
// `useIsMobile` used matchMedia instead of the resize-listener version this
// hook used to be. Collapsed into one implementation per ROADMAP §28.5.
const phoneQuery =
  typeof window !== "undefined"
    ? window.matchMedia(`(max-width: ${PHONE_BREAKPOINT}px)`)
    : null

/**
 * Reactive phone-viewport flag. SSR-safe: returns `false` when there is no
 * `window` (mirrors `isPhoneViewport()` in `src/config/breakpoints.ts`).
 */
export function usePhoneViewport(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      phoneQuery?.addEventListener("change", onChange)
      return () => phoneQuery?.removeEventListener("change", onChange)
    },
    () => phoneQuery?.matches ?? false,
    () => false,
  )
}
