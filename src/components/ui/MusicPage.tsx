import { useMusic } from "./MusicContext"
import { useStore } from "@/store"
import styles from "./Collections.module.scss"

export function MusicPage() {
  const { tracks, currentTrackIndex, isPlaying, playTrack } = useMusic()
  const contentIndex = useStore((s) => s.contentIndex)

  // A track may optionally have a backing note (liner notes). Only link to it
  // when one actually exists in the content index.
  const hasNote = (slug: string) =>
    Boolean(contentIndex && (contentIndex as Record<string, unknown>)[slug])

  return (
    <div className={styles.collectionPage}>
      <header className={styles.header}>
        <h1>Music</h1>
        <p>A collection of sounds and experiments.</p>
      </header>

      <div className={styles.musicList}>
        {tracks.length === 0 ? (
          <p>No tracks found.</p>
        ) : (
          tracks.map((track, index) => (
            <div
              key={track.slug}
              className={`${styles.musicItem} ${index === currentTrackIndex ? styles.active : ""}`}
            >
              <div className={styles.musicCover}>
                {track.cover ? <img src={track.cover} alt={track.title} /> : <div className={styles.placeholder} />}
                <button
                  className={styles.playButton}
                  onClick={() => playTrack(index)}
                  aria-label={index === currentTrackIndex && isPlaying ? "Pause" : "Play"}
                >
                  {index === currentTrackIndex && isPlaying ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 19H10V5H6V19ZM14 5V19H18V5H14Z" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5V19L19 12L8 5Z" />
                    </svg>
                  )}
                </button>
              </div>
              <div className={styles.musicInfo}>
                <h2>{track.title}</h2>
                <p>{track.artist}</p>
                <div className={styles.trackLinks}>
                  {hasNote(track.slug) && (
                    <a href={`/${track.slug}`} className={styles.noteLink}>View Note →</a>
                  )}
                  {track.scUrl && (
                    <a
                      href={track.scUrl}
                      className={styles.noteLink}
                      target="_blank"
                      rel="noreferrer"
                      data-panel-ignore
                    >
                      SoundCloud ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
