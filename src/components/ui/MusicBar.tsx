import { useStore } from "@/store"
import { useMusic } from "./MusicContext"
import styles from "./MusicBar.module.scss"

export function MusicBar() {
  const isExpanded = useStore((s) => s.isMusicExpanded)
  const setIsExpanded = useStore((s) => s.setIsMusicExpanded)
  const { isPlaying, togglePlay, nextTrack, prevTrack, currentTrack } = useMusic()

  if (!currentTrack) return null

  return (
    <div className={styles.musicBar} data-panel-ignore>
      {/* 1. Playback Buttons (Now on the Left) */}
      <div className={styles.controls}>
        <button className={styles.iconBtn} onClick={prevTrack} title="Previous" aria-label="Previous track">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 20L9 12L19 4V20ZM5 19V5H7V19H5Z" />
          </svg>
        </button>
        <button className={styles.iconBtn} onClick={togglePlay} title={isPlaying ? "Pause" : "Play"} aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19H10V5H6V19ZM14 5V19H18V5H14Z" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5V19L19 12L8 5Z" />
            </svg>
          )}
        </button>
        <button className={styles.iconBtn} onClick={nextTrack} title="Next" aria-label="Next track">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M5 4L15 12L5 20V4ZM19 5V19H17V5H19Z" />
          </svg>
        </button>
      </div>

      {/* 2. Song Title Carousel (Center) */}
      <div className={styles.trackInfo}>
        <div className={styles.marquee}>
          <span className={styles.title}>{currentTrack.title}</span>
          <span className={styles.title} aria-hidden="true">{currentTrack.title}</span>
        </div>
      </div>

      {/* 3. Expand Button (Now on the Right) */}
      <button
        className={styles.expandBtn}
        onClick={() => setIsExpanded(!isExpanded)}
        title="Show details"
        aria-label={isExpanded ? "Hide player details" : "Show player details"}
        aria-expanded={isExpanded}
      >
        <span className={`${styles.plus} ${isExpanded ? styles.active : ""}`} aria-hidden="true">+</span>
      </button>
    </div>
  )
}
