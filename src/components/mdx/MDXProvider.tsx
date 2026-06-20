import React, { Suspense, lazy, useState } from "react"
import { MDXProvider as BaseMDXProvider } from "@mdx-js/react"
import { useStore } from "@/store"
import { BookCard } from "./BookCard"
import { MovieCard } from "./MovieCard"
import { Gallery } from "./Gallery"
import { Query } from "./Query"
import { OnThisDay } from "./OnThisDay"
import { GameOfLife } from "./GameOfLife"
import { AsciiAvatar } from "./AsciiAvatar"
import { Epigraph } from "./Epigraph"
import { ImageLightbox } from "@/components/ui/reader/ImageLightbox"

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
  const [zoomed, setZoomed] = useState(false)
  return (
    <>
      <img
        {...props}
        width={dims?.width || props.width}
        height={dims?.height || props.height}
        onClick={() => setZoomed(true)}
        style={{ cursor: "zoom-in", ...(props.style || {}) }}
      />
      {zoomed && (
        <ImageLightbox src={props.src} alt={props.alt} onClose={() => setZoomed(false)} />
      )}
    </>
  )
}

export const mdxComponents = {
  BookCard,
  MovieCard,
  Gallery,
  Query,
  OnThisDay,
  GameOfLife,
  WikiSubmitForm,
  AsciiAvatar,
  PhotoAlbums,
  MachineGod,
  Epigraph,
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
