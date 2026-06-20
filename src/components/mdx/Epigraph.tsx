import type { ReactNode } from "react"

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
  return (
    <div className="epigraph" role="note">
      <div className="epigraph__quote">{children}</div>
      {cite && <div className="epigraph__cite">{cite}</div>}
    </div>
  )
}
