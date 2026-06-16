import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react"
import type { FocusEvent } from "react"
import { createPortal } from "react-dom"
import type { CSSProperties } from "react"
import { useStore } from "../../store"
import {
  canonicalSeedUrl,
  paletteForSeed,
  persistResolvedSeed,
  randomSeed,
  resolveSeed,
  BOOT_PALETTES,
} from "./bootSeed"
import { buildBootTelemetry } from "./bootTelemetry"
import type { BootTelemetrySnapshot } from "./bootTelemetry"
import type {
  BootEventKind,
  BootTone,
  ResolvedSeed,
  BootRenderedLine,
} from "./bootTypes"
import { useBootPlayback } from "./useBootPlayback"
import styles from "./BootPage.module.scss"
import { AmbientEngine } from "./bootAudio"
import {
  runBootCommand,
  COMMAND_NAMES,
  HELP_COMMANDS,
  type BootCommandContext,
  type ZoomPane,
} from "./bootCommands"

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

/**
 * Token classes for inline terminal-style syntax highlighting. Matched in
 * priority order; the first regex to hit at a position wins. Kept deliberately
 * small — this runs once per committed line (BootLine is memoised on its
 * immutable `line` prop), so there is no per-frame cost.
 */
const TOKEN_RULES: ReadonlyArray<{ re: RegExp; cls: string }> = [
  { re: /\[\s*(?:OK|DONE|PASS|UP|LIVE)\s*\]/y, cls: styles.tokOk },
  { re: /\[\s*(?:WARN|HOLD|SKIP)\s*\]/y, cls: styles.tokWarn },
  { re: /\[\s*(?:ERR(?:OR)?|FAIL|DEAD|LOST)\s*\]/y, cls: styles.tokErr },
  { re: /\[\s*(?:INFO|NOTE|\.\.\.)\s*\]/y, cls: styles.tokInfo },
  { re: /(?:^|(?<=\s))\$(?=\s)/y, cls: styles.tokPrompt },
  { re: /0x[0-9a-fA-F]+/y, cls: styles.tokHex },
  { re: /(?:\/[\w.-]+)+\/?|[\w-]+\.(?:dat|json|md|log|sock|tmp|cfg)/y, cls: styles.tokPath },
  { re: /"[^"]*"|'[^']*'/y, cls: styles.tokString },
  { re: /\d+(?:\.\d+)?(?:%|ms|s|Hz|kB\/s|MiB|M|°C|km\/s|×)?/y, cls: styles.tokNumber },
]

/** Split text into plain + classed token spans. Allocation-light, no backtrack. */
function tokenize(text: string): Array<{ text: string; cls?: string }> {
  const out: Array<{ text: string; cls?: string }> = []
  let plainStart = 0
  let i = 0

  const flushPlain = (end: number): void => {
    if (end > plainStart) out.push({ text: text.slice(plainStart, end) })
  }

  while (i < text.length) {
    let matched = false
    for (const { re, cls } of TOKEN_RULES) {
      re.lastIndex = i
      const m = re.exec(text)
      if (m && m.index === i && m[0].length > 0) {
        flushPlain(i)
        out.push({ text: m[0], cls })
        i += m[0].length
        plainStart = i
        matched = true
        break
      }
    }
    if (!matched) i += 1
  }
  flushPlain(text.length)
  return out
}

/** Kinds that get inline tokenising. ASCII art / frames stay verbatim. */
const TOKENISED_KINDS = new Set<BootEventKind>(["line", "heading"])

const BootLine = memo(({ line }: { line: BootRenderedLine }) => {
  const content =
    TOKENISED_KINDS.has(line.kind) && line.text.length <= 200
      ? tokenize(line.text).map((seg, idx) =>
          seg.cls ? (
            <span key={idx} className={seg.cls}>
              {seg.text}
            </span>
          ) : (
            seg.text
          ),
        )
      : line.text

  return (
    <div
      className={`${styles.line} ${TONE_CLASS[line.tone]} ${KIND_CLASS[line.kind]}`}
      data-kind={line.kind}
      aria-label={line.ariaLabel}
      aria-hidden={line.kind === "blank" || undefined}
    >
      {content}
    </div>
  )
})

/**
 * The right-hand instrument rack (scope + net + proc). Memoised on its
 * telemetry snapshot so log updates don't reconcile it, and telemetry updates
 * don't reconcile the (much larger) log list. `onZoom` is stable from the
 * parent's `setZoomedPane` setter.
 */
const InstrumentRack = memo(function InstrumentRack({
  telemetry,
  onZoom,
}: {
  telemetry: BootTelemetrySnapshot
  onZoom: (updater: (prev: ZoomPane) => ZoomPane) => void
}) {
  const toggle = (pane: ZoomPane) => () =>
    onZoom((prev) => (prev === pane ? "none" : pane))

  return (
    <aside className={styles.instrumentRack} aria-label="Live terminal instruments">
      <section className={`${styles.pane} ${styles.scopePane}`}>
        <div className={styles.paneTitle} onClick={toggle("scope")}>
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
        <div className={styles.paneTitle} onClick={toggle("net")}>
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
        <div className={styles.paneTitle} onClick={toggle("proc")}>
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
  )
})

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

  const [audioEnabled, setAudioEnabled] = useState(false)

  const [isBooted, setIsBooted] = useState(false)
  const [commandInput, setCommandInput] = useState("")
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const commandHistoryRef = useRef<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [themeOverride, setThemeOverride] = useState<string | null>(null)
  const [zoomedPane, setZoomedPane] = useState<ZoomPane>("none")
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  
  const commandInputRef = useRef<HTMLInputElement>(null)

  const pageRef = useRef<HTMLElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const detachedAtCountRef = useRef(0)
  const audioRef = useRef<AmbientEngine | null>(null)

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
    const engine = new AmbientEngine()
    engine.onStateChange = (state, error) => {
      if (error && state !== "running") {
        setStatusMessage(`Audio fault: ${error}`)
        setAudioEnabled(false)
      }
    }
    engine.onMessage = (msg) => {
      setStatusMessage(msg)
    }
    audioRef.current = engine

    return () => {
      engine.destroy()
      audioRef.current = null
    }
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
    injectLine,
    clearLines,
  } = useBootPlayback({
    seed: isBooted ? (resolvedSeed?.value ?? null) : null,
    runId,
    viewport: isNarrow ? "narrow" : "wide",
    reducedMotion,
    speed,
    maxLines: isNarrow ? 120 : 220,
    onTone: useCallback((tone: BootTone) => {
      audioRef.current?.chime(tone)
    }, []),
  })

  // Telemetry advances at half the line rate: memoising on `tick` (not raw
  // `emittedCount`) halves how often the RNG + scope raster + process table
  // rebuild, with no visible difference.
  const tick = Math.floor(emittedCount / 2)
  const telemetry = useMemo(
    () =>
      buildBootTelemetry(
        resolvedSeed?.value ?? 1,
        epoch,
        tick,
        phaseLabel,
        isNarrow,
      ),
    [tick, epoch, isNarrow, phaseLabel, resolvedSeed?.value],
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

  const palette = useMemo(() => {
    if (themeOverride) {
      const found = BOOT_PALETTES.find(p => p.name === themeOverride)
      if (found) return found
    }
    return paletteForSeed(resolvedSeed?.value ?? 1)
  }, [resolvedSeed?.value, themeOverride])

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

  // Follow on committed lines + phase changes only — not per-grapheme of the
  // active line (that thrashed layout on every keystroke). The active line is
  // short and the log's bottom padding keeps it in view as it types.
  useEffect(() => {
    if (!isFollowing) return
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" })
  }, [emittedCount, phaseLabel, isFollowing])

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

  const toggleSound = useCallback(async () => {
    if (!audioRef.current) return
    const engine = audioRef.current
    if (audioEnabled) {
      await engine.stop()
      setAudioEnabled(false)
      setStatusMessage("Audio disabled")
    } else {
      const success = await engine.start()
      if (success) {
        setAudioEnabled(true)
        setStatusMessage(`Audio running (${engine.chordName})`)
      }
    }
  }, [audioEnabled])

  const cyclePalette = useCallback((): string => {
    const currentName = themeOverride || palette.name
    const idx = BOOT_PALETTES.findIndex((p) => p.name === currentName)
    const nextName = BOOT_PALETTES[(idx + 1) % BOOT_PALETTES.length].name
    setThemeOverride(nextName)
    return nextName
  }, [palette.name, themeOverride])

  const setPalette = useCallback((name: string): boolean => {
    if (!BOOT_PALETTES.some((p) => p.name === name)) return false
    setThemeOverride(name)
    return true
  }, [])

  const toggleZoom = useCallback((target: ZoomPane) => {
    setZoomedPane((prev) => (prev === target ? "none" : target))
  }, [])

  const exportLog = useCallback(() => {
    const textToExport = lines.map((l) => l.text).join("\n")
    const blob = new Blob([textToExport], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `subsurface_log_${resolvedSeed?.display ?? "export"}.txt`
    a.click()
    URL.revokeObjectURL(url)
    injectLine("  log exported", "muted")
  }, [injectLine, lines, resolvedSeed?.display])

  const flashGlitch = useCallback(() => {
    document.body.classList.add("glitchMode")
    setTimeout(() => document.body.classList.remove("glitchMode"), 600)
  }, [])

  const commandContext = useMemo<BootCommandContext>(() => ({
    injectLine,
    clearLines,
    setZoomedPane,
    toggleZoom,
    toggleSound: () => void toggleSound(),
    chime: (tone) => audioRef.current?.chime(tone),
    setSpeed: (value) => setSpeed(value),
    cyclePalette,
    setPalette,
    setGlobalTheme: (mode) => useStore.getState().setTheme(mode),
    setFollowing,
    createNewSeed,
    exportLog,
    flashGlitch,
    openHelp: () => setIsHelpOpen(true),
    restart,
    setPaused,
    getHistory: () => commandHistoryRef.current,
  }), [
    clearLines,
    createNewSeed,
    cyclePalette,
    exportLog,
    flashGlitch,
    injectLine,
    palette.name,
    restart,
    setPalette,
    setPaused,
    toggleSound,
    toggleZoom,
  ])

  const runCommand = useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return

    setCommandHistory((prev) => {
      const next = [...prev, trimmed]
      commandHistoryRef.current = next
      setHistoryIndex(next.length)
      return next
    })

    injectLine(`  $ ${trimmed}`, "accent")

    if (!runBootCommand(trimmed, commandContext)) {
      const name = trimmed.split(/\s+/)[0].toLowerCase()
      injectLine(`  command not found: ${name}`, "warning")
    }
  }, [commandContext, injectLine])

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    runCommand(commandInput)
    setCommandInput("")
  }

  const handleCommandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault()
      const nextIndex = Math.max(0, historyIndex - 1)
      setHistoryIndex(nextIndex)
      setCommandInput(commandHistory[nextIndex] || "")
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      const nextIndex = Math.min(commandHistory.length, historyIndex + 1)
      setHistoryIndex(nextIndex)
      setCommandInput(commandHistory[nextIndex] || "")
    } else if (e.key === "Tab") {
      e.preventDefault()
      // simple autocomplete over the registry's names + aliases
      const val = commandInput.trim().toLowerCase()
      if (!val) return
      const match = COMMAND_NAMES.find((c) => c.startsWith(val))
      if (match) setCommandInput(match + " ")
    }
  }

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
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault()
        void toggleSound()
      } else if (event.key === ":") {
        event.preventDefault()
        commandInputRef.current?.focus()
      } else if (event.key === "]") {
        event.preventDefault()
        const panes = ["none", "log", "scope", "net", "proc"] as const
        setZoomedPane(prev => panes[(panes.indexOf(prev) + 1) % panes.length])
      } else if (event.key === "[") {
        event.preventDefault()
        const panes = ["none", "log", "scope", "net", "proc"] as const
        setZoomedPane(prev => panes[(panes.indexOf(prev) - 1 + panes.length) % panes.length])
      } else if (event.key === "?") {
        event.preventDefault()
        setIsHelpOpen(prev => !prev)
      } else if (event.key === "Escape") {
        event.preventDefault()
        if (isHelpOpen) {
          setIsHelpOpen(false)
        } else if (document.activeElement === commandInputRef.current) {
          commandInputRef.current?.blur()
        } else {
          exitBoot()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [changeSpeed, error, exitBoot, isPaused, isRunning, returnToLive, togglePaused, toggleSound, isHelpOpen])

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

      {!isBooted && (
        <div className={styles.cover}>
          <div className={styles.coverInner}>
            <h2>PROBING THE SMALL MACHINES...</h2>
            <form onSubmit={(e) => {
              e.preventDefault()
              const val = (new FormData(e.currentTarget).get("bootCmd") as string).toLowerCase()
              if (val.includes("audio") || val.includes("sound")) void toggleSound()
              setIsBooted(true)
            }}>
              <span>bootloader&gt;</span>
              <input name="bootCmd" autoFocus autoComplete="off" spellCheck="false" defaultValue="boot --audio" />
            </form>
          </div>
        </div>
      )}

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

      <div className={`${styles.workspace} ${zoomedPane !== "none" ? styles[`zoom-${zoomedPane}`] : ""}`}>
        <section className={`${styles.pane} ${styles.bootPane}`} aria-label="Boot log pane">
          <div className={styles.paneTitle} onClick={() => setZoomedPane(prev => prev === "log" ? "none" : "log")}>
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
              <BootLine key={line.id} line={line} />
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

        <InstrumentRack telemetry={telemetry} onZoom={setZoomedPane} />
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
        <form className={styles.commandForm} onSubmit={handleCommandSubmit}>
          <span>$</span>
          <input
            ref={commandInputRef}
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleCommandKeyDown}
            placeholder="type 'help' or press [ : ]"
            autoComplete="off"
            spellCheck="false"
          />
        </form>

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
          <span style={{ cursor: "pointer", opacity: 0.7 }} onClick={() => setIsHelpOpen(true)}>[?]</span>
        </div>
      </footer>

      {isHelpOpen && (
        <div className={styles.helpModal} onClick={() => setIsHelpOpen(false)}>
          <div className={styles.helpContent} onClick={e => e.stopPropagation()}>
            <div className={styles.helpHeader}>
              <span>SUB/SURFACE FIELD MANUAL</span>
              <button type="button" onClick={() => setIsHelpOpen(false)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: "bold" }}>X</button>
            </div>
            <div className={styles.helpBody}>
              <div>
                <h3>Keyboard</h3>
                <table>
                  <tbody>
                    <tr><td>SPC</td><td>Pause / resume playback</td></tr>
                    <tr><td>[ / ]</td><td>Cycle zoomed pane</td></tr>
                    <tr><td>:</td><td>Focus command line</td></tr>
                    <tr><td>+, -</td><td>Adjust playback speed</td></tr>
                    <tr><td>g, End</td><td>Return to live output</td></tr>
                    <tr><td>s</td><td>Toggle audio engine</td></tr>
                    <tr><td>Esc</td><td>Exit boot</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3>Commands</h3>
                <table>
                  <tbody>
                    {HELP_COMMANDS.map((command) => (
                      <tr key={command.name}>
                        <td>{command.help?.usage}</td>
                        <td>{command.help?.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ marginTop: "16px" }}>You can also click on any pane's header to quickly zoom into it.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>
    </main>,
    portalTarget,
  )
}
