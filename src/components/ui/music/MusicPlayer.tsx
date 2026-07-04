import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useStore } from "@/store"
import { useMusic } from "./MusicContext"
import { usePopoutPlayer } from "./usePopoutPlayer"
import { startScratch, prewarmScratch, type ScratchSession } from "@/lib/scratchEngine"
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
    audioRef,
  } = useMusic()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vinylRef = useRef<HTMLDivElement>(null)
  const [scratching, setScratching] = useState(false)
  const { popOut, pipWindow, isPopped, pipSupported } = usePopoutPlayer()

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

    // When popped out, the canvas lives in the PiP document — drive its rAF from
    // that window so the PiP page actually composites each frame, and read the
    // accent from whichever document the canvas is in.
    const win = (canvas.ownerDocument?.defaultView ?? window) as Window
    const rootEl = canvas.ownerDocument?.documentElement ?? document.documentElement
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
      animationId = win.requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      const W = canvas.width, H = canvas.height
      const cx = W / 2, cy = H / 2
      ctx.clearRect(0, 0, W, H)

      const accent = (win.getComputedStyle(rootEl)
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
    return () => win.cancelAnimationFrame(animationId)
    // re-bind when popping in/out so the rAF targets the right window/canvas
  }, [analyser, isExpanded, pipWindow])

  // Pre-decode the current track for scratching so the first scratch is instant
  // (no ~5MB fetch+decode mid-gesture). Fires as soon as the player is open and
  // the analyser exists (the analyser appears after the first user interaction,
  // so this re-runs once audio is unlocked) and whenever the track changes. The
  // decode runs off-thread; a small delay avoids competing with first paint.
  useEffect(() => {
    if (!isExpanded || !analyser || !currentTrack?.audio) return
    const url = currentTrack.audio
    const t = setTimeout(() => { void prewarmScratch(analyser, url) }, 150)
    return () => clearTimeout(t)
  }, [isExpanded, analyser, currentTrack?.audio])

  // --- Scratch: drag the record to scratch it like a real turntable. ---
  // <audio> can't play in reverse, so during a scratch we hand off to an
  // AudioWorklet scratch engine that reads the decoded track at a signed,
  // hand-driven velocity — true forward AND reverse, pitch-bending with hand
  // speed, routed through the same analyser so the visualiser reacts too. On
  // release we read the final position back and resume the <audio> element.
  // Falls back to silent currentTime scrubbing if the engine can't start.
  const onScratchDown = useCallback((e: React.PointerEvent) => {
    const vinyl = vinylRef.current
    const audio = audioRef.current
    if (!vinyl || !audio) return
    e.preventDefault()
    const rect = vinyl.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const angleOf = (px: number, py: number) => Math.atan2(py - cy, px - cx)
    const analyserNode = (window as unknown as { __musicAnalyser?: AnalyserNode }).__musicAnalyser

    let lastAngle = angleOf(e.clientX, e.clientY)
    let lastT = e.timeStamp
    let rotation = 0
    const wasPlaying = !audio.paused
    const trackUrl = audio.currentSrc || audio.src
    audio.pause()                       // worklet takes over the sound
    setScratching(true)
    vinyl.setPointerCapture(e.pointerId)

    // start the real scratch engine (async); until it's ready, moves are buffered
    let session: ScratchSession | null = null
    let pendingVel = 0
    let ended = false
    if (analyserNode && trackUrl) {
      startScratch(analyserNode, trackUrl, audio.currentTime, audio.volume).then((s) => {
        if (ended) { s?.end() ; return }   // released before it loaded
        session = s
        if (session) session.setVelocity(pendingVel)
      })
    }

    const onMove = (ev: PointerEvent) => {
      const a = angleOf(ev.clientX, ev.clientY)
      let d = a - lastAngle
      if (d > Math.PI) d -= Math.PI * 2
      else if (d < -Math.PI) d += Math.PI * 2
      const dt = Math.max(1, ev.timeStamp - lastT)   // ms since last move
      lastAngle = a
      lastT = ev.timeStamp
      rotation += d

      // angular velocity (rev/sec). A real 33⅓ record turns ~0.56 rev/s, so we
      // map hand rev/sec to playback velocity with a little gain and clamp.
      const revPerSec = (d / (Math.PI * 2)) / (dt / 1000)
      const vel = Math.max(-4, Math.min(4, revPerSec * 1.8))
      pendingVel = vel
      if (session) {
        session.setVelocity(vel)
      } else {
        // engine not ready (or unavailable): silent scrub fallback
        const back = (d / (Math.PI * 2)) * 1.8
        audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + back))
      }
      vinyl.style.transform = `rotate(${rotation}rad)`
    }

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      try { vinyl.releasePointerCapture(ev.pointerId) } catch { /* already released */ }
      setScratching(false)
      ended = true
      // Ease the disc from its scratched angle back to rest instead of snapping.
      // Normalise the accumulated rotation into (−π, π] so we glide the short way,
      // then clear the inline transform (handing rotation back to the CSS spin)
      // once the transition lands.
      const TWO_PI = Math.PI * 2
      const resting = rotation - TWO_PI * Math.round(rotation / TWO_PI)
      vinyl.style.transform = `rotate(${resting}rad)`
      requestAnimationFrame(() => {
        vinyl.style.transition = "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)"
        vinyl.style.transform = "rotate(0rad)"
      })
      const clear = () => {
        vinyl.style.transition = ""
        vinyl.style.transform = ""
        vinyl.removeEventListener("transitionend", clear)
      }
      vinyl.addEventListener("transitionend", clear)
      setTimeout(clear, 450)   // safety if transitionend doesn't fire
      if (session) {
        const finalTime = await session.end()
        if (Number.isFinite(finalTime)) audio.currentTime = finalTime
      }
      if (wasPlaying) audio.play().catch(() => { /* autoplay guard */ })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }, [audioRef])

  if (!isExpanded) return null

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const panel = (
    <div className={`${styles.musicPanel} ${isPopped ? styles.popped : ""}`} data-testid="music-player">
      <div className={styles.header}>
        <div className={styles.trackMeta}>
          {currentTrack?.scUrl ? (
            <a
              className={styles.title}
              href={currentTrack.scUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open “${currentTrack.title}” on SoundCloud`}
            >
              {currentTrack.title}
            </a>
          ) : (
            <div className={styles.title}>{currentTrack?.title}</div>
          )}
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
            <div
              ref={vinylRef}
              className={`${styles.vinyl} ${isPlaying ? styles.spinning : ""} ${scratching ? styles.scratching : ""}`}
              onPointerDown={onScratchDown}
              title="Drag to scratch"
            >
              <div className={styles.disc}>
                <img src={currentTrack.cover} alt={currentTrack.title} className={styles.label} draggable={false} />
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
            style={{ "--pct": `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}
          />
          <div className={styles.timeInfo}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className={styles.controls}>
          <button className={styles.controlBtn} onClick={prevTrack} aria-label="Previous track">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 20L9 12L19 4V20ZM5 19V5H7V19H5Z" />
            </svg>
          </button>
          <button className={styles.playBtn} onClick={togglePlay} aria-label="Play or pause">
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
          <button className={styles.controlBtn} onClick={nextTrack} aria-label="Next track">
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

  // When popped out, portal the panel into the PiP window. createPortal keeps
  // the React tree intact (context, state, handlers all work) even though the
  // DOM lands in another document — unlike physically moving the node.
  return pipWindow ? createPortal(panel, pipWindow.document.body) : panel
}
