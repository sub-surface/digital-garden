import React, { createContext, useContext, useEffect, useRef, useState } from "react"
import type { Track } from "@/types/content"

interface MusicContextType {
  tracks: Track[]
  currentTrackIndex: number
  isPlaying: boolean
  volume: number
  progress: number
  duration: number
  currentTime: number
  playTrack: (index: number) => void
  togglePlay: () => void
  nextTrack: () => void
  prevTrack: () => void
  setVolume: (volume: number) => void
  seek: (time: number) => void
  currentTrack: Track | null
  analyser: AnalyserNode | null
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
  const [volume, setVolumeState] = useState<number>(0.8)
  const [progress, setProgress] = useState<number>(0)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)

  // Fetch tracks on mount
  useEffect(() => {
    fetch("/music.json")
      .then((res) => res.json())
      .then((data: Track[]) => {
        // Adjust paths if they don't start with /content
        const adjusted = data.map((t) => ({
          ...t,
          audio: t.audio.startsWith("/Media") ? `/content${t.audio}` : t.audio,
          cover: t.cover.startsWith("/Media") ? `/content${t.cover}` : t.cover,
        }))
        setTracks(adjusted)
      })
      .catch((err) => console.error("Failed to load music.json:", err))
  }, [])

  // Setup Web Audio API for visualiser
  useEffect(() => {
    if (!audioRef.current) return

    const initAudioContext = () => {
      if (audioContextRef.current) return

      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioContextClass()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      
      const source = ctx.createMediaElementSource(audioRef.current!)
      source.connect(analyser)
      analyser.connect(ctx.destination)

      audioContextRef.current = ctx
      analyserRef.current = analyser
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

  const playTrack = (index: number) => {
    if (index === currentTrackIndex) {
      togglePlay()
    } else {
      setCurrentTrackIndex(index)
      setIsPlaying(true)
    }
  }

  const togglePlay = () => {
    setIsPlaying(!isPlaying)
  }

  const nextTrack = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % tracks.length)
    setIsPlaying(true)
  }

  const prevTrack = () => {
    setCurrentTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length)
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
    }
  }

  const handleEnded = () => {
    nextTrack()
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
        analyser: analyserRef.current,
      }}
    >
      {children}
      <audio
        ref={audioRef}
        src={currentTrack?.audio}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onLoadedMetadata={handleTimeUpdate}
      />
    </MusicContext.Provider>
  )
}
