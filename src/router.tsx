import {
  createRouter,
  createRoute,
  createRootRoute,
} from "@tanstack/react-router"
import { AppShell } from "@/components/layout/AppShell"
import { NoteRenderer } from "@/components/ui/NoteRenderer"
import { DevDashboard } from "@/components/dev/DevDashboard"
import { NotFound } from "@/components/ui/NotFound"
import { useEffect, lazy, Suspense } from "react"
import { useStore } from "@/store"

// Lazy load heavy components
const GraphView = lazy(() => import("@/components/ui/GraphView").then(m => ({ default: m.GraphView })))
const ChessPage = lazy(() => import("@/components/ui/ChessPage").then(m => ({ default: m.ChessPage })))

// Root layout
const rootRoute = createRootRoute({
  component: AppShell,
})

// Dev dashboard
const devRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/__dev",
  component: DevDashboard,
})

// Full Graph Route (Explicit)
const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graph",
  component: function GraphRoute() {
    const setActiveGraphSlug = useStore((s) => s.setActiveGraphSlug)
    useEffect(() => {
      setActiveGraphSlug("graph")
    }, [setActiveGraphSlug])

    return (
      <div className="article-layout">
        <div className="note-header" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 'var(--space-12)' }}>
          <h1 style={{ margin: 'var(--space-2) 0' }}>Knowledge Graph</h1>
        </div>
        <Suspense fallback={<div className="loading-shimmer">Mapping territories...</div>}>
          <GraphView />
        </Suspense>
      </div>
    )
  }
})

// Tag pages
const tagRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tags/$tag",
  component: function TagPage() {
    const { tag } = tagRoute.useParams()
    const contentIndex = useStore((s) => s.contentIndex)

    const notes = contentIndex
      ? Object.values(contentIndex).filter((n) => n.tags.some(t => t.toLowerCase() === tag.toLowerCase()))
      : []

    if (!contentIndex) {
      return (
        <div className="article-layout">
          <div className="note-loading">Loading index...</div>
        </div>
      )
    }

    return (
      <div className="article-layout">
        <div className="note-header" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 'var(--space-12)' }}>
          <h1 style={{ margin: 'var(--space-2) 0' }}>#{tag}</h1>
          <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.8rem', opacity: 0.6 }}>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'} found
          </div>
        </div>
        
        {notes.length === 0 ? (
          <p>No notes tagged with "{tag}".</p>
        ) : (
          <ul className="notes-list" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-8)' }}>
            {notes.map((n) => (
              <li key={n.slug} style={{ marginBottom: 'var(--space-4)', textAlign: 'right' }}>
                <a href={`/${n.slug}`} className="internal-link" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                  {n.title}
                </a>
                <div style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '2px' }}>{n.slug}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  },
})

// Folder pages
const folderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/folder/$",
  component: function FolderPage() {
    const params = folderRoute.useParams()
    const folderPath = (params as any)["_splat"]
    const contentIndex = useStore((s) => s.contentIndex)

    const notes = contentIndex
      ? Object.values(contentIndex).filter((n) => n.folder === folderPath)
      : []

    if (!contentIndex) {
      return (
        <div className="article-layout">
          <div className="note-loading">Loading index...</div>
        </div>
      )
    }

    return (
      <div className="article-layout">
        <div className="note-header" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 'var(--space-12)' }}>
          <h1 style={{ margin: 'var(--space-2) 0' }}>Folder: {folderPath}</h1>
          <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.8rem', opacity: 0.6 }}>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'} found
          </div>
        </div>

        {notes.length === 0 ? (
          <p>No notes found in "{folderPath}".</p>
        ) : (
          <ul className="notes-list" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-8)' }}>
            {notes.map((n) => (
              <li key={n.slug} style={{ marginBottom: 'var(--space-4)', textAlign: 'right' }}>
                <a href={`/${n.slug}`} className="internal-link" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                  {n.title}
                </a>
                <div style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '2px' }}>{n.slug}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  },
})

// Catch-all note route — handles /Books/foo, /Movies/bar, etc.
const noteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  component: function NotePage() {
    const params = noteRoute.useParams()
    const slug = (params as Record<string, string>)["_splat"] || "index"
    
    const setActiveGraphSlug = useStore((s) => s.setActiveGraphSlug)
    useEffect(() => {
      setActiveGraphSlug(slug)
    }, [slug, setActiveGraphSlug])

    return (
      <Suspense fallback={<div className="loading-shimmer">Loading note...</div>}>
        <NoteRenderer slug={slug} />
      </Suspense>
    )
  },
})

// Build the router
const routeTree = rootRoute.addChildren([
  devRoute,
  tagRoute,
  folderRoute,
  noteRoute,
])

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFound,
})

// Type registration
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
