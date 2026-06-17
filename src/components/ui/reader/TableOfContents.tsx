import { useState } from "react"

interface Props {
  headings: { id: string; text: string; level: number }[]
  className: string
}

export function TableOfContents({ headings, className }: Props) {
  const [isMinimised, setIsMinimised] = useState(false)
  
  if (headings.length < 3) return null

  const minLevel = Math.min(...headings.map((h) => h.level))

  return (
    <nav className={`${className} ${isMinimised ? 'is-minimised' : ''}`}>
      <div className="toc-header" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: isMinimised ? 0 : 'var(--space-2)'
      }}>
        <span style={{ margin: 0, fontWeight: 600, fontSize: '1.05rem' }}>Contents</span>
        <button 
          className="minimise-btn" 
          onClick={() => setIsMinimised(!isMinimised)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            fontFamily: 'var(--font-code)',
            fontSize: '1.2rem',
            padding: '0 4px',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s ease',
            marginLeft: 'var(--space-2)'
          }}
          title={isMinimised ? "Expand" : "Minimise"}
        >
          {isMinimised ? "+" : "−"}
        </button>
      </div>
      {!isMinimised && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {headings.map((h) => (
            <li
              key={h.id}
              style={{ 
                paddingLeft: `${(h.level - minLevel) * 12}px`,
                marginBottom: 'var(--space-1)'
              }}
            >
              <a 
                href={`#${h.id}`}
                onClick={(e) => {
                  // Standard hash navigation works since we disabled interceptor
                  // but we could also add smooth scroll here if desired.
                }}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
