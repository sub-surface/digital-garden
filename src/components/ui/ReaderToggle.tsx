import { useStore, READER_MEASURE_STEPS, READER_SCALE_STEPS } from "@/store"

/**
 * Reader-mode control for QuickControls. The book button opens the theme panel
 * (its Reader tab holds the full settings). While reader mode is on, compact
 * steppers for text size and column width sit beside it, plus an exit button,
 * so the controls stay reachable without the panel. Keyboard: F toggles,
 * − / + size, [ / ] width (src/config/hotkeys.ts).
 */
export function ReaderToggle() {
  const isReaderMode = useStore((s) => s.isReaderMode)
  const isThemePanelOpen = useStore((s) => s.isThemePanelOpen)
  const toggleThemePanel = useStore((s) => s.toggleThemePanel)
  const toggleReaderMode = useStore((s) => s.toggleReaderMode)
  const readerScale = useStore((s) => s.readerScale)
  const readerMeasureCh = useStore((s) => s.readerMeasureCh)
  const cycleReaderScale = useStore((s) => s.cycleReaderScale)
  const cycleReaderMeasure = useStore((s) => s.cycleReaderMeasure)

  const atMinScale = readerScale <= READER_SCALE_STEPS[0]
  const atMaxScale = readerScale >= READER_SCALE_STEPS[READER_SCALE_STEPS.length - 1]
  const atMinMeasure = readerMeasureCh <= READER_MEASURE_STEPS[0]
  const atMaxMeasure = readerMeasureCh >= READER_MEASURE_STEPS[READER_MEASURE_STEPS.length - 1]

  return (
    <span className="reader-quick" data-reading={isReaderMode || undefined}>
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

      {isReaderMode && (
        <span className="reader-quick__steppers" role="group" aria-label="Reader typography" data-panel-ignore>
          <button className="quick-icon-btn" onClick={() => cycleReaderScale(-1)} disabled={atMinScale}
            title="Smaller text (−)" aria-label="Smaller text">A<sup>−</sup></button>
          <span className="reader-quick__value" aria-live="polite">{Math.round(readerScale * 100)}%</span>
          <button className="quick-icon-btn" onClick={() => cycleReaderScale(1)} disabled={atMaxScale}
            title="Larger text (+)" aria-label="Larger text">A<sup>+</sup></button>
          <span className="reader-quick__sep" aria-hidden="true" />
          <button className="quick-icon-btn" onClick={() => cycleReaderMeasure(-1)} disabled={atMinMeasure}
            title="Narrower column ([)" aria-label="Narrower column">⇤</button>
          <span className="reader-quick__value" aria-live="polite">{readerMeasureCh}ch</span>
          <button className="quick-icon-btn" onClick={() => cycleReaderMeasure(1)} disabled={atMaxMeasure}
            title="Wider column (])" aria-label="Wider column">⇥</button>
          <button className="quick-icon-btn reader-quick__exit" onClick={toggleReaderMode}
            title="Exit reader mode (F)" aria-label="Exit reader mode">×</button>
        </span>
      )}
    </span>
  )
}
