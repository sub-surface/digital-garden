import { useStore } from "@/store"

export function SearchButton() {
  const toggleSearch = useStore((s) => s.toggleSearch)

  return (
    <button 
      className="quick-icon-btn" 
      onClick={toggleSearch}
      title="Search (Ctrl+K)"
      data-panel-ignore
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    </button>
  )
}
