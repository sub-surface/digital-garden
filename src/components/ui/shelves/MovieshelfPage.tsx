import { useStore } from "@/store"
import { MovieCard } from "@/components/mdx/MovieCard"
import { groupByDecade } from "./groupByDecade"
import styles from "./Collections.module.scss"

export function MovieshelfPage() {
  const contentIndex = useStore((s) => s.contentIndex)

  if (!contentIndex) return <div>Loading index...</div>

  const movies = Object.values(contentIndex)
    .filter((n) => n.type === "movie")
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (a.date && b.date ? b.date.localeCompare(a.date) : 0))

  const groups = groupByDecade(movies)

  return (
    <div className={styles.collectionPage}>
      <header className={styles.header}>
        <h1>Movieshelf</h1>
        <p>A place for cinema I've watched and enjoyed.</p>
      </header>

      {movies.length === 0 ? (
        <p>No movies found in the garden yet.</p>
      ) : (
        groups.map(([decade, items]) => (
          <section key={decade}>
            <h2 className={styles.decadeLabel}>{decade}</h2>
            <div className={styles.grid}>
              {items.map((movie) => {
                const poster = movie.poster
                  ? (movie.poster.startsWith("http") ? movie.poster : `/content/Media/${movie.poster}`)
                  : undefined

                return (
                  <MovieCard
                    key={movie.slug}
                    title={movie.title}
                    year={movie.year}
                    director={movie.director || "Unknown"}
                    poster={poster}
                    rating={movie.rating != null ? String(movie.rating) : undefined}
                    link={`/${movie.slug}`}
                  />
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
