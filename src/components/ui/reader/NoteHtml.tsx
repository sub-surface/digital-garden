import React, { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { mdxComponents } from "@/components/mdx/MDXProvider"
import { ImageLightbox } from "./ImageLightbox"
import { ErrorBoundary } from "../ErrorBoundary"

/**
 * Renders a note's static HTML and hydrates only its islands.
 *
 * The body is set once as plain HTML (from THE note pipeline). Each
 * `<div data-island="Name" data-props='…'>` placeholder is then filled by a
 * React portal, so islands live inside this component's tree (store, music,
 * router contexts all work) while everything else stays inert HTML. An
 * island's markdown children arrive pre-rendered; they're passed back in as
 * static HTML, and any island nested inside them is found on the next pass.
 */

interface Island {
  id: number
  el: HTMLElement
  name: string
  props: Record<string, unknown>
  childrenHtml: string
  inline: boolean
}

const registry = mdxComponents as unknown as Record<string, React.ComponentType<any>>

/** Pre-rendered children. `display: contents` keeps grid/flex parents
 *  (ConceptGrid, Classifieds…) seeing the cards as their direct children. */
function StaticChildren({ html, inline }: { html: string; inline: boolean }) {
  const Tag = inline ? "span" : "div"
  // MEMOISED on purpose. React 19 diffs dangerouslySetInnerHTML by object
  // identity, so a fresh `{ __html }` per render rewrote these children on
  // every render, recreating the nested island placeholders the discovery
  // pass then mounted again: an infinite update loop (React #185) on any page
  // with nested islands, e.g. the wiki home's ConceptGrid > ConceptCard.
  const inner = useMemo(() => ({ __html: html }), [html])
  return <Tag style={{ display: "contents" }} dangerouslySetInnerHTML={inner} />
}

function IslandFailure({ name, message }: { name: string; message: string }) {
  return <div className="note-build-error" role="alert">⚠ {name} could not render: {message}</div>
}

export function NoteHtml({ html, containerRef }: { html: string; containerRef?: React.RefObject<HTMLDivElement | null> }) {
  const ownRef = useRef<HTMLDivElement>(null)
  const ref = containerRef ?? ownRef
  const [islands, setIslands] = useState<Island[]>([])
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null)
  const nextId = useRef(0)

  // Body: set once per html. React never manages these nodes, so nothing
  // re-renders them; islands are the only React-owned parts.
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    root.innerHTML = html
    setIslands([])
  }, [html, ref])

  // Discover placeholders: now, and whenever nodes are added under the root.
  // Nested placeholders only exist once their parent island has rendered its
  // static children, which can be any number of commits later (a lazy
  // component resolving, a Suspense boundary revealing). Re-scanning on a
  // fixed dependency missed those: the wiki home's cards stayed empty once
  // the grids became lazy. A MutationObserver sees every arrival.
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const scan = () => {
      const found: Island[] = []
      root.querySelectorAll<HTMLElement>("[data-island]:not([data-island-mounted])").forEach((el) => {
        // A nested placeholder is detached once its parent island is cleared
        // below; it reappears inside the parent's static children later.
        if (!el.isConnected) return
        el.setAttribute("data-island-mounted", "")
        let props: Record<string, unknown> = {}
        try {
          props = JSON.parse(el.getAttribute("data-props") || "{}")
        } catch {
          // Malformed props are a build bug; render the island with none and let it show.
        }
        const childrenHtml = el.innerHTML
        el.innerHTML = ""
        found.push({
          id: nextId.current++,
          el,
          name: el.getAttribute("data-island") || "",
          props,
          childrenHtml,
          inline: el.tagName === "SPAN",
        })
      })
      if (found.length) setIslands((current) => [...current, ...found])
    }
    scan()
    const observer = new MutationObserver((records) => {
      if (records.some((r) => r.addedNodes.length > 0)) scan()
    })
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [html, ref])

  // Image zoom by delegation (formerly the MDX `img` override).
  const onClick = (e: React.MouseEvent) => {
    const img = (e.target as HTMLElement).closest("img")
    if (!img || img.closest("a") || img.closest("[data-island]")) return
    setZoom({ src: img.getAttribute("src") || "", alt: img.getAttribute("alt") || "" })
  }

  return (
    <>
      <div ref={ref} className="note-html" onClick={onClick} />
      {islands.map((island) => {
        const Component = registry[island.name]
        const content = Component ? (
          <ErrorBoundary
            label={`${island.name} island`}
            fallback={(error) => <IslandFailure name={island.name} message={error.message} />}
          >
            <Suspense fallback={null}>
              <Component {...island.props}>
                {island.childrenHtml ? <StaticChildren html={island.childrenHtml} inline={island.inline} /> : undefined}
              </Component>
            </Suspense>
          </ErrorBoundary>
        ) : (
          <IslandFailure name={island.name || "component"} message="not registered" />
        )
        return createPortal(content, island.el, `island-${island.id}`)
      })}
      {zoom && <ImageLightbox src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </>
  )
}
