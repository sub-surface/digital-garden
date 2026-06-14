import { lazy, type LazyExoticComponent, type ComponentType } from "react"

export interface SystemPage {
  component: LazyExoticComponent<ComponentType>
  layout: "article" | "note" | "game"
  loading: string
}

export const SYSTEM_PAGES: Record<string, SystemPage> = {
  graph:           { component: lazy(() => import("@/components/ui/ConstellationPage").then(m => ({ default: m.ConstellationPage }))), layout: "game", loading: "Charting the sky..." },
  chess:           { component: lazy(() => import("@/components/ui/ChessPage").then(m => ({ default: m.ChessPage }))),         layout: "game",    loading: "Loading board..." },
  hexo:            { component: lazy(() => import("@/components/ui/HexoPage").then(m => ({ default: m.HexoPage }))),           layout: "game",    loading: "Loading board..." },
  bookshelf:       { component: lazy(() => import("@/components/ui/BookshelfPage").then(m => ({ default: m.BookshelfPage }))),   layout: "article", loading: "Loading shelf..." },
  movieshelf:      { component: lazy(() => import("@/components/ui/MovieshelfPage").then(m => ({ default: m.MovieshelfPage }))), layout: "article", loading: "Loading shelf..." },
  "music-library": { component: lazy(() => import("@/components/ui/MusicPage").then(m => ({ default: m.MusicPage }))),         layout: "article", loading: "Loading library..." },
  arcade:          { component: lazy(() => import("@/components/ui/ArcadePage").then(m => ({ default: m.ArcadePage }))),       layout: "article", loading: "Loading arcade..." },
  snake:           { component: lazy(() => import("@/components/ui/SnakePage").then(m => ({ default: m.SnakePage }))),         layout: "game",    loading: "Loading snake..." },
  blackjack:       { component: lazy(() => import("@/components/ui/BlackjackPage").then(m => ({ default: m.BlackjackPage }))), layout: "game",    loading: "Loading table..." },
  tetris:          { component: lazy(() => import("@/components/ui/TetrisPage").then(m => ({ default: m.TetrisPage }))),       layout: "game",    loading: "Loading well..." },
  "2048":          { component: lazy(() => import("@/components/ui/Game2048Page").then(m => ({ default: m.Game2048Page }))),   layout: "game",    loading: "Loading tiles..." },
  murmuration:     { component: lazy(() => import("@/components/ui/BoidsPage").then(m => ({ default: m.BoidsPage }))),         layout: "game",    loading: "Loading flock..." },
  sandbox:         { component: lazy(() => import("@/components/ui/SandPage").then(m => ({ default: m.SandPage }))),           layout: "game",    loading: "Loading sand..." },
  "hex-mines":     { component: lazy(() => import("@/components/ui/HexMinesPage").then(m => ({ default: m.HexMinesPage }))),   layout: "game",    loading: "Loading minefield..." },
  "ant-farm":      { component: lazy(() => import("@/components/ui/AntFarmPage").then(m => ({ default: m.AntFarmPage }))),     layout: "game",    loading: "Loading colony..." },
  constellation:   { component: lazy(() => import("@/components/ui/ConstellationPage").then(m => ({ default: m.ConstellationPage }))), layout: "game", loading: "Charting the sky..." },
}
