import { TableOfContents } from "./TableOfContents"
import { ReadingProgress } from "./ReadingProgress"

interface Props {
  children: React.ReactNode
  headings: { id: string; text: string; level: number }[]
  infobox?: React.ReactNode
  header?: React.ReactNode
}

export function ArticleLayout({ children, headings, infobox, header }: Props) {
  return (
    <div className="article-layout-wrapper" style={{ display: 'contents' }}>
      <ReadingProgress />
      <div className="article-body">
        {header}
        <div className="body-side-group">
          {infobox}
          <TableOfContents headings={headings} className="article-toc-inline" />
        </div>
        {children}
      </div>
      <aside className="article-sidenotes-group">
        {/* Sidenotes will be injected here by the rehype plugin via portals or CSS positioning */}
      </aside>
    </div>
  )
}
