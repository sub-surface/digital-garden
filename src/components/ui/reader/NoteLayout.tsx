import { TableOfContents } from "./TableOfContents"
import { useActiveHeading } from "./useActiveHeading"

interface Props {
  children: React.ReactNode
  headings: { id: string; text: string; level: number }[]
  infobox?: React.ReactNode
  header?: React.ReactNode
}

export function NoteLayout({ children, headings, infobox, header }: Props) {
  const active = useActiveHeading(headings)
  return (
    <div className="note-layout-wrapper" style={{ display: 'contents' }}>
      <div className="note-body">
        {header}
        <div className="body-side-group">
          {infobox}
          <TableOfContents headings={headings} variant="box" active={active} />
        </div>
        {children}
      </div>
    </div>
  )
}
