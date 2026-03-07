import React from "react"
import { MDXProvider as BaseMDXProvider } from "@mdx-js/react"
import { BookCard } from "./BookCard"
import { MovieCard } from "./MovieCard"
import { Gallery } from "./Gallery"
import { Query } from "./Query"
import { WikiSubmitForm } from "@/components/ui/WikiSubmitPage"

export const mdxComponents = {
  BookCard,
  MovieCard,
  Gallery,
  Query,
  WikiSubmitForm,
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
