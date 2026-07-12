import { Outlet, useLocation } from "@tanstack/react-router"
import { useEffect, useSyncExternalStore, Suspense, lazy } from "react"
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
import { LinkPreview } from "@/components/ui/reader/LinkPreview"
import { MusicPlayer } from "@/components/ui/music/MusicPlayer"
import { MobileMusicBar } from "@/components/ui/music/MobileMusicBar"
import { SearchOverlay } from "@/components/ui/overlays/SearchOverlay"
import { GraphOverlay } from "@/components/ui/graph/GraphOverlay"
import { MDXProvider } from "@/components/mdx/MDXProvider"
import { CookieConsent } from "./CookieConsent"
import styles from "./AppShell.module.scss"

// Lazy-load LocalGraph — pulls in D3 + PixiJS (~570KB), only needed on desktop
const LocalGraph = lazy(() => import("@/components/ui/graph/LocalGraph").then(m => ({ default: m.LocalGraph })))

// Reactive mobile check — a plain window.innerWidth read only ran at mount, so
// resizing/rotating never re-evaluated the floating graph.
const mobileQuery = typeof window !== "undefined" ? window.matchMedia("(max-width: 800px)") : null
function useIsMobile(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      mobileQuery?.addEventListener("change", onChange)
      return () => mobileQuery?.removeEventListener("change", onChange)
    },
    () => mobileQuery?.matches ?? false,
    () => false,
  )
}

export function AppShell() {
  const shell = useShell()
  const isReaderMode = useStore((s) => s.isReaderMode)
  const readerMeasureCh = useStore((s) => s.readerMeasureCh)
  const readerScale = useStore((s) => s.readerScale)
  const activeSlug = useStore((s) => s.activeGraphSlug)
  const activeLayout = useStore((s) => s.activeLayout)
  const location = useLocation()
  const setContentIndex = useStore((s) => s.setContentIndex)
  const setContentIndexError = useStore((s) => s.setContentIndexError)
  const setImageDimensions = useStore((s) => s.setImageDimensions)

  // Defer content-index fetch — needed by Query components on all shells.
  // A 404 (stale deploy) returns the SPA HTML fallback with a 200-but-not-JSON
  // body, so check both res.ok and content-type before trusting it.
  useEffect(() => {
    let cancelled = false
    
    Promise.all([
      fetch("/content-index.json").then((r) => {
        const ct = r.headers.get("content-type") ?? ""
        if (!r.ok || !ct.includes("json")) {
          throw new Error(`content-index ${r.status} (${ct || "no content-type"})`)
        }
        return r.json()
      }),
      fetch("/image-dimensions.json").then((r) => {
        const ct = r.headers.get("content-type") ?? ""
        if (!r.ok || !ct.includes("json")) {
          console.warn(`image-dimensions ${r.status} (${ct || "no content-type"})`)
          return null // don't throw, just return null so it doesn't break content-index
        }
        return r.json()
      }).catch(err => {
        console.warn("Failed to fetch image dimensions:", err)
        return null
      })
    ])
      .then(([idx, dimensions]) => {
        if (cancelled) return
        setContentIndex(idx)
        setContentIndexError(false)
        if (dimensions) setImageDimensions(dimensions)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn("Content index failed to load:", err)
        setContentIndexError(true)
      })
      
    return () => { cancelled = true }
  }, [setContentIndex, setContentIndexError, setImageDimensions])

  usePanelClick()
  useHotkeys()
  useDynamicFavicon()
  const isMobile = useIsMobile() // hooks before shell branch (React rules)

  if (shell === "wiki") return <Suspense fallback={null}><WikiShell /><GlobalOverlays /><CookieConsent /></Suspense>
  if (shell === "chat") return <Suspense fallback={null}><ChatShell /><GlobalOverlays /><CookieConsent /></Suspense>
  if (shell === "os") return <Suspense fallback={null}><OSShell /><GlobalOverlays /><CookieConsent /></Suspense>

  const showFloatingGraph = !isMobile

  return (
    <MDXProvider>
      <div
        className={styles.shell}
        data-reader={isReaderMode ? "true" : undefined}
        data-layout={activeLayout}
        data-testid="app-shell"
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
