import { Outlet, useLocation } from "@tanstack/react-router"
import { LazyThemePanel } from "./lazyOverlay"
import { useStore } from "@/store"
import { BgCanvas } from "./BgCanvas"
import { QuickControls } from "./QuickControls"
import { TerminalTitle } from "./TerminalTitle"
import { CornerMenu } from "./CornerMenu"
import { LinkPreview } from "@/components/ui/reader/LinkPreview"
import { WikiSearchBox } from "@/components/ui/wiki/WikiSearchBox"
import { NotificationBanner } from "@/components/ui/NotificationBanner"
import { ErrorBoundary } from "@/components/ui/ErrorBoundary"
import { SkipToContent } from "@/components/ui/SkipToContent"
import styles from "./WikiShell.module.scss"

export function WikiShell() {
  const activeLayout = useStore((s) => s.activeLayout)
  const isReaderMode = useStore((s) => s.isReaderMode)
  const readerMeasureCh = useStore((s) => s.readerMeasureCh)
  const readerScale = useStore((s) => s.readerScale)
  const location = useLocation()

  return (
    <>
      <div
        className={styles.shell}
        data-wiki
        data-layout={activeLayout}
        data-reader={isReaderMode ? "true" : undefined}
        data-testid="wiki-shell"
        style={
          isReaderMode
            ? ({
                "--reader-measure": `${readerMeasureCh}ch`,
                "--reader-scale": String(readerScale),
              } as React.CSSProperties)
            : undefined
        }
      >
        <SkipToContent />
        <BgCanvas />
        <LazyThemePanel />
        <QuickControls />
        <LinkPreview />

        <NotificationBanner />
        <TerminalTitle context="wiki" />
        <WikiSearchBox />

        <div className={styles.dockedLayout}>
          <main
            id="main-content"
            tabIndex={-1}
            className={styles.mainPane}
            data-testid="main-pane"
          >
            <div className={styles.mainContent}>
              <ErrorBoundary label="page" resetKeys={[location.pathname]}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>
        </div>
        <CornerMenu variant="wiki" />
      </div>
    </>
  )
}
