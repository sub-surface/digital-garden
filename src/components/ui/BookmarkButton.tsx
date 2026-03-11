import { useBookmarks } from "@/hooks/useBookmarks"

interface Props {
  slug: string
  title: string
}

export function BookmarkButton({ slug, title }: Props) {
  const { isBookmarked, toggleBookmark } = useBookmarks()
  const bookmarked = isBookmarked(slug)

  return (
    <button
      className="wiki-edit-btn"
      onClick={() => toggleBookmark(slug, title)}
      title={bookmarked ? "Remove bookmark" : "Bookmark this page"}
      style={{ gap: "4px" }}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={bookmarked ? 0 : 1.5}>
        <path d="M3 2a1 1 0 011-1h8a1 1 0 011 1v12.5a.5.5 0 01-.777.416L8 12.101l-5.223 2.815A.5.5 0 012 14.5V2z"/>
      </svg>
      {bookmarked ? "Bookmarked" : "Bookmark"}
    </button>
  )
}
