interface Props {
  children: React.ReactNode
  headings: { id: string; text: string; level: number }[]
}

export function NoteLayout({ children, headings }: Props) {
  const minLevel =
    headings.length > 0 ? Math.min(...headings.map((h) => h.level)) : 2

  return (
    <div className="note-layout-wrapper">
      {headings.length >= 3 && (
        <nav className="toc">
          <h3>Contents</h3>
          <ul>
            {headings.map((h) => (
              <li
                key={h.id}
                style={{ paddingLeft: `${(h.level - minLevel) * 12}px` }}
              >
                <a href={`#${h.id}`}>{h.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {children}
    </div>
  )
}
