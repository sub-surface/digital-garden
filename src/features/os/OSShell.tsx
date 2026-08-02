/**
 * Root of SUBSURFACES 95 — os.subsurfaces.net.
 *
 * State machine: post → splash → desktop, plus an escape hatch to the original
 * endless TUI. See docs/os-95-spec.md.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { BgCanvas } from "@/components/layout/BgCanvas"
import { useMusic } from "@/components/ui/music/MusicContext"
import { useStore } from "@/store"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { OSBoot, OSSplash } from "./OSBoot"
import { useOS, useOSSettings } from "./osStore"
import { Desktop } from "./Desktop"
import styles from "./OS.module.scss"
import { playOSSound } from "./osSounds"
import { OSLogon } from "./OSLogon"

const Constellation = lazy(() =>
  import("@/components/ui/graph/ConstellationPage").then((m) => ({ default: m.ConstellationPage })),
)

const Terminal = lazy(() =>
  import("@/features/terminal/Terminal").then((m) => ({ default: m.Terminal })),
)

type Stage = "post" | "splash" | "logon" | "desktop" | "dos"

/** Boot plays once per tab, not once per navigation. */
const BOOTED_KEY = "subsurfaces95:booted"

function hasBooted(): boolean {
  try {
    return sessionStorage.getItem(BOOTED_KEY) === "1"
  } catch {
    // Private mode / storage disabled — boot every time rather than crash.
    return false
  }
}

function markBooted(): void {
  try {
    sessionStorage.setItem(BOOTED_KEY, "1")
  } catch {
    /* not fatal */
  }
}

export function OSShell() {
  const isPhone = usePhoneViewport()
  const bootSequence = useOSSettings((s) => s.bootSequence)
  // Read once, on mount: flipping the setting later must not restart a desktop
  // that is already up.
  const [stage, setStage] = useState<Stage>(() =>
    hasBooted() || useOSSettings.getState().bootSequence === "off"
      ? useOSSettings.getState().showLogon ? "logon" : "desktop"
      : "post",
  )

  const enterDesktop = useCallback((setupWiki = false) => {
    setStage("desktop")
    const settings = useOSSettings.getState()
    if (settings.soundEnabled && settings.soundEvents?.startup) playOSSound("startup", settings.soundVolume)
    if (setupWiki) {
      useOS.getState().openWindow({ appId: "newpage", args: {}, title: "Create a Wiki Page", w: 760, h: 620, silent: true })
    }
  }, [])

  const finishPost = useCallback(() => {
    markBooted()
    setStage("splash")
  }, [])

  // Start-menu session actions use events rather than a prop channel threaded
  // through Desktop and Taskbar. Logoff returns to the native account screen;
  // DOS mode swaps the desktop for the shared fullscreen terminal.
  useEffect(() => {
    const toDos = () => setStage("dos")
    const toLogon = () => setStage("logon")
    window.addEventListener("os:dos-mode", toDos)
    window.addEventListener("os:logon", toLogon)
    return () => {
      window.removeEventListener("os:dos-mode", toDos)
      window.removeEventListener("os:logon", toLogon)
    }
  }, [])

  if (isPhone) return <PhoneGuard />

  // "Restart in MS-DOS mode" — the same terminal, without the window frame.
  if (stage === "dos") {
    return (
      <Suspense fallback={null}>
        <Terminal surface="page" />
        <button
          type="button"
          className={styles.crtBtn}
          style={{ position: "fixed", right: 16, top: 16, zIndex: 100000 }}
          onClick={() => setStage("desktop")}
        >
          EXIT
        </button>
      </Suspense>
    )
  }

  return (
    <div className={styles.os}>
      {/* Wallpaper: the site's own ambient canvas, at z-0 as everywhere else. */}
      <BgCanvas />

      {stage === "desktop" && <Desktop />}
      {stage === "post" && (
        <OSBoot onComplete={finishPost} variant={bootSequence === "full" ? "full" : "post"} />
      )}
      {stage === "splash" && <OSSplash onDone={() => {
        if (useOSSettings.getState().showLogon) setStage("logon")
        else enterDesktop()
      }} />}
      {stage === "logon" && <OSLogon onContinue={({ guest, rememberGuest, setupWiki }) => {
        if (guest && rememberGuest) useOSSettings.getState().setShowLogon(false)
        enterDesktop(setupWiki)
      }} />}

      {stage === "desktop" && <ScreenSaver />}
      {stage === "desktop" && <BlueScreen />}
    </div>
  )
}

/**
 * A fatal exception has occurred. Triggered only by the terminal's `bsod`
 * command — nothing here crashes on its own, and it dismisses on any key.
 */
function BlueScreen() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const show = () => setVisible(true)
    window.addEventListener("os:bsod", show)
    return () => window.removeEventListener("os:bsod", show)
  }, [])

  useEffect(() => {
    if (!visible) return
    const dismiss = () => setVisible(false)
    // Deferred so the keystroke that ran the command doesn't dismiss it.
    const id = setTimeout(() => {
      window.addEventListener("keydown", dismiss, { once: true })
      window.addEventListener("pointerdown", dismiss, { once: true })
    }, 120)
    return () => {
      clearTimeout(id)
      window.removeEventListener("keydown", dismiss)
      window.removeEventListener("pointerdown", dismiss)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div className={styles.bsod} role="alertdialog" aria-label="Fatal exception">
      <div className={styles.bsodInner}>
        <div className={styles.bsodTitle}>SUBSURFACES 95</div>
        {"\n"}
        A fatal exception 0E has occurred at 0028:C001C3F0 in VXD GARDEN(01) +
        00010E36. The current application will be terminated.
        {"\n\n"}
        {"*  Press any key to terminate the current application.\n"}
        {"*  Press CTRL+ALT+DEL again to restart your computer. You will\n"}
        {"   lose any unsaved information in all applications.\n"}
        {"*  The note you were reading is fine. It was always fine.\n"}
        {"\n\n"}
        <span className={styles.bsodPrompt}>Press any key to continue _</span>
      </div>
    </div>
  )
}

/**
 * CONSTELLATION.SCR — after an idle period the knowledge graph takes the screen.
 * It is the garden's own graph, so the screensaver is made of your notes.
 * Delay and on/off live in Settings → Screen Saver.
 */
function ScreenSaver() {
  const enabled = useOSSettings((s) => s.saverEnabled)
  const delaySeconds = useOSSettings((s) => s.saverDelay)
  const saverMode = useOSSettings((s) => s.saverMode)
  const music = useMusic()
  const [active, setActive] = useState(false)
  // Mirrored in a ref so the pointermove handler can decide whether anything
  // changed WITHOUT calling setState — pointermove fires continuously, and this
  // page is already running an animated canvas.
  const activeRef = useRef(false)
  const previousBgRef = useRef<ReturnType<typeof useStore.getState>["bgMode"] | null>(null)

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout>
    let lastArmed = 0

    const arm = () => {
      clearTimeout(timer)
      lastArmed = Date.now()
      timer = setTimeout(() => {
        if (saverMode !== "constellation") {
          previousBgRef.current = useStore.getState().bgMode
          useStore.setState({ bgMode: saverMode })
        }
        activeRef.current = true
        setActive(true)
      }, Math.max(10, delaySeconds) * 1000)
    }

    const onActivity = () => {
      if (activeRef.current) {
        if (previousBgRef.current) {
          useStore.setState({ bgMode: previousBgRef.current })
          previousBgRef.current = null
        }
        activeRef.current = false
        setActive(false)
        arm()
        return
      }
      // Re-arming on every single pointermove would churn timers for no gain;
      // once a second is plenty for a 90s countdown.
      if (Date.now() - lastArmed > 1_000) arm()
    }

    const events: (keyof WindowEventMap)[] = ["pointermove", "pointerdown", "keydown", "wheel"]
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    arm()

    return () => {
      clearTimeout(timer)
      activeRef.current = false
      setActive(false)
      if (previousBgRef.current) {
        useStore.setState({ bgMode: previousBgRef.current })
        previousBgRef.current = null
      }
      events.forEach((e) => window.removeEventListener(e, onActivity))
    }
  }, [enabled, delaySeconds, saverMode])

  if (!enabled || !active) return null

  return (
    <div className={styles.saver} data-ambient={saverMode !== "constellation" || undefined}>
      {saverMode === "constellation" ? (
        <Suspense fallback={null}>
          <Constellation embedded />
        </Suspense>
      ) : (
        <div className={styles.saverAmbientLabel}>{saverMode.toUpperCase()}.SCR</div>
      )}
      {music.isPlaying && music.currentTrack && (
        <div className={styles.saverNowPlaying} aria-label={`Now playing ${music.currentTrack.title} by ${music.currentTrack.artist}`}>
          {music.currentTrack.cover && <img src={music.currentTrack.cover} alt="" />}
          <div className={styles.saverTrackMeta}>
            <span>NOW PLAYING</span>
            <strong>{music.currentTrack.title}</strong>
            <em>{music.currentTrack.artist}</em>
            <div className={styles.saverProgress}>
              <i style={{ width: `${Math.max(0, Math.min(100, music.progress * 100))}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A desktop OS at 390px is bad. Saying so in character costs nothing and is
 * better than an apology. Breakpoint via usePhoneViewport (CLAUDE.md gotcha #13).
 */
function PhoneGuard() {
  return (
    <div className={styles.crt}>
      <div className={styles.crtTitle}>SUBSURFACES WORKSTATION</div>
      <div>
        A display of 800 &times; 600 or greater is required.
        {"\n\n"}
        Please connect a suitable monitor, or visit
        {"\n"}
        the garden at subsurfaces.net.
      </div>
      <a className={styles.crtBtn} href="https://subsurfaces.net">
        OK
      </a>
    </div>
  )
}
