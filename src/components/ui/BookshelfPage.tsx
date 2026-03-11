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
          books.map((book) => {
            const cover = book.cover
              ? (book.cover.startsWith("http") ? book.cover : `/content/Media/${book.cover}`)
              : undefined

            return (
              <BookCard
                key={book.slug}
                title={book.title}
                author={book.author || "Unknown"}
                cover={cover}
                rating={book.rating != null ? String(book.rating) : undefined}
                status={book.status}
                link={`/${book.slug}`}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
