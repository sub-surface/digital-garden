import { useEffect, useState } from "react"

/**
 * The heading you're reading: the last one above a line 30% down the page.
 *
 * Positions are measured once (and again when the article changes size), so
 * a scroll frame is just arithmetic: compare the scroll offset with the
 * cached heading offsets (binary search), no layout read. Scroll events are
 * coalesced to one check per frame. (An IntersectionObserver band was tried
 * first: it missed headings carried straight past it by a fast scroll or a
 * jump, and its stretched-band variant reported inconsistently.)
 *
 * The headings list can arrive before the note's HTML does, and the HTML can
 * be replaced (first paint, then the app's copy), so a MutationObserver
 * re-measures whenever a watched heading is missing or has left the page.
 */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    // overflow-x: hidden alone makes overflow-y compute to auto: only a box
    // whose content actually overflows is the scroller.
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

export function useActiveHeading(headings: { id: string }[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = headings.map((h) => h.id).join("|")

  useEffect(() => {
    if (!key) return
    const ids = key.split("|")
    let els: HTMLElement[] = []
    let laid: HTMLElement[] = []
    let tops: number[] = []
    let scroller: HTMLElement | null = null
    let view = 0
    let raf = 0
    let ro: ResizeObserver | null = null

    const check = () => {
      raf = 0
      if (!scroller || !tops.length) return
      const line = scroller.scrollTop + view * 0.3
      // Last heading whose top is at or above the line
      let lo = 0, hi = tops.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (tops[mid] <= line) lo = mid + 1
        else hi = mid
      }
      setActive(lo ? laid[lo - 1].id : null)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check) }

    const measure = () => {
      if (!scroller) return
      const base = scroller.getBoundingClientRect().top - scroller.scrollTop
      view = scroller.clientHeight
      // Headings with no layout (hidden labels) are left out; the rest in page order
      const pairs = els.filter((el) => el.offsetParent).map((el) => [el.getBoundingClientRect().top - base, el] as const)
      pairs.sort((a, b) => a[0] - b[0])
      tops = pairs.map((p) => p[0])
      laid = pairs.map((p) => p[1])
      check()
    }

    const setup = () => {
      els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
      scroller?.removeEventListener("scroll", onScroll)
      ro?.disconnect()
      if (!els.length) return
      scroller = scrollerOf(els[0])
      if (!scroller) return
      scroller.addEventListener("scroll", onScroll, { passive: true })
      // Content arriving (images, islands, fonts) moves the headings: re-measure.
      ro = new ResizeObserver(measure)
      ro.observe(els[0].parentElement ?? scroller)
      ro.observe(scroller)
      measure()
    }

    setup()
    // Re-run when headings are missing or replaced, or the page wasn't yet tall enough to scroll
    const stale = () => !scroller || els.length < ids.length || els.some((el) => !el.isConnected)
    const mo = new MutationObserver(() => { if (stale()) setup() })
    mo.observe(document.getElementById("main-content") ?? document.body, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      ro?.disconnect()
      scroller?.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [key])

  return active
}
