import React from "react"
import { Link } from "@tanstack/react-router"
import styles from "./ChatterCard.module.scss"

interface ChatterCardProps {
  name: string
  handle: string
  slug: string
  faction?: "realist" | "pragmatist" | "continental" | "analytic" | "editorial"
  stat?: string
  quote?: string
  bio?: string
}

const FACTION_COLORS: Record<string, string> = {
  realist: "#a3be8c",
  pragmatist: "#ebcb8b",
  continental: "#b48ead",
  analytic: "#88c0d0",
  editorial: "#d08770",
}

export function ChatterCard({ name, handle, slug, faction = "editorial", stat, quote, bio }: ChatterCardProps) {
  const accent = FACTION_COLORS[faction] || "var(--color-accent, #b8681a)"
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <article className={styles.card} style={{ "--card-accent": accent } as React.CSSProperties}>
      <div className={styles.topRow}>
        <div className={styles.avatarMonogram} aria-hidden="true">
          {initials}
        </div>
        <div className={styles.ident}>
          <h4 className={styles.name}>
            <Link to={`/${slug}` as any} className={styles.nameLink}>
              {name}
            </Link>
          </h4>
          <span className={styles.handle}>{handle}</span>
        </div>
        {stat && <span className={styles.statPill}>{stat}</span>}
      </div>

      {quote && (
        <blockquote className={styles.quote}>
          &ldquo;{quote}&rdquo;
        </blockquote>
      )}

      {bio && <p className={styles.bio}>{bio}</p>}

      <footer className={styles.footer}>
        <span className={styles.factionLabel}>{faction} faction</span>
        <Link to={`/${slug}` as any} className={styles.profileLink}>
          Profile →
        </Link>
      </footer>
    </article>
  )
}

interface ChatterGridProps {
  children: React.ReactNode
  cols?: 2 | 3
}

export function ChatterGrid({ children, cols = 3 }: ChatterGridProps) {
  return (
    <div className={`${styles.grid} ${cols === 2 ? styles.cols2 : styles.cols3}`}>
      {children}
    </div>
  )
}
