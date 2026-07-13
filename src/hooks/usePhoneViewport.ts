import { useState, useEffect } from "react"
import { isPhoneViewport } from "@/config/breakpoints"

/**
 * Reactive phone-viewport flag. Wraps the identical `useState` + resize-listener
 * boilerplate that NoteFooter / LocalGraph each hand-rolled against a bare
 * `window.innerWidth <= 800` literal, and reads the shared `PHONE_BREAKPOINT`
 * (src/config/breakpoints.ts) so the number lives in exactly one place.
 */
export function usePhoneViewport(): boolean {
  const [isPhone, setIsPhone] = useState(isPhoneViewport)

  useEffect(() => {
    const onResize = () => setIsPhone(isPhoneViewport())
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return isPhone
}
