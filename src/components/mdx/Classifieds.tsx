import React, { type ReactNode } from "react"
import styles from "./Classifieds.module.scss"

interface ClassifiedProps {
  category: string
  title: string
  contact?: string
  children: ReactNode
}

export function Classified({ category, title, contact, children }: ClassifiedProps) {
  return (
    <article className={styles.ad}>
      <span className={styles.category}>{category}</span>
      <h4 className={styles.title}>{title}</h4>
      <div className={styles.body}>{children}</div>
      {contact && <div className={styles.contact}>{contact}</div>}
    </article>
  )
}

interface ClassifiedsProps {
  rate?: string
  children: ReactNode
}

/**
 * A classified advertisements section from The Phil Chat Times — notices, personals,
 * bounties, lost & found, and room disputes set in a vintage broadsheet directory grid.
 *
 *   <Classifieds>
 *     <Classified category="LOST & FOUND" title="10 Gallons of Lye" contact="Box 4">
 *       Found in a plastic tub. Inquire with Brutus.
 *     </Classified>
 *   </Classifieds>
 */
export function Classifieds({ rate = "2 Cents Per Word · In Advance", children }: ClassifiedsProps) {
  return (
    <section className={styles.container} aria-label="Classified Advertisements">
      <div className={styles.masthead}>
        <span className={styles.mastTitle}>The Phil Chat Times &mdash; Classified Directory</span>
        <span className={styles.mastRate}>{rate}</span>
      </div>
      <div className={styles.grid}>
        {children}
      </div>
    </section>
  )
}
