import { useEffect, useRef, useState } from "react"

/**
 * A number that eases toward `target` instead of jumping (ease-out cubic over
 * `ms`), for score readouts. Snaps straight there under reduced motion, or when
 * the page is hidden (no frames would run anyway).
 */
export function useTween(target: number, ms = 450): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  const shownRef = useRef(target)
  shownRef.current = shown

  useEffect(() => {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce || document.hidden || shownRef.current === target) { setShown(target); return }
    from.current = shownRef.current
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      const e = 1 - (1 - k) ** 3
      setShown(from.current + (target - from.current) * e)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])

  return shown
}
