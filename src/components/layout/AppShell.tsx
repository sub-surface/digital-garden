import { Outlet } from "@tanstack/react-router"
import { useStore } from "@/store"
import { PanelStack } from "@/components/panel/PanelStack"
import { usePanelClick } from "@/components/panel/usePanelClick"
import { TerminalTitle } from "./TerminalTitle"
import { CornerMenu } from "./CornerMenu"
import { BgCanvas } from "./BgCanvas"
import { ThemePanel } from "./ThemePanel"
import { LinkPreview } from "@/components/ui/LinkPreview"
import { MusicPlayer } from "@/components/ui/MusicPlayer"
import { MusicBar } from "@/components/ui/MusicBar"
import { SearchOverlay } from "@/components/ui/SearchOverlay"
import { BgModeToggle } from "@/components/ui/BgModeToggle"
import { MDXProvider } from "@/components/mdx/MDXProvider"
import styles from "./AppShell.module.scss"

export function AppShell() {
  const isReaderMode = useStore((s) => s.isReaderMode)
  
  usePanelClick()

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
        <MusicBar />
        <BgModeToggle />
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

        {/* Corner menu — bottom-right (includes Theme toggle) */}
        <CornerMenu />
      </div>
    </MDXProvider>
  )
}
