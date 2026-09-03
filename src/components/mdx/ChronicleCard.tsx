import React from "react"
import { Link } from "@tanstack/react-router"
import { useStore } from "@/store"
import { resolveSlug } from "@/lib/content-loader"
import styles from "./ChronicleCard.module.scss"

interface ChronicleCardProps {
  title: string
  slug: string
  epoch: string
  dispute: string
  outcome: string
  badge?: string
}

export function ChronicleCard({ title, slug, epoch, dispute, outcome, badge }: ChronicleCardProps) {
  const contentIndex = useStore((s) => s.contentIndex)
  const resolved = contentIndex ? (resolveSlug(slug, contentIndex) ?? slug) : slug
  const targetHref = `/${resolved.replace(/^\//, "").replace(/\s+/g, "-")}`

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.metaRow}>
          <span className={styles.epoch}>{epoch}</span>
          {badge && <span className={styles.badge}>{badge}</span>}
        </div>
        <h4 className={styles.title}>
          <Link to={targetHref as any} className={styles.titleLink}>
            {title}
          </Link>
        </h4>
      </header>

      <div className={styles.ruler} aria-hidden="true" />

      <div className={styles.body}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Dispute</span>
          <p className={styles.fieldText}>{dispute}</p>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Settlement</span>
          <p className={styles.fieldText}>{outcome}</p>
        </div>
      </div>

      <footer className={styles.footer}>
        <Link to={targetHref as any} className={styles.readLink}>
          Read dispatch →
        </Link>
      </footer>
    </article>
  )
}

interface ChronicleGridProps {
  children: React.ReactNode
  cols?: 2 | 3
}

export function ChronicleGrid({ children, cols = 2 }: ChronicleGridProps) {
  return (
    <div className={`${styles.grid} ${cols === 3 ? styles.cols3 : styles.cols2}`}>
      {children}
    </div>
  )
}
