import { useEffect, useState } from "react"
import { GLORP_GREEN, MOODS, type Mood } from "./glorp"

/**
 * Just glorp's face, cycling through a mood's frames. The homepage avatar,
 * the OS pet and GlorpPeek all draw this. Pauses while the tab is hidden.
 */
export function GlorpFace({ mood, interval = 900, className, style }: {
  mood: Mood
  interval?: number
  className?: string
  style?: React.CSSProperties
}) {
  const frames = MOODS[mood]
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setFrame((f) => f + 1)
    }, interval)
    return () => window.clearInterval(id)
  }, [interval])

  const [antennae, face, body] = frames[frame % frames.length]
  return (
    <pre
      className={className}
      aria-hidden="true"
      style={{ margin: 0, fontFamily: "var(--font-code)", lineHeight: 1.15, color: GLORP_GREEN, background: "none", ...style }}
    >
      {antennae}
      {"\n"}
      {face}
      {"\n"}
      {body}
    </pre>
  )
}
