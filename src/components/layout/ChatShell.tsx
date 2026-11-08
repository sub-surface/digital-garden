import { Outlet } from "@tanstack/react-router"
import { useStore } from "@/store"
import { NotificationBanner } from "@/components/ui/NotificationBanner"
import { ErrorBoundary } from "@/components/ui/ErrorBoundary"
import styles from "./ChatShell.module.scss"

/**
 * chat.subsurfaces.net, in cold storage: just the room, chromeless, for the
 * dock's pop-out button. philchat proper lives in the dock (C, or the chat
 * button in the bar).
 *
 * The full chat site (rooms sidebar, terminal view, its own bar) was retired
 * on 2026-11-08 and is preserved at the git tag `cold-storage/chat-shell`,
 * pending a redesign as a small social space.
 */
export function ChatShell() {
  const chatDensity = useStore((s) => s.chatDensity)
  const chatFontScale = useStore((s) => s.chatFontScale)

  return (
    <div
      className={styles.shell}
      data-chat
      data-density={chatDensity}
      style={{ "--chat-font-scale": chatFontScale } as React.CSSProperties}
      data-testid="chat-shell"
    >
      <NotificationBanner />
      <main id="main-content" tabIndex={-1} className={styles.mainPane} data-testid="main-pane">
        <ErrorBoundary label="chat">
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
