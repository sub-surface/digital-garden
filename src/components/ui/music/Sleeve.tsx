import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { loadNote } from "@/lib/note-loader"
import type { Track } from "@/types/content"
import styles from "./MusicPlayer.module.scss"

/**
 * The back of the sleeve: what you'd read turning the record over. The
 * track's details, its liner notes (the optional `content/Music/<track>.md`,
 * as the same built HTML the reader shows), and the notes in the garden that
 * mention it.
 */
/**
 * The liner note's prose. A track note often holds only a `music:` play link
 * (the reader's way to start the track), which on the sleeve of the record
 * you're already holding means nothing: drop those, and whatever they leave
 * empty. Returns "" when nothing is left.
 */
function linerHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
  doc.querySelectorAll('a[href^="music:"], [data-island]').forEach((el) => el.remove())
  doc.querySelectorAll("p, li, h2, h3, h4").forEach((el) => { if (!el.textContent?.trim() && !el.querySelector("img")) el.remove() })
  return doc.body.textContent?.trim() || doc.body.querySelector("img") ? doc.body.innerHTML : ""
}

const fmt = (sec?: number) => (sec ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}` : "")

export function Sleeve({ track, index, count }: { track: Track; index: number; count: number }) {
  const contentIndex = useStore((s) => s.contentIndex)
  const navigate = useNavigate()
  const [notes, setNotes] = useState<{ slug: string; html: string } | null | "none">(null)

  // The liner-notes note: by the track's slug, else by its title, in Music/
  const noteSlug = (() => {
    if (!contentIndex) return null
    const want = [track.slug, `music/${track.title}`].map((s) => s.toLowerCase().replace(/\s+/g, "-"))
    return Object.keys(contentIndex).find((k) => want.includes(k.toLowerCase())) ?? null
  })()

  useEffect(() => {
    if (!noteSlug) {
      setNotes(contentIndex ? "none" : null)
      return
    }
    let live = true
    loadNote(noteSlug)
      .then((n) => {
        if (!live) return
        const html = linerHtml(n.html)
        setNotes(html ? { slug: noteSlug, html } : "none")
      })
      .catch(() => live && setNotes("none"))
    return () => { live = false }
  }, [noteSlug, contentIndex])

  const mentions = noteSlug ? (contentIndex?.[noteSlug]?.backlinks ?? []).filter((s) => contentIndex?.[s]) : []
  const go = (slug: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    navigate({ to: "/$", params: { _splat: slug } })
  }

  return (
    <div className={styles.sleeve}>
      <div className={styles.sleeveCat}>
        No. {String(index + 1).padStart(2, "0")} of {count}
        {track.year ? ` · ${track.year}` : ""}
        {track.duration ? ` · ${fmt(track.duration)}` : ""}
      </div>
      <div className={styles.sleeveTitle}>{track.title}</div>
      <div className={styles.sleeveArtist}>{track.artist}</div>

      {notes && notes !== "none" ? (
        // Built note HTML: already sanitised by the note pipeline.
        <div className={styles.sleeveNotes} dangerouslySetInnerHTML={{ __html: notes.html }} />
      ) : notes === "none" ? (
        <p className={styles.sleeveEmpty}>No liner notes yet.</p>
      ) : null}

      {mentions.length > 0 && (
        <div className={styles.sleeveMentions}>
          <div className={styles.sleeveLabel}>In the garden</div>
          {mentions.slice(0, 8).map((s) => (
            <a key={s} href={`/${s}`} onClick={go(s)}>{contentIndex?.[s]?.title ?? s}</a>
          ))}
        </div>
      )}

      {track.scUrl && (
        <a className={styles.sleeveLink} href={track.scUrl} target="_blank" rel="noopener noreferrer">
          SoundCloud ↗
        </a>
      )}
    </div>
  )
}
