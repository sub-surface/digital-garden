import { useState } from "react"
import { isPhoneViewport } from "@/config/breakpoints"

/**
 * The contents of a note or essay, in three forms (styles: src/styles/toc.scss):
 *
 *   "margin"  essays on wide screens: a quiet list in the right margin,
 *             level with the header (ArticleLayout places it), handing over
 *             to <TocRail> once you scroll past it.
 *   "box"     notes on desktop: a light box beside the opening prose.
 *   "line"    phones and narrow windows (and notes on phones): one folded
 *             line, "Contents · 7", that opens in place.
 *
 * Subsections are folded by default; the section you're reading (`active`,
 * from useActiveHeading) opens by itself unless you've folded it by hand.
 */

export interface HeadingItem {
  id: string
  text: string
  level: number
}

export interface Section {
  heading: HeadingItem
  children: HeadingItem[]
}

export function groupHeadings(headings: HeadingItem[]): Section[] {
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

/** Fewer headings than this and a note gets no contents at all. */
export const TOC_MIN = 3

interface Props {
  headings: HeadingItem[]
  variant: "margin" | "box" | "line"
  active?: string | null
  className?: string
}

export function TableOfContents({ headings, variant, active = null, className = "" }: Props) {
  const [folded, setFolded] = useState(
    () => variant === "line" || (variant === "box" && typeof window !== "undefined" && isPhoneViewport()),
  )
  // Hand-set open/closed per section; anything unset follows the reading position.
  const [manual, setManual] = useState<Record<string, boolean>>({})

  if (headings.length < TOC_MIN) return null
  const sections = groupHeadings(headings)
  const foldable = variant !== "margin"

  return (
    <nav className={`toc toc--${variant} ${className}`} data-folded={(foldable && folded) || undefined} aria-label="Contents">
      {foldable ? (
        <button type="button" className="toc__head" onClick={() => setFolded(!folded)} aria-expanded={!folded}>
          <span className="toc__label">Contents</span>
          <span className="toc__count">· {sections.length}</span>
          <span className="toc__chevron" aria-hidden="true">{folded ? "▾" : "▴"}</span>
        </button>
      ) : (
        <div className="toc__head">
          <span className="toc__label">Contents</span>
        </div>
      )}

      {/* Always rendered (hidden when folded) so CSS can fold it both ways. */}
      <ul className="toc__list" hidden={foldable && folded}>
        {sections.map((sec) => {
          const ids = [sec.heading.id, ...sec.children.map((c) => c.id)]
          const here = active != null && ids.includes(active)
          const open = sec.children.length > 0 && (manual[sec.heading.id] ?? here)
          return (
            <li key={sec.heading.id} className="toc__section" data-here={here || undefined}>
              <div className="toc__row">
                <a href={`#${sec.heading.id}`} className={active === sec.heading.id ? "active" : undefined}>
                  {sec.heading.text}
                </a>
                {sec.children.length > 0 && (
                  <button
                    type="button"
                    className="toc__twist"
                    onClick={(e) => {
                      e.preventDefault()
                      setManual((m) => ({ ...m, [sec.heading.id]: !open }))
                    }}
                    aria-expanded={open}
                    aria-label={`${open ? "Fold" : "Unfold"} ${sec.children.length} subsections of ${sec.heading.text}`}
                  >
                    {open ? "−" : "+"}
                  </button>
                )}
              </div>
              {sec.children.length > 0 && (
                <ul className="toc__subs" hidden={!open}>
                  {sec.children.map((sub) => (
                    <li key={sub.id}>
                      <a href={`#${sub.id}`} className={active === sub.id ? "active" : undefined}>{sub.text}</a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Once the margin contents have scrolled away: a slim rail of ticks in the
 * strip beyond the margin column (sidenotes never reach it), one per
 * section, the one you're in lit. Hover or focus it for the full list.
 */
export function TocRail({ headings, active, shown }: { headings: HeadingItem[]; active: string | null; shown: boolean }) {
  if (headings.length < TOC_MIN) return null
  const sections = groupHeadings(headings)
  return (
    <div className="toc-rail" data-shown={shown || undefined} aria-hidden={!shown}>
      <nav className="toc-rail__track" aria-label="Contents">
        <ul className="toc-rail__ticks">
          {sections.map((sec) => {
            const here = active != null && (active === sec.heading.id || sec.children.some((c) => c.id === active))
            return (
              <li key={sec.heading.id} data-here={here || undefined}>
                <a href={`#${sec.heading.id}`} tabIndex={shown ? 0 : -1}>
                  <span className="toc-rail__tick" aria-hidden="true" />
                  <span className="toc-rail__name">{sec.heading.text}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
