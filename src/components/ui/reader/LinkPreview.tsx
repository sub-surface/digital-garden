import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react"
import { useStore } from "@/store"
import { useNavigate } from "@tanstack/react-router"
import { useShell } from "@/hooks/useShell"
import { loadNote, type NoteData } from "@/lib/note-loader"
import type { NoteMetadata } from "@/types/content"

interface PreviewState {
  id: string
  slug: string
  title: string
  meta: string        // folder · date · reading time
  bodyHtml: string    // a slice of the built note HTML ("" while loading)
  loading: boolean
  missing: boolean
  image: string       // the note's image, if it has one
  x: number
  y?: number
  bottom?: number
  pos: "above" | "below" | "anchored"
  /** CSS anchor name on the hovered link, where anchor positioning exists. */
  anchorName?: string
  isFootnote?: boolean
  footnoteHtml?: string
  depth: number
}

const DELAY = 320       // hover-in delay before a preview opens
const HIDE_DELAY = 110  // grace period after leaving — just enough to reach the card
const MAX_DEPTH = 4
const PREVIEW_W = 340 // matches .link-preview's width in link-preview.scss
const PREVIEW_H = 200 // a guess at the card's height, used only without anchor positioning

// Where the browser supports CSS anchor positioning, it places the card against
// the link with the card's real size, flips it above when it won't fit below,
// and keeps it on the link while the page scrolls. computePosition() remains
// the fallback (it has to guess the height, so tall cards could clip).
const SUPPORTS_ANCHOR = typeof CSS !== "undefined" && !!CSS.supports?.("anchor-name: --a")

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
  isFootnote?: boolean,
): { x: number; y?: number; bottom?: number; pos: "above" | "below" } {
  const GAP = isFootnote ? 6 : 10
  const PADDING = 12
  const width = isFootnote ? 280 : PREVIEW_W
  const height = isFootnote ? 110 : PREVIEW_H

  // Cascade each depth level rightward so cards don't stack exactly
  const offset = depth * 20
  let x = rect.left + rect.width / 2 - width / 2 + offset
  x = Math.max(PADDING, Math.min(x, window.innerWidth - width - PADDING))

  if (isFootnote) {
    // Footnotes prefer rendering ABOVE the marker (matching the old system) if space permits
    if (rect.top - GAP - height > PADDING) {
      const bottom = Math.max(PADDING, window.innerHeight - rect.top + GAP)
      return { x, bottom, pos: "above" }
    }
    return { x, y: rect.bottom + GAP, pos: "below" }
  }

  // When showing above, add a line's height buffer (~26px) so the preview card
  // never overlays or obscures the link itself.
  const LINE_HEIGHT_BUFFER = 26

  if (rect.bottom + GAP + PREVIEW_H > window.innerHeight - PADDING) {
    // Anchor to the bottom of the viewport so the card expands upwards and
    // remains securely above the link by GAP + LINE_HEIGHT_BUFFER.
    const bottom = Math.max(PADDING, window.innerHeight - rect.top + GAP + LINE_HEIGHT_BUFFER)
    return { x, bottom, pos: "above" }
  }

  return { x, y: rect.bottom + GAP, pos: "below" }
}

/**
 * What a preview shows, read from the SAME built note JSON the reader renders
 * (lib/note-loader). It used to fetch the raw markdown and regex it into HTML
 * at runtime: no maths, broken sidenotes, a second renderer to keep in step.
 * Now the preview is a slice of the real note, and hovering a link warms the
 * cache, so clicking it opens instantly.
 */
interface PreviewBody {
  html: string
  image: string
  missing?: boolean
}

const PREVIEW_CHARS = 420
// Never in a preview: components, margin furniture, media, code blocks.
const STRIP = [
  "[data-island]", "aside", "input", "label", "figure", "img", "picture", "video", "audio",
  "iframe", "pre", "table", "hr", "script", "style", "sup", ".note-build-error", ".katex-display",
  ".telescopic", "[class*=callout]", "h1",
].join(",")

function sliceOf(nodes: Element[]): string {
  const out: string[] = []
  let chars = 0
  for (const node of nodes) {
    if (!/^(P|BLOCKQUOTE|UL|OL|H2|H3|H4)$/.test(node.tagName)) continue
    const text = (node.textContent ?? "").trim()
    if (!text) continue
    if (/^H[234]$/.test(node.tagName)) {
      if (out.length) break // stop at the next section
      continue
    }
    out.push(node.outerHTML)
    chars += text.length
    if (chars >= PREVIEW_CHARS) break
  }
  return out.join("")
}

function buildPreview(note: NoteData, anchor?: string): PreviewBody {
  const doc = new DOMParser().parseFromString(`<div id="root">${note.html}</div>`, "text/html")
  const root = doc.getElementById("root")!
  const image = typeof note.frontmatter.image === "string" ? note.frontmatter.image : root.querySelector("img")?.getAttribute("src") ?? ""
  root.querySelectorAll(STRIP).forEach((el) => el.remove())

  if (anchor) {
    const target = root.querySelector(`#${CSS.escape(anchor)}`)
    if (target) {
      const after: Element[] = []
      for (let el = target.nextElementSibling; el; el = el.nextElementSibling) after.push(el)
      const body = sliceOf(after)
      if (body) {
        // Built as a node, never by pasting text into a string: textContent
        // is decoded, so a heading reading "&lt;img onerror=…&gt;" would
        // become live markup.
        const label = doc.createElement("p")
        label.className = "link-preview__section"
        label.textContent = target.textContent ?? ""
        return { html: label.outerHTML + body, image: "" }
      }
    }
  }
  return { html: sliceOf(Array.from(root.children)), image: image.startsWith("http") || image.startsWith("/") ? image : "" }
}

async function fetchPreview(slug: string, anchor?: string): Promise<PreviewBody> {
  try {
    return buildPreview(await loadNote(slug), anchor)
  } catch {
    return { html: "", image: "", missing: true }
  }
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

function metaLine(meta: NoteMetadata | undefined): string {
  if (!meta) return ""
  const folder = meta.folder?.split("/").pop()?.replace(/-/g, " ")
  const date = meta.date && !Number.isNaN(Date.parse(meta.date)) ? DATE.format(new Date(meta.date)) : null
  return [folder, date, meta.readingTime ? `${meta.readingTime} min` : null].filter(Boolean).join(" · ")
}

export function LinkPreview() {
  const [stack, setStack] = useState<PreviewState[]>([])
  const contentIndex = useStore((s) => s.contentIndex)
  const pushCard = useStore((s) => s.pushCard)
  const shell = useShell()
  const navigate = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const currentSlug = useRef("")
  const highlightedSidenote = useRef<HTMLElement | null>(null)
  const anchors = useRef(new Map<string, HTMLElement>())

  // Take the anchor name off a link once its card has closed.
  useEffect(() => {
    const live = new Set(stack.map((p) => p.id))
    for (const [id, el] of anchors.current) {
      if (live.has(id)) continue
      el.style.removeProperty("anchor-name")
      anchors.current.delete(id)
    }
  }, [stack])

  const popTo = useCallback((depth: number) => {
    setStack(prev => {
      const newStack = prev.slice(0, depth)
      if (newStack.length === 0) currentSlug.current = ""
      else currentSlug.current = newStack[newStack.length - 1].slug
      return newStack
    })
  }, [])

  const pushPreview = useCallback((slug: string, isFootnote: boolean, anchor: HTMLAnchorElement, targetAnchor?: string) => {
    const previewKey = targetAnchor ? `${slug}#${targetAnchor}` : slug
    if (stack.some(p => p.slug === previewKey)) return
    const depth = stack.length
    if (depth >= MAX_DEPTH) return

    const meta = contentIndex?.[slug]
    const id = Math.random().toString(36).slice(2)
    let place: Pick<PreviewState, "x" | "y" | "bottom" | "pos" | "anchorName">
    if (SUPPORTS_ANCHOR) {
      const anchorName = `--lp-${id}`
      anchor.style.setProperty("anchor-name", anchorName)
      anchors.current.set(id, anchor)
      place = { x: 0, pos: "anchored", anchorName }
    } else {
      place = computePosition(anchor.getBoundingClientRect(), depth, isFootnote)
    }

    let footnoteHtml: string | undefined
    if (isFootnote) {
      const href = anchor.getAttribute("href") ?? ""
      const fnId = href.startsWith("#") ? href.slice(1) : (anchor.getAttribute("data-footnote-id") ?? "")
      const container = anchor.closest(".mainPane, .contentScroll, .link-preview") ?? document
      const fnLi = container.querySelector(`#${CSS.escape(fnId)}`)
      if (fnLi) {
        const cloned = fnLi.cloneNode(true) as HTMLElement
        cloned.querySelectorAll("[data-footnote-backref]").forEach(el => el.remove())
        footnoteHtml = cloned.innerHTML
      } else {
        const cleanId = fnId.replace(/^fn-/, "")
        const aside = container.querySelector(`#sn-aside-${CSS.escape(cleanId)}`) || document.getElementById(`sn-aside-${cleanId}`)
        if (aside) {
          footnoteHtml = aside.innerHTML
        }
      }
    }

    let localAnchorHtml: string | undefined
    if (targetAnchor) {
      const localEl = document.getElementById(targetAnchor)
      if (localEl) {
        const parentLi = localEl.closest("li") || localEl
        const cloned = parentLi.cloneNode(true) as HTMLElement
        localAnchorHtml = cloned.innerHTML.replace(/<span[^>]*id="[^"]*"[^>]*>/g, "").replace(/<\/span>/g, "")
      }
    }

    const willFetch = !isFootnote && !localAnchorHtml && !meta?.system
    const initial: PreviewState = {
      id, depth, slug: previewKey, isFootnote,
      footnoteHtml: footnoteHtml || localAnchorHtml,
      title: isFootnote ? `Footnote ${anchor.textContent}` : (meta?.title ?? slug.split("/").pop()?.replace(/-/g, " ") ?? ""),
      meta: isFootnote ? "" : metaLine(meta),
      bodyHtml: "",
      loading: willFetch,
      missing: false,
      image: "",
      ...place,
    }

    setStack(prev => [...prev, initial])
    currentSlug.current = previewKey

    // Synthesized system pages (games, shelves) have no note body to show.
    if (willFetch) {
      void fetchPreview(slug, targetAnchor).then(({ html, image, missing }) => {
        setStack(prev => prev.map(p =>
          p.id === id ? { ...p, bodyHtml: html, image, loading: false, missing: Boolean(missing) } : p
        ))
      })
    }
  }, [stack, contentIndex])

  useEffect(() => {
    // Hover-to-peek is a deliberate desktop-only affordance (ROADMAP §18): it
    // doesn't map to touch, and on touch devices the browser fires a synthetic
    // `mouseover` on first tap that would flash a preview card open a frame
    // before the tap navigates away. Gate the listeners on real hover capability
    // so touch devices simply navigate straight through — no half-behaviour.
    if (typeof window !== "undefined" &&
        !window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) {
      return
    }

    function handleOver(e: MouseEvent) {
      const target = e.target as Element
      const anchor = target.closest("a") as HTMLAnchorElement | null
      if (!anchor) return

      // Opt-out for links that aren't notes (e.g. arcade system-page entries),
      // where a body fetch only 404s and the preview card would be empty.
      if (anchor.hasAttribute("data-no-preview")) return

      const isInternal = anchor.classList.contains("internal-link")
      const isFootnote = anchor.hasAttribute("data-footnote-ref")

      // If it's a footnote reference, check if the corresponding Tufte sidenote is visible
      if (isFootnote) {
        const fnId = anchor.getAttribute("data-footnote-id") || (anchor.getAttribute("href") ?? "").replace(/^#fn-/, "")
        const cleanId = fnId.replace(/^fn-/, "")
        const sidenote = cleanId ? document.getElementById(`sn-aside-${cleanId}`) : null

        if (sidenote && getComputedStyle(sidenote).display !== "none" && sidenote.offsetParent !== null) {
          // On article pages with visible sidenotes in the margin: highlight the sidenote, no popup
          if (highlightedSidenote.current && highlightedSidenote.current !== sidenote) {
            highlightedSidenote.current.classList.remove("is-highlighted")
          }
          sidenote.classList.add("is-highlighted")
          highlightedSidenote.current = sidenote
          return
        }
      }

      // If we got here and there was a highlighted sidenote, unhighlight it
      if (highlightedSidenote.current) {
        highlightedSidenote.current.classList.remove("is-highlighted")
        highlightedSidenote.current = null
      }

      const targetAnchor = anchor.hash ? anchor.hash.slice(1) : undefined
      const baseSlug = isInternal ? extractSlug(anchor.href) : (isFootnote ? (anchor.getAttribute("href") ?? "").slice(1) : null)
      const previewKey = targetAnchor && baseSlug ? `${baseSlug}#${targetAnchor}` : baseSlug

      if (!baseSlug || !previewKey || previewKey === currentSlug.current) return

      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        pushPreview(baseSlug, isFootnote, anchor, targetAnchor)
      }, DELAY)
    }

    function handleOut(e: MouseEvent) {
      const related = e.relatedTarget as Element | null

      // Clean up highlighted sidenote when mouse leaves the footnote reference
      if (highlightedSidenote.current) {
        const target = e.target as Element
        const currentAnchor = target.closest("a")
        if (!related || !currentAnchor || !currentAnchor.contains(related)) {
          highlightedSidenote.current.classList.remove("is-highlighted")
          highlightedSidenote.current = null
        }
      }

      const toPreview = related?.closest(".link-preview")

      if (toPreview) {
        const depth = parseInt(toPreview.getAttribute("data-depth") || "0")
        clearTimeout(timer.current)
        if (depth < stack.length - 1) {
          timer.current = setTimeout(() => popTo(depth + 1), HIDE_DELAY)
        }
        return
      }

      const target = e.target as Element
      if (target.closest("a") && related?.closest("a") === target.closest("a")) return

      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        if (!currentSlug.current) return
        popTo(0)
      }, HIDE_DELAY)
    }

    document.addEventListener("mouseover", handleOver)
    document.addEventListener("mouseout", handleOut)
    return () => {
      document.removeEventListener("mouseover", handleOver)
      document.removeEventListener("mouseout", handleOut)
      clearTimeout(timer.current)
      if (highlightedSidenote.current) {
        highlightedSidenote.current.classList.remove("is-highlighted")
        highlightedSidenote.current = null
      }
    }
  }, [stack, pushPreview, popTo])

  return (
    <>
      {stack.map((p) => (
        <PreviewCard
          key={p.id}
          state={p}
          onOpen={() => {
            // The garden opens it beside the current note; the wiki has no panels.
            if (shell === "main") pushCard({ url: `/${p.slug}`, slug: p.slug, title: p.title, html: "" }, -1)
            else navigate({ to: "/$", params: { _splat: p.slug } })
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

/**
 * The card's placement under CSS anchor positioning. Previews open below the
 * link (footnotes above, nearer the marker) and flip to the other side when
 * they don't fit; horizontally they centre on the link, clamped to the
 * viewport, and cascade right with depth like the fallback.
 */
function anchoredStyle(state: PreviewState): CSSProperties {
  const w = state.isFootnote ? 280 : PREVIEW_W
  const gap = state.isFootnote ? 6 : 10
  const shift = w / 2 - state.depth * 20
  const style: Record<string, string | number> = {
    positionAnchor: state.anchorName!,
    left: `clamp(12px, calc(anchor(center) - ${shift}px), calc(100vw - ${w + 12}px))`,
    positionTryFallbacks: "flip-block",
    positionVisibility: "anchors-visible",
    margin: 0,
    maxHeight: `min(${state.isFootnote ? 260 : 380}px, calc(100dvh - 24px))`,
    zIndex: 1000 + state.depth,
  }
  if (state.isFootnote) Object.assign(style, { bottom: "anchor(top)", marginBottom: gap })
  else Object.assign(style, { top: "anchor(bottom)", marginTop: gap })
  return style as CSSProperties
}

function PreviewCard({ state, onOpen, onEnter }: {
  state: PreviewState
  onOpen: () => void
  onEnter: () => void
}) {
  const dims = useStore((s) => state.image ? s.imageDimensions?.[state.image] : undefined)
  const maxHeight = state.bottom && typeof window !== "undefined"
    ? Math.min(380, Math.max(160, window.innerHeight - state.bottom - 12))
    : 380

  return (
    <div
      className={`link-preview ${state.isFootnote ? "link-preview--footnote" : ""}`}
      style={state.anchorName ? anchoredStyle(state) : {
        left: state.x,
        top: state.y,
        bottom: state.bottom,
        maxHeight: state.isFootnote ? 260 : maxHeight,
        zIndex: 1000 + state.depth,
      }}
      data-panel-ignore
      data-pos={state.pos}
      data-depth={state.depth}
      onMouseEnter={onEnter}
    >
      {state.isFootnote || state.footnoteHtml ? (
        <div
          className="link-preview__rich"
          dangerouslySetInnerHTML={{ __html: state.footnoteHtml ?? "" }}
        />
      ) : (
        <>
          {state.image && (
            <div className="link-preview__image">
              <img src={state.image} alt="" width={dims?.width} height={dims?.height} onError={(e) => { (e.currentTarget.parentElement!).style.display = "none" }} />
            </div>
          )}
          <div className="link-preview__body">
            {state.meta && <div className="link-preview__meta">{state.meta}</div>}
            <div className="link-preview__title">{state.title}</div>
            {state.loading ? (
              <div className="link-preview__skeleton" aria-hidden="true"><i /><i /><i /></div>
            ) : state.bodyHtml ? (
              // A slice of the built note: already sanitised by the pipeline.
              <div className="link-preview__excerpt" dangerouslySetInnerHTML={{ __html: state.bodyHtml }} />
            ) : (
              <div className="link-preview__empty">{state.missing ? "This note couldn't be loaded." : "A page, not a note: open it to see."}</div>
            )}
            <button className="link-preview__open" onClick={(e) => { e.stopPropagation(); onOpen() }}>
              open beside <span aria-hidden="true">→</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
