import { Outlet, useLocation } from "@tanstack/react-router"
import { LazyThemePanel, LazyMusicPlayer } from "./lazyOverlay"
import { useEffect, Suspense, lazy } from "react"
import { useStore } from "@/store"
import { PanelStack } from "@/components/panel/PanelStack"
import { usePanelClick } from "@/components/panel/usePanelClick"
import { useHotkeys } from "@/hooks/useHotkeys"
import { useShell } from "@/hooks/useShell"
import { useDynamicFavicon } from "@/hooks/useDynamicFavicon"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { useScrollManager } from "@/hooks/useScrollManager"
import { slugFromPathname } from "@/lib/slug"
const WikiShell = lazy(() => import("./WikiShell").then(m => ({ default: m.WikiShell })))
const ChatShell = lazy(() => import("./ChatShell").then(m => ({ default: m.ChatShell })))
const OSShell = lazy(() => import("@/features/os/OSShell").then(m => ({ default: m.OSShell })))
import { TerminalTitle } from "./TerminalTitle"
import { PhoneBar } from "./PhoneBar"
import { BgCanvas } from "./BgCanvas"
import { Ambience } from "@/features/ambience/Ambience"
import { GlorpPeek } from "@/features/glorp/GlorpPeek"
import { useTrail } from "@/features/terminal/trail"
import { QuickControls } from "./QuickControls"
import { GlobalOverlays } from "./GlobalOverlays"
import { ErrorBoundary } from "@/components/ui/ErrorBoundary"
import { SkipToContent } from "@/components/ui/SkipToContent"
import { LinkPreview } from "@/components/ui/reader/LinkPreview"
import { GraphOverlay } from "@/components/ui/graph/GraphOverlay"
import { CookieConsent } from "./CookieConsent"
import styles from "./AppShell.module.scss"

// Lazy-load LocalGraph — pulls in D3 + PixiJS (~570KB), only needed on desktop
const LocalGraph = lazy(() => import("@/components/ui/graph/LocalGraph").then(m => ({ default: m.LocalGraph })))

export function AppShell() {
  const shell = useShell()
  const isWiki = shell === "wiki"
  const isReaderMode = useStore((s) => s.isReaderMode)
  const readerShowBg = useStore((s) => s.readerShowBg)
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

  useScrollManager()
  usePanelClick()
  useHotkeys()
  useTrail()
  useDynamicFavicon()
  const isMobile = usePhoneViewport() // hooks before shell branch (React rules)

  if (shell === "wiki") return <Suspense fallback={null}><WikiShell /><GlobalOverlays /><CookieConsent /></Suspense>
  if (shell === "chat") return <Suspense fallback={null}><ChatShell /><CookieConsent /></Suspense>
  if (shell === "os") return <Suspense fallback={null}><OSShell /><GlobalOverlays /><CookieConsent /></Suspense>

  const showFloatingGraph = !isMobile
  const isWikiRoute =
    isWiki ||
    slugFromPathname(location.pathname, isWiki).toLowerCase().startsWith("wiki") ||
    activeSlug.toLowerCase().startsWith("wiki") ||
    location.pathname.toLowerCase().startsWith("/wiki")

  return (
    <>
      <div
        className={styles.shell}
        data-reader={isReaderMode ? "true" : undefined}
        data-reader-bg={isReaderMode && readerShowBg ? "show" : undefined}
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
        <Ambience />
        <GlorpPeek />
        <LazyThemePanel />
        <LinkPreview />
        {!isWikiRoute && <LazyMusicPlayer />}
        <QuickControls />
        <GraphOverlay />
        <GlobalOverlays />
        
        {/* Terminal title — top-left. Not on phones: there the bottom PhoneBar
            says where you are, and a fixed strip at the top only covered text. */}
        {!isMobile && <TerminalTitle />}

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

        {/* Phones: the one bottom bar (prompt, music, reader, more) */}
        {isMobile && <PhoneBar variant={isWikiRoute ? "wiki" : "default"} />}
        <CookieConsent />
      </div>
    </>
  )
}
