import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { Track } from "@/types/content"
import { musicAssetUrl } from "@/lib/musicAsset"
import {
  DEFAULT_MUSIC_EFFECTS,
  EQ_BANDS,
  equalPowerCurves,
  normalizeMusicEffects,
  type EqGains,
  type MusicEffectsSettings,
} from "./musicEffects"
import { migrateQueue } from "./musicQueue"

type RepeatMode = "off" | "track" | "all"
type DeckIndex = 0 | 1

interface MusicContextType {
  tracks: Track[]
  currentTrackIndex: number
  isPlaying: boolean
  volume: number
  progress: number
  duration: number
  currentTime: number
  playTrack: (target: number | string, queuePosition?: number) => void
  togglePlay: () => void
  stop: () => void
  nextTrack: () => void
  prevTrack: () => void
  setVolume: (volume: number) => void
  seek: (time: number) => void
  currentTrack: Track | null
  analyser: AnalyserNode | null
  /** Live active deck for direct, render-lag-free scrubbing (scratch). */
  audioRef: React.RefObject<HTMLAudioElement | null>
  /** Entry to the shared effects chain so scratch audio receives the same EQ. */
  effectsInput: AudioNode | null
  repeatMode: RepeatMode
  setRepeatMode: (mode: RepeatMode) => void
  queue: string[]
  setQueue: (list: string[]) => void
  queueIndex: number
  setQueueIndex: (index: number) => void
  eqEnabled: boolean
  setEqEnabled: (enabled: boolean) => void
  eqGains: EqGains
  setEqGain: (index: number, gain: number) => void
  setEqGains: (gains: EqGains) => void
  highpassHz: number
  setHighpassHz: (frequency: number) => void
  lowpassHz: number
  setLowpassHz: (frequency: number) => void
  resetEqualizer: () => void
  crossfadeSeconds: number
  setCrossfadeSeconds: (seconds: number) => void
  isCrossfading: boolean
}

const MusicContext = createContext<MusicContextType | undefined>(undefined)
const { fadeIn: FADE_IN_CURVE, fadeOut: FADE_OUT_CURVE } = equalPowerCurves(96)

export function useMusic() {
  const context = useContext(MusicContext)
  if (!context) throw new Error("useMusic must be used within a MusicProvider")
  return context
}

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tracks, setTracks] = useState<Track[]>([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolumeState] = useState(0.5)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("all")
  const [queue, setQueue] = useState<string[]>([])
  const [queueIndex, setQueueIndex] = useState(-1)
  const [effects, setEffects] = useState<MusicEffectsSettings>(DEFAULT_MUSIC_EFFECTS)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [effectsInput, setEffectsInput] = useState<AudioNode | null>(null)
  const [isCrossfading, setIsCrossfading] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const deckRefs = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([null, null])
  const activeDeckRef = useRef<DeckIndex>(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const deckGainRefs = useRef<[GainNode | null, GainNode | null]>([null, null])
  const masterGainRef = useRef<GainNode | null>(null)
  const dryGainRef = useRef<GainNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)
  const highpassRef = useRef<BiquadFilterNode | null>(null)
  const lowpassRef = useRef<BiquadFilterNode | null>(null)
  const eqFilterRefs = useRef<BiquadFilterNode[]>([])
  const resumeTimeRef = useRef(0)
  const lastSaveRef = useRef(0)
  const transitionRef = useRef(0)
  const transitionTimerRef = useRef<number | null>(null)
  const autoCrossfadeArmedRef = useRef(false)

  const tracksRef = useRef(tracks)
  const currentTrackIndexRef = useRef(currentTrackIndex)
  const isPlayingRef = useRef(isPlaying)
  const volumeRef = useRef(volume)
  const repeatModeRef = useRef(repeatMode)
  const queueRef = useRef(queue)
  const queueIndexRef = useRef(queueIndex)
  const effectsRef = useRef(effects)
  tracksRef.current = tracks
  currentTrackIndexRef.current = currentTrackIndex
  isPlayingRef.current = isPlaying
  volumeRef.current = volume
  repeatModeRef.current = repeatMode
  queueRef.current = queue
  queueIndexRef.current = queueIndex
  effectsRef.current = effects

  const attachDeck = useCallback((deck: DeckIndex, node: HTMLAudioElement | null) => {
    deckRefs.current[deck] = node
    if (deck === activeDeckRef.current) audioRef.current = node
  }, [])
  const attachDeckA = useCallback((node: HTMLAudioElement | null) => attachDeck(0, node), [attachDeck])
  const attachDeckB = useCallback((node: HTMLAudioElement | null) => attachDeck(1, node), [attachDeck])

  const applyEffectsToGraph = useCallback((settings: MusicEffectsSettings) => {
    const context = audioContextRef.current
    if (!context) return
    const now = context.currentTime
    const nyquist = context.sampleRate / 2
    const ramp = (node: GainNode | null, target: number) => {
      if (!node) return
      node.gain.cancelScheduledValues(now)
      node.gain.setValueAtTime(node.gain.value, now)
      node.gain.linearRampToValueAtTime(target, now + 0.01)
    }
    ramp(dryGainRef.current, settings.eqEnabled ? 0 : 1)
    ramp(wetGainRef.current, settings.eqEnabled ? 1 : 0)
    const highpass = highpassRef.current
    const lowpass = lowpassRef.current
    if (highpass) {
      highpass.frequency.setTargetAtTime(settings.highpassHz, now, 0.02)
    }
    if (lowpass) {
      const openFrequency = Math.min(20_000, Math.max(20, nyquist - 1))
      lowpass.frequency.setTargetAtTime(Math.min(settings.lowpassHz, openFrequency), now, 0.02)
    }
    eqFilterRefs.current.forEach((filter, index) => {
      filter.gain.setTargetAtTime(settings.eqGains[index], now, 0.02)
    })
  }, [])

  const initializeAudioGraph = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current
    const [deckA, deckB] = deckRefs.current
    if (!deckA || !deckB) return null
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null

    const context = new AudioContextClass()
    const analyserNode = context.createAnalyser()
    analyserNode.fftSize = 1024
    analyserNode.smoothingTimeConstant = 0.8

    const deckGainA = context.createGain()
    const deckGainB = context.createGain()
    deckGainA.gain.value = activeDeckRef.current === 0 ? 1 : 0
    deckGainB.gain.value = activeDeckRef.current === 1 ? 1 : 0
    const mixBus = context.createGain()
    const dryGain = context.createGain()
    const wetGain = context.createGain()
    dryGain.gain.value = effectsRef.current.eqEnabled ? 0 : 1
    wetGain.gain.value = effectsRef.current.eqEnabled ? 1 : 0
    const highpass = context.createBiquadFilter()
    highpass.type = "highpass"
    highpass.Q.value = 0.7
    const eqFilters = EQ_BANDS.map(({ frequency }) => {
      const filter = context.createBiquadFilter()
      filter.type = "peaking"
      filter.frequency.value = frequency
      filter.Q.value = 1
      return filter
    })
    const lowpass = context.createBiquadFilter()
    lowpass.type = "lowpass"
    lowpass.Q.value = 0.7
    const masterGain = context.createGain()
    masterGain.gain.value = volumeRef.current

    const sourceA = context.createMediaElementSource(deckA)
    const sourceB = context.createMediaElementSource(deckB)
    sourceA.connect(deckGainA).connect(mixBus)
    sourceB.connect(deckGainB).connect(mixBus)
    mixBus.connect(dryGain).connect(analyserNode)
    mixBus.connect(highpass)
    let tail: AudioNode = highpass
    for (const filter of eqFilters) tail = tail.connect(filter)
    tail.connect(lowpass).connect(wetGain).connect(analyserNode)
    analyserNode.connect(masterGain).connect(context.destination)

    deckA.volume = 1
    deckB.volume = 1
    audioContextRef.current = context
    deckGainRefs.current = [deckGainA, deckGainB]
    masterGainRef.current = masterGain
    dryGainRef.current = dryGain
    wetGainRef.current = wetGain
    highpassRef.current = highpass
    lowpassRef.current = lowpass
    eqFilterRefs.current = eqFilters
    setAnalyser(analyserNode)
    setEffectsInput(mixBus)
    applyEffectsToGraph(effectsRef.current)

    ;(window as typeof window & { __musicAnalyser?: AnalyserNode }).__musicAnalyser = analyserNode
    ;(window as typeof window & { __musicIsPlaying?: () => boolean }).__musicIsPlaying =
      () => !audioRef.current?.paused
    return context
  }, [applyEffectsToGraph])

  const cancelCrossfade = useCallback((pauseInactive = true) => {
    transitionRef.current++
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
    const context = audioContextRef.current
    if (context) {
      deckGainRefs.current.forEach((gain, index) => {
        if (!gain) return
        gain.gain.cancelScheduledValues(context.currentTime)
        gain.gain.setValueAtTime(index === activeDeckRef.current ? 1 : 0, context.currentTime)
      })
    }
    if (pauseInactive) {
      const inactive = activeDeckRef.current === 0 ? 1 : 0
      deckRefs.current[inactive]?.pause()
    }
    setIsCrossfading(false)
  }, [])

  const adjacentTarget = useCallback((direction: 1 | -1, allowWrap: boolean) => {
    const availableTracks = tracksRef.current
    if (availableTracks.length === 0) return null
    const activeQueue = queueRef.current
    if (activeQueue.length > 0) {
      const position = queueIndexRef.current
      let nextPosition = position >= 0 ? position + direction : direction > 0 ? 0 : activeQueue.length - 1
      if (nextPosition < 0 || nextPosition >= activeQueue.length) {
        if (!allowWrap) return null
        nextPosition = (nextPosition + activeQueue.length) % activeQueue.length
      }
      const trackIndex = availableTracks.findIndex((track) => track.slug === activeQueue[nextPosition])
      return trackIndex < 0 ? null : { trackIndex, queuePosition: nextPosition }
    }

    let trackIndex = currentTrackIndexRef.current + direction
    if (trackIndex < 0 || trackIndex >= availableTracks.length) {
      if (!allowWrap) return null
      trackIndex = (trackIndex + availableTracks.length) % availableTracks.length
    }
    return { trackIndex, queuePosition: -1 }
  }, [])

  const transitionToTrack = useCallback(async (
    trackIndex: number,
    nextQueueIndex: number,
    allowCrossfade: boolean,
  ) => {
    const nextTrack = tracksRef.current[trackIndex]
    if (!nextTrack) return
    const outgoingDeck = activeDeckRef.current
    const incomingDeck: DeckIndex = outgoingDeck === 0 ? 1 : 0
    const outgoing = deckRefs.current[outgoingDeck]
    const incoming = deckRefs.current[incomingDeck]
    if (!outgoing || !incoming) return

    // A rapid manual skip during an existing overlap first promotes the active
    // deck to unity and retires its partner, avoiding stacked automation and
    // the audible gain jump that three logical transitions on two decks cause.
    cancelCrossfade()
    const context = initializeAudioGraph()
    if (context?.state === "suspended") void context.resume()
    const fadeSeconds = allowCrossfade ? effectsRef.current.crossfadeSeconds : 0
    const canCrossfade = Boolean(
      context &&
      fadeSeconds > 0 &&
      isPlayingRef.current &&
      !outgoing.paused &&
      deckGainRefs.current[outgoingDeck] &&
      deckGainRefs.current[incomingDeck],
    )
    const transition = ++transitionRef.current
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current)

    incoming.pause()
    const nextUrl = new URL(nextTrack.audio, window.location.href).href
    if (incoming.currentSrc !== nextUrl && incoming.src !== nextUrl) {
      incoming.src = nextTrack.audio
      incoming.load()
    }
    try { incoming.currentTime = 0 } catch { /* metadata has not loaded yet */ }
    incoming.volume = context ? 1 : volumeRef.current

    const incomingGain = deckGainRefs.current[incomingDeck]
    const outgoingGain = deckGainRefs.current[outgoingDeck]
    if (context && incomingGain && outgoingGain) {
      incomingGain.gain.cancelScheduledValues(context.currentTime)
      outgoingGain.gain.cancelScheduledValues(context.currentTime)
      // Keep the candidate silent until play() succeeds. That lets a broken
      // source fail without replacing the current track/session underneath it.
      incomingGain.gain.setValueAtTime(0, context.currentTime)
      outgoingGain.gain.setValueAtTime(1, context.currentTime)
    }
    if (!canCrossfade) outgoing.pause()

    try {
      await incoming.play()
    } catch (error) {
      if (transition !== transitionRef.current) return
      console.warn("Autoplay blocked or track failed:", error)
      incoming.pause()
      cancelCrossfade()
      if (isPlayingRef.current && !outgoing.ended) {
        void outgoing.play().catch(() => setIsPlaying(false))
      } else {
        setIsPlaying(false)
      }
      return
    }
    if (transition !== transitionRef.current) return

    activeDeckRef.current = incomingDeck
    audioRef.current = incoming
    currentTrackIndexRef.current = trackIndex
    queueIndexRef.current = nextQueueIndex
    setCurrentTrackIndex(trackIndex)
    setQueueIndex(nextQueueIndex)
    setCurrentTime(0)
    setProgress(0)
    setDuration(nextTrack.duration ?? 0)
    autoCrossfadeArmedRef.current = false
    setIsPlaying(true)
    setIsCrossfading(canCrossfade)

    if (canCrossfade && context && incomingGain && outgoingGain) {
      const start = context.currentTime
      incomingGain.gain.setValueCurveAtTime(FADE_IN_CURVE, start, fadeSeconds)
      outgoingGain.gain.setValueCurveAtTime(FADE_OUT_CURVE, start, fadeSeconds)
      transitionTimerRef.current = window.setTimeout(() => {
        if (transition !== transitionRef.current) return
        outgoing.pause()
        try { outgoing.currentTime = 0 } catch { /* no metadata */ }
        outgoingGain.gain.cancelScheduledValues(context.currentTime)
        outgoingGain.gain.setValueAtTime(0, context.currentTime)
        incomingGain.gain.cancelScheduledValues(context.currentTime)
        incomingGain.gain.setValueAtTime(1, context.currentTime)
        transitionTimerRef.current = null
        setIsCrossfading(false)
      }, fadeSeconds * 1_000 + 40)
    } else {
      outgoing.pause()
      try { outgoing.currentTime = 0 } catch { /* no metadata */ }
      if (context && incomingGain && outgoingGain) {
        incomingGain.gain.setValueAtTime(1, context.currentTime)
        outgoingGain.gain.setValueAtTime(0, context.currentTime)
      }
      setIsCrossfading(false)
    }
  }, [cancelCrossfade, initializeAudioGraph])

  const nextTrack = useCallback(() => {
    const target = adjacentTarget(1, true)
    if (target) void transitionToTrack(target.trackIndex, target.queuePosition, true)
  }, [adjacentTarget, transitionToTrack])

  const prevTrack = useCallback(() => {
    const target = adjacentTarget(-1, true)
    if (target) void transitionToTrack(target.trackIndex, target.queuePosition, true)
  }, [adjacentTarget, transitionToTrack])

  const togglePlay = useCallback(() => {
    const context = initializeAudioGraph()
    if (context?.state === "suspended") void context.resume()
    setIsPlaying((playing) => !playing)
  }, [initializeAudioGraph])

  const stop = useCallback(() => {
    cancelCrossfade(false)
    deckRefs.current.forEach((audio) => {
      audio?.pause()
      if (audio) {
        try { audio.currentTime = 0 } catch { /* no metadata */ }
      }
    })
    setIsPlaying(false)
    setCurrentTime(0)
    setProgress(0)
  }, [cancelCrossfade])

  const playTrack = useCallback((target: number | string, nextQueueIndex = -1) => {
    const index = typeof target === "number"
      ? target
      : tracksRef.current.findIndex((track) => track.slug === target)
    if (index < 0 || index >= tracksRef.current.length) return
    if (index === currentTrackIndexRef.current) {
      queueIndexRef.current = nextQueueIndex
      setQueueIndex(nextQueueIndex)
      togglePlay()
      return
    }
    void transitionToTrack(index, nextQueueIndex, true)
  }, [togglePlay, transitionToTrack])

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume))
    volumeRef.current = clamped
    setVolumeState(clamped)
    localStorage.setItem("music-volume", clamped.toString())
  }, [])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(time, audio.duration || time))
    setCurrentTime(audio.currentTime)
  }, [])

  const setEqEnabled = useCallback((eqEnabled: boolean) => {
    setEffects((current) => ({ ...current, eqEnabled }))
  }, [])
  const setEqGain = useCallback((index: number, gain: number) => {
    if (index < 0 || index >= EQ_BANDS.length) return
    setEffects((current) => {
      const eqGains = [...current.eqGains] as EqGains
      eqGains[index] = Math.max(-12, Math.min(12, gain))
      return { ...current, eqGains }
    })
  }, [])
  const setEqGains = useCallback((eqGains: EqGains) => {
    setEffects((current) => normalizeMusicEffects({ ...current, eqGains }))
  }, [])
  const setHighpassHz = useCallback((highpassHz: number) => {
    setEffects((current) => normalizeMusicEffects({ ...current, highpassHz }))
  }, [])
  const setLowpassHz = useCallback((lowpassHz: number) => {
    setEffects((current) => normalizeMusicEffects({ ...current, lowpassHz }))
  }, [])
  const resetEqualizer = useCallback(() => {
    setEffects((current) => ({
      ...current,
      eqGains: [...DEFAULT_MUSIC_EFFECTS.eqGains] as EqGains,
      highpassHz: DEFAULT_MUSIC_EFFECTS.highpassHz,
      lowpassHz: DEFAULT_MUSIC_EFFECTS.lowpassHz,
    }))
  }, [])
  const setCrossfadeSeconds = useCallback((crossfadeSeconds: number) => {
    setEffects((current) => normalizeMusicEffects({ ...current, crossfadeSeconds }))
  }, [])

  useEffect(() => {
    fetch("/music.json")
      .then((response) => response.json())
      .then((data: Track[]) => {
        const fix = (path: string) => path && path.startsWith("/Media") ? `/content${path}` : path
        const adjusted = data.map((track) => ({
          ...track,
          audio: musicAssetUrl(fix(track.audio)),
          cover: musicAssetUrl(fix(track.cover)),
        }))
        let restoredTrackIndex = 0
        try {
          const raw = localStorage.getItem("music-session")
          if (raw) {
            const session = JSON.parse(raw) as {
              trackIndex?: number
              trackSlug?: string
              time?: number
              repeatMode?: RepeatMode
              queue?: string[]
              queueIndex?: number
              playlist?: Array<number | string>
              playlistIndex?: number
              effects?: unknown
            }
            const slugIndex = typeof session.trackSlug === "string"
              ? adjusted.findIndex((track) => track.slug === session.trackSlug)
              : -1
            const index = slugIndex >= 0 ? slugIndex : session.trackIndex
            if (typeof index === "number" && index >= 0 && index < adjusted.length) restoredTrackIndex = index
            resumeTimeRef.current = session.time && session.time > 0 ? session.time : 0
            if (session.repeatMode) setRepeatMode(session.repeatMode)
            const restoredQueue = migrateQueue(session.queue ?? session.playlist, adjusted)
            setQueue(restoredQueue)
            queueRef.current = restoredQueue
            const restoredPosition = session.queueIndex ?? session.playlistIndex
            const safePosition = typeof restoredPosition === "number"
              && restoredPosition >= 0
              && restoredPosition < restoredQueue.length
              ? restoredPosition
              : -1
            setQueueIndex(safePosition)
            queueIndexRef.current = safePosition
            const restoredEffects = normalizeMusicEffects(session.effects)
            setEffects(restoredEffects)
            effectsRef.current = restoredEffects
          }
        } catch (error) {
          console.warn("Failed to restore music session:", error)
        }

        setTracks(adjusted)
        tracksRef.current = adjusted
        setCurrentTrackIndex(restoredTrackIndex)
        currentTrackIndexRef.current = restoredTrackIndex
        const audio = deckRefs.current[0]
        if (audio && adjusted[restoredTrackIndex]) {
          audio.src = adjusted[restoredTrackIndex].audio
          audio.volume = volumeRef.current
          audio.load()
        }
      })
      .catch((error) => console.error("Failed to load music.json:", error))

    const savedVolume = localStorage.getItem("music-volume")
    if (savedVolume !== null) {
      const parsed = Number.parseFloat(savedVolume)
      if (Number.isFinite(parsed)) {
        const clamped = Math.max(0, Math.min(1, parsed))
        volumeRef.current = clamped
        setVolumeState(clamped)
      }
    }
  }, [])

  useEffect(() => {
    const handleInteraction = () => {
      const context = initializeAudioGraph()
      if (context?.state === "suspended") void context.resume()
    }
    window.addEventListener("pointerdown", handleInteraction, { passive: true })
    window.addEventListener("keydown", handleInteraction)
    return () => {
      window.removeEventListener("pointerdown", handleInteraction)
      window.removeEventListener("keydown", handleInteraction)
    }
  }, [initializeAudioGraph])

  useEffect(() => {
    const context = audioContextRef.current
    const master = masterGainRef.current
    if (context && master) {
      master.gain.setTargetAtTime(volume, context.currentTime, 0.02)
      deckRefs.current.forEach((audio) => { if (audio) audio.volume = 1 })
    } else {
      deckRefs.current.forEach((audio) => { if (audio) audio.volume = volume })
    }
  }, [volume])

  useEffect(() => {
    effectsRef.current = effects
    applyEffectsToGraph(effects)
  }, [applyEffectsToGraph, effects])

  useEffect(() => {
    if (isPlaying) {
      audioRef.current?.play().catch((error) => {
        console.warn("Autoplay blocked or track failed:", error)
        setIsPlaying(false)
      })
    } else {
      deckRefs.current.forEach((audio) => audio?.pause())
      if (isCrossfading) cancelCrossfade()
    }
  }, [cancelCrossfade, isCrossfading, isPlaying])

  const currentTrack = tracks[currentTrackIndex] ?? null

  useEffect(() => {
    if (tracks.length === 0) return
    try {
      localStorage.setItem("music-session", JSON.stringify({
        trackIndex: currentTrackIndex,
        trackSlug: currentTrack?.slug,
        time: resumeTimeRef.current || audioRef.current?.currentTime || 0,
        repeatMode,
        queue,
        queueIndex,
        effects,
      }))
    } catch { /* private mode / quota */ }
  }, [currentTrack?.slug, currentTrackIndex, effects, queue, queueIndex, repeatMode, tracks.length])

  useEffect(() => {
    if (!currentTrack || isCrossfading) return
    const target = adjacentTarget(1, repeatMode === "all")
    const standbyDeck: DeckIndex = activeDeckRef.current === 0 ? 1 : 0
    const standby = deckRefs.current[standbyDeck]
    const standbyTrack = target ? tracks[target.trackIndex] : null
    if (!standby || !standbyTrack || !target) return
    const targetUrl = new URL(standbyTrack.audio, window.location.href).href
    const desiredPreload = effects.crossfadeSeconds > 0 ? "auto" : "metadata"
    const preloadChanged = standby.preload !== desiredPreload
    standby.preload = desiredPreload
    if (standby.currentSrc === targetUrl || standby.src === targetUrl) {
      if (preloadChanged) standby.load()
      return
    }
    standby.pause()
    standby.src = standbyTrack.audio
    standby.load()
  }, [adjacentTarget, currentTrack, currentTrackIndex, effects.crossfadeSeconds, isCrossfading, queue, queueIndex, repeatMode, tracks])

  useEffect(() => {
    const mediaSession = navigator.mediaSession
    if (!mediaSession || !currentTrack) return
    try {
      mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || "Unknown",
        artist: currentTrack.artist || "",
        album: "subsurfaces.net",
        artwork: currentTrack.cover ? [{ src: currentTrack.cover, sizes: "512x512", type: "image/jpeg" }] : [],
      })
    } catch { /* MediaMetadata unsupported */ }
  }, [currentTrack])

  useEffect(() => {
    if (navigator.mediaSession) navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused"
  }, [isPlaying])

  useEffect(() => {
    const mediaSession = navigator.mediaSession
    if (!mediaSession) return
    const set = (action: MediaSessionAction, handler: (() => void) | null) => {
      try { mediaSession.setActionHandler(action, handler) } catch { /* unsupported action */ }
    }
    set("play", () => setIsPlaying(true))
    set("pause", () => setIsPlaying(false))
    set("previoustrack", prevTrack)
    set("nexttrack", nextTrack)
    try {
      mediaSession.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime === "number") seek(details.seekTime)
      })
    } catch { /* unsupported */ }
    return () => {
      for (const action of ["play", "pause", "previoustrack", "nexttrack", "seekto"] as const) set(action, null)
    }
  }, [nextTrack, prevTrack, seek])

  useEffect(() => () => {
    transitionRef.current++
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current)
    void audioContextRef.current?.close()
    delete (window as typeof window & { __musicAnalyser?: AnalyserNode }).__musicAnalyser
    delete (window as typeof window & { __musicIsPlaying?: () => boolean }).__musicIsPlaying
  }, [])

  const saveSession = (time: number) => {
    try {
      localStorage.setItem("music-session", JSON.stringify({
        trackIndex: currentTrackIndexRef.current,
        trackSlug: tracksRef.current[currentTrackIndexRef.current]?.slug,
        time,
        repeatMode: repeatModeRef.current,
        queue: queueRef.current,
        queueIndex: queueIndexRef.current,
        effects: effectsRef.current,
      }))
    } catch { /* private mode / quota */ }
  }

  const handleTimeUpdate = (deck: DeckIndex) => {
    if (deck !== activeDeckRef.current) return
    const audio = deckRefs.current[deck]
    if (!audio) return
    const nextTime = audio.currentTime
    const nextDuration = audio.duration || tracksRef.current[currentTrackIndexRef.current]?.duration || 0
    setCurrentTime(nextTime)
    setDuration(nextDuration)
    setProgress(nextDuration ? nextTime / nextDuration : 0)
    const now = performance.now()
    if (now - lastSaveRef.current > 5_000) {
      lastSaveRef.current = now
      saveSession(nextTime)
    }

    const crossfadeSeconds = effectsRef.current.crossfadeSeconds
    const remaining = nextDuration - nextTime
    if (
      isPlayingRef.current &&
      crossfadeSeconds > 0 &&
      remaining > 0 &&
      remaining <= crossfadeSeconds &&
      repeatModeRef.current !== "track" &&
      !autoCrossfadeArmedRef.current
    ) {
      const target = adjacentTarget(1, repeatModeRef.current === "all")
      if (target) {
        autoCrossfadeArmedRef.current = true
        void transitionToTrack(target.trackIndex, target.queuePosition, true)
      }
    }
  }

  const handleLoadedMetadata = (deck: DeckIndex) => {
    if (deck !== activeDeckRef.current) return
    const audio = deckRefs.current[deck]
    if (!audio) return
    if (resumeTimeRef.current > 0) {
      audio.currentTime = Math.min(resumeTimeRef.current, audio.duration || resumeTimeRef.current)
      resumeTimeRef.current = 0
    }
    handleTimeUpdate(deck)
  }

  const handleEnded = (deck: DeckIndex) => {
    if (deck !== activeDeckRef.current) return
    if (repeatModeRef.current === "track") {
      const audio = deckRefs.current[deck]
      if (audio) {
        audio.currentTime = 0
        void audio.play()
      }
      return
    }
    const target = adjacentTarget(1, repeatModeRef.current === "all")
    if (target) void transitionToTrack(target.trackIndex, target.queuePosition, false)
    else setIsPlaying(false)
  }

  return (
    <MusicContext.Provider value={{
      tracks,
      currentTrackIndex,
      isPlaying,
      volume,
      progress,
      duration,
      currentTime,
      playTrack,
      togglePlay,
      stop,
      nextTrack,
      prevTrack,
      setVolume,
      seek,
      currentTrack,
      analyser,
      audioRef,
      effectsInput,
      repeatMode,
      setRepeatMode,
      queue,
      setQueue,
      queueIndex,
      setQueueIndex,
      eqEnabled: effects.eqEnabled,
      setEqEnabled,
      eqGains: effects.eqGains,
      setEqGain,
      setEqGains,
      highpassHz: effects.highpassHz,
      setHighpassHz,
      lowpassHz: effects.lowpassHz,
      setLowpassHz,
      resetEqualizer,
      crossfadeSeconds: effects.crossfadeSeconds,
      setCrossfadeSeconds,
      isCrossfading,
    }}>
      {children}
      <audio
        ref={attachDeckA}
        crossOrigin="anonymous"
        preload="metadata"
        onTimeUpdate={() => handleTimeUpdate(0)}
        onEnded={() => handleEnded(0)}
        onLoadedMetadata={() => handleLoadedMetadata(0)}
      />
      <audio
        ref={attachDeckB}
        crossOrigin="anonymous"
        preload="metadata"
        onTimeUpdate={() => handleTimeUpdate(1)}
        onEnded={() => handleEnded(1)}
        onLoadedMetadata={() => handleLoadedMetadata(1)}
      />
    </MusicContext.Provider>
  )
}
