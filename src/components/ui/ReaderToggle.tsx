import { useStore } from "@/store"

/**
 * Reader-mode toggle for QuickControls. Reader mode fades the background canvas
 * and hides shell chrome for distraction-free prose. Mirrors the toggle in the
 * ThemePanel so it's reachable without opening the panel.
 */
export function ReaderToggle() {
  const isReaderMode = useStore((s) => s.isReaderMode)
  const isThemePanelOpen = useStore((s) => s.isThemePanelOpen)
  const toggleThemePanel = useStore((s) => s.toggleThemePanel)

  return (
    <button
      className="quick-icon-btn"
      onClick={toggleThemePanel}
      title="Theme & reader settings (\)"
      aria-label="Open theme and reader settings"
      aria-pressed={isReaderMode}
      data-active={isReaderMode || isThemePanelOpen || undefined}
      data-panel-ignore
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    </button>
  )
}
