import { TableOfContents } from "./TableOfContents"

interface Props {
  children: React.ReactNode
  headings: { id: string; text: string; level: number }[]
  infobox?: React.ReactNode
  header?: React.ReactNode
}

export function ArticleLayout({ children, headings, infobox, header }: Props) {
  return (
    <div className="article-layout-wrapper" style={{ display: 'contents' }}>
      <div className="article-body">
        {header}
        <div className="body-side-group" style={{ float: 'right', clear: 'right', marginLeft: 'var(--space-8)', marginBottom: 'var(--space-6)', width: '300px' }}>
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
