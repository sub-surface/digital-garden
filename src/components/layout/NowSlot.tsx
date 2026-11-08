import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { useMusic } from "@/components/ui/music/MusicContext"
import { MusicBar } from "@/components/ui/music/MusicBar"
import { isLandableNote } from "@/hooks/useRandomNote"
import styles from "./QuickControls.module.scss"

/**
 * The left of the bar says what is happening now. While music is playing (or
 * paused mid-listen) that's the song. Otherwise it's what has changed in the
 * garden lately: the newest notes, one at a time, a click away.
 */

const ROTATE_MS = 9000
const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto", style: "short" })

function ago(date: string): string {
  const days = Math.round((Date.parse(date) - Date.now()) / 86_400_000)
  if (days > -1) return "today"
  if (days > -14) return RELATIVE.format(days, "day")
  if (days > -60) return RELATIVE.format(Math.round(days / 7), "week")
  return RELATIVE.format(Math.round(days / 30), "month")
}

interface Event {
  slug: string
  label: string
  when: string
}

function useRecentEvents(scope: "garden" | "wiki"): Event[] {
  const contentIndex = useStore((s) => s.contentIndex)
  return useMemo(() => {
    if (!contentIndex) return []
    const now = Date.now()
    return Object.values(contentIndex)
      .filter((n) => n.date && !n.draft && !n.system && isLandableNote(n.slug, n))
      .filter((n) => (scope === "wiki") === n.slug.toLowerCase().startsWith("wiki/"))
      .filter((n) => Date.parse(n.date!) <= now)
      .sort((a, b) => Date.parse(b.date!) - Date.parse(a.date!))
      .slice(0, 4)
      .map((n) => ({ slug: n.slug, label: n.title, when: ago(n.date!) }))
  }, [contentIndex, scope])
}

export function NowSlot({ scope, music }: { scope: "garden" | "wiki"; music: boolean }) {
  const { isPlaying, currentTrack, togglePlay, tracks } = useMusic()
  // Once you've listened this visit, the song keeps the slot even when paused,
  // so resuming is one click.
  const [listening, setListening] = useState(false)
  if (music && isPlaying && !listening) setListening(true)

  if (music && listening && currentTrack) return <MusicBar />
  return <Events scope={scope} onPlay={music && tracks.length ? togglePlay : undefined} />
}

function Events({ scope, onPlay }: { scope: "garden" | "wiki"; onPlay?: () => void }) {
  const events = useRecentEvents(scope)
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (events.length < 2 || paused) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % events.length), ROTATE_MS)
    return () => window.clearInterval(id)
  }, [events.length, paused])

  const event = events[index % Math.max(events.length, 1)]

  return (
    <div className={styles.now} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      {onPlay && (
        <button className={styles.nowPlay} onClick={onPlay} title="Play music (M)" aria-label="Play music">
          ♪
        </button>
      )}
      {event && (
        <button
          key={event.slug}
          className={styles.nowEvent}
          onClick={() => navigate({ to: "/$", params: { _splat: event.slug } })}
          title={`Newest: ${event.label}`}
        >
          <span className={styles.nowKind}>new</span>
          <span className={styles.nowLabel}>{event.label}</span>
          <span className={styles.nowWhen}>{event.when}</span>
        </button>
      )}
    </div>
  )
}
