import styles from "./MDXComponents.module.scss"

interface MovieCardProps {
  title: string
  director: string
  year?: number | string
  poster?: string
  rating?: string
  link?: string
}

export function MovieCard({ title, director, year, poster, rating, link }: MovieCardProps) {
  return (
    <div className={styles.movieCard}>
      {poster && (
        <div className={styles.poster}>
          <img src={poster} alt={title} />
        </div>
      )}
      <div className={styles.info}>
        <div className={styles.title}>{title}</div>
        <div className={styles.director}>{director} {year && `(${year})`}</div>
        {rating && <div className={styles.rating}>{rating}</div>}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className={styles.link}>
            Letterboxd →
          </a>
        )}
      </div>
    </div>
  )
}
