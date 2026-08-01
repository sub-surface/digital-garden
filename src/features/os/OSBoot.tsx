/**
 * The finite POST.
 *
 * Deliberately NOT BootPage. BootPage is a 1,100-line application — an endless
 * generator, a command prompt, telemetry panes, an auth modal — and threading a
 * "stop after 40 lines" mode through it would drag all of that into the OS boot
 * for no gain. This is a bounded sequence that hands off. BootPage stays exactly
 * as it is and returns via Start → Restart in MS-DOS mode.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { mixSeed, resolveSeed } from "@/features/boot/bootSeed"
import { useBootPlayback } from "@/features/boot/useBootPlayback"
import styles from "./OS.module.scss"

type Tone = "normal" | "dim" | "ok"

interface PostLine {
  text: string
  tone?: Tone
  /** Delay before the NEXT line, ms. */
  after?: number
}

interface Props {
  onComplete: () => void
  /** "post" is the scripted BIOS check; "full" streams the procedural TUI. */
  variant?: "post" | "full"
}

/** The label the visitor arrived with, e.g. ?seed=PERSISTENCE. */
function urlSeedLabel(): string | null {
  if (typeof window === "undefined") return null
  const raw = new URLSearchParams(window.location.search).get("seed")
  if (!raw) return null
  const clean = raw.trim().toUpperCase()
  return /^[A-Z0-9_-]{1,20}$/.test(clean) ? clean : null
}

function buildScript(seed: number, label: string | null): PostLine[] {
  // Deterministic from the seed, so a shared URL boots the same machine twice.
  const memory = 8192 * (1 + (mixSeed(seed, "memory") % 4))
  const cache = 128 << (mixSeed(seed, "cache") % 3)

  const lines: PostLine[] = [
    { text: "SUBSURFACES BIOS v4.7.1", after: 140 },
    { text: "Copyright (C) 1995 Psychograph Systems", tone: "dim", after: 320 },
    { text: "", after: 60 },
    { text: `Main Processor    : Cortex 486DX2/66`, tone: "dim", after: 90 },
    { text: `Memory Test       : ${memory}K OK`, after: 280 },
    { text: `Cache Memory      : ${cache}K`, tone: "dim", after: 220 },
    { text: "", after: 80 },
    { text: "Detecting IDE drives ...", tone: "dim", after: 340 },
    { text: "  Primary Master   : GARDEN     (C:)", tone: "ok", after: 140 },
    { text: "  Primary Slave    : WIKI       (W:)", tone: "ok", after: 140 },
    { text: "  Secondary Master : CHAT       (X:)", tone: "ok", after: 140 },
    { text: "  Secondary Slave  : None", tone: "dim", after: 260 },
    { text: "", after: 60 },
    { text: "Floppy disk(s) fail (40)", tone: "dim", after: 300 },
  ]

  if (label) {
    // The README.1ST payoff: arriving with a volume label is acknowledged by
    // name, deterministically, every time.
    lines.push(
      { text: "", after: 120 },
      { text: `Volume label accepted : ${label}`, tone: "ok", after: 260 },
      { text: "Mounting archived volume ...", tone: "dim", after: 420 },
    )
  }

  lines.push(
    { text: "", after: 80 },
    { text: "Verifying DMI Pool Data ....", tone: "dim", after: 460 },
    { text: "", after: 60 },
    { text: "Starting Subsurfaces 95...", after: 700 },
  )

  return lines
}

export function OSBoot({ onComplete, variant = "post" }: Props) {
  // Split rather than branched inside one component: the "full" variant drives
  // useBootPlayback, and running that generator (with its timers) during a
  // scripted POST would be pure waste.
  return variant === "full" ? (
    <FullBoot onComplete={onComplete} />
  ) : (
    <PostBoot onComplete={onComplete} />
  )
}

/**
 * The procedural TUI as a *boot*: the same generator the terminal's attract mode
 * uses, streamed until it has said enough, then handed off to the desktop.
 */
const FULL_BOOT_EVENTS = 46

function FullBoot({ onComplete }: { onComplete: () => void }) {
  const seedInfo = useMemo(() => resolveSeed(), [])
  const doneRef = useRef(false)
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete

  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  )

  const { lines, activeText, emittedCount } = useBootPlayback({
    seed: seedInfo.value,
    reducedMotion: reduced,
    maxLines: 120,
  })

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    completeRef.current()
  }, [])

  useEffect(() => {
    if (emittedCount >= FULL_BOOT_EVENTS) finish()
  }, [emittedCount, finish])

  useEffect(() => {
    window.addEventListener("keydown", finish)
    window.addEventListener("pointerdown", finish)
    return () => {
      window.removeEventListener("keydown", finish)
      window.removeEventListener("pointerdown", finish)
    }
  }, [finish])

  return (
    <div className={styles.boot} role="log" aria-label="System startup">
      {lines.map((line) => (
        <div key={line.id} className={styles.bootLine}>
          {line.text || " "}
        </div>
      ))}
      {activeText && (
        <div className={styles.bootLine}>
          {activeText}
          <span className={styles.bootCursor} />
        </div>
      )}
      <div className={styles.bootSkip}>Press any key to continue</div>
    </div>
  )
}

function PostBoot({ onComplete }: { onComplete: () => void }) {
  const seedInfo = useMemo(() => resolveSeed(), [])
  const label = useMemo(() => urlSeedLabel(), [])
  const script = useMemo(() => buildScript(seedInfo.value, label), [seedInfo.value, label])

  const [shown, setShown] = useState(0)
  const doneRef = useRef(false)
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete

  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  )

  // Advance the script. One timer at a time, cleared on unmount — a stale timer
  // firing after handoff would set state on an unmounted desktop.
  useEffect(() => {
    if (reduced) {
      setShown(script.length)
      const id = setTimeout(() => completeRef.current(), 200)
      return () => clearTimeout(id)
    }

    if (shown >= script.length) {
      if (doneRef.current) return
      doneRef.current = true
      const id = setTimeout(() => completeRef.current(), 500)
      return () => clearTimeout(id)
    }

    const delay = script[shown]?.after ?? 100
    const id = setTimeout(() => setShown((n) => n + 1), delay)
    return () => clearTimeout(id)
  }, [shown, script, reduced])

  // Any input skips straight to the desktop.
  useEffect(() => {
    const skip = () => {
      if (doneRef.current) return
      doneRef.current = true
      completeRef.current()
    }
    window.addEventListener("keydown", skip)
    window.addEventListener("pointerdown", skip)
    return () => {
      window.removeEventListener("keydown", skip)
      window.removeEventListener("pointerdown", skip)
    }
  }, [])

  const visible = script.slice(0, shown)

  return (
    <div className={styles.boot} role="log" aria-label="System startup">
      {visible.map((line, i) => (
        <div
          key={i}
          className={`${styles.bootLine} ${
            line.tone === "dim" ? styles.bootDim : line.tone === "ok" ? styles.bootOk : ""
          }`}
        >
          {line.text}
          {i === visible.length - 1 && <span className={styles.bootCursor} />}
        </div>
      ))}
      <div className={styles.bootSkip}>Press any key to continue</div>
    </div>
  )
}

interface SplashProps {
  onDone: () => void
}

export function OSSplash({ onDone }: SplashProps) {
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const id = setTimeout(() => doneRef.current(), 1100)
    return () => clearTimeout(id)
  }, [])

  return (
    <div className={styles.splash}>
      <div className={styles.splashTitle}>Subsurfaces 95</div>
      <div className={styles.splashRule} />
      <div className={styles.splashSub}>a second reading interface for the same garden</div>
    </div>
  )
}
