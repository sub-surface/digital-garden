import React, { Suspense, lazy } from "react"
import { MDXProvider as BaseMDXProvider } from "@mdx-js/react"
import { BookCard } from "./BookCard"
import { MovieCard } from "./MovieCard"
import { Gallery } from "./Gallery"
import { Query } from "./Query"
import { AsciiAvatar } from "./AsciiAvatar"

const LazyWikiSubmitForm = lazy(() => import("@/components/ui/WikiSubmitPage").then((m) => ({ default: m.WikiSubmitForm })))
const LazyPhotoAlbums = lazy(() => import("@/components/ui/PhotographyPage").then((m) => ({ default: m.PhotoAlbums })))

function WikiSubmitForm() {
  return (
    <Suspense fallback={null}>
      <LazyWikiSubmitForm />
    </Suspense>
  )
}

function PhotoAlbums() {
  return (
    <Suspense fallback={null}>
      <LazyPhotoAlbums />
    </Suspense>
  )
}

export const mdxComponents = {
  BookCard,
  MovieCard,
  Gallery,
  Query,
  WikiSubmitForm,
  AsciiAvatar,
  PhotoAlbums,
  // Add more custom components here
  a: (props: any) => {
    const isInternal = props.href?.startsWith("/") || props.href?.startsWith(window.location.origin)
    return (
      <a 
        {...props} 
        className={`${props.className || ""} ${isInternal ? "internal-link" : "external-link"}`}
      />
    )
  }
}

export function MDXProvider({ children }: { children: React.ReactNode }) {
  return (
    <BaseMDXProvider components={mdxComponents as any}>
      {children}
    </BaseMDXProvider>
  )
}
