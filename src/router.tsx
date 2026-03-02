import {
  createRouter,
  createRoute,
  createRootRoute,
} from "@tanstack/react-router"
import { AppShell } from "@/components/layout/AppShell"
import { NoteRenderer } from "@/components/ui/NoteRenderer"
import { DevDashboard } from "@/components/dev/DevDashboard"
import { BookshelfPage } from "@/components/ui/BookshelfPage"
import { MovieshelfPage } from "@/components/ui/MovieshelfPage"
import { MusicPage } from "@/components/ui/MusicPage"
import { PhotographyPage } from "@/components/ui/PhotographyPage"
import { GraphView } from "@/components/ui/GraphView"
import { ChessPage } from "@/components/ui/ChessPage"
import { NotFound } from "@/components/ui/NotFound"
import { useStore } from "@/store"

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

// Bookshelf
const bookshelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bookshelf",
  component: BookshelfPage,
})

// Movieshelf
const movieshelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/movieshelf",
  component: MovieshelfPage,
})

// Music
const musicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/music",
  component: MusicPage,
})

// Photography
const photographyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/photography",
  component: PhotographyPage,
})

// Global Graph
const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graph",
  component: GraphView,
})

// Chess
const chessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chess",
  component: ChessPage,
})

// Tag pages
const tagRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tags/$tag",
  component: function TagPage() {
    const { tag } = tagRoute.useParams()
    const contentIndex = useStore((s) => s.contentIndex)

    const notes = contentIndex
      ? Object.values(contentIndex).filter((n) => n.tags.includes(tag))
      : []

    return (
      <div className="collection-page">
        <h1>#{tag}</h1>
        {notes.length === 0 ? (
          <p>No notes tagged with "{tag}".</p>
        ) : (
          <ul className="notes-list">
            {notes.map((n) => (
              <li key={n.slug}>
                <a href={`/${n.slug}`} className="internal-link">{n.title}</a>
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

    return (
      <div className="collection-page">
        <h1>Folder: {folderPath}</h1>
        {notes.length === 0 ? (
          <p>No notes found in "{folderPath}".</p>
        ) : (
          <ul className="notes-list">
            {notes.map((n) => (
              <li key={n.slug}>
                <a href={`/${n.slug}`} className="internal-link">{n.title}</a>
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
    const slug = (params as Record<string, string>)["_splat"]
    if (!slug) return <NoteRenderer slug="index" />
    return <NoteRenderer slug={slug} />
  },
})

// Build the router
// Note: More specific routes (dev, tag, collections) MUST come before the catch-all ($)
const routeTree = rootRoute.addChildren([
  devRoute,
  bookshelfRoute,
  movieshelfRoute,
  musicRoute,
  photographyRoute,
  graphRoute,
  chessRoute,
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
