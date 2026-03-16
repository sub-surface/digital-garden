import { useState, useEffect, useRef, useCallback } from "react"
import styles from "./Terminal.module.scss"

interface Props {
  onDone: () => void
}

const BIOS_POST_LINES = [
  "CPU: Intel Core i9-13900K @ 4.8GHz",
  "BIOS: v2.1.4 Flash OK",
  "PCI Bus: 4 devices found",
  "USB: 3 controllers initialised",
  "SATA: 2 drives detected",
  "Fan: 1200 RPM nominal",
  "Thermal: 42°C",
  "Ethernet: 1GbE Link UP",
  "Audio: HDA codec detected",
  "Display: 1920x1080 60Hz",
  "RAM: 32768 MB DDR5",
  "GPU: PCIe x16 device found",
  "NVMe: 2 devices at PCIe x4",
  "TPM: v2.0 active",
  "Secure Boot: ENABLED",
  "ACPI: v6.4 loaded",
  "PXE Boot: disabled",
  "Battery: AC adapter connected",
  "SMBus: 3 devices",
  "RTC: 2026-03-16 OK",
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickSubset<T>(arr: T[], min: number, max: number): T[] {
  const count = min + Math.floor(Math.random() * (max - min + 1))
  return shuffle(arr).slice(0, count)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function TerminalBootScreen({ onDone }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [currentLine, setCurrentLine] = useState("")
  const alive = useRef(true)
  const doneRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const dismiss = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }, [onDone])

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines, currentLine])

  // Skip on keydown or click
  useEffect(() => {
    const handler = () => dismiss()
    window.addEventListener("keydown", handler)
    window.addEventListener("click", handler)
    return () => {
      window.removeEventListener("keydown", handler)
      window.removeEventListener("click", handler)
    }
  }, [dismiss])

  useEffect(() => {
    alive.current = true

    async function appendLine(text: string) {
      if (!alive.current) return
      setCurrentLine("")
      setLines((prev) => [...prev, text])
    }

    async function typeText(text: string, delay = 25) {
      if (!alive.current) return
      setCurrentLine("")
      for (let i = 0; i <= text.length; i++) {
        if (!alive.current) return
        setCurrentLine(text.slice(0, i))
        await sleep(delay)
      }
      if (!alive.current) return
      setLines((prev) => [...prev, text])
      setCurrentLine("")
    }

    async function progressBar(label: string, steps = 20, stepDelay = 30) {
      if (!alive.current) return
      for (let i = 0; i <= steps; i++) {
        if (!alive.current) return
        const filled = "█".repeat(i) + " ".repeat(steps - i)
        setCurrentLine(`${label}[${filled}] ${Math.round((i / steps) * 100)}%`)
        await sleep(stepDelay)
      }
      if (!alive.current) return
      const filled = "█".repeat(steps)
      setLines((prev) => [...prev, `${label}[${filled}] 100%`])
      setCurrentLine("")
    }

    async function typeDots(prefix: string, count = 6, delay = 80) {
      if (!alive.current) return
      for (let i = 0; i <= count; i++) {
        if (!alive.current) return
        setCurrentLine(prefix + ".".repeat(i))
        await sleep(delay)
      }
      if (!alive.current) return
      setLines((prev) => [...prev, prefix + ".".repeat(count) + "  OK"])
      setCurrentLine("")
    }

    // Phase 2 element implementations
    async function elementA() {
      // ASCII branch tree
      const treeLines = [
        ".",
        "|-- boot",
        "|   |-- kernel",
        "|   |-- initrd",
        "|   `-- modules",
        "|-- sys",
        "|   |-- net",
        "`-- run",
      ]
      for (const l of treeLines) {
        if (!alive.current) return
        await appendLine(l)
        await sleep(40)
      }
    }

    async function elementB() {
      await typeDots("Scanning network interfaces", 7, 70)
    }

    async function elementC() {
      const lines = pickSubset(BIOS_POST_LINES, 5, 8)
      for (const l of lines) {
        if (!alive.current) return
        await appendLine(l)
        await sleep(45)
      }
    }

    async function elementD() {
      await typeText("ECHO> connecting to subsurfaces.net...", 18)
      if (!alive.current) return
      await sleep(180)
      await appendLine("ECHO> connection established")
    }

    async function elementE() {
      const mods = ["kernel", "auth", "chat", "stonks"]
      let out = "Loading modules: "
      for (const mod of mods) {
        if (!alive.current) return
        setCurrentLine(out + mod + "...")
        await sleep(120)
        out += mod + "... ok / "
      }
      if (!alive.current) return
      setLines((prev) => [...prev, out.replace(/ \/ $/, "")])
      setCurrentLine("")
    }

    async function elementF() {
      const chars = ["⊓", "⊓", "⎍", "⎍", "⊓", "⊓", "⎍", "⎍", "⊓", "⊓", "⎍", "⎍", "⊓", "⊓", "⎍"]
      let out = ""
      for (const c of chars) {
        if (!alive.current) return
        out += c
        setCurrentLine(out)
        await sleep(45)
      }
      if (!alive.current) return
      setLines((prev) => [...prev, out])
      setCurrentLine("")
    }

    const phase2Elements = [elementA, elementB, elementC, elementD, elementE, elementF]

    async function run() {
      // ── Phase 1 ──
      await appendLine("PSYCHOGRAPH OS v3.1.4")
      await appendLine("Copyright (c) 2024 Subsurfaces. All rights reserved.")
      await appendLine("")
      await typeText("Initialising hardware...", 22)
      if (!alive.current) return
      await sleep(80)
      await progressBar("", 20, 28)
      if (!alive.current) return
      await appendLine("Memory test: 65536K OK")
      await sleep(120)

      // ── Phase 2 (randomised subset of elements) ──
      const selected = pickSubset(phase2Elements, 3, 4)
      for (const el of selected) {
        if (!alive.current) return
        await sleep(80)
        await el()
      }

      // ── Phase 3 ──
      if (!alive.current) return
      await sleep(100)
      await typeText("Establishing secure connection...", 20)
      if (!alive.current) return
      await sleep(60)
      await progressBar("", 20, 25)
      if (!alive.current) return
      await sleep(80)
      await appendLine("AUTH OK. Welcome.")
      await appendLine("")
      await sleep(800)
      if (!alive.current) return
      dismiss()
    }

    run()

    return () => {
      alive.current = false
    }
  }, [dismiss])

  return (
    <div className={styles.terminalOverlay}>
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
        {currentLine === "" && lines.length > 0 && (
          <span className={styles.terminalLine}>
            <span className={styles.terminalCursor}>▋</span>
          </span>
        )}
      </div>
      <span className={styles.terminalSkip}>press any key to skip</span>
    </div>
  )
}
