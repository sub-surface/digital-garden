import React, { useEffect, useRef, useState, Suspense } from "react"
import { useTelescopicHandlers } from "./TelescopicHandler"
import { NotFound } from "./NotFound"
import { useMusic } from "./MusicContext"
import { useStore } from "@/store"
import { mdxComponents } from "@/components/mdx/MDXProvider"
import { TagPage } from "./TagPage"
import { FolderPage } from "./FolderPage"
import { SYSTEM_PAGES } from "@/config/system-pages"

// `music` is an alias for the music-library system page used in older links.
const SYSTEM_ALIASES: Record<string, string> = { music: "music-library" }

interface Props {
  slug: string
  onLoad?: (data: { frontmatter?: Record<string, any>; html?: string; headings?: { id: string; text: string; level: number }[] }) => void
}

export function NoteBody({ slug: rawSlug, onLoad }: Props) {
  const slug = React.useMemo(() => 
    rawSlug
      .replace(/\.mdx?$/, "")
      .replace(/\s+/g, "-"),
    [rawSlug]
  )
  const [loading, setLoading] = useState(true)
  const [MDXComponent, setMDXComponent] = useState<React.ComponentType<any> | null>(null)
  const [notFound, setNotFound] = useState(false)
  
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
  }, [playTrack, tracks, MDXComponent])

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
      setLoading(false)
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
    setLoading(true)
    setNotFound(false)
    setMDXComponent(null)

    async function load() {
      try {
        const paths = [
          `/src/content/${slug}.md`,
          `/src/content/${slug}.mdx`,
          `/src/content/${slug}/index.md`,
          `/src/content/${slug}/index.mdx`
        ].map(p => p.toLowerCase())
        
        const notes = import.meta.glob(["/src/content/**/*.{md,mdx}", "!/src/content/**/_template.{md,mdx}"])
        let match = ""
        
        // Case-insensitive match
        for (const p of Object.keys(notes)) {
          if (paths.includes(p.toLowerCase())) {
            match = p
            break
          }
        }

        if (match) {
          const mod = (await notes[match]()) as any
          if (!cancelled) {
            setMDXComponent(() => mod.default)
            if (onLoad) {
              onLoad({ frontmatter: mod.frontmatter || {} })
            }
            setLoading(false)
            return
          }
        } else {
          if (!cancelled) {
            setNotFound(true)
            setLoading(false)
          }
        }
      } catch (err) {
        console.error("Failed to load MDX note:", err)
        if (!cancelled) {
          setNotFound(true)
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [slug, isSystemPage, isTagPage, isFolderPage])

  // Extract headings from MDX after render
  useEffect(() => {
    if (MDXComponent && contentRef.current && onLoad) {
      const headingEls = contentRef.current.querySelectorAll("h2, h3, h4")
      const extracted = Array.from(headingEls).map((el) => ({
        id: el.id,
        text: (el as HTMLElement).innerText,
        level: parseInt(el.tagName.substring(1)),
      }))
      onLoad({ headings: extracted })
    }
  }, [MDXComponent, slug])

  if (loading) return <div className="note-loading">Loading...</div>
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

  return (
    <div ref={contentRef} className="note-content">
      {MDXComponent && (
        <Suspense fallback={<div>Loading component...</div>}>
          <MDXComponent components={mdxComponents as any} />
        </Suspense>
      )}
    </div>
  )
}
