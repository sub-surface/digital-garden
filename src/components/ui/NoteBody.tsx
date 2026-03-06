import React, { useEffect, useRef, useState, Suspense } from "react"
import { useTelescopicHandlers } from "./TelescopicHandler"
import { NotFound } from "./NotFound"
import { useMusic } from "./MusicContext"

// Import shelf components for panel usage
import { BookshelfPage } from "./BookshelfPage"
import { MovieshelfPage } from "./MovieshelfPage"
import { MusicPage } from "./MusicPage"
import { PhotographyPage } from "./PhotographyPage"
import { ChessPage } from "./ChessPage"

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
  const { playTrack } = useMusic()
  useTelescopicHandlers(contentRef)

  // Intercept music: links
  useEffect(() => {
    if (!contentRef.current) return
    
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest("a")
      if (link && link.getAttribute("href")?.startsWith("music:")) {
        e.preventDefault()
        const trackSlug = link.getAttribute("href")?.replace("music:", "")
        if (trackSlug) playTrack(trackSlug)
      }
    }

    const el = contentRef.current
    el.addEventListener("click", handleClick)
    return () => el.removeEventListener("click", handleClick)
  }, [playTrack, MDXComponent])

  // Handle "System" pages that aren't MDX files
  const isSystemPage = ["Bookshelf", "Movieshelf", "Music", "Photography", "Chess"].includes(slug)

  useEffect(() => {
    if (isSystemPage) {
      setLoading(false)
      if (onLoad) {
        // Provide default system frontmatter
        onLoad({ frontmatter: { title: slug, layout: slug === "Chess" ? "article" : "note" } })
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
        
        const notes = import.meta.glob("/src/content/**/*.{md,mdx}")
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
  }, [slug, isSystemPage])

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
    return (
      <div ref={contentRef} className="note-content">
        {slug === "Bookshelf" && <BookshelfPage />}
        {slug === "Movieshelf" && <MovieshelfPage />}
        {slug === "Music" && <MusicPage />}
        {slug === "Photography" && <PhotographyPage />}
        {slug === "Chess" && <ChessPage />}
      </div>
    )
  }

  return (
    <div ref={contentRef} className="note-content">
      {MDXComponent && (
        <Suspense fallback={<div>Loading component...</div>}>
          <MDXComponent />
        </Suspense>
      )}
    </div>
  )
}
