import {
  createRouter,
  createRoute,
  createRootRoute,
} from "@tanstack/react-router"
import { AppShell } from "@/components/layout/AppShell"
import { NoteRenderer } from "@/components/ui/NoteRenderer"
import { DevDashboard } from "@/components/dev/DevDashboard"
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
      <div className="tag-page">
        <h1>#{tag}</h1>
        {notes.length === 0 ? (
          <p>No notes tagged with "{tag}".</p>
        ) : (
          <ul>
            {notes.map((n) => (
              <li key={n.slug}>
                <a href={`/${n.slug}`}>{n.title}</a>
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
// Note: More specific routes (dev, tag) MUST come before the catch-all ($)
const routeTree = rootRoute.addChildren([
  devRoute,
  tagRoute,
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
