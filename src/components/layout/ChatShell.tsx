import { Outlet } from "@tanstack/react-router"
import { useStore } from "@/store"
import { ThemePanel } from "./ThemePanel"
import { BgCanvas } from "./BgCanvas"
import { TerminalTitle } from "./TerminalTitle"
import { QuickControls } from "./QuickControls"
import { NotificationBanner } from "@/components/ui/NotificationBanner"
import styles from "./ChatShell.module.scss"

export function ChatShell() {
  const activeLayout = useStore((s) => s.activeLayout)

  return (
    <div
      className={styles.shell}
      data-chat
      data-layout={activeLayout}
      data-testid="chat-shell"
    >
      <BgCanvas />
      <ThemePanel />

      <NotificationBanner />
      <TerminalTitle context="chat" />
      <QuickControls variant="chat" />

      <main className={styles.mainPane} data-testid="main-pane">
        <Outlet />
      </main>

    </div>
  )
}
