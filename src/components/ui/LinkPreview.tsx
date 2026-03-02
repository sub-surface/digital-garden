import { useEffect, useRef, useState, useCallback } from "react"
import { parseMarkdown, type ParsedNote } from "@/lib/markdown"
import { useStore } from "@/store"
import { useTelescopicHandlers } from "./TelescopicHandler"

interface PreviewState {
  id: string // Unique ID for each preview instance
  visible: boolean
  expanded: boolean
  loading: boolean
  slug: string
  title: string
  excerpt: string
  richHtml: string
  leadImage: string
  animLine: string
  x: number
  y: number
  pos: "above" | "below"
  isFootnote?: boolean
  depth: number
}

const INITIAL_BASE: Omit<PreviewState, "id" | "depth"> = {
  visible: true,
  expanded: false,
  loading: false,
  slug: "",
  title: "",
  excerpt: "",
  richHtml: "",
  leadImage: "",
  animLine: "",
  x: 0,
  y: 0,
  pos: "below",
}

const DELAY = 400
const previewCache = new Map<string, ParsedNote>()

// ── Animation Snippets ──

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const LOADING_LABELS = ["indexing notes", "mapping links", "loading graph", "calibrating", "syncing state", "building index"]

async function* loadingBar(): AsyncGenerator<string, void, unknown> {
  const W = 15
  const label = LOADING_LABELS[Math.floor(Math.random() * LOADING_LABELS.length)]
  for (let i = 0; i <= W; i++) {
    const bar = "\u2588".repeat(i) + "\u2591".repeat(W - i)
    const pct = Math.round((i / W) * 100).toString().padStart(3)
    yield `${label} [${bar}] ${pct}%`
    await sleep(30)
  }
}

async function* asciiPulse(): AsyncGenerator<string, void, unknown> {
  const W = 24
  const frames = 8
  for (let f = 0; f <= frames; f++) {
    const t = f / frames
    const row = Array.from({ length: W }, (_, i) => {
      const x = (i / W - 0.5) * Math.PI * 4
      const y = Math.sin(x + t * Math.PI * 6) * (1 - t * 0.6)
      if (y > 0.5) return "\u2584"
      if (y > 0.1) return "\u2583"
      if (y > -0.1) return "\u2500"
      if (y > -0.5) return "\u2581"
      return " "
    }).join("")
    yield row
    await sleep(40)
  }
}

const SNIPPETS = [loadingBar, asciiPulse]

function extractSlug(href: string): string | null {
  try {
    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin) return null
    const path = decodeURIComponent(url.pathname).replace(/^\//, "")
    return path || null
  } catch {
    return null
  }
}

function computePosition(rect: DOMRect, isExpanded: boolean, depth: number): { x: number; y: number; pos: "above" | "below" } {
  const width = isExpanded ? 420 : 320
  const height = isExpanded ? 500 : 150 // Approximate heights
  const GAP = 12
  const PADDING = 16
  
  // Offset based on depth for a tiered look
  const offset = depth * 15
  let x = rect.left + rect.width / 2 - width / 2 + offset
  
  // Constrain X to viewport
  x = Math.max(PADDING, Math.min(x, window.innerWidth - width - PADDING))

  // Try below first
  let y = rect.bottom + GAP
  let pos: "above" | "below" = "below"
  
  // If it goes off screen bottom, show above
  if (y + height > window.innerHeight - PADDING) {
    y = rect.top - GAP - height
    pos = "above"
    
    // If it now goes off screen TOP, constrain to padding
    if (y < PADDING) {
      y = PADDING
    }
  }
  
  return { x, y, pos }
}

function extractPreview(html: string, maxWords: number): { truncatedHtml: string; firstImage: string } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  const img = doc.querySelector("img")
  const firstImage = img?.getAttribute("src") ?? ""
  const children = Array.from(doc.body.children)
  let wordCount = 0
  const parts: string[] = []
  const allowedTags = ["P", "UL", "OL", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "DIV"]

  for (const child of children) {
    if (!allowedTags.includes(child.tagName)) continue
    if (child.classList.contains("telescopic-controls")) continue
    const words = (child.textContent ?? "").split(/\s+/).filter(Boolean)
    wordCount += words.length
    parts.push(child.outerHTML)
    if (wordCount >= maxWords) break
  }
  return { truncatedHtml: parts.join(""), firstImage }
}

export function LinkPreview() {
  const [stack, setStack] = useState<PreviewState[]>([])
  const contentIndex = useStore((s) => s.contentIndex)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const currentSlug = useRef("")
  const abortControllers = useRef<Map<string, AbortController>>(new Map())

  const popTo = useCallback((depth: number) => {
    setStack(prev => {
      const newStack = prev.slice(0, depth)
      // Abort removed controllers
      prev.slice(depth).forEach(p => {
        abortControllers.current.get(p.id)?.abort()
        abortControllers.current.delete(p.id)
      })
      if (newStack.length === 0) currentSlug.current = ""
      else currentSlug.current = newStack[newStack.length - 1].slug
      return newStack
    })
  }, [])

  const pushPreview = useCallback((slug: string, isFootnote: boolean, anchor: HTMLAnchorElement) => {
    if (stack.some(p => p.slug === slug)) return

    const depth = stack.length
    const meta = contentIndex?.[slug]
    const rect = anchor.getBoundingClientRect()
    const { x, y, pos } = computePosition(rect, isFootnote, depth)
    const id = Math.random().toString(36).slice(2)

    const newState: PreviewState = {
      ...INITIAL_BASE,
      id,
      depth,
      slug,
      isFootnote,
      title: isFootnote ? `Footnote ${anchor.textContent}` : (meta?.title ?? slug.split("/").pop() ?? ""),
      excerpt: meta?.excerpt ?? "",
      x,
      y,
      pos,
    }

    if (isFootnote) {
      const href = anchor.getAttribute("href") ?? ""
      const fnId = href.startsWith("#") ? href.slice(1) : ""
      const container = anchor.closest(".mainPane, .contentScroll, .link-preview") ?? document
      const fnLi = container.querySelector(`#${CSS.escape(fnId)}`)
      if (fnLi) {
        const cloned = fnLi.cloneNode(true) as HTMLElement
        cloned.querySelectorAll("[data-footnote-backref]").forEach(el => el.remove())
        newState.richHtml = cloned.innerHTML
        newState.expanded = true
        // Re-calculate position with expanded height for footnote
        const { x: fx, y: fy, pos: fpos } = computePosition(rect, true, depth)
        newState.x = fx
        newState.y = fy
        newState.pos = fpos
      }
    }

    setStack(prev => [...prev, newState])
    currentSlug.current = slug
  }, [stack, contentIndex])

  const expand = useCallback(async (id: string) => {
    const preview = stack.find(p => p.id === id)
    if (!preview || preview.isFootnote || preview.expanded) return

    const ac = new AbortController()
    abortControllers.current.set(id, ac)

    // Find original anchor to re-position
    const anchor = document.querySelector(`a.internal-link[href$="/${preview.slug}"]`) as HTMLAnchorElement | null
    let nextPos = { x: preview.x, y: preview.y, pos: preview.pos }
    if (anchor) {
      const rect = anchor.getBoundingClientRect()
      nextPos = computePosition(rect, true, preview.depth)
    }

    setStack(prev => prev.map(p => p.id === id ? { 
      ...p, 
      loading: true, 
      expanded: true,
      x: nextPos.x,
      y: nextPos.y,
      pos: nextPos.pos
    } : p))

    try {
      let parsed = previewCache.get(preview.slug)
      if (!parsed) {
        const paths = [`/content/${preview.slug}.md`, `/content/${preview.slug}/index.md`]
        let source: string | null = null
        for (const p of paths) {
          const res = await fetch(p)
          if (res.ok) { source = await res.text(); break }
        }
        if (!source) return
        parsed = await parseMarkdown(source)
        previewCache.set(preview.slug, parsed)
      }

      const { truncatedHtml, firstImage } = extractPreview(parsed.html, 400)
      
      const snippet = SNIPPETS[Math.floor(Math.random() * SNIPPETS.length)]
      for await (const line of snippet()) {
        if (ac.signal.aborted) return
        setStack(prev => prev.map(p => p.id === id ? { ...p, animLine: line } : p))
      }
      
      setStack(prev => prev.map(p => p.id === id ? { 
        ...p, 
        loading: false, 
        richHtml: truncatedHtml, 
        leadImage: firstImage,
        animLine: "READY."
      } : p))
    } catch {
      setStack(prev => prev.map(p => p.id === id ? { ...p, loading: false } : p))
    }
  }, [stack])

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
        // If we moved to a parent preview, cull the children
        if (depth < stack.length - 1) {
          timer.current = setTimeout(() => popTo(depth + 1), DELAY)
        }
        return
      }

      const target = e.target as Element
      if (target.closest("a") && related?.closest("a") === target.closest("a")) return

      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        // If we're not over ANY preview or internal link, clear all
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
          onExpand={() => expand(p.id)} 
          onClose={() => popTo(p.depth)}
          onEnter={() => {
            clearTimeout(timer.current)
            currentSlug.current = p.slug
          }}
        />
      ))}
    </>
  )
}

function PreviewCard({ state, onExpand, onClose, onEnter }: { 
  state: PreviewState; 
  onExpand: () => void; 
  onClose: () => void;
  onEnter: () => void;
}) {
  const richRef = useRef<HTMLDivElement>(null)
  useTelescopicHandlers(richRef)

  return (
    <div
      className={`link-preview${state.expanded ? " link-preview--expanded" : ""}`}
      style={{ 
        left: state.x, 
        top: state.y, 
        zIndex: 1000 + state.depth,
        // Visual depth cue
        boxShadow: `0 ${4 + state.depth * 2}px ${12 + state.depth * 4}px rgba(0,0,0,0.2)`
      }}
      data-panel-ignore
      data-pos={state.pos}
      data-depth={state.depth}
      onMouseEnter={onEnter}
    >
      {state.expanded && state.animLine && (
        <div className="link-preview__terminal">{state.animLine}</div>
      )}

      {!state.expanded ? (
        <div className="link-preview__small">
          <h4 className="link-preview__title">{state.title}</h4>
          <p className="link-preview__excerpt">{state.excerpt}</p>
        </div>
      ) : (
        <>
          {state.loading ? (
            <div className="link-preview__excerpt" style={{ opacity: 0.5 }}>
              Retrieving territories...
            </div>
          ) : (
            <>
              {state.leadImage && (
                <img className="link-preview__image" src={state.leadImage} alt="" />
              )}
              {state.richHtml ? (
                <div
                  ref={richRef}
                  className="link-preview__rich"
                  dangerouslySetInnerHTML={{ __html: state.richHtml }}
                />
              ) : (
                <p className="link-preview__excerpt">{state.excerpt}</p>
              )}
            </>
          )}
        </>
      )}

      {!state.isFootnote && (
        <div className="link-preview__footer">
          <button 
            className="link-preview__expand-btn"
            onClick={(e) => {
              e.stopPropagation()
              if (state.expanded) onClose()
              else onExpand()
            }}
          >
            {state.expanded ? "CLOSE" : "EXPAND"}
          </button>
        </div>
      )}
    </div>
  )
}
