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
        {(rating || status) && (
          <div className={styles.meta}>
            {rating && <span className={styles.rating}>{rating}</span>}
            {status && <span className={styles.status}>{status}</span>}
          </div>
        )}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className={styles.link}>
            Details →
          </a>
        )}
      </div>
    </div>
  )
}
