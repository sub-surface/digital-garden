import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { FocusEvent } from "react"
import { createPortal } from "react-dom"
import type { CSSProperties } from "react"
import {
  canonicalSeedUrl,
  paletteForSeed,
  persistResolvedSeed,
  randomSeed,
  resolveSeed,
} from "./bootSeed"
import { buildBootTelemetry } from "./bootTelemetry"
import type {
  BootEventKind,
  BootTone,
  ResolvedSeed,
} from "./bootTypes"
import { useBootPlayback } from "./useBootPlayback"
import styles from "./BootPage.module.scss"

const FOLLOW_THRESHOLD_PX = 32
const SPEED_STEPS = [0.5, 1, 2, 4] as const

const TONE_CLASS: Record<BootTone, string> = {
  normal: styles.toneNormal,
  muted: styles.toneMuted,
  accent: styles.toneAccent,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  error: styles.toneError,
  tender: styles.toneTender,
}

const KIND_CLASS: Record<BootEventKind, string> = {
  line: styles.kindLine,
  blank: styles.kindBlank,
  rule: styles.kindRule,
  heading: styles.kindHeading,
  frame: styles.kindFrame,
  phase: styles.kindPhase,
}

function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return fallback
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (!window.matchMedia) return undefined

    const media = window.matchMedia(query)
    const update = (): void => setMatches(media.matches)
    update()

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update)
      return () => media.removeEventListener("change", update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [query])

  return matches
}

function isNearBottom(element: HTMLElement): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    FOLLOW_THRESHOLD_PX
  )
}

function targetIsInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, summary, [contenteditable="true"]',
    ),
  )
}

function stateGlyph(state: "run" | "sleep" | "wait"): string {
  if (state === "run") return "R"
  if (state === "wait") return "D"
  return "S"
}

export function BootPage() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [resolvedSeed, setResolvedSeed] = useState<ResolvedSeed | null>(null)
  const [runId, setRunId] = useState(0)
  const [speed, setSpeed] = useState<number>(1)
  const [isFollowing, setFollowing] = useState(true)
  const [statusMessage, setStatusMessage] = useState("Resolving boot seed")
  const [copySucceeded, setCopySucceeded] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

  const pageRef = useRef<HTMLElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const detachedAtCountRef = useRef(0)

  const isNarrow = useMediaQuery("(max-width: 800px)")
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    setPortalTarget(document.body)

    const appRoot = document.getElementById("root")
    const rootHadInert = appRoot?.hasAttribute("inert") ?? false
    const previousRootAriaHidden = appRoot?.getAttribute("aria-hidden") ?? null
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehavior

    appRoot?.setAttribute("inert", "")
    appRoot?.setAttribute("aria-hidden", "true")
    document.documentElement.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"

    const focusFrame = window.requestAnimationFrame(() => {
      pageRef.current?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
      if (appRoot) {
        if (!rootHadInert) appRoot.removeAttribute("inert")
        if (previousRootAriaHidden === null) {
          appRoot.removeAttribute("aria-hidden")
        } else {
          appRoot.setAttribute("aria-hidden", previousRootAriaHidden)
        }
      }
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousBodyOverscroll

      if (previousFocus?.isConnected) {
        window.requestAnimationFrame(() => {
          previousFocus.focus({ preventScroll: true })
        })
      }
    }
  }, [])

  useEffect(() => {
    const resolved = resolveSeed()
    setResolvedSeed(resolved)
    setStatusMessage(`Seed ${resolved.display} ready`)
  }, [])

  useEffect(() => {
    const handlePopState = (): void => {
      const resolved = resolveSeed()
      detachedAtCountRef.current = 0
      setFollowing(true)
      setResolvedSeed(resolved)
      setRunId((value) => value + 1)
      setStatusMessage(`Restored seed ${resolved.display} from browser history`)
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const {
    lines,
    activeText,
    activeTone,
    activeKind,
    activeAriaLabel,
    phaseLabel,
    isPaused,
    isRunning,
    setPaused,
    togglePaused,
    epoch,
    emittedCount,
    error,
  } = useBootPlayback({
    seed: resolvedSeed?.value ?? null,
    runId,
    viewport: isNarrow ? "narrow" : "wide",
    reducedMotion,
    speed,
    maxLines: isNarrow ? 120 : 220,
  })

  const telemetry = useMemo(
    () =>
      buildBootTelemetry(
        resolvedSeed?.value ?? 1,
        epoch,
        emittedCount,
        phaseLabel,
        isNarrow,
      ),
    [emittedCount, epoch, isNarrow, phaseLabel, resolvedSeed?.value],
  )

  const unseenCount = isFollowing
    ? 0
    : Math.max(0, emittedCount - detachedAtCountRef.current)

  const seedUrl = useMemo(
    () =>
      resolvedSeed === null
        ? ""
        : canonicalSeedUrl(resolvedSeed.value),
    [resolvedSeed],
  )

  const palette = useMemo(
    () => paletteForSeed(resolvedSeed?.value ?? 1),
    [resolvedSeed?.value],
  )

  const pageStyle = useMemo<CSSProperties>(
    () => ({ ["--tui-accent" as string]: palette.accent }),
    [palette.accent],
  )

  useEffect(() => {
    const previousTitle = document.title
    document.title = resolvedSeed
      ? `SUB/SURFACE boot · ${resolvedSeed.display}`
      : "SUB/SURFACE boot"
    return () => {
      document.title = previousTitle
    }
  }, [resolvedSeed])

  useEffect(() => {
    if (!isFollowing) return
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" })
  }, [activeText, emittedCount, isFollowing])

  useEffect(() => {
    if (!copySucceeded) return undefined
    const timeout: ReturnType<typeof setTimeout> = setTimeout(
      () => setCopySucceeded(false),
      2_400,
    )
    return () => clearTimeout(timeout)
  }, [copySucceeded])

  useEffect(() => {
    if (!error) return
    setStatusMessage(`Playback fault: ${error}`)
  }, [error])

  const handleScroll = useCallback(() => {
    const log = logRef.current
    if (!log) return

    const nearBottom = isNearBottom(log)
    setFollowing((wasFollowing) => {
      if (wasFollowing && !nearBottom) {
        detachedAtCountRef.current = emittedCount
      }
      if (!wasFollowing && nearBottom) {
        detachedAtCountRef.current = emittedCount
      }
      return nearBottom
    })
  }, [emittedCount])

  const returnToLive = useCallback(() => {
    detachedAtCountRef.current = emittedCount
    setFollowing(true)
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" })
    setStatusMessage("Returned to live output")
  }, [emittedCount])

  const restart = useCallback(() => {
    detachedAtCountRef.current = 0
    setFollowing(true)
    setRunId((value) => value + 1)
    setStatusMessage("Restarting the current seed from firmware")
  }, [])

  const createNewSeed = useCallback(() => {
    const next = persistResolvedSeed(randomSeed(), "generated", "push")
    detachedAtCountRef.current = 0
    setFollowing(true)
    setResolvedSeed(next)
    setRunId((value) => value + 1)
    setFallbackUrl(null)
    setStatusMessage(`New seed ${next.display} installed`)
  }, [])

  const copySeedLink = useCallback(async () => {
    if (!seedUrl) return

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable")
      }
      await navigator.clipboard.writeText(seedUrl)
      setCopySucceeded(true)
      setFallbackUrl(null)
      setStatusMessage("Seed link copied")
    } catch {
      setFallbackUrl(seedUrl)
      setStatusMessage("Clipboard unavailable; manual copy field opened")
    }
  }, [seedUrl])

  const changeSpeed = useCallback((direction: -1 | 1) => {
    const currentIndex = SPEED_STEPS.findIndex((step) => step === speed)
    const safeIndex = currentIndex < 0 ? 1 : currentIndex
    const nextIndex = Math.min(
      SPEED_STEPS.length - 1,
      Math.max(0, safeIndex + direction),
    )
    const next = SPEED_STEPS[nextIndex]
    setSpeed(next)
    setStatusMessage(`Playback speed ${next}×`)
  }, [speed])

  const handlePause = useCallback(() => {
    const nextPaused = !isPaused
    setPaused(nextPaused)
    setStatusMessage(nextPaused ? "Playback paused" : "Playback resumed")
  }, [isPaused, setPaused])

  const exitBoot = useCallback(() => {
    window.location.assign("/")
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (targetIsInteractive(event.target)) return

      if (event.key === " ") {
        if (!isRunning || error) return
        event.preventDefault()
        togglePaused()
        setStatusMessage(isPaused ? "Playback resumed" : "Playback paused")
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault()
        changeSpeed(1)
      } else if (event.key === "-") {
        event.preventDefault()
        changeSpeed(-1)
      } else if (event.key.toLowerCase() === "g") {
        event.preventDefault()
        returnToLive()
      } else if (event.key === "Escape") {
        event.preventDefault()
        exitBoot()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [changeSpeed, error, exitBoot, isPaused, isRunning, returnToLive, togglePaused])

  if (portalTarget === null) return null

  return createPortal(
    <main
      ref={pageRef}
      className={styles.page}
      style={pageStyle}
      data-paused={isPaused || undefined}
      tabIndex={-1}
      aria-label="SUB/SURFACE procedural boot workspace"
    >
      <h1 className={styles.srOnly}>SUB/SURFACE procedural boot console</h1>

      <header className={styles.tmuxBar} aria-label="Terminal session bar">
        <span className={styles.sessionName}>[subsurface]</span>
        <span className={`${styles.windowTab} ${styles.activeTab}`}>
          <b>0</b>:boot*
        </span>
        <span className={styles.windowTab}><b>1</b>:scope</span>
        <span className={styles.windowTab}><b>2</b>:net</span>
        <span className={styles.windowTab}><b>3</b>:proc</span>
        <span className={styles.tmuxSpacer} />
        <span className={styles.hostLabel}>subsurface.local</span>
      </header>

      <div className={styles.workspace}>
        <section className={`${styles.pane} ${styles.bootPane}`} aria-label="Boot log pane">
          <div className={styles.paneTitle}>
            <span>0:boot — {phaseLabel}</span>
            {!isFollowing ? (
              <button type="button" className={styles.paneAction} onClick={returnToLive}>
                [g] follow +{unseenCount}
              </button>
            ) : (
              <span>{isPaused ? "HOLD" : "FOLLOW"}</span>
            )}
          </div>

          <div
            ref={logRef}
            className={styles.log}
            role="log"
            aria-live="off"
            aria-relevant="additions"
            aria-label="Procedural boot output"
            onScroll={handleScroll}
          >
            {lines.map((line) => (
              <div
                key={line.id}
                className={`${styles.line} ${TONE_CLASS[line.tone]} ${KIND_CLASS[line.kind]}`}
                data-kind={line.kind}
                aria-label={line.ariaLabel}
                aria-hidden={line.kind === "blank" || undefined}
              >
                {line.text}
              </div>
            ))}

            {error && (
              <div className={`${styles.line} ${styles.toneError}`} role="alert">
                [ERROR] playback halted: {error}
              </div>
            )}

            {isRunning && (
              <div
                className={`${styles.activeLine} ${TONE_CLASS[activeTone]} ${KIND_CLASS[activeKind]}`}
                aria-hidden="true"
              >
                <span>{activeText}</span>
                <span className={styles.cursor}>█</span>
              </div>
            )}

            {activeAriaLabel && (
              <span className={styles.srOnly}>{activeAriaLabel}</span>
            )}
            <div ref={bottomRef} className={styles.bottomSentinel} aria-hidden="true" />
          </div>
        </section>

        <aside className={styles.instrumentRack} aria-label="Live terminal instruments">
          <section className={`${styles.pane} ${styles.scopePane}`}>
            <div className={styles.paneTitle}>
              <span>1:scope — CH A</span>
              <span>{telemetry.scopeTrigger}</span>
            </div>
            <pre className={styles.scopeDisplay} aria-hidden="true">
              {telemetry.scopeRows.join("\n")}
            </pre>
            <div className={styles.instrumentFooter}>
              <span>F {telemetry.scopeFrequency}</span>
              <span>Vpp {telemetry.scopeVoltage}</span>
              <span>tick {telemetry.tick.toString().padStart(5, "0")}</span>
            </div>
          </section>

          <section className={`${styles.pane} ${styles.networkPane}`}>
            <div className={styles.paneTitle}>
              <span>2:net — eth0</span>
              <span>{telemetry.peerCount} peers</span>
            </div>
            <div className={styles.networkBody} aria-hidden="true">
              <div className={styles.sparkRow}>
                <span>RX</span>
                <code>{telemetry.rxHistory}</code>
                <b>{telemetry.rxRate}</b>
              </div>
              <div className={styles.sparkRow}>
                <span>TX</span>
                <code>{telemetry.txHistory}</code>
                <b>{telemetry.txRate}</b>
              </div>
              <div className={styles.routeLine}>{telemetry.route}</div>
              <div className={styles.netStats}>
                <span>loss {telemetry.packetLoss}</span>
                <span>state ESTABLISHED</span>
              </div>
            </div>
          </section>

          <section className={`${styles.pane} ${styles.processPane}`}>
            <div className={styles.paneTitle}>
              <span>3:proc — garden.top</span>
              <span>{telemetry.phaseCode}</span>
            </div>
            <div className={styles.processHead} aria-hidden="true">
              <span>PID</span><span>S</span><span>CPU</span><span>MEM</span><span>COMMAND</span>
            </div>
            <div className={styles.processList} aria-hidden="true">
              {telemetry.processes.map((process) => (
                <div className={styles.processRow} key={`${process.pid}-${process.name}`}>
                  <span>{process.pid.toString().padStart(3, "0")}</span>
                  <span>{stateGlyph(process.state)}</span>
                  <span>{process.cpu}</span>
                  <span>{process.memory}</span>
                  <span>{process.name}</span>
                </div>
              ))}
            </div>
            <div className={styles.instrumentFooter}>
              <span>load {telemetry.loadAverage}</span>
              <span>{telemetry.temperature}</span>
              <span>up {telemetry.uptime}</span>
            </div>
          </section>
        </aside>
      </div>

      {fallbackUrl && (
        <label className={styles.copyFallback}>
          <span>clipboard unavailable — copy seed URL:</span>
          <input
            value={fallbackUrl}
            readOnly
            onFocus={(event: FocusEvent<HTMLInputElement>) => event.currentTarget.select()}
          />
          <button type="button" onClick={() => setFallbackUrl(null)}>[esc] close</button>
        </label>
      )}

      <footer className={styles.commandBar} aria-label="Boot controls and status">
        <div className={styles.commandGroup}>
          <button type="button" onClick={handlePause} disabled={!isRunning || Boolean(error)}>
            <kbd>SPC</kbd>{isPaused ? "resume" : "pause"}
          </button>
          <button type="button" onClick={() => changeSpeed(-1)} disabled={speed <= SPEED_STEPS[0]}>
            <kbd>−</kbd>slow
          </button>
          <button type="button" onClick={() => changeSpeed(1)} disabled={speed >= SPEED_STEPS[SPEED_STEPS.length - 1]}>
            <kbd>+</kbd>fast
          </button>
          <button type="button" onClick={restart} disabled={resolvedSeed === null}>
            <kbd>r</kbd>restart
          </button>
          <button type="button" onClick={createNewSeed}>
            <kbd>n</kbd>reseed
          </button>
          <button type="button" onClick={() => void copySeedLink()} disabled={!seedUrl}>
            <kbd>y</kbd>{copySucceeded ? "copied" : "yank"}
          </button>
          <button type="button" onClick={exitBoot}>
            <kbd>ESC</kbd>exit
          </button>
        </div>

        <div className={styles.statusGroup}>
          <span className={isPaused ? styles.modeHeld : styles.modeLive}>
            {isPaused ? "HOLD" : isRunning ? "LIVE" : "INIT"}
          </span>
          <span>{resolvedSeed?.display ?? "seed:--------"}</span>
          <span>{palette.name}</span>
          <span>e{epoch.toString().padStart(4, "0")}</span>
          <span>{speed}×</span>
          <span>{emittedCount}L</span>
          {reducedMotion && <span>RM</span>}
        </div>
      </footer>

      <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>
    </main>,
    portalTarget,
  )
}
