import React, { Suspense, lazy } from "react"
import { MDXProvider as BaseMDXProvider } from "@mdx-js/react"
import { useStore } from "@/store"
import { BookCard } from "./BookCard"
import { MovieCard } from "./MovieCard"
import { Gallery } from "./Gallery"
import { Query } from "./Query"
import { AsciiAvatar } from "./AsciiAvatar"

const LazyWikiSubmitForm = lazy(() => import("@/components/ui/wiki/WikiSubmitPage").then((m) => ({ default: m.WikiSubmitForm })))
const LazyPhotoAlbums = lazy(() => import("@/components/ui/shelves/PhotographyPage").then((m) => ({ default: m.PhotoAlbums })))
const LazyMachineGod = lazy(() => import("./MachineGod").then((m) => ({ default: m.MachineGod })))

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

function MachineGod() {
  return (
    <Suspense fallback={null}>
      <LazyMachineGod />
    </Suspense>
  )
}

function MDXImage(props: any) {
  const dims = useStore(s => s.imageDimensions?.[props.src])
  return <img {...props} width={dims?.width || props.width} height={dims?.height || props.height} />
}

export const mdxComponents = {
  BookCard,
  MovieCard,
  Gallery,
  Query,
  WikiSubmitForm,
  AsciiAvatar,
  PhotoAlbums,
  MachineGod,
  // Add more custom components here
  img: MDXImage,
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
