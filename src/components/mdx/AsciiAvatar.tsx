import { useState, useEffect, useRef, useCallback } from "react"
import { GLORP_GREEN, MOODS, QUIPS, contextualQuip, pickFrom, pickMood, type Mood } from "@/features/glorp/glorp"
import { moonPhase, seasonOf } from "@/features/ambience/sky"
import { useStore } from "@/store"

/** A third of the time glorp talks about now (the hour, the season, the page). */
function nextQuip(mood: Mood): string {
  if (mood !== "spooked" && Math.random() < 0.33) {
    const { contentIndex, activeGraphSlug } = useStore.getState()
    const note = contentIndex?.[activeGraphSlug]
    const now = new Date()
    const line = contextualQuip({
      date: now,
      season: seasonOf(now),
      moon: moonPhase(now).name,
      noteTitle: note && activeGraphSlug !== "index" ? note.title : null,
    })
    if (line) return line
  }
  return pickFrom(QUIPS[mood])
}

// How many frames to hold before picking a new mood/quip
const FRAMES_PER_MOOD = 6


// ASCII characters for sprinkle bursts on click
const SPRINKLE_CHARS = ['✦', '✧', '⋆', '◈', '◇', '◆', '·', '∿', '∞', '░', '▒', '○', '●', '⊕', '∂', '↗', '↑', '↖', '→', '←', '↘', '↓', '↙']

interface Sprinkle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  char: string
  life: number
  opacity: number
}

let sprinkleId = 0

interface Props {
  interval?: number
  label?: string
  showQuip?: boolean
  size?: "sm" | "md" | "lg"
  align?: "left" | "center" | "right"
}

export function AsciiAvatar({ interval = 950, label, showQuip = true, size = "md", align = "center" }: Props) {
  const [frame, setFrame] = useState(0)
  const [mood, setMood] = useState<Mood>("idle")
  const [quip, setQuip] = useState(() => pickFrom(QUIPS["idle"]))
  const [sprinkles, setSprinkles] = useState<Sprinkle[]>([])
  const cycleRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const wrapperRef = useRef<HTMLSpanElement>(null)

  const hasSprinkles = sprinkles.length > 0

  // Animate sprinkles via rAF while any are alive
  useEffect(() => {
    if (!hasSprinkles) return
    const tick = () => {
      setSprinkles(prev => {
        const next = prev
          .map(s => ({
            ...s,
            x: s.x + s.vx + Math.sin(s.life * 8) * 0.3, // gentle wobble
            y: s.y + s.vy,
            vy: s.vy * 0.98,   // slight deceleration as bubble slows
            life: s.life - 0.015, // slow fade
          }))
          .filter(s => s.life > 0)
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [hasSprinkles])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const wrapperRect = wrapperRef.current?.getBoundingClientRect()
    if (!wrapperRect) return
    const cx = e.clientX - wrapperRect.left
    const cy = e.clientY - wrapperRect.top
    const burst: Sprinkle[] = Array.from({ length: 10 }, () => ({
      id: sprinkleId++,
      x: cx + (Math.random() - 0.5) * 20,
      y: cy,
      vx: (Math.random() - 0.5) * 0.8,   // gentle horizontal drift
      vy: -(0.8 + Math.random() * 1.4),   // upward only, slow
      char: SPRINKLE_CHARS[Math.floor(Math.random() * SPRINKLE_CHARS.length)],
      life: 1,
      opacity: 0.85 + Math.random() * 0.15,
    }))
    setSprinkles(prev => [...prev, ...burst])
  }, [])

  // Only animate while on screen and the tab is visible: it used to tick (and
  // re-render) forever, even scrolled far away.
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const el = wrapperRef.current
    if (!el || typeof IntersectionObserver === "undefined") return
    let onScreen = true
    const sync = () => setVisible(onScreen && document.visibilityState === "visible")
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      sync()
    })
    io.observe(el)
    document.addEventListener("visibilitychange", sync)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => {
      setFrame(f => {
        const next = (f + 1) % MOODS[mood].length
        // At the end of a mood cycle, pick a new mood + quip
        cycleRef.current++
        if (cycleRef.current >= FRAMES_PER_MOOD) {
          cycleRef.current = 0
          const newMood = pickMood()
          setMood(newMood)
          setQuip(nextQuip(newMood))
        }
        return next
      })
    }, interval)
    return () => clearInterval(id)
  }, [interval, mood, visible])

  const f = MOODS[mood][frame % MOODS[mood].length]

  const fontSize = size === "sm" ? "0.7em" : size === "lg" ? "1.1em" : "0.85em"

  const alignItemsMap = { left: "flex-start", center: "center", right: "flex-end" }
  const floatMap = { left: "left", center: "none", right: "right" } as const
  const marginMap = { left: "0 1.5em 0.5em 0", center: "0 auto", right: "0 0 0.5em 1.5em" }

  return (
    <span ref={wrapperRef} style={{
      display: "inline-flex",
      flexDirection: "column",
      alignItems: alignItemsMap[align] as any,
      float: floatMap[align],
      margin: marginMap[align],
      gap: 0,
      lineHeight: 1.4,
      position: "relative",
    }}>
      {/* Fixed-size box — wide/tall enough for the largest frame, never resizes */}
      <span
        onClick={handleClick}
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${GLORP_GREEN}`,
          borderRadius: "4px",
          padding: "0.5em 0.8em",
          opacity: 0.85,
          width: "8.5em",
          minHeight: showQuip ? "7em" : "4.8em",
          fontSize,
          boxSizing: "border-box",
          gap: "0.5em",
          cursor: "pointer",
          userSelect: "none",
          position: "relative",
          overflow: "visible",
        }}
      >
        <pre style={{
          fontFamily: "var(--font-code)",
          fontSize: "1em",
          color: GLORP_GREEN,
          margin: 0,
          padding: 0,
          background: "none",
          border: "none",
          lineHeight: 1.4,
          userSelect: "none",
          textAlign: "center",
        }}>
          {f[0]}{"\n"}{f[1]}{"\n"}{f[2]}
        </pre>
        {showQuip && (
          <span key={quip} style={{
            fontFamily: "var(--font-code)",
            fontSize: size === "sm" ? "0.55em" : "0.62em",
            color: GLORP_GREEN,
            opacity: 0.75,
            letterSpacing: "0.04em",
            textAlign: "center",
            animation: "glorp-quip-fade 0.5s ease forwards",
          }}>
            {quip}
          </span>
        )}
      </span>
      {label && (
        <span style={{
          fontFamily: "var(--font-code)",
          fontSize: "0.55em",
          opacity: 0.3,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginTop: "0.2em",
        }}>
          {label}
        </span>
      )}
      {/* Sprinkle burst particles */}
      {sprinkles.map(s => (
        <span
          key={s.id}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(${s.x}px, ${s.y}px)`,
            fontFamily: "var(--font-code)",
            fontSize: fontSize,
            color: GLORP_GREEN,
            opacity: s.life * s.opacity,
            pointerEvents: "none",
            userSelect: "none",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {s.char}
        </span>
      ))}
    </span>
  )
}
