import { Outlet, useLocation } from "@tanstack/react-router"
import { useStore } from "@/store"
import { ThemePanel } from "./ThemePanel"
import { BgCanvas } from "./BgCanvas"
import { QuickControls } from "./QuickControls"
import { TerminalTitle } from "./TerminalTitle"
import { CornerMenu } from "./CornerMenu"
import { LinkPreview } from "@/components/ui/LinkPreview"
import { SearchOverlay } from "@/components/ui/SearchOverlay"
import { MDXProvider } from "@/components/mdx/MDXProvider"
import { SideChat } from "@/components/ui/SideChat"
import { NotificationBanner } from "@/components/ui/NotificationBanner"
import styles from "./WikiShell.module.scss"

export function WikiShell() {
  const activeLayout = useStore((s) => s.activeLayout)
  const isSideChatOpen = useStore((s) => s.isSideChatOpen)
  const sideChatWidth = useStore((s) => s.sideChatWidth)
  const location = useLocation()

  const segments = location.pathname.replace(/^\//, "").split("/").filter(Boolean)
  const breadcrumb = segments.map((s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))

  return (
    <MDXProvider>
      <div
        className={styles.shell}
        data-wiki
        data-layout={activeLayout}
        data-testid="wiki-shell"
      >
        <BgCanvas />
        <ThemePanel />
        <QuickControls />
        <LinkPreview />
        <SearchOverlay />

        <NotificationBanner />
        <TerminalTitle context="wiki" />

        {breadcrumb.length > 0 && (
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className={styles.breadcrumbSegment}>
                {i > 0 && <span className={styles.breadcrumbSep}>/</span>}
                {crumb}
              </span>
            ))}
          </nav>
        )}

        <div className={styles.dockedLayout}>
          <main
            className={styles.mainPane}
            data-testid="main-pane"
            style={isSideChatOpen ? { width: `calc(100% - ${sideChatWidth}px)` } : undefined}
          >
            <div className={styles.mainContent}>
              <Outlet />
            </div>
          </main>

          <SideChat />
        </div>
        <CornerMenu variant="wiki" />
      </div>
    </MDXProvider>
  )
}
