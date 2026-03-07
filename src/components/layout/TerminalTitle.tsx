import { useEffect, useRef, useState, useCallback } from "react"
import { useNavigate, useLocation } from "@tanstack/react-router"
import { useStore } from "@/store"
import styles from "./TerminalTitle.module.scss"

// ── Animation bank — short snippets for boot + idle re-trigger ──

type Snippet = {
  gen: () => AsyncGenerator<string, void, unknown>
  tooltip?: string
}

const BOOT_LINES: string[] = [
  "SUB-SURFACE CORE v2.0.0",
  "loading thought-graph...",
  "mapping territories...",
  "indexing 120 notes · 35 links",
  "calibrating noise field...",
  "system ready.",
]

async function* bootSequence(): AsyncGenerator<string, void, unknown> {
  for (const line of BOOT_LINES) {
    yield line
    await sleep(80 + Math.random() * 120)
  }
}

async function* loadingBar(): AsyncGenerator<string, void, unknown> {
  const W = 20
  const label = LOADING_LABELS[Math.floor(Math.random() * LOADING_LABELS.length)]
  for (let i = 0; i <= W; i++) {
    const bar = "\u2588".repeat(i) + "\u2591".repeat(W - i)
    const pct = Math.round((i / W) * 100).toString().padStart(3)
    yield `${label} [${bar}] ${pct}%`
    await sleep(40 + Math.random() * 30)
  }
}

const LOADING_LABELS = ["indexing notes", "mapping links", "loading graph", "calibrating", "syncing state", "building index"]

async function* asciiPulse(): AsyncGenerator<string, void, unknown> {
  const W = 32
  const frames = 12
  for (let f = 0; f <= frames; f++) {
    const t = f / frames
    const row = Array.from({ length: W }, (_, i) => {
      const x = (i / W - 0.5) * Math.PI * 4
      const y = Math.sin(x + t * Math.PI * 6) * (1 - t * 0.6)
      if (y > 0.5) return "\u2584"
      if (y > 0.1) return "\u2583"
      if (y > -0.1) return "\u2500"
      if (y > -0.5) return "\u2581"
      return " "
    }).join("")
    yield row
    await sleep(50)
  }
}

async function* catWalk(): AsyncGenerator<string, void, unknown> {
  const frames = ["^._.^      ", " ^._.^     ", "  ^._.^    ", "   ^._.^   ", "    ^._.^  ", "     ^._.^ ", "      ^._.^"]
  for (const f of frames) {
    yield f
    await sleep(150)
  }
}

async function* heartBeat(): AsyncGenerator<string, void, unknown> {
  const frames = ["<3", " <3 ", "  <3  ", "   <3   ", "    <3    ", "     <3     "]
  for (let i = 0; i < 3; i++) {
    for (const f of frames) {
      yield f
      await sleep(100)
    }
  }
}

async function* thinkingDots(): AsyncGenerator<string, void, unknown> {
  const frames = ["thinking", "thinking.", "thinking..", "thinking...", "thinking...."]
  for (let i = 0; i < 3; i++) {
    for (const f of frames) {
      yield f
      await sleep(200)
    }
  }
}

async function* coffeeTime(): AsyncGenerator<string, void, unknown> {
  yield "(  ) \u2615"
  await sleep(400)
  yield "( ~) \u2615"
  await sleep(400)
  yield "(~~) \u2615"
  await sleep(400)
  yield "(  ) \u2615"
  await sleep(400)
}

async function* ghostDance(): AsyncGenerator<string, void, unknown> {
  const frames = [" \u15d5 ", "<\u15d5>", " \u15d5 ", "<\u15d5>"]
  for (let i = 0; i < 4; i++) {
    yield frames[i % frames.length]
    await sleep(300)
  }
}

async function* systemInit(): AsyncGenerator<string, void, unknown> {
  const checks = [["renderer", "OK"], ["audio ctx", "OK"], ["content-index", "120 notes"], ["graph", "35 edges"], ["noise field", "ready"]] as const
  for (const [name, status] of checks) {
    yield `  ${name} ${"·".repeat(18 - name.length)} ${status}`
    await sleep(60 + Math.random() * 80)
  }
}

async function* hexDump(): AsyncGenerator<string, void, unknown> {
  const lines = ["0000: 53 55 42 2D 53 55 52 46", "0008: 41 43 45 00 54 45 52 52", "0010: 49 54 4F 52 49 45 53 00"]
  for (const line of lines) {
    yield line
    await sleep(40)
  }
}

async function* echoFade(): AsyncGenerator<string, void, unknown> {
  const word = "INITIALISING"
  for (let i = 0; i < 4; i++) {
    const pad = " ".repeat(i * 2)
    const fade = ["", "\u00b7", ":", "\u00b7."][i]
    yield `${pad}${word}${fade}`
    await sleep(70 + i * 30)
  }
}

const IDLE_SNIPPETS: Snippet[] = [
  { gen: loadingBar, tooltip: "Calibrating systems..." },
  { gen: asciiPulse, tooltip: "Pulse detected." },
  { gen: systemInit, tooltip: "Diagnostics running." },
  { gen: hexDump, tooltip: "Memory dump..." },
  { gen: echoFade, tooltip: "Echoing..." },
  { gen: catWalk, tooltip: "Meow." },
  { gen: heartBeat, tooltip: "System pulse stable." },
  { gen: thinkingDots, tooltip: "Deep thought engaged." },
  { gen: coffeeTime, tooltip: "Re-caffeinating core." },
  { gen: ghostDance, tooltip: "Spectral activity high." },
]

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Wiki boot lines ──

const WIKI_BOOT_LINES: string[] = [
  "PHILCHAT WIKI v1.0.0",
  "loading philosopher index...",
  "mapping debates...",
  "wiki ready.",
]

async function* wikiBootSequence(): AsyncGenerator<string, void, unknown> {
  for (const line of WIKI_BOOT_LINES) {
    yield line
    await sleep(80 + Math.random() * 120)
  }
}

// ── Component ──

interface TerminalTitleProps {
  context?: "wiki"
}

export function TerminalTitle({ context }: TerminalTitleProps = {}) {
  const isWiki = context === "wiki"
  const navigate = useNavigate()
  const location = useLocation()
  const clearStack = useStore((s) => s.clearStack)

  const [line, setLine] = useState("")
  const [tooltip, setTooltip] = useState("Go to homepage")
  const [isHovered, setIsHovered] = useState(false)
  const [booted, setBooted] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const settledText = isWiki ? "Philchat Wiki" : "Sub-Surface Territories"

  // Run a snippet generator, updating the displayed line
  const runSnippet = useCallback(
    async (gen: AsyncGenerator<string, void, unknown>, signal: AbortSignal) => {
      for await (const text of gen) {
        if (signal.aborted) return
        setLine(text)
      }
    },
    [],
  )

  // Schedule the next idle re-trigger
  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    const delay = 60_000 + Math.random() * 240_000 // 1–5 min
    idleTimerRef.current = setTimeout(async () => {
      if (isAnimating) {
        scheduleIdle()
        return
      }
      const ac = new AbortController()
      abortRef.current = ac
      const snippet = IDLE_SNIPPETS[Math.floor(Math.random() * IDLE_SNIPPETS.length)]
      if (snippet.tooltip) setTooltip(snippet.tooltip)
      await runSnippet(snippet.gen(), ac.signal)
      if (!ac.signal.aborted) {
        // Settle back to site name after a short pause
        await sleep(1200)
        if (!ac.signal.aborted) {
          setLine(settledText)
          setTooltip(isWiki ? "← subsurfaces.net" : "Go to homepage")
        }
        scheduleIdle()
      }
    }, delay)
  }, [runSnippet, isAnimating])

  // Boot sequence on mount
  useEffect(() => {
    const ac = new AbortController()
    abortRef.current = ac
    ;(async () => {
      await runSnippet(isWiki ? wikiBootSequence() : bootSequence(), ac.signal)
      if (!ac.signal.aborted) {
        await sleep(600)
        setLine(settledText)
        setBooted(true)
        if (!isWiki) scheduleIdle()
      }
    })()
    return () => {
      ac.abort()
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSnippet, scheduleIdle, isWiki])

  const handleClick = async () => {
    if (isWiki) {
      window.location.href = "https://subsurfaces.net"
      return
    }

    const isIndex = location.pathname === "/" || location.pathname === ""

    if (isIndex && booted && !isAnimating) {
      setIsAnimating(true)
      const ac = new AbortController()
      abortRef.current?.abort() // Stop current idle
      abortRef.current = ac

      const snippet = IDLE_SNIPPETS[Math.floor(Math.random() * IDLE_SNIPPETS.length)]
      if (snippet.tooltip) setTooltip(snippet.tooltip)
      await runSnippet(snippet.gen(), ac.signal)

      if (!ac.signal.aborted) {
        await sleep(1000)
        if (!ac.signal.aborted) {
          setLine(settledText)
          setTooltip("Go to homepage")
        }
      }
      setIsAnimating(false)
      scheduleIdle()
    } else {
      clearStack()
      navigate({ to: "/" })
    }
  }

  const displayText = (isHovered && booted && !isAnimating) ? settledText : line
  const titleTooltip = isWiki ? "← subsurfaces.net" : tooltip

  const titleContent = (
    <>
      <span className={styles.text} data-hovered={isHovered || undefined}>
        {displayText || "\u00a0"}
      </span>
      {booted && !isAnimating && <span className={styles.karat} />}
    </>
  )

  return (
    <div className={styles.container} data-panel-ignore>
      {isWiki ? (
        <a
          className={styles.title}
          href="https://subsurfaces.net"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          aria-label={titleTooltip}
          title={titleTooltip}
        >
          {titleContent}
        </a>
      ) : (
        <button
          className={styles.title}
          onClick={handleClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          aria-label={tooltip}
          title={tooltip}
        >
          {titleContent}
        </button>
      )}
    </div>
  )
}
