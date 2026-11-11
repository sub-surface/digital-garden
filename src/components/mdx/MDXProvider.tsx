import { lazy, Suspense, type ComponentType } from "react"

/**
 * The note-component registry: what an island named in a note hydrates as.
 *
 * Every entry is lazy. Islands mount after the note's static HTML is already
 * on screen (NoteHtml wraps each in Suspense), so a component's code is only
 * downloaded on a page that uses it. Previously all of them sat in the main
 * chunk that every visitor parses first.
 *
 * Keep the keys in parity with ISLAND_NAMES (island-names.ts): enforced by
 * scripts/test-islands.ts.
 */

type AnyComponent = ComponentType<any>

function named<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): AnyComponent {
  return lazy(() => load().then((m) => ({ default: m[name] as AnyComponent })))
}

/** The graphs are tall: reserve their height while the code loads. */
function withShimmer(Inner: AnyComponent): AnyComponent {
  return function Shimmered(props: { height?: number }) {
    return (
      <Suspense
        fallback={
          <div className="loading-shimmer" style={{ height: props?.height || 520, margin: "24px 0" }}>
            Waking the constellation...
          </div>
        }
      >
        <Inner {...props} />
      </Suspense>
    )
  }
}

export const mdxComponents: Record<string, AnyComponent> = {
  BookCard: named(() => import("./BookCard"), "BookCard"),
  MovieCard: named(() => import("./MovieCard"), "MovieCard"),
  Gallery: named(() => import("./Gallery"), "Gallery"),
  Query: named(() => import("./Query"), "Query"),
  OnThisDay: named(() => import("./OnThisDay"), "OnThisDay"),
  DailyNav: named(() => import("./Daily"), "DailyNav"),
  DailyThreads: named(() => import("./Daily"), "DailyThreads"),
  GameOfLife: named(() => import("./GameOfLife"), "GameOfLife"),
  WikiSubmitForm: named(() => import("@/components/ui/wiki/WikiSubmitPage"), "WikiSubmitForm"),
  AsciiAvatar: named(() => import("./AsciiAvatar"), "AsciiAvatar"),
  PhotoAlbums: named(() => import("@/components/ui/shelves/PhotographyPage"), "PhotoAlbums"),
  MachineGod: named(() => import("./MachineGod"), "MachineGod"),
  Epigraph: named(() => import("./Epigraph"), "Epigraph"),
  Tape: named(() => import("./Tape"), "Tape"),
  WeighIn: named(() => import("./WeighIn"), "WeighIn"),
  Clipping: named(() => import("./Clipping"), "Clipping"),
  Classifieds: named(() => import("./Classifieds"), "Classifieds"),
  Classified: named(() => import("./Classifieds"), "Classified"),
  ChuckleRating: named(() => import("./ChuckleRating"), "ChuckleRating"),
  FactionTree: named(() => import("./FactionTree"), "FactionTree"),
  ChronicleCard: named(() => import("./ChronicleCard"), "ChronicleCard"),
  ChronicleGrid: named(() => import("./ChronicleCard"), "ChronicleGrid"),
  ChatterCard: named(() => import("./ChatterCard"), "ChatterCard"),
  ChatterGrid: named(() => import("./ChatterCard"), "ChatterGrid"),
  ConceptCard: named(() => import("./ConceptCard"), "ConceptCard"),
  ConceptGrid: named(() => import("./ConceptCard"), "ConceptGrid"),
  BroadsheetColumns: named(() => import("./BroadsheetColumns"), "BroadsheetColumns"),
  WikiGraph: withShimmer(named(() => import("./WikiGraph"), "WikiGraph")),
  EmbedGraph: withShimmer(named(() => import("./EmbedGraph"), "EmbedGraph")),
}
