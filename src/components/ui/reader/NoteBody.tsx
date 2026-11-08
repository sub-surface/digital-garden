import React, { useEffect, useRef, useState, Suspense } from "react"
import { useTelescopicHandlers } from "../TelescopicHandler"
import { NotFound } from "../NotFound"
import { useMusic } from "@/components/ui/music/MusicContext"
import { useStore } from "@/store"
import { loadNote, NoteMissingError } from "@/lib/note-loader"
import { NoteHtml } from "./NoteHtml"
import { TagPage } from "./TagPage"
import { FolderPage } from "./FolderPage"
import { SYSTEM_PAGES } from "@/config/system-pages"
import { normalizeSlug } from "@/lib/slug"
import { resolveSlug } from "@/lib/content-loader"

// `music` is an alias for the music-library system page used in older links.
const SYSTEM_ALIASES: Record<string, string> = { music: "music-library" }

interface Props {
  slug: string
  onLoad?: (data: { frontmatter?: Record<string, any>; html?: string; headings?: { id: string; text: string; level: number }[] }) => void
}

export function NoteBody({ slug: rawSlug, onLoad }: Props) {
  const contentIndex = useStore((s) => s.contentIndex)
  const resolvedSlug = React.useMemo(() => {
    if (contentIndex) {
      return resolveSlug(rawSlug, contentIndex) ?? rawSlug
    }
    return rawSlug
  }, [rawSlug, contentIndex])

  const slug = React.useMemo(
    () => normalizeSlug(resolvedSlug.replace(/\.mdx?$/, "")),
    [resolvedSlug]
  )
  // One status instead of loading/notFound/MDXComponent flags that had to be
  // kept consistent by hand.
  type Status =
    | { kind: "loading" }
    | { kind: "ready"; html: string; frontmatter: Record<string, any> }
    | { kind: "missing" }
  const [status, setStatus] = useState<Status>({ kind: "loading" })
  const loading = status.kind === "loading"
  const notFound = status.kind === "missing"
  const frontmatter = status.kind === "ready" ? status.frontmatter : {}
  const bodyHtml = status.kind === "ready" ? status.html : null
  
  const contentRef = useRef<HTMLDivElement>(null)
  const { playTrack, tracks } = useMusic()
  useTelescopicHandlers(contentRef)

  // Intercept music: links
  useEffect(() => {
    if (!contentRef.current) return

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest("a")
      if (link && link.getAttribute("href")?.startsWith("music:")) {
        e.preventDefault()
        const trackName = link.getAttribute("href")!.slice(6)
        // Match by title (case-insensitive) — what authors write in links
        const idx = tracks.findIndex(t => t.title.toLowerCase() === trackName.toLowerCase())
        if (idx !== -1) {
          playTrack(idx)
          const state = useStore.getState() as any
          if (!state.isMusicOpen) state.toggleMusic()
        }
      }
    }

    const el = contentRef.current
    el.addEventListener("click", handleClick)
    return () => el.removeEventListener("click", handleClick)
  }, [playTrack, tracks, bodyHtml])

  // Handle "System" pages that aren't MDX files
  const isTagPage = slug.toLowerCase() === "tags" || slug.toLowerCase().startsWith("tags/")
  const isFolderPage = slug.toLowerCase() === "folder" || slug.toLowerCase().startsWith("folder/")
  // Source of truth: the SYSTEM_PAGES registry (so arcade, games, toys, etc.
  // all render in embedded panels too — not just a hardcoded few).
  const sysKey = SYSTEM_ALIASES[slug.toLowerCase()] ?? slug.toLowerCase()
  const sysPage = SYSTEM_PAGES[sysKey]
  const isSystemPage = isTagPage || isFolderPage || Boolean(sysPage)

  useEffect(() => {
    if (isSystemPage) {
      setStatus({ kind: "ready", html: "", frontmatter: {} })
      if (onLoad) {
        // Provide default system frontmatter
        let systemTitle = slug.charAt(0).toUpperCase() + slug.slice(1).toLowerCase()
        if (isTagPage) {
          const tag = slug.split("/")[1]
          systemTitle = tag ? `#${tag}` : "Tags"
        } else if (isFolderPage) {
          const folder = slug.split("/").slice(1).join("/")
          systemTitle = folder ? `Folder: ${folder}` : "Folders"
        }
        onLoad({
          frontmatter: {
            title: systemTitle,
            layout: sysPage ? sysPage.layout : "note",
          },
        })
      }
      return
    }

    let cancelled = false
    setStatus({ kind: "loading" })
    loadNote(slug)
      .then((note) => {
        if (cancelled) return
        setStatus({ kind: "ready", html: note.html, frontmatter: note.frontmatter })
        onLoad?.({ frontmatter: note.frontmatter })
      })
      .catch((err) => {
        if (cancelled) return
        if (!(err instanceof NoteMissingError)) console.error("Failed to load note:", err)
        setStatus({ kind: "missing" })
      })
    return () => { cancelled = true }
  }, [slug, isSystemPage, isTagPage, isFolderPage, sysPage, onLoad])

  // Check if we have stashed pre-rendered HTML for this slug from the edge response
  const prerenderCache = typeof window !== "undefined" ? (window as any).__PRERENDER_CACHE__ : null
  const hasPrerender =
    loading &&
    Boolean(prerenderCache?.bodyHtml) &&
    (prerenderCache?.slug?.toLowerCase() === slug.toLowerCase() ||
      prerenderCache?.slug?.toLowerCase() === resolvedSlug.toLowerCase())

  // Extract headings from MDX or pre-rendered HTML after render
  useEffect(() => {
    if (contentRef.current && onLoad) {
      const headingEls = contentRef.current.querySelectorAll("h2, h3, h4")
      if (headingEls.length > 0) {
        const extracted = Array.from(headingEls).map((el) => ({
          id: el.id,
          text: (el as HTMLElement).innerText,
          level: parseInt(el.tagName.substring(1)),
        }))
        onLoad({ headings: extracted })
      }
    }
  }, [bodyHtml, hasPrerender, slug, onLoad])

  // The edge-injected stash has done its job once the real body is in.
  useEffect(() => {
    if (bodyHtml !== null && typeof window !== "undefined" && (window as any).__PRERENDER_CACHE__) {
      ;(window as any).__PRERENDER_CACHE__ = null
    }
  }, [bodyHtml])

  if (loading && !hasPrerender) return <div className="note-loading">Loading...</div>
  if (notFound) return <NotFound />

  if (isSystemPage) {
    const tagPart = isTagPage ? slug.split("/")[1] : undefined
    const folderPart = isFolderPage ? slug.split("/").slice(1).join("/") : undefined
    const SysComponent = sysPage?.component

    return (
      <div ref={contentRef} className="note-content">
        <Suspense fallback={<div className="note-loading">{sysPage?.loading ?? "Loading..."}</div>}>
          {isTagPage && <TagPage tag={tagPart} />}
          {isFolderPage && <FolderPage folderPath={folderPart} />}
          {!isTagPage && !isFolderPage && SysComponent && <SysComponent />}
        </Suspense>
      </div>
    )
  }

  // Movie/book notes carry their poster in frontmatter but have little body —
  // render the artwork by default. Lives here (not just NoteRenderer) so panel
  // cards / note-mode views get it too. Bare filenames resolve to /content/Media.
  const posterSrc = (() => {
    const ftype = frontmatter.type as string | undefined
    if (ftype !== "movie" && ftype !== "book") return undefined
    const raw = (frontmatter.poster || frontmatter.cover || frontmatter.image) as string | undefined
    if (!raw) return undefined
    return raw.startsWith("http") ? raw : `/content/Media/${raw}`
  })()

  return (
    <div ref={contentRef} className="note-content">
      {posterSrc && (
        <figure className="note-poster">
          <img src={posterSrc} alt={(frontmatter.title as string) || ""} loading="lazy" />
        </figure>
      )}
      {bodyHtml !== null ? (
        <NoteHtml html={bodyHtml} />
      ) : hasPrerender ? (
        <div
          className="prerendered-body-content"
          dangerouslySetInnerHTML={{ __html: prerenderCache.bodyHtml }}
        />
      ) : null}
    </div>
  )
}
