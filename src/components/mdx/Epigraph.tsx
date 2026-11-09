import { useLayoutEffect, useRef, type ReactNode } from "react"
import { hugText } from "@/lib/shrinkwrap"

interface Props {
  /** Attribution line, e.g. "— Borges, *Ficciones*". Rendered below the quote. */
  cite?: ReactNode
  children: ReactNode
}

/**
 * Gwern-style opening epigraph: a short quotation set apart before the prose
 * begins, with a right-aligned attribution. Essays only, opt-in from MDX:
 *
 *   <Epigraph cite="— Borges">The universe (which others call the Library)…</Epigraph>
 */
export function Epigraph({ cite, children }: Props) {
  // Even lines: the quote hugs the narrowest width that keeps its line count
  // (lib/shrinkwrap), so a two-line quote never strands one word.
  const box = useRef<HTMLDivElement>(null)
  const quote = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!box.current || !quote.current) return
    return hugText(box.current, quote.current)
  }, [children])

  return (
    <div className="epigraph" role="note" ref={box}>
      <div className="epigraph__quote" ref={quote}>{children}</div>
      {cite && <div className="epigraph__cite">{cite}</div>}
    </div>
  )
}
