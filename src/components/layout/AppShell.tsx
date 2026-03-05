import { Outlet, useLocation } from "@tanstack/react-router"
import { useStore } from "@/store"
import { PanelStack } from "@/components/panel/PanelStack"
import { usePanelClick } from "@/components/panel/usePanelClick"
import { TerminalTitle } from "./TerminalTitle"
import { CornerMenu } from "./CornerMenu"
import { BgCanvas } from "./BgCanvas"
import { ThemePanel } from "./ThemePanel"
import { QuickControls } from "./QuickControls"
import { LinkPreview } from "@/components/ui/LinkPreview"
import { MusicPlayer } from "@/components/ui/MusicPlayer"
import { SearchOverlay } from "@/components/ui/SearchOverlay"
import { MDXProvider } from "@/components/mdx/MDXProvider"
import { LocalGraph } from "@/components/ui/LocalGraph"
import { Suspense, lazy } from "react"
import styles from "./AppShell.module.scss"

export function AppShell() {
  const isReaderMode = useStore((s) => s.isReaderMode)
  const activeSlug = useStore((s) => s.activeGraphSlug)
  const location = useLocation()
  
  usePanelClick()

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 800
  const showFloatingGraph = !isMobile && location.pathname !== '/graph'

  return (
    <MDXProvider>
      <div
        className={styles.shell}
        data-reader={isReaderMode ? "true" : undefined}
        data-testid="app-shell"
      >
        <BgCanvas />
        <ThemePanel />
        <LinkPreview />
        <MusicPlayer />
        <QuickControls />
        <SearchOverlay />
        
        {/* Terminal title — top-left */}
        <TerminalTitle />

        {/* Horizontal workspace: main pane + panel cards */}
        <div className={styles.workspace} data-testid="workspace">
          <div className={styles.mainPane} data-testid="main-pane">
            <div className={styles.mainContent}>
              <Outlet />
            </div>
          </div>
          <PanelStack />
        </div>

        {/* Floating Local Graph (Desktop Only) */}
        {showFloatingGraph && (
          <Suspense fallback={null}>
            <LocalGraph slug={activeSlug} />
          </Suspense>
        )}

        {/* Corner menu — bottom-right (includes Theme toggle) */}
        <CornerMenu />
      </div>
    </MDXProvider>
  )
}
