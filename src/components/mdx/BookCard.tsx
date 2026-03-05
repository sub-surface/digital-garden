import { Link } from "@tanstack/react-router"
import styles from "./MDXComponents.module.scss"

interface BookCardProps {
  title: string
  author: string
  cover?: string
  rating?: string
  status?: string
  link?: string
}

export function BookCard({ title, author, cover, rating, status, link }: BookCardProps) {
  return (
    <div className={styles.bookCard}>
      {cover && (
        <div className={styles.cover}>
          <img src={cover} alt={title} />
        </div>
      )}
      <div className={styles.info}>
        <div className={styles.title}>{title}</div>
        <div className={styles.author}>{author}</div>
        {status && <div className={styles.status}>{status}</div>}
        {rating && <div className={styles.rating}>{rating}</div>}
        {link && (
          <Link to={link} className={styles.link}>
            Details →
          </Link>
        )}
      </div>
    </div>
  )
}
