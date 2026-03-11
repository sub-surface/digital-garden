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
import { useShell } from "@/hooks/useShell"
import { TagPage } from "@/components/ui/TagPage"
import { FolderPage } from "@/components/ui/FolderPage"
import { RecentPage } from "@/components/ui/RecentPage"
import { WikiSubmitPage } from "@/components/ui/WikiSubmitPage"
import { WikiEditPage } from "@/components/ui/WikiEditPage"
import { WikiNewPage } from "@/components/ui/WikiNewPage"
import { WikiAdminPage } from "@/components/ui/WikiAdminPage"
import { WikiProfilePage } from "@/components/ui/WikiProfilePage"

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
const tagsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tags",
  component: TagPage,
})

const tagRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tags/$tag",
  component: function TagRouteComponent() {
    const { tag } = tagRoute.useParams()
    return <TagPage tag={tag} />
  },
})

// Folder pages
const foldersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/folder",
  component: FolderPage,
})

const folderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/folder/$",
  component: function FolderRouteComponent() {
    const params = folderRoute.useParams()
    const folderPath = (params as any)["_splat"]
    return <FolderPage folderPath={folderPath} />
  },
})

// Recent notes route
const recentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recent",
  component: RecentPage,
})

// Wiki submit route — must be before catch-all
const submitRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/submit",
  component: WikiSubmitPage,
})

// Wiki new article route
const newRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/new",
  component: WikiNewPage,
})

// Wiki admin route
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: WikiAdminPage,
})

// Profile routes
const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: WikiProfilePage,
})

const userRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/user/$",
  component: function UserRoutePage() {
    const params = userRoute.useParams()
    const username = (params as Record<string, string>)["_splat"] || ""
    return <WikiProfilePage username={username} />
  },
})

// Wiki edit route — catch-all for /edit/*
const editRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/edit/$",
  component: function EditRoutePage() {
    const params = editRoute.useParams()
    const rawSlug = (params as Record<string, string>)["_splat"] || ""
    return <WikiEditPage slug={rawSlug} />
  },
})

// Catch-all note route — handles /Books/foo, /Movies/bar, etc.
const noteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  component: function NotePage() {
    const params = noteRoute.useParams()
    const shell = useShell()
    const rawSlug = (params as Record<string, string>)["_splat"] || "index"
    const slug = rawSlug === "index" && shell === "wiki" ? "wiki" : rawSlug

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
  tagsRoute,
  tagRoute,
  foldersRoute,
  folderRoute,
  recentRoute,
  submitRoute,
  newRoute,
  adminRoute,
  profileRoute,
  userRoute,
  editRoute,
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
