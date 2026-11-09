import { useEffect, useRef, useState } from "react"
import { TableOfContents, TocRail } from "./TableOfContents"
import { ReadingProgress } from "./ReadingProgress"
import { useActiveHeading } from "./useActiveHeading"

interface Props {
  children: React.ReactNode
  headings: { id: string; text: string; level: number }[]
  infobox?: React.ReactNode
  header?: React.ReactNode
}

/**
 * Contents on wide screens live in the right margin, the way the sidenotes
 * do, but never at their expense: the margin list sits level with the header
 * (where no sidenote can be), capped to the room above the first sidenote,
 * and hands over to a slim rail beyond the margin once it scrolls out of
 * view. Narrow windows get the folded line instead (CSS picks; toc.scss).
 * StaticArticle mirrors this markup for the first paint.
 */
export function ArticleLayout({ children, headings, infobox, header }: Props) {
  const active = useActiveHeading(headings)
  const body = useRef<HTMLDivElement>(null)
  const margin = useRef<HTMLDivElement>(null)
  const [marginGone, setMarginGone] = useState(false)
  const [crowded, setCrowded] = useState(false)

  // The rail appears once the margin list is out of view.
  useEffect(() => {
    const el = margin.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(([e]) => setMarginGone(!e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [headings.length])

  // Room in the margin above the first sidenote, and its left edge (the list
  // shares it). Measured when the article changes size (content arriving,
  // fonts, resize), never on scroll.
  useEffect(() => {
    const b = body.current, m = margin.current
    if (!b || !m || typeof ResizeObserver === "undefined") return
    const measure = () => {
      const first = b.querySelector<HTMLElement>("aside.sidenote")
      const br = b.getBoundingClientRect()
      const fr = first && first.offsetParent ? first.getBoundingClientRect() : null
      const room = fr ? fr.top - br.top - 24 : Infinity
      m.style.maxHeight = Number.isFinite(room) ? `${Math.max(0, room)}px` : ""
      // Share the sidenotes' left edge, wherever the content put them
      m.style.left = fr ? `${fr.left - br.left}px` : ""
      setCrowded(room < 110)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(b)
    return () => ro.disconnect()
  }, [headings.length])

  return (
    <div className="article-layout-wrapper" style={{ display: "contents" }}>
      <ReadingProgress />
      <div className="article-body" ref={body}>
        <div className="toc-margin" ref={margin} data-crowded={crowded || undefined}>
          <TableOfContents headings={headings} variant="margin" active={active} />
        </div>
        <TocRail headings={headings} active={active} shown={marginGone || crowded} />
        {header}
        <div className="body-side-group">
          {infobox}
          <TableOfContents headings={headings} variant="line" active={active} className="toc--narrow-only" />
        </div>
        {children}
      </div>
    </div>
  )
}
