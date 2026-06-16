import { Outlet, useLocation } from "@tanstack/react-router"
import { useEffect, Suspense, lazy } from "react"
import { useStore } from "@/store"
import { PanelStack } from "@/components/panel/PanelStack"
import { usePanelClick } from "@/components/panel/usePanelClick"
import { useHotkeys } from "@/hooks/useHotkeys"
import { useShell } from "@/hooks/useShell"
import { useDynamicFavicon } from "@/hooks/useDynamicFavicon"
const WikiShell = lazy(() => import("./WikiShell").then(m => ({ default: m.WikiShell })))
const ChatShell = lazy(() => import("./ChatShell").then(m => ({ default: m.ChatShell })))
const OSShell = lazy(() => import("@/features/boot/BootPage").then(m => ({ default: m.BootPage })))
import { TerminalTitle } from "./TerminalTitle"
import { CornerMenu } from "./CornerMenu"
import { BgCanvas } from "./BgCanvas"
import { ThemePanel } from "./ThemePanel"
import { QuickControls } from "./QuickControls"
import { GlobalOverlays } from "./GlobalOverlays"
import { ErrorBoundary } from "@/components/ui/ErrorBoundary"
import { SkipToContent } from "@/components/ui/SkipToContent"
import { LinkPreview } from "@/components/ui/LinkPreview"
import { MusicPlayer } from "@/components/ui/MusicPlayer"
import { MobileMusicBar } from "@/components/ui/MobileMusicBar"
import { SearchOverlay } from "@/components/ui/SearchOverlay"
import { GraphOverlay } from "@/components/ui/GraphOverlay"
import { MDXProvider } from "@/components/mdx/MDXProvider"
import { CookieConsent } from "./CookieConsent"
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
  const setContentIndexError = useStore((s) => s.setContentIndexError)

  // Defer content-index fetch — needed by Query components on all shells.
  // A 404 (stale deploy) returns the SPA HTML fallback with a 200-but-not-JSON
  // body, so check both res.ok and content-type before trusting it.
  useEffect(() => {
    let cancelled = false
    fetch("/content-index.json")
      .then((r) => {
        const ct = r.headers.get("content-type") ?? ""
        if (!r.ok || !ct.includes("json")) {
          throw new Error(`content-index ${r.status} (${ct || "no content-type"})`)
        }
        return r.json()
      })
      .then((idx) => {
        if (cancelled) return
        setContentIndex(idx)
        setContentIndexError(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn("Content index failed to load:", err)
        setContentIndexError(true)
      })
    return () => { cancelled = true }
  }, [setContentIndex, setContentIndexError])

  usePanelClick()
  useHotkeys()
  useDynamicFavicon()

  if (shell === "wiki") return <Suspense fallback={null}><WikiShell /><GlobalOverlays /><CookieConsent /></Suspense>
  if (shell === "chat") return <Suspense fallback={null}><ChatShell /><GlobalOverlays /><CookieConsent /></Suspense>
  if (shell === "os") return <Suspense fallback={null}><OSShell /><GlobalOverlays /><CookieConsent /></Suspense>

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
        <SkipToContent />
        <BgCanvas />
        <ThemePanel />
        <LinkPreview />
        <MusicPlayer />
        <MobileMusicBar />
        <QuickControls />
        <SearchOverlay />
        <GraphOverlay />
        <GlobalOverlays />
        
        {/* Terminal title — top-left */}
        <TerminalTitle />

        {/* Horizontal workspace: main pane + panel cards */}
        <div className={styles.workspace} data-testid="workspace">
          <main id="main-content" tabIndex={-1} className={styles.mainPane} data-testid="main-pane">
            <div className={styles.mainContent}>
              <ErrorBoundary label="note" resetKeys={[location.pathname]}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>
          <PanelStack />
        </div>

        {/* Floating Local Graph (Desktop Only) */}
        {showFloatingGraph && (
          <ErrorBoundary label="graph" fallback={() => null}>
            <Suspense fallback={null}>
              <LocalGraph slug={activeSlug} />
            </Suspense>
          </ErrorBoundary>
        )}

        {/* Corner menu — bottom-right (includes Theme toggle) */}
        <CornerMenu />
        <CookieConsent />
      </div>
    </MDXProvider>
  )
}
