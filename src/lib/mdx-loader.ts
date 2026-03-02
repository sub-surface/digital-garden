import React, { lazy } from "react"

// Use Vite's glob import to create a map of all MDX/MD components
const notes = import.meta.glob("/src/content/**/*.{md,mdx}")

export interface MDXNoteModule {
  default: React.ComponentType<any>
  frontmatter: Record<string, any>
}

export function getNoteComponent(rawSlug: string) {
  const slug = decodeURIComponent(rawSlug)
  // Normalize slug to match glob keys
  const paths = [
    `/src/content/${slug}.md`,
    `/src/content/${slug}.mdx`,
    `/src/content/${slug}/index.md`,
    `/src/content/${slug}/index.mdx`
  ]

  for (const path of paths) {
    if (notes[path]) {
      return lazy(() => notes[path]() as Promise<MDXNoteModule>)
    }
  }

  return null
}

export function hasNote(slug: string): boolean {
  const paths = [
    `/src/content/${slug}.md`,
    `/src/content/${slug}.mdx`,
    `/src/content/${slug}/index.md`,
    `/src/content/${slug}/index.mdx`
  ]
  return paths.some(path => !!notes[path])
}
