import { useState } from "react"

interface HeadingItem {
  id: string
  text: string
  level: number
}

interface Props {
  headings: HeadingItem[]
  className: string
}

interface Section {
  heading: HeadingItem
  children: HeadingItem[]
}

function groupHeadings(headings: HeadingItem[]): Section[] {
  if (headings.length === 0) return []
  const minLevel = Math.min(...headings.map((h) => h.level))
  const sections: Section[] = []
  let current: Section | null = null

  for (const h of headings) {
    if (h.level === minLevel || !current) {
      current = { heading: h, children: [] }
      sections.push(current)
    } else {
      current.children.push(h)
    }
  }

  return sections
}

export function TableOfContents({ headings, className }: Props) {
  const [isMinimised, setIsMinimised] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  if (headings.length < 3) return null

  const sections = groupHeadings(headings)

  const toggleSection = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCollapsedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  return (
    <nav className={`${className} ${isMinimised ? "is-minimised" : ""}`} aria-label="Table of Contents">
      <div
        className="toc-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: isMinimised ? 0 : "var(--space-2)",
        }}
      >
        <span style={{ margin: 0, fontWeight: 600, fontSize: "1.05rem" }}>Contents</span>
        <button
          className="minimise-btn"
          onClick={() => setIsMinimised(!isMinimised)}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            fontFamily: "var(--font-code)",
            fontSize: "1.2rem",
            padding: "0 4px",
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "color 0.2s ease",
            marginLeft: "var(--space-2)",
          }}
          title={isMinimised ? "Expand table of contents" : "Minimise table of contents"}
          aria-expanded={!isMinimised}
        >
          {isMinimised ? "+" : "−"}
        </button>
      </div>

      {!isMinimised && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sections.map((sec) => {
            const hasChildren = sec.children.length > 0
            const isCollapsed = Boolean(collapsedSections[sec.heading.id])

            return (
              <li key={sec.heading.id} style={{ marginBottom: "var(--space-1)" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.25rem",
                  }}
                >
                  <a
                    href={`#${sec.heading.id}`}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {sec.heading.text}
                  </a>

                  {hasChildren && (
                    <button
                      type="button"
                      onClick={(e) => toggleSection(sec.heading.id, e)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-text-muted)",
                        cursor: "pointer",
                        fontFamily: "var(--font-code)",
                        fontSize: "0.75rem",
                        padding: "2px 4px",
                        lineHeight: 1,
                        borderRadius: "3px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.8,
                        transition: "opacity 0.15s ease, color 0.15s ease",
                      }}
                      title={isCollapsed ? `Expand ${sec.children.length} subheadings` : `Collapse ${sec.children.length} subheadings`}
                      aria-label={isCollapsed ? `Expand subsections for ${sec.heading.text}` : `Collapse subsections for ${sec.heading.text}`}
                      aria-expanded={!isCollapsed}
                    >
                      {isCollapsed ? "+" : "−"}
                    </button>
                  )}
                </div>

                {hasChildren && !isCollapsed && (
                  <ul
                    style={{
                      listStyle: "none",
                      paddingLeft: "14px",
                      margin: "var(--space-1) 0 0 0",
                      borderLeft: "1px solid var(--color-border-light, rgba(255, 255, 255, 0.1))",
                    }}
                  >
                    {sec.children.map((sub) => (
                      <li key={sub.id} style={{ marginBottom: "var(--space-1)" }}>
                        <a
                          href={`#${sub.id}`}
                          style={{
                            display: "block",
                            fontSize: "0.8em",
                            opacity: 0.85,
                          }}
                        >
                          {sub.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
