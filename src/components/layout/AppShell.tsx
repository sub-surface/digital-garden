import { Outlet, useLocation } from "@tanstack/react-router"
import { useEffect, Suspense, lazy } from "react"
import { useStore } from "@/store"
import { PanelStack } from "@/components/panel/PanelStack"
import { usePanelClick } from "@/components/panel/usePanelClick"
import { useHotkeys } from "@/hooks/useHotkeys"
import { useShell } from "@/hooks/useShell"
const WikiShell = lazy(() => import("./WikiShell").then(m => ({ default: m.WikiShell })))
const ChatShell = lazy(() => import("./ChatShell").then(m => ({ default: m.ChatShell })))
import { TerminalTitle } from "./TerminalTitle"
import { CornerMenu } from "./CornerMenu"
import { BgCanvas } from "./BgCanvas"
import { ThemePanel } from "./ThemePanel"
import { QuickControls } from "./QuickControls"
import { LinkPreview } from "@/components/ui/LinkPreview"
import { MusicPlayer } from "@/components/ui/MusicPlayer"
import { MobileMusicBar } from "@/components/ui/MobileMusicBar"
import { SearchOverlay } from "@/components/ui/SearchOverlay"
import { GraphOverlay } from "@/components/ui/GraphOverlay"
import { MDXProvider } from "@/components/mdx/MDXProvider"
import styles from "./AppShell.module.scss"

// Lazy-load LocalGraph — pulls in D3 + PixiJS (~570KB), only needed on desktop
const LocalGraph = lazy(() => import("@/components/ui/LocalGraph").then(m => ({ default: m.LocalGraph })))

export function AppShell() {
  const shell = useShell()
  const isReaderMode = useStore((s) => s.isReaderMode)
  const activeSlug = useStore((s) => s.activeGraphSlug)
  const activeLayout = useStore((s) => s.activeLayout)
  const location = useLocation()
  const setContentIndex = useStore((s) => s.setContentIndex)

  // Defer content-index fetch — needed by Query components on all shells
  useEffect(() => {
    fetch("/content-index.json")
      .then((r) => r.json())
      .then(setContentIndex)
      .catch(() => console.warn("Content index not found — run prebuild first"))
  }, [setContentIndex])

  usePanelClick()
  useHotkeys()

  if (shell === "wiki") return <Suspense fallback={null}><WikiShell /></Suspense>
  if (shell === "chat") return <Suspense fallback={null}><ChatShell /></Suspense>

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 800
  const showFloatingGraph = !isMobile

  return (
    <MDXProvider>
      <div
        className={styles.shell}
        data-reader={isReaderMode ? "true" : undefined}
        data-layout={activeLayout}
        data-testid="app-shell"
      >
        <BgCanvas />
        <ThemePanel />
        <LinkPreview />
        <MusicPlayer />
        <MobileMusicBar />
        <QuickControls />
        <SearchOverlay />
        <GraphOverlay />
        
        {/* Terminal title — top-left */}
        <TerminalTitle />

        {/* Horizontal workspace: main pane + panel cards */}
        <div className={styles.workspace} data-testid="workspace">
          <main className={styles.mainPane} data-testid="main-pane">
            <div className={styles.mainContent}>
              <Outlet />
            </div>
          </main>
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
