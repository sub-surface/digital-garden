import React, { createContext, useContext, useEffect, useRef, useState } from "react"
import type { Track } from "@/types/content"
import { musicAssetUrl } from "@/lib/musicAsset"

interface MusicContextType {
  tracks: Track[]
  currentTrackIndex: number
  isPlaying: boolean
  volume: number
  progress: number
  duration: number
  currentTime: number
  playTrack: (target: number | string) => void
  togglePlay: () => void
  nextTrack: () => void
  prevTrack: () => void
  setVolume: (volume: number) => void
  seek: (time: number) => void
  currentTrack: Track | null
  analyser: AnalyserNode | null
  /** Live <audio> element — for direct, render-lag-free scrubbing (scratch). */
  audioRef: React.RefObject<HTMLAudioElement | null>
  repeatMode: "off" | "track" | "all"
  setRepeatMode: (mode: "off" | "track" | "all") => void
  playlist: number[]
  setPlaylist: (list: number[]) => void
  playlistIndex: number
  setPlaylistIndex: (index: number) => void
}

const MusicContext = createContext<MusicContextType | undefined>(undefined)

export function useMusic() {
  const context = useContext(MusicContext)
  if (!context) {
    throw new Error("useMusic must be used within a MusicProvider")
  }
  return context
}

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tracks, setTracks] = useState<Track[]>([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [volume, setVolumeState] = useState<number>(0.5)
  const [progress, setProgress] = useState<number>(0)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)
  
  const [repeatMode, setRepeatMode] = useState<"off" | "track" | "all">("all")
  const [playlist, setPlaylist] = useState<number[]>([])
  const [playlistIndex, setPlaylistIndex] = useState<number>(-1)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  // Position to seek to once the restored track's metadata loads (resume across
  // page loads). Cleared after it's applied so a later track change starts at 0.
  const resumeTimeRef = useRef<number>(0)
  // Throttle session writes so a per-frame timeupdate doesn't hammer localStorage.
  const lastSaveRef = useRef<number>(0)

  // Fetch tracks on mount, then restore the last session (track + position +
  // playlist) from localStorage. We never auto-resume *playing* — browsers
  // block autoplay without a gesture — so playback stays paused until the user
  // interacts, but everything else picks up exactly where they left off.
  useEffect(() => {
    fetch("/music.json")
      .then((res) => res.json())
      .then((data: Track[]) => {
        // Audio/cover are absolute URLs (R2) by default. Legacy local paths
        // under /Media are still rewritten to /content/Media for back-compat.
        const fix = (p: string) =>
          p && p.startsWith("/Media") ? `/content${p}` : p
        const adjusted = data.map((t) => ({
          ...t,
          audio: musicAssetUrl(fix(t.audio)),
          cover: musicAssetUrl(fix(t.cover)),
        }))
        setTracks(adjusted)

        try {
          const raw = localStorage.getItem("music-session")
          if (raw) {
            const s = JSON.parse(raw) as {
              trackIndex?: number
              time?: number
              repeatMode?: "off" | "track" | "all"
              playlist?: number[]
              playlistIndex?: number
            }
            if (
              typeof s.trackIndex === "number" &&
              s.trackIndex >= 0 &&
              s.trackIndex < adjusted.length
            ) {
              setCurrentTrackIndex(s.trackIndex)
              resumeTimeRef.current = s.time && s.time > 0 ? s.time : 0
            }
            if (s.repeatMode) setRepeatMode(s.repeatMode)
            if (Array.isArray(s.playlist)) setPlaylist(s.playlist)
            if (typeof s.playlistIndex === "number") setPlaylistIndex(s.playlistIndex)
          }
        } catch (err) {
          console.warn("Failed to restore music session:", err)
        }
      })
      .catch((err) => console.error("Failed to load music.json:", err))

    // Restore volume independently (its own key, also written by setVolume).
    const savedVol = localStorage.getItem("music-volume")
    if (savedVol !== null) {
      const v = parseFloat(savedVol)
      if (Number.isFinite(v)) setVolumeState(Math.max(0, Math.min(1, v)))
    }
  }, [])

  // Setup Web Audio API for visualiser
  useEffect(() => {
    if (!audioRef.current) return

    const initAudioContext = () => {
      if (audioContextRef.current) return

      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioContextClass()
      const analyser = ctx.createAnalyser()
      // 1024 → 512 bins: enough resolution for log-spaced bands to have real
      // detail in the low octaves. smoothingTimeConstant adds a little inherent
      // temporal smoothing on top of the visualiser's own peak-decay.
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.8
      
      const source = ctx.createMediaElementSource(audioRef.current!)
      source.connect(analyser)
      analyser.connect(ctx.destination)

      audioContextRef.current = ctx
      analyserRef.current = analyser
      setAnalyser(analyser)
      sourceRef.current = source
      
      // Store on window for background engine access (port of Quartz logic)
      ;(window as any).__musicAnalyser = analyser
      ;(window as any).__musicIsPlaying = () => !audioRef.current?.paused
    }

    const handleInteraction = () => {
      initAudioContext()
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume()
      }
    }

    window.addEventListener("click", handleInteraction)
    window.addEventListener("keydown", handleInteraction)

    return () => {
      window.removeEventListener("click", handleInteraction)
      window.removeEventListener("keydown", handleInteraction)
    }
  }, [])

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.play().catch((err) => {
        console.warn("Autoplay blocked or track failed:", err)
        setIsPlaying(false)
      })
    } else {
      audioRef.current.pause()
    }
  }, [isPlaying, currentTrackIndex])

  const currentTrack = tracks[currentTrackIndex] || null

  // Persist immediately when the track / repeat / playlist changes (the time
  // path is throttled separately). Skips the empty initial render.
  useEffect(() => {
    if (tracks.length === 0) return
    try {
      localStorage.setItem(
        "music-session",
        JSON.stringify({
          trackIndex: currentTrackIndex,
          time: resumeTimeRef.current || audioRef.current?.currentTime || 0,
          repeatMode,
          playlist,
          playlistIndex,
        }),
      )
    } catch {
      /* non-fatal */
    }
  }, [currentTrackIndex, repeatMode, playlist, playlistIndex, tracks.length])

  // --- Media Session: drive the player from OS / lockscreen / media keys. ---
  // Metadata (title, artist, artwork) updates per track; action handlers route
  // hardware/OS controls back into the player. Guarded for browsers (Safari)
  // missing individual actions.
  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms || !currentTrack) return
    try {
      ms.metadata = new MediaMetadata({
        title: currentTrack.title || "Unknown",
        artist: currentTrack.artist || "",
        album: "subsurfaces.net",
        artwork: currentTrack.cover
          ? [{ src: currentTrack.cover, sizes: "512x512", type: "image/jpeg" }]
          : [],
      })
    } catch {
      /* MediaMetadata unsupported */
    }
  }, [currentTrack])

  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms) return
    const set = (action: MediaSessionAction, handler: (() => void) | null) => {
      try { ms.setActionHandler(action, handler) } catch { /* unsupported action */ }
    }
    set("play", () => setIsPlaying(true))
    set("pause", () => setIsPlaying(false))
    set("previoustrack", () => prevTrack())
    set("nexttrack", () => nextTrack())
    try {
      ms.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime === "number") seek(details.seekTime)
      })
    } catch { /* unsupported */ }
    return () => {
      for (const a of ["play", "pause", "previoustrack", "nexttrack", "seekto"] as const) {
        set(a, null)
      }
    }
  }, [tracks, playlist, playlistIndex, currentTrackIndex])

  // Keep OS playback state in sync so the lockscreen shows the right play/pause.
  useEffect(() => {
    if (navigator.mediaSession) {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused"
    }
  }, [isPlaying])

  const ensureAudioContext = () => {
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume()
    }
  }

  const playTrack = (target: number | string) => {
    ensureAudioContext()
    
    let index = -1
    if (typeof target === "number") {
      index = target
    } else {
      index = tracks.findIndex(t => t.slug === target)
    }

    if (index === -1) return

    if (index === currentTrackIndex) {
      togglePlay()
    } else {
      setCurrentTrackIndex(index)
      setIsPlaying(true)
    }
  }

  const togglePlay = () => {
    ensureAudioContext()
    setIsPlaying(!isPlaying)
  }

  const nextTrack = () => {
    ensureAudioContext()
    if (playlist.length > 0) {
      const nextIdx = (playlistIndex + 1) % playlist.length
      setPlaylistIndex(nextIdx)
      setCurrentTrackIndex(playlist[nextIdx])
    } else {
      setCurrentTrackIndex((prev) => (prev + 1) % tracks.length)
    }
    setIsPlaying(true)
  }

  const prevTrack = () => {
    ensureAudioContext()
    if (playlist.length > 0) {
      const prevIdx = (playlistIndex - 1 + playlist.length) % playlist.length
      setPlaylistIndex(prevIdx)
      setCurrentTrackIndex(playlist[prevIdx])
    } else {
      setCurrentTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length)
    }
    setIsPlaying(true)
  }

  const setVolume = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    setVolumeState(clamped)
    localStorage.setItem("music-volume", clamped.toString())
  }

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime
      const dur = audioRef.current.duration
      setCurrentTime(cur)
      setDuration(dur || 0)
      setProgress(dur ? cur / dur : 0)
      // Persist position at most every 5s so resume survives a reload/close
      // without hammering localStorage on every timeupdate tick.
      const now = performance.now()
      if (now - lastSaveRef.current > 5000) {
        lastSaveRef.current = now
        saveSession(cur)
      }
    }
  }

  // When a restored track's metadata is ready, jump to the saved position once.
  const handleLoadedMetadata = () => {
    if (audioRef.current && resumeTimeRef.current > 0) {
      const t = Math.min(resumeTimeRef.current, audioRef.current.duration || resumeTimeRef.current)
      audioRef.current.currentTime = t
      resumeTimeRef.current = 0
    }
    handleTimeUpdate()
  }

  // Snapshot the listening session so the next visit resumes where we left off.
  // `time` is passed explicitly when called from the timeupdate path (the state
  // `currentTime` lags a tick); falls back to the live element otherwise.
  const saveSession = (time?: number) => {
    try {
      localStorage.setItem(
        "music-session",
        JSON.stringify({
          trackIndex: currentTrackIndex,
          time: time ?? audioRef.current?.currentTime ?? 0,
          repeatMode,
          playlist,
          playlistIndex,
        }),
      )
    } catch {
      /* quota / private mode — non-fatal */
    }
  }

  const handleEnded = () => {
    if (repeatMode === "track") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play()
      }
    } else if (repeatMode === "all") {
      nextTrack()
    } else {
      if (playlist.length > 0 && playlistIndex === playlist.length - 1) {
        setIsPlaying(false)
      } else if (playlist.length === 0 && currentTrackIndex === tracks.length - 1) {
        setIsPlaying(false)
      } else {
        nextTrack()
      }
    }
  }

  return (
    <MusicContext.Provider
      value={{
        tracks,
        currentTrackIndex,
        isPlaying,
        volume,
        progress,
        duration,
        currentTime,
        playTrack,
        togglePlay,
        nextTrack,
        prevTrack,
        setVolume,
        seek,
        currentTrack,
        analyser,
        audioRef,
        repeatMode,
        setRepeatMode,
        playlist,
        setPlaylist,
        playlistIndex,
        setPlaylistIndex,
      }}
    >
      {children}
      <audio
        ref={audioRef}
        src={currentTrack?.audio}
        crossOrigin="anonymous"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
      />
    </MusicContext.Provider>
  )
}
