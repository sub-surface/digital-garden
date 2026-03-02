import { useStore } from "@/store"
import { BookCard } from "@/components/mdx/BookCard"
import styles from "./Collections.module.scss"

export function BookshelfPage() {
  const contentIndex = useStore((s) => s.contentIndex)

  if (!contentIndex) return <div>Loading index...</div>

  const books = Object.values(contentIndex)
    .filter((n) => n.type === "book")
    .sort((a, b) => (a.date && b.date ? b.date.localeCompare(a.date) : 0))

  return (
    <div className={styles.collectionPage}>
      <header className={styles.header}>
        <h1>Bookshelf</h1>
        <p>A home for my favourite reads, no particular order.</p>
      </header>

      <div className={styles.grid}>
        {books.length === 0 ? (
          <p>No books found in the garden yet.</p>
        ) : (
          books.map((book) => (
            <BookCard
              key={book.slug}
              title={book.title}
              author={(book as any).author || "Unknown"}
              cover={(book as any).cover}
              rating={(book as any).rating}
              status={(book as any).status}
              link={`/${book.slug}`}
            />
          ))
        )}
      </div>
    </div>
  )
}
