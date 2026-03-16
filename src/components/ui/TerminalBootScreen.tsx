import { useState, useEffect, useRef, useCallback } from "react"
import styles from "./Terminal.module.scss"

export interface BootMessage {
  username: string
  body: string
  nameColor?: string | null
}

interface Props {
  onDone: () => void
  messages?: BootMessage[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickSubset<T>(arr: T[], min: number, max: number): T[] {
  const count = min + Math.floor(Math.random() * (max - min + 1))
  return shuffle(arr).slice(0, count)
}

// ── Static data ───────────────────────────────────────────────────────────────

const BIOS_POST_POOL = [
  "CPU: Intel Core i9-13900K @ 4.8GHz",
  "RAM: 32768 MB DDR5-6000",
  "GPU: PCIe x16 — WebGL 2.0",
  "NVMe: 2x 2TB @ PCIe 4.0",
  "TPM: v2.0 active",
  "Secure Boot: ENABLED",
  "Ethernet: 1GbE Link UP",
  "DNS: resolver.subsurfaces.net",
  "TLS: 1.3 handshake OK",
  "CDN: Cloudflare edge ✓",
  "Supabase: realtime CONNECTED",
  "Rooms: 3 active channels",
  "Auth: session restored",
  "Messages: RLS policies OK",
  "Reactions: index ready",
  "Soul: waveform detected ∿∿∿",
  "Vibes: nominal",
  "Coffee: mandatory",
  "Cat: ^._.^ (present)",
  "Existential dread: within tolerance",
  "Philosophy: loaded",
  "Subwoofer: strongly recommended",
  "Mouse: hover is enough",
  "PCI Bus: 4 devices found",
  "USB: 3 controllers initialised",
  "SATA: 2 drives detected",
  "Fan: 1200 RPM nominal",
  "Thermal: 42°C",
  "Audio: HDA codec detected",
  "Display: 1920×1080 60Hz",
  "ACPI: v6.4 loaded",
  "RTC: 2026-03-16 OK",
  "Battery: AC adapter connected",
]

const TIPS_POOL = [
  '"The chat has no algorithm. Chronological only. Radical act."',
  '"Type /help to see all terminal commands."',
  '"Emotes are a language. :kek: speaks volumes."',
  '"A message sent cannot be unsent. But it can be /clear\'d locally."',
  '"Philosophy: the art of asking questions no one can answer at dinner."',
  '"Pro tip: your stonks go up when people react to you. Vibes = value."',
  '"Cat fact: cats have 32 muscles in each ear. You have this chat."',
  '"The terminal has no ads. No algorithm. No engagement metrics. Just chat."',
  '"Footnotes: add [^1] inline, [^1]: content at end of message."',
  '"/me action sends an action message. Try it."',
  '"Every message is permanent. Treat it like a sentence."',
  '"The philosophy channel is for big questions. All questions are welcome."',
  '"∿∿∿∿ waveform nominal ∿∿∿∿"',
  '"Life is short. Chat is real-time."',
  '"There are no wrong opinions in philosophy. Only under-argued ones."',
]

const SPLASH_QUOTES = [
  '"a place to think out loud"',
  '"philosophy + vibes + cat emotes"',
  '"the internet, but worse. in the best way."',
  '"∿ signal detected ∿"',
  '"enter to continue. or don\'t."',
]

const ECHO_WORDS = [
  "INITIALISING",
  "CONNECTING",
  "SYNCHRONISING",
  "PHILCHAT",
  "SUBSURFACES",
]

const PERF_TESTS = [
  "CHAT_PARSE_MSG",
  "EMOTE_RESOLVE",
  "REACTION_IDX",
  "AUTH_VERIFY",
  "RLS_QUERY",
  "REALTIME_PING",
  "RENDER_TOKEN",
]

const SPLASH_LOGO = [
  " ██████╗ ██╗  ██╗██╗██╗      ██████╗██╗  ██╗ █████╗ ████████╗",
  " ██╔══██╗██║  ██║██║██║     ██╔════╝██║  ██║██╔══██╗╚══██╔══╝",
  " ██████╔╝███████║██║██║     ██║     ███████║███████║   ██║   ",
  " ██╔═══╝ ██╔══██║██║██║     ██║     ██╔══██║██╔══██║   ██║   ",
  " ██║     ██║  ██║██║███████╗╚██████╗██║  ██║██║  ██║   ██║   ",
  " ╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ",
]

// ── Component ─────────────────────────────────────────────────────────────────

export function TerminalBootScreen({ onDone, messages }: Props) {
  // lines[] = committed lines, currentLine = in-progress typed line
  const [lines, setLines] = useState<string[]>([])
  const [currentLine, setCurrentLine] = useState("")
  const [phase, setPhase] = useState<0 | 1 | 2>(0) // 0=bios, 1=splash, 2=rollIn
  const [splashLines, setSplashLines] = useState<string[]>([])
  const [showPressKey, setShowPressKey] = useState(false)

  const alive = useRef(true)
  const doneRef = useRef(false)
  const phaseRef = useRef<0 | 1 | 2>(0)
  const skipPhase0Ref = useRef(false)
  const skipPhase2Ref = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const dismiss = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    alive.current = false
    onDone()
  }, [onDone])

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines, currentLine, splashLines])

  // Input handlers
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismiss()
        return
      }
      advancePhase()
    }
    const handleClick = () => advancePhase()

    function advancePhase() {
      const p = phaseRef.current
      if (p === 0) {
        skipPhase0Ref.current = true
      } else if (p === 1) {
        // advance to roll-in
        setPhase(2)
        phaseRef.current = 2
      } else if (p === 2) {
        skipPhase2Ref.current = true
      }
    }

    window.addEventListener("keydown", handleKey)
    window.addEventListener("click", handleClick)
    return () => {
      window.removeEventListener("keydown", handleKey)
      window.removeEventListener("click", handleClick)
    }
  }, [dismiss])

  // ── Phase 0: BIOS ──────────────────────────────────────────────────────────
  useEffect(() => {
    alive.current = true
    phaseRef.current = 0

    const appendLine = (text: string) => {
      if (!alive.current) return
      setLines((prev) => [...prev, text])
    }

    const typeChar = async (text: string, delay = 15) => {
      if (!alive.current) return
      setCurrentLine("")
      for (let i = 1; i <= text.length; i++) {
        if (!alive.current || skipPhase0Ref.current) break
        setCurrentLine(text.slice(0, i))
        await sleep(delay)
      }
      if (!alive.current) return
      setLines((prev) => [...prev, text])
      setCurrentLine("")
    }

    const sleepOrSkip = async (ms: number) => {
      if (!alive.current || skipPhase0Ref.current) return
      await sleep(ms)
    }

    // ── ELEMENT: bios_header ──
    async function elBiosHeader() {
      const headerLines = [
        "╔══════════════════════════════════════════════════════╗",
        "║  PHILCHAT OS  v4.2.0      (C) 2026  subsurfaces.net ║",
        "║  Realtime Community Terminal · Supabase · CF Workers ║",
        "╚══════════════════════════════════════════════════════╝",
      ]
      for (const l of headerLines) {
        if (!alive.current || skipPhase0Ref.current) return
        appendLine(l)
        await sleepOrSkip(30)
      }
    }

    // ── ELEMENT: bios_post ──
    async function elBiosPost() {
      const selected = pickSubset(BIOS_POST_POOL, 6, 9)
      for (const l of selected) {
        if (!alive.current || skipPhase0Ref.current) return
        appendLine(l)
        await sleepOrSkip(40)
        if (l.endsWith("OK") || l.endsWith("✓")) {
          await sleepOrSkip(60)
        }
      }
    }

    // ── ELEMENT: memory_test ──
    async function elMemoryTest() {
      if (!alive.current || skipPhase0Ref.current) return
      const total = 65536
      const step = 8192
      for (let v = 0; v <= total; v += step) {
        if (!alive.current || skipPhase0Ref.current) break
        const kStr = String(v).padStart(6, " ")
        setCurrentLine(`Memory Test: ${kStr}K ...`)
        await sleep(20)
      }
      if (!alive.current) return
      setLines((prev) => [...prev, "Memory Test:  65536K OK"])
      setCurrentLine("")
    }

    // ── ELEMENT: network_handshake ──
    async function elNetworkHandshake() {
      if (!alive.current || skipPhase0Ref.current) return
      appendLine("Network:")
      const netLines = [
        "  TX >>> SYN [0x1A4F] ...  ACK",
        "  RX <<< SYN/ACK [0x4F1A] ...  ESTABLISHED",
        "  latency: 12ms  jitter: 0.8ms  OK",
      ]
      for (const l of netLines) {
        if (!alive.current || skipPhase0Ref.current) return
        await typeChar(l, 15)
        await sleepOrSkip(20)
      }
    }

    // ── ELEMENT: scope_pulse ──
    async function elScopePulse() {
      if (!alive.current || skipPhase0Ref.current) return
      const scopeChars = ["▄", "▃", "─", "▁", " "]
      const width = 48
      const frames = 18
      let scopeLineId: number | null = null
      for (let f = 0; f < frames; f++) {
        if (!alive.current || skipPhase0Ref.current) break
        let row = ""
        for (let x = 0; x < width; x++) {
          const v = Math.sin((x + f * 2) * 0.26) * 2
          const idx = Math.min(4, Math.max(0, Math.round(2 - v)))
          row += scopeChars[idx]
        }
        if (scopeLineId === null) {
          setCurrentLine("SCOPE: " + row)
        } else {
          setCurrentLine("SCOPE: " + row)
        }
        scopeLineId = f
        await sleep(40)
      }
      if (!alive.current) return
      setCurrentLine("")
    }

    // ── ELEMENT: branch_tree ──
    async function elBranchTree() {
      if (!alive.current || skipPhase0Ref.current) return
      const tree = [
        "         │         ",
        "        ╱│╲        ",
        "       ╱ │ ╲       ",
        "      ╱  ╪  ╲      ",
        "    ╱╲  ╱ ╲  ╱╲   ",
        "  ╱  ╲╱   ╲╱  ╲  ",
        "  ───────────────────",
      ]
      // appear bottom-to-top means we add from index 0 (already reversed above)
      const displayed: string[] = []
      const startIdx = lines.length
      void startIdx
      for (const l of tree) {
        if (!alive.current || skipPhase0Ref.current) return
        displayed.push(l)
        appendLine(l)
        await sleepOrSkip(55)
      }
      await sleepOrSkip(180)
      // remove the tree lines
      if (!alive.current) return
      setLines((prev) => prev.filter((_, i) => !displayed.some((_, di) => i === prev.length - tree.length + di)))
    }

    // ── ELEMENT: echo_text ──
    async function elEchoText() {
      if (!alive.current || skipPhase0Ref.current) return
      const word = pick(ECHO_WORDS)
      const echoes = [
        word,
        `  ${word}·`,
        `    ${word}:`,
        `      ${word}·.`,
      ]
      for (const l of echoes) {
        if (!alive.current || skipPhase0Ref.current) return
        appendLine(l)
        await sleepOrSkip(70)
      }
      await sleepOrSkip(200)
      if (!alive.current) return
      setLines((prev) => prev.slice(0, Math.max(0, prev.length - echoes.length)))
    }

    // ── ELEMENT: hex_dump ──
    async function elHexDump() {
      const hexLines = [
        "0000: 50 48 49 4C 43 48 41 54  2E 4F 53 00 00 00 00 00",
        "0010: 53 55 42 53 55 52 46 41  43 45 53 00 00 00 00 00",
        "0020: 52 45 41 4C 54 49 4D 45  2E 43 48 41 54 00 00 00",
      ]
      for (const l of hexLines) {
        if (!alive.current || skipPhase0Ref.current) return
        appendLine(l)
        await sleepOrSkip(40)
      }
    }

    // ── ELEMENT: module_load ──
    async function elModuleLoad() {
      if (!alive.current || skipPhase0Ref.current) return
      const mods = ["kernel", "auth", "chat", "realtime", "stonks"]
      let out = "Loading modules: "
      for (const mod of mods) {
        if (!alive.current || skipPhase0Ref.current) break
        setCurrentLine(out + mod + "...")
        await sleep(120)
        out += mod + "... ok / "
      }
      if (!alive.current) return
      setLines((prev) => [...prev, out.slice(0, -3)]) // trim trailing " / "
      setCurrentLine("")
    }

    // ── ELEMENT: spectral ──
    async function elSpectral() {
      if (!alive.current || skipPhase0Ref.current) return
      const bands = [
        "  LOW  ▇▇▇▇▆▆▅▄▃   -12dB",
        "  MID  ▇▇▆▅▄▃▂     -24dB",
        "  HI   ▇▆▅▄▂       -36dB",
      ]
      for (const l of bands) {
        if (!alive.current || skipPhase0Ref.current) return
        appendLine(l)
        await sleepOrSkip(50)
      }
    }

    // ── ELEMENT: perf_test ──
    async function elPerfTest() {
      if (!alive.current || skipPhase0Ref.current) return
      const selected = pickSubset(PERF_TESTS, 4, 6)
      for (const name of selected) {
        if (!alive.current || skipPhase0Ref.current) return
        const dots = "........"
        const ms = (Math.random() * 1.5 + 0.1).toFixed(2) + "ms"
        setCurrentLine(`  running ${name}  ${dots}`)
        await sleep(50 + Math.floor(Math.random() * 30))
        if (!alive.current) return
        appendLine(`  running ${name}  ${dots}  ${ms}  [PASSED]`)
        setCurrentLine("")
        await sleepOrSkip(30)
      }
    }

    // ── ELEMENT: tip_block ──
    async function elTipBlock() {
      if (!alive.current || skipPhase0Ref.current) return
      const tip = pick(TIPS_POOL)
      const usBox = Math.random() > 0.5
      if (usBox) {
        const inner = `  tip: ${tip}  `
        const border = "─".repeat(inner.length)
        appendLine(`┌${border}┐`)
        await sleepOrSkip(30)
        appendLine(`│${inner}│`)
        await sleepOrSkip(30)
        appendLine(`└${border}┘`)
      } else {
        appendLine(`// tip: ${tip}`)
      }
    }

    const ALL_ELEMENTS = [
      elBiosHeader,
      elBiosPost,
      elMemoryTest,
      elNetworkHandshake,
      elScopePulse,
      elBranchTree,
      elEchoText,
      elHexDump,
      elModuleLoad,
      elSpectral,
      elPerfTest,
      elTipBlock,
    ]

    async function runPhase0() {
      const selected = pickSubset(ALL_ELEMENTS, 4, 6)
      for (const el of selected) {
        if (!alive.current) return
        if (skipPhase0Ref.current) break
        await el()
        await sleepOrSkip(60)
      }
    }

    async function run() {
      await runPhase0()
      if (!alive.current) return

      // Transition to splash
      setLines([])
      setCurrentLine("")
      setPhase(1)
      phaseRef.current = 1
    }

    run()

    return () => {
      alive.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Phase 1: Splash ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 1) return

    const quote = pick(SPLASH_QUOTES)
    const taglines = [
      "",
      "  v4.2.0  ·  realtime community terminal",
      "  subsurfaces.net  ·  (C) 2026",
      "",
      `  ${quote}`,
      "",
    ]

    let cancelled = false

    async function runSplash() {
      const result: string[] = []

      // Logo lines
      for (const l of SPLASH_LOGO) {
        if (cancelled) return
        result.push(l)
        setSplashLines([...result])
        await sleep(10)
      }

      // Taglines
      for (const l of taglines) {
        if (cancelled) return
        result.push(l)
        setSplashLines([...result])
        await sleep(50)
      }

      if (!cancelled) setShowPressKey(true)
    }

    runSplash()
    return () => { cancelled = true }
  }, [phase])

  // ── Phase 2: Roll-in ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 2) return

    // Clear splash, reset lines
    setSplashLines([])
    setShowPressKey(false)
    setLines([])
    setCurrentLine("")

    let cancelled = false

    const appendL = (text: string) => {
      if (cancelled) return
      setLines((prev) => [...prev, text])
    }

    async function runRollIn() {
      const msgs = messages?.slice(-8) ?? []

      for (const m of msgs) {
        if (cancelled) return
        const prefix = `[${m.username}] `
        const full = prefix + m.body

        if (skipPhase2Ref.current) {
          appendL(full)
          continue
        }

        // Type char by char (body only, prefix instant)
        appendL("") // placeholder
        setLines((prev) => {
          const next = [...prev]
          next[next.length - 1] = prefix
          return next
        })

        for (let i = 1; i <= m.body.length; i++) {
          if (cancelled) return
          if (skipPhase2Ref.current) {
            setLines((prev) => {
              const next = [...prev]
              next[next.length - 1] = full
              return next
            })
            break
          }
          const partial = prefix + m.body.slice(0, i)
          setLines((prev) => {
            const next = [...prev]
            next[next.length - 1] = partial
            return next
          })
          await sleep(15)
        }

        if (!skipPhase2Ref.current) await sleep(60)
      }

      if (cancelled) return
      await sleep(200)
      appendL("-- connected to #general --")
      await sleep(80)
      appendL("-- type /help for commands --")
      await sleep(400)
      if (!cancelled && !doneRef.current) {
        doneRef.current = true
        onDone()
      }
    }

    runRollIn()
    return () => { cancelled = true }
  }, [phase, messages, onDone])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 1) {
    return (
      <div className={styles.terminalOverlay} style={{ color: "#e0e0e0" }}>
        <div ref={containerRef} className={styles.terminalInner}>
          {splashLines.map((l, i) => (
            <span
              key={i}
              className={
                i < SPLASH_LOGO.length
                  ? styles.terminalSplashLogo
                  : styles.terminalSplashTagline
              }
            >
              {l}
            </span>
          ))}
        </div>
        {showPressKey && (
          <div className={styles.terminalPressKey}>[ PRESS ANY KEY ]</div>
        )}
        <span className={styles.terminalEscHint}>ESC to skip</span>
      </div>
    )
  }

  return (
    <div className={styles.terminalOverlay} style={{ color: "#e0e0e0" }}>
      <div ref={containerRef} className={styles.terminalInner}>
        {lines.map((line, i) => (
          <span key={i} className={styles.terminalLine}>
            {line}
          </span>
        ))}
        {currentLine !== "" && (
          <span className={styles.terminalLine}>
            {currentLine}
            <span className={styles.terminalCursor}>▋</span>
          </span>
        )}
        {currentLine === "" && lines.length > 0 && phase === 0 && (
          <span className={styles.terminalLine}>
            <span className={styles.terminalCursor}>▋</span>
          </span>
        )}
      </div>
      <span className={styles.terminalEscHint}>ESC to skip</span>
    </div>
  )
}
