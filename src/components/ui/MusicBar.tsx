import { useStore } from "@/store"
import { useMusic } from "./MusicContext"
import styles from "./MusicBar.module.scss"

export function MusicBar() {
  const isExpanded = useStore((s) => s.isMusicExpanded)
  const setIsExpanded = useStore((s) => s.setIsMusicExpanded)
  const { isPlaying, togglePlay, nextTrack, prevTrack, currentTrack } = useMusic()

  const toggleMusic = useStore((s) => s.toggleMusic)

  if (!currentTrack) return null

  return (
    <div className={styles.musicBar} data-panel-ignore>
      <button 
        className={styles.expandBtn} 
        onClick={() => setIsExpanded(!isExpanded)}
        title="Show details"
      >
        <span className={`${styles.plus} ${isExpanded ? styles.active : ""}`}>+</span>
      </button>

      <div className={styles.trackInfo}>
        <div className={styles.marquee}>
          <span className={styles.title}>{currentTrack.title}</span>
          <span className={styles.title} aria-hidden="true">{currentTrack.title}</span>
        </div>
      </div>

      <div className={styles.controls}>
        <button className={styles.iconBtn} onClick={prevTrack} title="Previous">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 20L9 12L19 4V20ZM5 19V5H7V19H5Z" />
          </svg>
        </button>
        <button className={styles.iconBtn} onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
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
        <button className={styles.iconBtn} onClick={nextTrack} title="Next">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 4L15 12L5 20V4ZM19 5V19H17V5H19Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
