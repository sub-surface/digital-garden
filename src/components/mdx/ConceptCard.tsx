import React from "react"
import { Link } from "@tanstack/react-router"
import { useStore } from "@/store"
import { resolveSlug } from "@/lib/content-loader"
import styles from "./ConceptCard.module.scss"

interface ConceptCardProps {
  term: string
  slug: string
  category: string
  origin?: string
  definition: string
}

export function ConceptCard({ term, slug, category, origin, definition }: ConceptCardProps) {
  const contentIndex = useStore((s) => s.contentIndex)
  const resolved = contentIndex ? (resolveSlug(slug, contentIndex) ?? slug) : slug
  const targetHref = `/${resolved.replace(/^\//, "").replace(/\s+/g, "-")}`

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <span className={styles.category}>{category}</span>
        {origin && <span className={styles.origin}>{origin}</span>}
      </header>
      <h4 className={styles.term}>
        <Link to={targetHref as any} className={styles.termLink}>
          {term}
        </Link>
      </h4>
      <p className={styles.definition}>{definition}</p>
      <footer className={styles.footer}>
        <Link to={targetHref as any} className={styles.exploreLink}>
          Explication →
        </Link>
      </footer>
    </article>
  )
}

interface ConceptGridProps {
  children: React.ReactNode
  cols?: 2 | 3
}

export function ConceptGrid({ children, cols = 3 }: ConceptGridProps) {
  return (
    <div className={`${styles.grid} ${cols === 2 ? styles.cols2 : styles.cols3}`}>
      {children}
    </div>
  )
}
