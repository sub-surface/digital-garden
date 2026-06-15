import { useRandomNote } from "@/hooks/useRandomNote"

/** Dice button — jumps to a random note. Bound to the `r` hotkey too. */
export function RandomNoteButton() {
  const goRandom = useRandomNote()

  return (
    <button
      className="quick-icon-btn"
      onClick={goRandom}
      title="Random note (r)"
      aria-label="Jump to a random note"
      data-panel-ignore
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" />
        <circle cx="16" cy="8" r="1.25" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
        <circle cx="8" cy="16" r="1.25" fill="currentColor" stroke="none" />
        <circle cx="16" cy="16" r="1.25" fill="currentColor" stroke="none" />
      </svg>
    </button>
  )
}
