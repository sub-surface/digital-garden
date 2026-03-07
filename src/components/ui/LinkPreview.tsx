import { useEffect, useRef, useState, useCallback } from "react"
import { useStore } from "@/store"

interface PreviewState {
  id: string
  slug: string
  title: string
  excerpt: string
  body: string        // first ~300 chars of note body (plain text)
  bodyHtml: string    // body with wikilinks rendered as <a> tags
  image: string       // first image URL found in the note, or ""
  tags: string[]
  x: number
  y: number
  pos: "above" | "below"
  isFootnote?: boolean
  footnoteHtml?: string
  depth: number
}

const DELAY = 350
const MAX_DEPTH = 4
const PREVIEW_W = 300
const PREVIEW_H = 200

function extractSlug(href: string): string | null {
  try {
    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin) return null
    const p = decodeURIComponent(url.pathname).replace(/^\//, "")
    return p || null
  } catch {
    return null
  }
}

function computePosition(
  rect: DOMRect,
  depth: number,
): { x: number; y: number; pos: "above" | "below" } {
  const GAP = 10
  const PADDING = 12
  // Cascade each depth level rightward so cards don't stack exactly
  const offset = depth * 20
  let x = rect.left + rect.width / 2 - PREVIEW_W / 2 + offset
  x = Math.max(PADDING, Math.min(x, window.innerWidth - PREVIEW_W - PADDING))

  let y = rect.bottom + GAP
  let pos: "above" | "below" = "below"

  if (y + PREVIEW_H > window.innerHeight - PADDING) {
    y = rect.top - GAP - PREVIEW_H
    pos = "above"
    if (y < PADDING) y = PADDING
  }

  return { x, y, pos }
}

// Extract the first image URL (external http or internal /content/) from markdown
function extractFirstImage(md: string): string {
  // Strip frontmatter first
  const body = md.replace(/^---[\s\S]*?---\n?/, "")
  // External image: ![alt](url)
  const extMatch = body.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/)
  if (extMatch) return extMatch[1]
  // Internal wikilink image: ![[filename.ext]]
  const wikiMatch = body.match(/!\[\[([^\]]+\.(png|jpe?g|gif|webp|svg))\]\]/i)
  if (wikiMatch) return `/content/Media/${wikiMatch[1]}`
  // Internal markdown image: ![alt](/content/... or relative)
  const intMatch = body.match(/!\[[^\]]*\]\(([^)]+\.(png|jpe?g|gif|webp|svg))\)/i)
  if (intMatch) return intMatch[1].startsWith("http") ? intMatch[1] : `/content/${intMatch[1]}`
  return ""
}

// Convert markdown body to HTML with wikilinks/md-links as <a> tags, strip other formatting
function mdToBodyHtml(md: string): string {
  return md
    .replace(/^---[\s\S]*?---\n?/, "")          // frontmatter
    .replace(/!\[\[[^\]]*\]\]/g, "")             // note embeds (not images)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")        // inline images
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
      const label = alias || target
      const href = "/" + target.replace(/\s+/g, "-")
      return `<a href="${href}" class="internal-link">${label}</a>`
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" class="external-link" target="_blank" rel="noopener">$1</a>')
    .replace(/\[([^\]]+)\]\(\/([^)]+)\)/g, '<a href="/$2" class="internal-link">$1</a>')
    .replace(/^#{1,6}\s+(.+)$/gm, "<strong>$1</strong>")  // headings → bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^>\s+(.+)$/gm, "<span class=\"preview-quote\">$1</span>")
    .replace(/[_~]/g, "")
    .replace(/\n{2,}/g, " · ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400)
}

// Plain text fallback (for excerpt field)
function mdToPlain(md: string): string {
  return md
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, a) => a || t)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`~>]/g, "")
    .replace(/\n{2,}/g, " · ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320)
}

interface FetchedBody { plain: string; html: string; image: string }
const bodyCache = new Map<string, FetchedBody>()

async function fetchBody(slug: string, contentPath?: string): Promise<FetchedBody> {
  if (bodyCache.has(slug)) return bodyCache.get(slug)!
  const paths = contentPath
    ? [`/content/${contentPath}`]
    : [`/content/${slug}.md`, `/content/${slug}.mdx`, `/content/${slug}/index.md`]
  for (const p of paths) {
    try {
      const res = await fetch(p)
      if (res.ok && !res.headers.get("content-type")?.includes("text/html")) {
        const text = await res.text()
        const result: FetchedBody = {
          plain: mdToPlain(text),
          html: mdToBodyHtml(text),
          image: extractFirstImage(text),
        }
        bodyCache.set(slug, result)
        return result
      }
    } catch { /* ignore */ }
  }
  return { plain: "", html: "", image: "" }
}

export function LinkPreview() {
  const [stack, setStack] = useState<PreviewState[]>([])
  const contentIndex = useStore((s) => s.contentIndex)
  const pushCard = useStore((s) => s.pushCard)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const currentSlug = useRef("")

  const popTo = useCallback((depth: number) => {
    setStack(prev => {
      const newStack = prev.slice(0, depth)
      if (newStack.length === 0) currentSlug.current = ""
      else currentSlug.current = newStack[newStack.length - 1].slug
      return newStack
    })
  }, [])

  const pushPreview = useCallback((slug: string, isFootnote: boolean, anchor: HTMLAnchorElement) => {
    if (stack.some(p => p.slug === slug)) return
    const depth = stack.length
    if (depth >= MAX_DEPTH) return

    const meta = contentIndex?.[slug]
    const rect = anchor.getBoundingClientRect()
    const { x, y, pos } = computePosition(rect, depth)
    const id = Math.random().toString(36).slice(2)

    let footnoteHtml: string | undefined
    if (isFootnote) {
      const href = anchor.getAttribute("href") ?? ""
      const fnId = href.startsWith("#") ? href.slice(1) : ""
      const container = anchor.closest(".mainPane, .contentScroll, .link-preview") ?? document
      const fnLi = container.querySelector(`#${CSS.escape(fnId)}`)
      if (fnLi) {
        const cloned = fnLi.cloneNode(true) as HTMLElement
        cloned.querySelectorAll("[data-footnote-backref]").forEach(el => el.remove())
        footnoteHtml = cloned.innerHTML
      }
    }

    const initial: PreviewState = {
      id, depth, slug, isFootnote, footnoteHtml,
      title: isFootnote ? `Footnote ${anchor.textContent}` : (meta?.title ?? slug.split("/").pop() ?? ""),
      excerpt: meta?.excerpt ?? "",
      body: "",
      bodyHtml: "",
      image: "",
      tags: meta?.tags ?? [],
      x, y, pos,
    }

    setStack(prev => [...prev, initial])
    currentSlug.current = slug

    // Fetch body content async and patch state
    if (!isFootnote) {
      fetchBody(slug, meta?.contentPath).then(({ plain, html, image }) => {
        setStack(prev => prev.map(p =>
          p.id === id ? { ...p, body: plain, bodyHtml: html, image } : p
        ))
      })
    }
  }, [stack, contentIndex])

  useEffect(() => {
    function handleOver(e: MouseEvent) {
      const target = e.target as Element
      const anchor = target.closest("a") as HTMLAnchorElement | null
      if (!anchor) return

      const isInternal = anchor.classList.contains("internal-link")
      const isFootnote = anchor.hasAttribute("data-footnote-ref")
      const slug = isInternal ? extractSlug(anchor.href) : (isFootnote ? (anchor.getAttribute("href") ?? "").slice(1) : null)

      if (!slug || slug === currentSlug.current) return

      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        pushPreview(slug, isFootnote, anchor)
      }, DELAY)
    }

    function handleOut(e: MouseEvent) {
      const related = e.relatedTarget as Element | null
      const toPreview = related?.closest(".link-preview")

      if (toPreview) {
        const depth = parseInt(toPreview.getAttribute("data-depth") || "0")
        clearTimeout(timer.current)
        if (depth < stack.length - 1) {
          timer.current = setTimeout(() => popTo(depth + 1), DELAY)
        }
        return
      }

      const target = e.target as Element
      if (target.closest("a") && related?.closest("a") === target.closest("a")) return

      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        if (!currentSlug.current) return
        popTo(0)
      }, DELAY)
    }

    document.addEventListener("mouseover", handleOver)
    document.addEventListener("mouseout", handleOut)
    return () => {
      document.removeEventListener("mouseover", handleOver)
      document.removeEventListener("mouseout", handleOut)
      clearTimeout(timer.current)
    }
  }, [stack, pushPreview, popTo])

  return (
    <>
      {stack.map((p) => (
        <PreviewCard
          key={p.id}
          state={p}
          onOpen={() => {
            pushCard({ url: `/${p.slug}`, slug: p.slug, title: p.title, html: "" }, -1)
            popTo(0)
          }}
          onEnter={() => {
            clearTimeout(timer.current)
            currentSlug.current = p.slug
          }}
        />
      ))}
    </>
  )
}

function PreviewCard({ state, onOpen, onEnter }: {
  state: PreviewState
  onOpen: () => void
  onEnter: () => void
}) {
  return (
    <div
      className="link-preview"
      style={{
        left: state.x,
        top: state.y,
        zIndex: 1000 + state.depth,
        boxShadow: `0 ${4 + state.depth * 2}px ${12 + state.depth * 4}px rgba(0,0,0,0.25)`
      }}
      data-panel-ignore
      data-pos={state.pos}
      data-depth={state.depth}
      onMouseEnter={onEnter}
    >
      {state.isFootnote && state.footnoteHtml ? (
        <div
          className="link-preview__rich"
          dangerouslySetInnerHTML={{ __html: state.footnoteHtml }}
        />
      ) : (
        <>
          {state.image && (
            <div className="link-preview__image">
              <img src={state.image} alt="" onError={(e) => { (e.currentTarget.parentElement!).style.display = "none" }} />
            </div>
          )}
          <div className="link-preview__body">
            <h4 className="link-preview__title">{state.title}</h4>
            {state.bodyHtml ? (
              <p className="link-preview__excerpt" dangerouslySetInnerHTML={{ __html: state.bodyHtml }} />
            ) : state.excerpt ? (
              <p className="link-preview__excerpt">{state.excerpt}</p>
            ) : null}
            {state.tags.length > 0 && (
              <div className="link-preview__tags">
                {state.tags.map(t => (
                  <a key={t} href={`/tags/${t}`} className="tag-pill">#{t}</a>
                ))}
              </div>
            )}
            <div className="link-preview__footer">
              <button
                className="link-preview__expand-btn"
                onClick={(e) => { e.stopPropagation(); onOpen() }}
              >
                OPEN →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
