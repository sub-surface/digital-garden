import { Outlet } from "@tanstack/react-router"
import { useStore } from "@/store"
import { PanelStack } from "@/components/panel/PanelStack"
import { usePanelClick } from "@/components/panel/usePanelClick"
import { TerminalTitle } from "./TerminalTitle"
import { CornerMenu } from "./CornerMenu"
import { BgCanvas } from "./BgCanvas"
import { ThemePanel } from "./ThemePanel"
import { LinkPreview } from "@/components/ui/LinkPreview"
import styles from "./AppShell.module.scss"

export function AppShell() {
  const isReaderMode = useStore((s) => s.isReaderMode)
  
  usePanelClick()

  return (
    <div
      className={styles.shell}
      data-reader={isReaderMode ? "true" : undefined}
    >
      <BgCanvas />
      <ThemePanel />
      <LinkPreview />
      
      {/* Terminal title — top-left */}
      <TerminalTitle />

      {/* Horizontal workspace: main pane + panel cards */}
      <div className={styles.workspace}>
        <div className={styles.mainPane}>
          <div className={styles.mainContent}>
            <Outlet />
          </div>
        </div>
        <PanelStack />
      </div>

      {/* Corner menu — bottom-right (includes Theme toggle) */}
      <CornerMenu />
    </div>
  )
}
