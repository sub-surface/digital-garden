import { TableOfContents } from "./TableOfContents"

interface Props {
  children: React.ReactNode
  headings: { id: string; text: string; level: number }[]
  infobox?: React.ReactNode
  header?: React.ReactNode
}

export function NoteLayout({ children, headings, infobox, header }: Props) {
  return (
    <div className="note-layout-wrapper" style={{ display: 'contents' }}>
      <div className="note-body">
        {header}
        <div className="body-side-group">
          {infobox}
          <TableOfContents headings={headings} className="toc-inline" />
        </div>
        {children}
      </div>
    </div>
  )
}
