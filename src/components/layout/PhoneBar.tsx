import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore, READER_SCALE_STEPS } from "@/store"
import { useRandomNote } from "@/hooks/useRandomNote"
import { useMusic } from "@/components/ui/music/MusicContext"
import { MODES, type ModeId } from "@/config/modes"
import styles from "./PhoneBar.module.scss"

/**
 * The phone's one piece of chrome: a slim bar along the bottom edge.
 *
 * It replaced three things that each floated over the page (the fixed
 * TerminalTitle strip at the top, the ☰ CornerMenu with its pop-up list and
 * reader buttons, and the separate 48px music bar). One surface, thumb-side:
 *
 *   default  › where you are (tap: prompt)       ♫  ▤  ···
 *   music    ▶ track title (tap: turntable)  ›   ♫  ▤  ···
 *   reading  A−  100%  A+                         × reader
 *
 * It slides away while you scroll down and returns on scroll up. Its visible
 * height is published as `--phone-bar-h` on <html> (by CSS, from its known
 * height: see the module) so the music player and glorp can sit on top of it. `···` opens a sheet with the rest: random,
 * settings, philchat, the other rooms, about, privacy.
 *
 * Every action here is also a prompt command (gotcha #25).
 */
// Reading progress comes from CSS scroll-driven animation where it exists
// (PhoneBar.module.scss); otherwise the scroll listener writes --read.
const NATIVE_READ = typeof CSS !== "undefined" && !!CSS.supports?.("timeline-scope: --page")

export function PhoneBar({ variant = "default" }: { variant?: "default" | "wiki" }) {
  const isWiki = variant === "wiki"
  const navigate = useNavigate()
  const goRandom = useRandomNote()
  const { isPlaying, togglePlay, currentTrack } = useMusic()

  const activeSlug = useStore((s) => s.activeGraphSlug)
  const contentIndex = useStore((s) => s.contentIndex)
  const openDock = useStore((s) => s.openDock)
  const dock = useStore((s) => s.dock)
  const isReaderMode = useStore((s) => s.isReaderMode)
  const toggleReaderMode = useStore((s) => s.toggleReaderMode)
  const readerScale = useStore((s) => s.readerScale)
  const cycleReaderScale = useStore((s) => s.cycleReaderScale)
  const toggleThemePanel = useStore((s) => s.toggleThemePanel)
  const isThemePanelOpen = useStore((s) => s.isThemePanelOpen)
  const isMusicOpen = useStore((s) => s.isMusicOpen)
  const toggleMusic = useStore((s) => s.toggleMusic)
  const isMusicExpanded = useStore((s) => s.isMusicExpanded)
  const setIsMusicExpanded = useStore((s) => s.setIsMusicExpanded)
  const clearStack = useStore((s) => s.clearStack)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  const showMusic = !isWiki && isMusicOpen && !!currentTrack
  const pinned = sheetOpen || isMusicExpanded || isThemePanelOpen || isReaderMode

  // Hide on scroll down, show on scroll up. The page scrolls inside the main
  // pane (not the window), so listen in the capture phase for any scroller.
  useEffect(() => {
    const last = new WeakMap<EventTarget, number>()
    // Movement summed per direction: touch and smooth scrolling arrive as
    // many small steps, so a per-event threshold would never trip.
    let run = 0
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement
      if (!el || typeof el.scrollTop !== "number") return
      if (barRef.current?.contains(el) || el.closest?.("[data-phone-sheet]")) return
      const top = el.scrollTop
      const prev = last.get(el) ?? top
      last.set(el, top)
      const delta = top - prev
      if (delta === 0) return
      run = Math.sign(delta) === Math.sign(run) ? run + delta : delta
      if (top < 60 || run < -24) setHidden(false)
      else if (run > 24) setHidden(true)
      // Reading progress for the page's own scroller: a hairline along the
      // bar's top edge, written straight to style (no re-render per frame).
      if (!NATIVE_READ && (el.id === "main-content" || el.dataset.testid === "main-pane")) {
        const max = el.scrollHeight - el.clientHeight
        barRef.current?.style.setProperty("--read", max > 0 ? String(Math.min(1, top / max)) : "0")
      }
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => document.removeEventListener("scroll", onScroll, { capture: true })
  }, [])

  const isHidden = hidden && !pinned

  // The sheet closes on Escape, a tap outside, or any action in it.
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [sheetOpen])

  if (dock) return null // the dock is a full-screen sheet on phones

  const where = contentIndex?.[activeSlug]?.title ?? (isWiki ? "Philchat Wiki" : "Sub-Surface Territories")
  const current: ModeId = isWiki ? "wiki" : activeSlug.toLowerCase() === "arcade" ? "arcade" : "notes"
  const rooms = MODES.filter((m) => m.id !== current)

  const act = (fn: () => void) => () => {
    setSheetOpen(false)
    fn()
  }

  const goRoom = (id: ModeId, href: string) => {
    setSheetOpen(false)
    if (!isWiki && (id === "notes" || id === "arcade")) {
      clearStack()
      navigate(id === "notes" ? { to: "/" } : { to: "/$", params: { _splat: "arcade" } })
    } else {
      window.location.href = href
    }
  }

  const goPage = (to: string) => {
    setSheetOpen(false)
    clearStack()
    navigate({ to })
  }

  return (
    <>
      {sheetOpen && (
        <div className={styles.backdrop} onClick={() => setSheetOpen(false)} data-panel-ignore aria-hidden="true" />
      )}

      <div className={styles.sheet} data-open={sheetOpen || undefined} data-phone-sheet data-panel-ignore role="dialog" aria-label="More" inert={!sheetOpen}>
        <div className={styles.sheetGrid}>
          {!isWiki && <button className={styles.tile} onClick={act(goRandom)}><span className={styles.tileGlyph}>⁂</span>random</button>}
          <button className={styles.tile} onClick={act(toggleThemePanel)}><span className={styles.tileGlyph}>◐</span>settings</button>
          <button className={styles.tile} onClick={act(() => openDock("chat"))}><span className={styles.tileGlyph}>¶</span>philchat</button>
          <button className={styles.tile} onClick={act(() => openDock("prompt"))}><span className={styles.tileGlyph}>›</span>prompt</button>
        </div>
        <div className={styles.sheetRooms}>
          {rooms.map((m) => (
            <button key={m.id} className={styles.room} onClick={() => goRoom(m.id, m.href)}>{m.label}</button>
          ))}
        </div>
        <div className={styles.sheetFooter}>
          <a href="/about" onClick={(e) => { e.preventDefault(); goPage("/about") }}>about</a>
          <a href="/privacy" onClick={(e) => { e.preventDefault(); goPage("/privacy") }}>privacy</a>
          {import.meta.env.DEV && !isWiki && (
            <a href="/__dev" onClick={(e) => { e.preventDefault(); goPage("/__dev") }}>dev</a>
          )}
          <span className={styles.copyright}>&copy; Sub-Surface</span>
        </div>
      </div>

      <div
        ref={barRef}
        className={styles.bar}
        data-hidden={isHidden || undefined}
        data-panel-ignore
        data-reader-keep
        data-phone-bar
      >
        {isReaderMode ? (
          <>
            <div className={styles.reader} role="group" aria-label="Reader typography">
              <button className={styles.icon} onClick={() => cycleReaderScale(-1)} disabled={readerScale <= READER_SCALE_STEPS[0]} aria-label="Smaller text">A<sup>−</sup></button>
              <span className={styles.readerValue} aria-live="polite">{Math.round(readerScale * 100)}%</span>
              <button className={styles.icon} onClick={() => cycleReaderScale(1)} disabled={readerScale >= READER_SCALE_STEPS[READER_SCALE_STEPS.length - 1]} aria-label="Larger text">A<sup>+</sup></button>
            </div>
            <button className={styles.leave} onClick={toggleReaderMode}>× reader</button>
          </>
        ) : (
          <>
            {showMusic ? (
              <div className={styles.now}>
                <button className={styles.icon} onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19H10V5H6V19ZM14 5V19H18V5H14Z" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5V19L19 12L8 5Z" /></svg>
                  )}
                </button>
                <button
                  className={styles.track}
                  onClick={() => setIsMusicExpanded(!isMusicExpanded)}
                  aria-expanded={isMusicExpanded}
                  aria-label={`${currentTrack!.title}: open the turntable`}
                >
                  <span className={styles.trackTitle}>{currentTrack!.title}</span>
                </button>
                <button className={styles.icon} onClick={() => openDock("prompt")} aria-label="Prompt">›</button>
              </div>
            ) : (
              <button className={styles.where} onClick={() => openDock("prompt")} aria-label={`${where}: open the prompt`}>
                <span className={styles.caret}>›</span>
                <span className={styles.whereText}>{where}</span>
              </button>
            )}

            <div className={styles.icons}>
              {!isWiki && (
                <button
                  className={styles.icon}
                  onClick={() => {
                    if (isMusicOpen) setIsMusicExpanded(false)
                    toggleMusic()
                  }}
                  data-active={isMusicOpen || undefined}
                  aria-pressed={isMusicOpen}
                  aria-label="Music"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </button>
              )}
              <button className={styles.icon} onClick={toggleReaderMode} aria-label="Reader mode">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </button>
              <button
                className={styles.icon}
                onClick={() => setSheetOpen((v) => !v)}
                data-active={sheetOpen || undefined}
                aria-expanded={sheetOpen}
                aria-label="More"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
