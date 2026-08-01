/**
 * Root of SUBSURFACES 95 — os.subsurfaces.net.
 *
 * State machine: post → splash → desktop, plus an escape hatch to the original
 * endless TUI. See docs/os-95-spec.md.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { BgCanvas } from "@/components/layout/BgCanvas"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { OSBoot, OSSplash } from "./OSBoot"
import { Desktop } from "./Desktop"
import styles from "./OS.module.scss"

const BootPage = lazy(() =>
  import("@/features/boot/BootPage").then((m) => ({ default: m.BootPage })),
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

  if (stage === "dos") {
    return (
      <Suspense fallback={null}>
        <BootPage />
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
