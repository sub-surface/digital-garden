import { lazy, type LazyExoticComponent, type ComponentType } from "react"

export interface SystemPage {
  component: LazyExoticComponent<ComponentType>
  layout: "article" | "note"
  loading: string
}

export const SYSTEM_PAGES: Record<string, SystemPage> = {
  graph:           { component: lazy(() => import("@/components/ui/GraphView").then(m => ({ default: m.GraphView }))),         layout: "article", loading: "Loading map..." },
  chess:           { component: lazy(() => import("@/components/ui/ChessPage").then(m => ({ default: m.ChessPage }))),         layout: "article", loading: "Loading board..." },
  hexo:            { component: lazy(() => import("@/components/ui/HexoPage").then(m => ({ default: m.HexoPage }))),           layout: "article", loading: "Loading board..." },
  bookshelf:       { component: lazy(() => import("@/components/ui/BookshelfPage").then(m => ({ default: m.BookshelfPage }))),   layout: "article", loading: "Loading shelf..." },
  movieshelf:      { component: lazy(() => import("@/components/ui/MovieshelfPage").then(m => ({ default: m.MovieshelfPage }))), layout: "article", loading: "Loading shelf..." },
  "music-library": { component: lazy(() => import("@/components/ui/MusicPage").then(m => ({ default: m.MusicPage }))),         layout: "article", loading: "Loading library..." },
}
