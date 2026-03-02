import { useEffect, useRef } from "react"
import { useStore } from "@/store"
import { useMusic } from "./MusicContext"
import styles from "./MusicPlayer.module.scss"

export function MusicPlayer() {
  const isExpanded = useStore((s) => s.isMusicExpanded)
  const isPlaylistOpen = useStore((s) => s.isPlaylistExpanded)
  const setIsPlaylistOpen = useStore((s) => s.setIsPlaylistExpanded)
  
  const {
    tracks,
    currentTrackIndex,
    isPlaying,
    volume,
    currentTime,
    duration,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    setVolume,
    seek,
    currentTrack,
    analyser,
  } = useMusic()

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Visualiser animation
  useEffect(() => {
    if (!analyser || !canvasRef.current || !isExpanded) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    let animationId: number

    const draw = () => {
      animationId = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const barWidth = (canvas.width / bufferLength) * 2.5
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base") || "#fff"
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.4
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)
        x += barWidth + 1
      }
    }

    draw()
    return () => cancelAnimationFrame(animationId)
  }, [analyser, isExpanded])

  if (!isExpanded) return null

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className={styles.musicPanel} data-testid="music-player">
      <div className={styles.header}>
        <div className={styles.trackMeta}>
          <div className={styles.title}>{currentTrack?.title}</div>
          <div className={styles.artist}>{currentTrack?.artist}</div>
        </div>
        <button 
          className={`${styles.playlistToggle} ${isPlaylistOpen ? styles.active : ""}`}
          onClick={() => setIsPlaylistOpen(!isPlaylistOpen)}
          title="Toggle Playlist"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </button>
      </div>

      <div className={styles.mainContent}>
        <div className={styles.visualiserWrap}>
          <canvas ref={canvasRef} width="240" height="40" className={styles.canvas} />
        </div>

        <div className={styles.progressArea}>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className={styles.progressBar}
          />
          <div className={styles.timeInfo}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className={styles.controls}>
          <button className={styles.controlBtn} onClick={prevTrack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 20L9 12L19 4V20ZM5 19V5H7V19H5Z" />
            </svg>
          </button>
          <button className={styles.playBtn} onClick={togglePlay}>
            {isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19H10V5H6V19ZM14 5V19H18V5H14Z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5V19L19 12L8 5Z" />
              </svg>
            )}
          </button>
          <button className={styles.controlBtn} onClick={nextTrack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 4L15 12L5 20V4ZM19 5V19H17V5H19Z" />
            </svg>
          </button>
        </div>

        <div className={styles.volumeArea}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4 }}>
            <path d="M11 5L6 9H2V15H6L11 19V5Z" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className={styles.volumeSlider}
          />
        </div>
      </div>

      {isPlaylistOpen && (
        <div className={styles.playlist}>
          {tracks.map((track, i) => (
            <div 
              key={track.slug} 
              className={`${styles.trackItem} ${i === currentTrackIndex ? styles.active : ""}`}
              onClick={() => playTrack(i)}
            >
              <span className={styles.idx}>{(i + 1).toString().padStart(2, '0')}</span>
              <span className={styles.tTitle}>{track.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
