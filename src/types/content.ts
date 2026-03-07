export interface NoteMetadata {
  slug: string
  title: string
  tags: string[]
  type?: "book" | "movie" | "music" | string
  date?: string
  description?: string
  growth?: "larval" | "becoming" | "actual"
  featured?: boolean
  private?: boolean
  excerpt?: string      // first paragraph plain text, for hover previews
  readingTime?: number  // minutes, rounded up
  aliases?: string[]    // alternate slug names
  published?: boolean   // opt-in to RSS feed
  image?: string
  cover?: string
  poster?: string
  links: string[]       // slugs this note links to
  backlinks: string[]   // slugs that link to this note
  folder?: string       // parent folder path
  contentPath?: string  // original relative path in public/content/ (preserves casing)
}

export interface ContentIndex {
  [slug: string]: NoteMetadata
}

export interface GraphData {
  nodes: { id: string; title: string; tags: string[] }[]
  links: { source: string; target: string }[]
}

export interface Track {
  title: string
  artist: string
  audio: string
  cover: string
  slug: string
}

export interface PanelCard {
  url: string
  slug: string
  title: string
  html: string
  depth: number
}
