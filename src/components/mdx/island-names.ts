/**
 * Names of the components a note may use (`<Query … />`, `<ConceptCard>`…).
 *
 * Pure data, so the build (Node, no SCSS) can validate notes without
 * importing React components. `scripts/test-islands.ts` keeps this list in
 * parity with the capitalised keys of `mdxComponents` in MDXProvider.tsx.
 */
export const ISLAND_NAMES = [
  "BookCard",
  "MovieCard",
  "Gallery",
  "Query",
  "OnThisDay",
  "GameOfLife",
  "WikiSubmitForm",
  "AsciiAvatar",
  "PhotoAlbums",
  "MachineGod",
  "Epigraph",
  "Tape",
  "WeighIn",
  "Clipping",
  "Classifieds",
  "Classified",
  "ChuckleRating",
  "FactionTree",
  "ChronicleCard",
  "ChronicleGrid",
  "ChatterCard",
  "ChatterGrid",
  "ConceptCard",
  "ConceptGrid",
  "BroadsheetColumns",
  "WikiGraph",
  "EmbedGraph",
] as const

export type IslandName = (typeof ISLAND_NAMES)[number]
