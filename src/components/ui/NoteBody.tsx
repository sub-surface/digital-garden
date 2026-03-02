import { useEffect, useRef, useState, Suspense } from "react"
import { parseMarkdown, type ParsedNote } from "@/lib/markdown"
import { useTelescopicHandlers } from "./TelescopicHandler"
import { NotFound } from "./NotFound"

interface Props {
  slug: string
  onLoad?: (data: { frontmatter?: Record<string, any>; html?: string; headings?: { id: string; text: string; level: number }[] }) => void
}

function extractHeadings(html: string): { id: string; text: string; level: number }[] {
  const regex = /<h([2-4])\s+id="([^"]+)"[^>]*>(.*?)<\/h\1>/gi
  const headings: { id: string; text: string; level: number }[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const text = match[3].replace(/<[^>]+>/g, "")
    headings.push({ id: match[2], text, level: parseInt(match[1]) })
  }
  return headings
}

export function NoteBody({ slug, onLoad }: Props) {
  const [note, setNote] = useState<ParsedNote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [MDXComponent, setMDXComponent] = useState<React.ComponentType<any> | null>(null)
  
  const contentRef = useRef<HTMLDivElement>(null)
  useTelescopicHandlers(contentRef)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setMDXComponent(null)

    async function load() {
      try {
        // Try MDX first
        const paths = [
          `/src/content/${slug}.md`,
          `/src/content/${slug}.mdx`,
          `/src/content/${slug}/index.md`,
          `/src/content/${slug}/index.mdx`
        ]
        
        const notes = import.meta.glob("/src/content/**/*.{md,mdx}")
        let match = ""
        for (const p of paths) { if (notes[p]) { match = p; break; } }

        if (match) {
          const mod = (await notes[match]()) as any
          if (!cancelled) {
            setMDXComponent(() => mod.default)
            if (onLoad) {
              // We'll extract MDX headings after mount via another effect
              onLoad({ frontmatter: mod.frontmatter || {}, headings: [] })
            }
            setLoading(false)
            return
          }
        }

        // Fallback
        const fetchPaths = [`/content/${slug}.md`, `/content/${slug}/index.md`]
        let source: string | null = null
        for (const path of fetchPaths) {
          const res = await fetch(path)
          if (res.ok) {
            source = await res.text()
            break
          }
        }

        if (!source) {
          if (!cancelled) setError("Note not found")
          return
        }

        const parsed = await parseMarkdown(source)
        if (!cancelled) {
          setNote(parsed)
          if (onLoad) {
            onLoad({ 
              frontmatter: parsed.frontmatter, 
              html: parsed.html, 
              headings: extractHeadings(parsed.html) 
            })
          }
        }
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [slug])

  // Extract headings from MDX after render
  useEffect(() => {
    if (MDXComponent && contentRef.current && onLoad) {
      const headingEls = contentRef.current.querySelectorAll("h2, h3, h4")
      const extracted = Array.from(headingEls).map((el) => ({
        id: el.id,
        text: (el as HTMLElement).innerText,
        level: parseInt(el.tagName.substring(1)),
      }))
      // Important: Only call onLoad if we have headings
      onLoad({ headings: extracted })
    }
  }, [MDXComponent, slug])

  if (loading) return <div className="note-loading">Loading...</div>
  if (error === "Note not found") return <NotFound />
  if (error) return <div className="note-error">{error}</div>

  return (
    <div ref={contentRef} className="note-content">
      {MDXComponent ? (
        <Suspense fallback={<div>Loading component...</div>}>
          <MDXComponent />
        </Suspense>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: note?.html || "" }} />
      )}
    </div>
  )
}
