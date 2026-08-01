/**
 * Root of SUBSURFACES 95 — os.subsurfaces.net.
 *
 * State machine: post → splash → desktop, plus an escape hatch to the original
 * endless TUI. See docs/os-95-spec.md.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { BgCanvas } from "@/components/layout/BgCanvas"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { OSBoot, OSSplash } from "./OSBoot"
import { Desktop } from "./Desktop"
import styles from "./OS.module.scss"

const Constellation = lazy(() =>
  import("@/components/ui/graph/ConstellationPage").then((m) => ({ default: m.ConstellationPage })),
)

const Terminal = lazy(() =>
  import("@/features/terminal/Terminal").then((m) => ({ default: m.Terminal })),
)

type Stage = "post" | "splash" | "desktop" | "dos"

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
  const [stage, setStage] = useState<Stage>(() => (hasBooted() ? "desktop" : "post"))

  const finishPost = useCallback(() => {
    markBooted()
    setStage("splash")
  }, [])

  // Start → Restart in MS-DOS mode. An event rather than a prop so the Start
  // menu doesn't need a channel threaded through Desktop and Taskbar.
  useEffect(() => {
    const toDos = () => setStage("dos")
    window.addEventListener("os:dos-mode", toDos)
    return () => window.removeEventListener("os:dos-mode", toDos)
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
      {stage === "post" && <OSBoot onComplete={finishPost} />}
      {stage === "splash" && <OSSplash onDone={() => setStage("desktop")} />}

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
 * CONSTELLATION.SCR — after 90s idle the knowledge graph takes the screen.
 * It is the garden's own graph, so the screensaver is made of your notes.
 */
const IDLE_MS = 90_000

function ScreenSaver() {
  const [active, setActive] = useState(false)
  // Mirrored in a ref so the pointermove handler can decide whether anything
  // changed WITHOUT calling setState — pointermove fires continuously, and this
  // page is already running an animated canvas.
  const activeRef = useRef(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let lastArmed = 0

    const arm = () => {
      clearTimeout(timer)
      lastArmed = Date.now()
      timer = setTimeout(() => {
        activeRef.current = true
        setActive(true)
      }, IDLE_MS)
    }

    const onActivity = () => {
      if (activeRef.current) {
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
      events.forEach((e) => window.removeEventListener(e, onActivity))
    }
  }, [])

  if (!active) return null

  return (
    <div className={styles.saver}>
      <Suspense fallback={null}>
        <Constellation embedded />
      </Suspense>
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
