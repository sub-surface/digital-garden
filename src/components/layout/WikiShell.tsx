import { Outlet, useLocation } from "@tanstack/react-router"
import { useStore } from "@/store"
import { ThemePanel } from "./ThemePanel"
import { BgCanvas } from "./BgCanvas"
import { QuickControls } from "./QuickControls"
import { TerminalTitle } from "./TerminalTitle"
import { CornerMenu } from "./CornerMenu"
import { LinkPreview } from "@/components/ui/reader/LinkPreview"
import { SearchOverlay } from "@/components/ui/overlays/SearchOverlay"
import { MDXProvider } from "@/components/mdx/MDXProvider"
import { WikiSearchBox } from "@/components/ui/wiki/WikiSearchBox"
import { SideChat } from "@/components/ui/chat/SideChat"
import { NotificationBanner } from "@/components/ui/NotificationBanner"
import { ErrorBoundary } from "@/components/ui/ErrorBoundary"
import { SkipToContent } from "@/components/ui/SkipToContent"
import styles from "./WikiShell.module.scss"

export function WikiShell() {
  const activeLayout = useStore((s) => s.activeLayout)
  const isReaderMode = useStore((s) => s.isReaderMode)
  const readerMeasureCh = useStore((s) => s.readerMeasureCh)
  const readerScale = useStore((s) => s.readerScale)
  const isSideChatOpen = useStore((s) => s.isSideChatOpen)
  const sideChatWidth = useStore((s) => s.sideChatWidth)
  const location = useLocation()

  return (
    <MDXProvider>
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
        <ThemePanel />
        <QuickControls />
        <LinkPreview />
        <SearchOverlay />

        <NotificationBanner />
        <TerminalTitle context="wiki" />
        <WikiSearchBox />

        <div className={styles.dockedLayout}>
          <main
            id="main-content"
            tabIndex={-1}
            className={styles.mainPane}
            data-testid="main-pane"
            style={isSideChatOpen ? { width: `calc(100% - ${sideChatWidth}px)` } : undefined}
          >
            <div className={styles.mainContent}>
              <ErrorBoundary label="page" resetKeys={[location.pathname]}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>

          <SideChat />
        </div>
        <CornerMenu variant="wiki" />
      </div>
    </MDXProvider>
  )
}
