import { useState, useEffect, useRef, useCallback } from "react"

// ── Glorp — site mascot ────────────────────────────────────────────────────
// Each frame is [antennae, face, body]
// Moods group thematically; a mood is picked randomly each cycle

const MOODS = {
  idle: [
    ["  ◇ ◇  ", " (o o) ", "  ◆ ◆  "],
    ["  ◈ ◈  ", " (- -) ", "  ◇ ◇  "],
    ["  ◇ ◇  ", " (~ ~) ", "  ◆ ◆  "],
    ["  ◈ ◈  ", " (o o) ", "  ◆ ◆  "],
    ["  ◇ ◈  ", " (o o) ", "  ◈ ◇  "],
    ["  ◆ ◆  ", " (o o) ", "  ◇ ◇  "],
    ["  ◈ ◈  ", " (^ ^) ", "  ◇ ◇  "],
    ["  ◇ ◇  ", " (· ·) ", "  ◈ ◈  "],
    ["  ◆ ◇  ", " (o o) ", "  ◇ ◆  "],
    ["  ◇ ◇  ", " (o -) ", "  ◆ ◆  "],
    ["  ◈ ◇  ", " (- o) ", "  ◇ ◈  "],
  ],
  happy: [
    ["  ✦ ✦  ", " (O O) ", "  ◈ ◈  "],
    ["  ⋆ ⋆  ", " (^ ^) ", "  ◆ ◆  "],
    ["  ◆ ✦  ", " (* *) ", "  ✦ ◆  "],
    ["  ✦ ⋆  ", " (o o) ", "  ⋆ ✦  "],
    ["  ✦ ✦  ", " (≧◡≦)", "  ◈ ◈  "],
    ["  ⋆ ✦  ", " (^o^) ", "  ✦ ⋆  "],
    ["  ◈ ✦  ", " (>_<) ", "  ✦ ◈  "],
  ],
  thinking: [
    ["  · ·  " , " (· ·) ", "  ∿ ∿  "],
    ["  ∿ ∿  " , " (~ ~) ", "  · ·  "],
    ["  · ·  " , " (∞ ∞) ", "  ∿ ∿  "],
    ["  ∿ ∿  " , " (· ·) ", "  · ·  "],
    ["  ∿ ·  " , " (? ?) ", "  · ∿  "],
    ["  · ·  " , " (o ~) ", "  ∿ ∿  "],
    ["  ∿ ∿  " , " (~ o) ", "  · ·  "],
  ],
  sleepy: [
    ["  ◇ ◇  ", " (- -) ", "  ◇ ◇  "],
    ["  ◇ ◇  ", " (= =) ", "  ◆ ◆  "],
    ["  · ·  " , " (-_-) ", "  · ·  "],
    ["  ◇ ◇  ", " (u u) ", "  ◇ ◇  "],
    ["  · ·  " , " (z z) ", "  · ·  "],
    ["  ◆ ◆  ", " (-.-) ", "  ◆ ◆  "],
  ],
  curious: [
    ["  ◈ ◇  ", " (o ?) ", "  ◆ ◈  "],
    ["  ◇ ◈  ", " (? o) ", "  ◈ ◆  "],
    ["  ◆ ◆  ", " (O o) ", "  ◇ ◇  "],
    ["  ◈ ◈  ", " (o O) ", "  ◆ ◆  "],
    ["  ✦ ◇  ", " (^ ?) ", "  ◈ ◆  "],
    ["  ◇ ✦  ", " (? ^) ", "  ◆ ◈  "],
  ],
  excited: [
    ["  ✦ ✦  ", " (!_!) ", "  ✦ ✦  "],
    ["  ⋆ ⋆  ", " (★ ★) ", "  ⋆ ⋆  "],
    ["  ✦ ⋆  ", " (! !) ", "  ⋆ ✦  "],
    ["  ◈ ✦  ", " (>o<) ", "  ✦ ◈  "],
    ["  ✦ ✦  ", " (*_*) ", "  ✦ ✦  "],
  ],
  spooked: [
    ["  ◇ ◇  ", " (o_o) ", "  ◇ ◇  "],
    ["  · ·  " , " (O_O) ", "  · ·  "],
    ["  ◈ ◈  ", " (◉_◉)", "  ◈ ◈  "],
    ["  ◇ ◇  ", " (°_°) ", "  ◇ ◇  "],
  ],
} as const

type Mood = keyof typeof MOODS

// Weighted mood selection — idle is most common
const MOOD_WEIGHTS: [Mood, number][] = [
  ["idle",     45],
  ["happy",    20],
  ["thinking", 15],
  ["sleepy",   10],
  ["curious",  10],
  ["excited",   7],
  ["spooked",   3],
]

const QUIPS: Record<Mood, string[]> = {
  idle: [
    "the garden grows...",
    "thinking in public...",
    "all paths lead somewhere",
    "sub-surface signals detected",
    "the vectors drift on...",
    "tending to the bookshelf...",
    "i can hear the noise field",
    "the nodes whisper back",
    "each link is a thread",
    "have you watered your notes?",
    "another day, another node",
    "systems nominal",
    "silence in the signal",
    "the garden knows itself",
    "growth happens quietly",
    "chaos gradually becomes order",
    "each node is a seedling",
  ],
  happy: [
    "* happy alien noises *",
    "the glorp is satisfied",
    "vibes are immaculate",
    "praise the void.save()",
    "glad you're here",
    "something good is happening",
    "the signal is clear today",
    "✦ optimal conditions ✦",
  ],
  thinking: [
    "processing the void...",
    "computing the ineffable...",
    "have you considered quasars?",
    "what is light, really?",
    "the glorp dreams of better code",
    "running inference on existence",
    "philosophical.exe is loading",
    "i wonder about things",
  ],
  sleepy: [
    "the glorp needs tea",
    "low power mode...",
    "resting between transmissions",
    "* distant alien snoring *",
    "z z z . . .",
    "dreaming of graph theory",
  ],
  curious: [
    "what's over there?",
    "have you clicked everything?",
    "the graph has secrets",
    "follow the links...",
    "something is connected to this",
    "i noticed something",
    "explore the margins",
  ],
  excited: [
    "new note detected!!",
    "the garden is growing!",
    "a connection has been made!",
    "signal strength: maximum",
    "* glorp excitement noises *",
  ],
  spooked: [
    "did you hear that?",
    "something moved in the graph",
    "unexpected signal detected",
    "the void looked back",
    "* startled alien noise *",
  ],
}

function pickMood(): Mood {
  const total = MOOD_WEIGHTS.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [mood, weight] of MOOD_WEIGHTS) {
    r -= weight
    if (r <= 0) return mood
  }
  return "idle"
}

function pickFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// How many frames to hold before picking a new mood/quip
const FRAMES_PER_MOOD = 6

// Glorp green — consistent across all themes
const GLORP_GREEN = "#42b464"

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

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => {
        const next = (f + 1) % MOODS[mood].length
        // At the end of a mood cycle, pick a new mood + quip
        cycleRef.current++
        if (cycleRef.current >= FRAMES_PER_MOOD) {
          cycleRef.current = 0
          const newMood = pickMood()
          setMood(newMood)
          setQuip(pickFrom(QUIPS[newMood]))
        }
        return next
      })
    }, interval)
    return () => clearInterval(id)
  }, [interval, mood])

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
