import { useEffect, useRef } from "react"
import { useStore } from "@/store"
import { useMusic } from "./MusicContext"
import { usePopoutPlayer } from "./usePopoutPlayer"
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
  const panelRef = useRef<HTMLDivElement>(null)
  const { popOut, isPopped, pipSupported } = usePopoutPlayer(panelRef)

  // Radial visualiser drawn BEHIND the record. Bars bloom outward from behind
  // the disc edge while playing. Two scale choices that make it musical without
  // costing anything per frame:
  //   • Frequency axis is LOG-spaced. getByteFrequencyData bins are linear in Hz,
  //     but pitch is logarithmic — a linear sweep clumps everything in the bass
  //     and leaves a dead high-end tail. We precompute, once, the [lo,hi) bin band
  //     each bar averages, so each bar spans ~equal musical interval (octave-even).
  //   • Amplitude is already ~log: the analyser returns dB mapped to 0–255, so we
  //     use it linearly. We add cheap peak-decay smoothing so bars fall gracefully
  //     instead of strobing. One Float32Array, no allocation in the loop.
  // Bars are mirrored left/right so the bloom reads symmetric (bass at the top).
  useEffect(() => {
    if (!analyser || !canvasRef.current || !isExpanded) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const BANDS = 40                 // logical frequency bands (mirrored → 80 bars)
    const minBin = 1                 // skip DC
    const maxBin = Math.floor(bufferLength * 0.85)
    // Precompute log-spaced band edges once (no per-frame Math.log / pow).
    const edges = new Int32Array(BANDS + 1)
    const logMin = Math.log(minBin), logMax = Math.log(maxBin)
    for (let i = 0; i <= BANDS; i++) {
      const b = Math.round(Math.exp(logMin + (logMax - logMin) * (i / BANDS)))
      edges[i] = Math.max(i === 0 ? minBin : edges[i - 1] + 1, b)
    }
    const peaks = new Float32Array(BANDS)   // smoothed per-band amplitude

    let animationId: number
    const TWO_PI = Math.PI * 2

    const draw = () => {
      animationId = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      const W = canvas.width, H = canvas.height
      const cx = W / 2, cy = H / 2
      ctx.clearRect(0, 0, W, H)

      const accent = (getComputedStyle(document.documentElement)
        .getPropertyValue("--color-accent-base") || "#b4424c").trim()
      const inner = Math.min(W, H) * 0.30   // start just outside the disc edge
      const maxLen = Math.min(W, H) * 0.205

      ctx.strokeStyle = accent
      ctx.lineCap = "round"
      const TOTAL = BANDS * 2
      ctx.lineWidth = Math.max(1.5, (TWO_PI * inner) / TOTAL * 0.55)

      for (let i = 0; i < BANDS; i++) {
        // average the bins in this log band
        let sum = 0, n = 0
        for (let b = edges[i]; b < edges[i + 1]; b++) { sum += dataArray[b]; n++ }
        const v = (n ? sum / n : 0) / 255
        // peak-decay: rise instantly, fall slowly → graceful, non-strobing
        peaks[i] = reduce ? 0.15 : v > peaks[i] ? v : peaks[i] * 0.86 + v * 0.14
        const p = peaks[i]
        const len = p * maxLen + 1
        ctx.globalAlpha = 0.16 + p * 0.55

        // mirror band i to both sides: bass at top (−90°), treble toward bottom
        for (const sign of [-1, 1]) {
          const ang = -Math.PI / 2 + sign * (i / TOTAL) * TWO_PI
          const c = Math.cos(ang), s = Math.sin(ang)
          ctx.beginPath()
          ctx.moveTo(cx + c * inner, cy + s * inner)
          ctx.lineTo(cx + c * (inner + len), cy + s * (inner + len))
          ctx.stroke()
        }
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
    <div className={`${styles.musicPanel} ${isPopped ? styles.popped : ""}`} data-testid="music-player" ref={panelRef}>
      <div className={styles.header}>
        <div className={styles.trackMeta}>
          <div className={styles.title}>{currentTrack?.title}</div>
          <div className={styles.artist}>{currentTrack?.artist}</div>
        </div>
        <div className={styles.headerActions}>
          {pipSupported && (
            <button
              className={`${styles.iconAction} ${isPopped ? styles.active : ""}`}
              onClick={popOut}
              title="Pop out player"
              aria-label="Pop out player into a floating window"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3" />
                <rect x="8" y="9" width="8" height="6" rx="1" />
              </svg>
            </button>
          )}
          <button
            className={`${styles.iconAction} ${isPlaylistOpen ? styles.active : ""}`}
            onClick={() => setIsPlaylistOpen(!isPlaylistOpen)}
            title="Toggle Playlist"
            aria-label="Toggle playlist"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </button>
          <button
            className={styles.closeBtn}
            onClick={() => useStore.getState().setIsMusicExpanded(false)}
            title="Close Player"
            aria-label="Close player"
          >
            &times;
          </button>
        </div>
      </div>

      <div className={styles.mainContent}>
        {currentTrack?.cover && (
          <div className={styles.coverWrap}>
            <canvas ref={canvasRef} width="320" height="320" className={styles.viz} />
            <div className={`${styles.vinyl} ${isPlaying ? styles.spinning : ""}`}>
              <div className={styles.disc}>
                <img src={currentTrack.cover} alt={currentTrack.title} className={styles.label} />
                <span className={styles.spindle} />
              </div>
            </div>
          </div>
        )}

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
