import { useStore } from "@/store"

/**
 * Reader-mode toggle for QuickControls. Reader mode fades the background canvas
 * and hides shell chrome for distraction-free prose. Mirrors the toggle in the
 * ThemePanel so it's reachable without opening the panel.
 */
export function ReaderToggle() {
  const isReaderMode = useStore((s) => s.isReaderMode)
  const toggleReaderMode = useStore((s) => s.toggleReaderMode)

  return (
    <button
      className="quick-icon-btn"
      onClick={toggleReaderMode}
      title={isReaderMode ? "Exit reader mode" : "Reader mode"}
      aria-label="Toggle reader mode"
      aria-pressed={isReaderMode}
      data-active={isReaderMode || undefined}
      data-panel-ignore
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    </button>
  )
}
