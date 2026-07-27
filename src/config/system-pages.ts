import { lazy, type LazyExoticComponent, type ComponentType } from "react"
import { SYSTEM_PAGE_META } from "./system-pages-meta"

export interface SystemPage {
  component: LazyExoticComponent<ComponentType>
  layout: "article" | "note" | "game"
  loading: string
}

const SYSTEM_PAGE_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = {
  graph:           lazy(() => import("@/components/ui/graph/ConstellationPage").then(m => ({ default: m.ConstellationPage }))),
  chess:           lazy(() => import("@/components/ui/games/ChessPage").then(m => ({ default: m.ChessPage }))),
  hexo:            lazy(() => import("@/components/ui/games/HexoPage").then(m => ({ default: m.HexoPage }))),
  bookshelf:       lazy(() => import("@/components/ui/shelves/BookshelfPage").then(m => ({ default: m.BookshelfPage }))),
  movieshelf:      lazy(() => import("@/components/ui/shelves/MovieshelfPage").then(m => ({ default: m.MovieshelfPage }))),
  "music-library": lazy(() => import("@/components/ui/shelves/MusicPage").then(m => ({ default: m.MusicPage }))),
  arcade:          lazy(() => import("@/components/ui/games/ArcadePage").then(m => ({ default: m.ArcadePage }))),
  inbox:           lazy(() => import("@/components/ui/shelves/InboxPage").then(m => ({ default: m.InboxPage }))),
  snake:           lazy(() => import("@/components/ui/games/SnakePage").then(m => ({ default: m.SnakePage }))),
  blackjack:       lazy(() => import("@/components/ui/games/BlackjackPage").then(m => ({ default: m.BlackjackPage }))),
  tetris:          lazy(() => import("@/components/ui/games/TetrisPage").then(m => ({ default: m.TetrisPage }))),
  "2048":          lazy(() => import("@/components/ui/games/Game2048Page").then(m => ({ default: m.Game2048Page }))),
  murmuration:     lazy(() => import("@/components/ui/games/BoidsPage").then(m => ({ default: m.BoidsPage }))),
  sandbox:         lazy(() => import("@/components/ui/games/SandPage").then(m => ({ default: m.SandPage }))),
  "hex-mines":     lazy(() => import("@/components/ui/games/HexMinesPage").then(m => ({ default: m.HexMinesPage }))),
  "ant-farm":      lazy(() => import("@/components/ui/games/AntFarmPage").then(m => ({ default: m.AntFarmPage }))),
  "hex-life":      lazy(() => import("@/components/ui/games/HexLifePage").then(m => ({ default: m.HexLifePage }))),
  life:            lazy(() => import("@/components/ui/games/LifePage").then(m => ({ default: m.LifePage }))),
  progressions:    lazy(() => import("@/components/ui/games/ProgressionsPage").then(m => ({ default: m.ProgressionsPage }))),
  constellation:   lazy(() => import("@/components/ui/graph/ConstellationPage").then(m => ({ default: m.ConstellationPage }))),
  "persian-carpet": lazy(() => import("@/components/ui/games/PersianCarpetPage").then(m => ({ default: m.PersianCarpetPage }))),
  sigil:           lazy(() => import("@/components/ui/games/SigilPage").then(m => ({ default: m.SigilPage }))),
  collider:        lazy(() => import("@/components/ui/games/ColliderPage").then(m => ({ default: m.ColliderPage }))),
  apparatus:       lazy(() => import("@/components/ui/composer/ComposerPage").then(m => ({ default: m.ComposerPage }))),
  filament:        lazy(() => import("@/features/filament/FilamentPage").then(m => ({ default: m.FilamentPage }))),
}

if (import.meta.env?.DEV) {
  const metaKeys = new Set(Object.keys(SYSTEM_PAGE_META))
  const componentKeys = new Set(Object.keys(SYSTEM_PAGE_COMPONENTS))
  const missing = [...metaKeys].filter((k) => !componentKeys.has(k))
  const extra = [...componentKeys].filter((k) => !metaKeys.has(k))
  if (missing.length || extra.length) {
    throw new Error(
      `SYSTEM_PAGE_META / SYSTEM_PAGE_COMPONENTS key mismatch — missing component: [${missing.join(", ")}], missing meta: [${extra.join(", ")}]`,
    )
  }
}

export const SYSTEM_PAGES: Record<string, SystemPage> = Object.fromEntries(
  Object.entries(SYSTEM_PAGE_COMPONENTS).map(([slug, component]) => [
    slug,
    { component, layout: SYSTEM_PAGE_META[slug].layout, loading: SYSTEM_PAGE_META[slug].loading },
  ]),
)
