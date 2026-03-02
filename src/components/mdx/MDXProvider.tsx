import React from "react"
import { MDXProvider as BaseMDXProvider } from "@mdx-js/react"
import { BookCard } from "./BookCard"
import { MovieCard } from "./MovieCard"
import { Gallery } from "./Gallery"

const components = {
  BookCard,
  MovieCard,
  Gallery,
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
    <BaseMDXProvider components={components as any}>
      {children}
    </BaseMDXProvider>
  )
}
