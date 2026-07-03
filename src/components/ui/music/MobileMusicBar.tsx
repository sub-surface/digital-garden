import { useStore } from "@/store"
import { useMusic } from "./MusicContext"
import styles from "./MobileMusicBar.module.scss"

export function MobileMusicBar() {
  const isExpanded = useStore((s) => s.isMusicExpanded)
  const setIsExpanded = useStore((s) => s.setIsMusicExpanded)
  const isMusicOpen = useStore((s) => s.isMusicOpen)
  const { isPlaying, togglePlay, nextTrack, prevTrack, currentTrack } = useMusic()

  if (!currentTrack || !isMusicOpen) return null

  return (
    <div className={styles.mobileMusicBar} data-panel-ignore>
      <div className={styles.content}>
        <div className={styles.controls}>
          <button className={styles.iconBtn} onClick={prevTrack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 20L9 12L19 4V20ZM5 19V5H7V19H5Z" />
            </svg>
          </button>
          <button className={styles.playBtn} onClick={togglePlay}>
            {isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19H10V5H6V19ZM14 5V19H18V5H14Z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5V19L19 12L8 5Z" />
              </svg>
            )}
          </button>
          <button className={styles.iconBtn} onClick={nextTrack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 4L15 12L5 20V4ZM19 5V19H17V5H19Z" />
            </svg>
          </button>
        </div>

        <div className={styles.trackInfo}>
          <div className={styles.marquee}>
            <span className={styles.title}>{currentTrack.title}</span>
            <span className={styles.title} aria-hidden="true">{currentTrack.title}</span>
          </div>
        </div>

        <button 
          className={styles.expandBtn} 
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className={`${styles.plus} ${isExpanded ? styles.active : ""}`}>+</span>
        </button>
      </div>
    </div>
  )
}
