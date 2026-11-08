import { useEffect, useRef, useState } from "react"
import { useStore } from "@/store"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { moonPhase, seasonOf } from "@/features/ambience/sky"
import { GlorpFace } from "./GlorpFace"
import { QUIPS, contextualQuip, pickFrom, type Mood } from "./glorp"
import styles from "./GlorpPeek.module.scss"

/**
 * Now and then glorp peeks up from the bottom of the page, says something
 * about what you're reading, and ducks away. At most once a visit, after a few
 * minutes of actually being here (time with the tab hidden doesn't count),
 * never in reader mode, never on phones. `glorp` in the prompt calls it over.
 * Settings → Look → "Glorp drops by" turns it off.
 */

const MIN_WAIT_MS = 3 * 60_000
const MAX_WAIT_MS = 7 * 60_000
const STAY_MS = 14_000
const SESSION_KEY = "glorp-peeked"

type Phase = "away" | "rising" | "here" | "leaving"

function line(): string {
  const { contentIndex, activeGraphSlug } = useStore.getState()
  const note = contentIndex?.[activeGraphSlug]
  const now = new Date()
  return (
    contextualQuip({
      date: now,
      season: seasonOf(now),
      moon: moonPhase(now).name,
      noteTitle: note && activeGraphSlug !== "index" ? note.title : null,
      readingMinutes: note?.readingTime ?? null,
    }) ?? pickFrom(QUIPS.curious)
  )
}

export function GlorpPeek() {
  const enabled = useStore((s) => s.glorpVisits)
  const isReaderMode = useStore((s) => s.isReaderMode)
  const glorpCall = useStore((s) => s.glorpCall)
  const isPhone = usePhoneViewport()
  const [phase, setPhase] = useState<Phase>("away")
  const [mood, setMood] = useState<Mood>("curious")
  const [quip, setQuip] = useState("")
  const timers = useRef<number[]>([])

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const leave = () => {
    setPhase("leaving")
    later(() => setPhase("away"), 700)
  }
  const visit = () => {
    clear()
    setMood("curious")
    setQuip(line())
    setPhase("rising")
    later(() => setPhase("here"), 50)
    later(leave, STAY_MS)
  }

  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const allowed = enabled && !isReaderMode && !isPhone && !reduceMotion

  // The once-a-visit drop-in: counts only visible time.
  useEffect(() => {
    if (!allowed || sessionStorage.getItem(SESSION_KEY)) return
    let remaining = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS)
    let last = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      if (document.visibilityState === "visible") remaining -= now - last
      last = now
      if (remaining <= 0) {
        window.clearInterval(id)
        sessionStorage.setItem(SESSION_KEY, "1")
        visit()
      }
    }, 5_000)
    return () => window.clearInterval(id)
    // visit() only touches state setters and timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed])

  // Called over from the prompt.
  const seenCall = useRef(glorpCall)
  useEffect(() => {
    if (glorpCall === seenCall.current) return
    seenCall.current = glorpCall
    if (!isPhone && !isReaderMode) visit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glorpCall])

  useEffect(() => clear, [])

  if (phase === "away") return null

  return (
    <div className={styles.peek} data-phase={phase} data-panel-ignore>
      <div className={styles.bubble} role="status">{quip}</div>
      <button
        type="button"
        className={styles.glorp}
        aria-label="Glorp. Click to say hello."
        onClick={() => {
          clear()
          setMood("happy")
          setQuip(pickFrom(["* happy alien noises *", "hello hello!", "glad you're here", "✦ ✦ ✦"]))
          later(leave, 2_200)
        }}
      >
        <GlorpFace mood={mood} interval={700} />
      </button>
    </div>
  )
}
