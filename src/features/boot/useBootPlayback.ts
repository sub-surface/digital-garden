/**
 * useBootPlayback.ts — Playback engine hook
 * Manages line reveal timing, reveal modes, and pause state
 */

import { useEffect, useRef, useState, useCallback } from "react"
import { BootEvent, BootRenderedLine } from "./bootTypes"
import { BootGenerator } from "./bootGenerators"

export interface UseBootPlaybackResult {
  lines: BootRenderedLine[]
  activeText: string
  isPaused: boolean
  setPaused: (paused: boolean) => void
  epoch: number
  emittedCount: number
}

/**
 * Constants for playback timing
 */
const REVEAL_TIMING = {
  typeWpm: 1200, // Words per minute → chars per second (doubled for faster play)
  burstDelay: 20, // 20ms for burst mode
  lineSpacing: 40, // 40ms between lines
  maxDomNodes: typeof window !== "undefined" && window.innerWidth <= 800 ? 110 : 180,
}

// Compute derived timing after object creation
REVEAL_TIMING.typeCharDelay = (60 / REVEAL_TIMING.typeWpm) * 1000 // ~50ms per char

export function useBootPlayback(seed: number): UseBootPlaybackResult {
  const [lines, setLines] = useState<BootRenderedLine[]>([])
  const [activeText, setActiveText] = useState("")
  const [epoch, setEpoch] = useState(0)
  const [emittedCount, setEmittedCount] = useState(0)

  const pausedRef = useRef(false)
  const generatorRef = useRef<BootEvent[]>([])
  const currentEventIndexRef = useRef(0)
  const currentCharIndexRef = useRef(0)
  const timeoutRef = useRef<NodeJS.Timeout>()
  const startTimeRef = useRef(Date.now())

  const handlePause = useCallback((paused: boolean) => {
    pausedRef.current = paused
  }, [])

  // Generate content on mount
  useEffect(() => {
    const generator = new BootGenerator(seed)
    generatorRef.current = generator.generate(150) // Pre-generate events
    setEpoch(0)
  }, [seed])

  // Main playback loop
  useEffect(() => {
    const processFrame = () => {
      if (pausedRef.current) {
        timeoutRef.current = setTimeout(processFrame, 50)
        return
      }

      const events = generatorRef.current
      let eventIdx = currentEventIndexRef.current
      let charIdx = currentCharIndexRef.current

      if (eventIdx >= events.length) {
        // Loop: reset and continue
        eventIdx = 0
        charIdx = 0
        currentEventIndexRef.current = 0
        currentCharIndexRef.current = 0
        setEpoch((e) => e + 1)
      }

      const event = events[eventIdx]
      if (!event) return

      // Determine reveal timing based on mode
      let nextDelay = REVEAL_TIMING.lineSpacing
      let lineComplete = false

      if (event.reveal === "instant") {
        // Instant: commit entire line immediately
        setLines((prev) => {
          const newLines = [
            ...prev,
            { id: event.id, text: event.text, tone: event.tone, kind: event.kind },
          ]
          // Prune old lines to keep DOM bounded
          if (newLines.length > REVEAL_TIMING.maxDomNodes) {
            return newLines.slice(-REVEAL_TIMING.maxDomNodes)
          }
          return newLines
        })
        setEmittedCount((c) => c + 1)
        setActiveText("")
        lineComplete = true
        nextDelay = REVEAL_TIMING.lineSpacing
      } else if (event.reveal === "type") {
        // Type: reveal char by char
        if (charIdx < event.text.length) {
          const partial = event.text.slice(0, charIdx + 1)
          setActiveText(partial)
          charIdx++
          nextDelay = REVEAL_TIMING.typeCharDelay
        } else {
          // Finish typing
          setLines((prev) => {
            const newLines = [
              ...prev,
              { id: event.id, text: event.text, tone: event.tone, kind: event.kind },
            ]
            if (newLines.length > REVEAL_TIMING.maxDomNodes) {
              return newLines.slice(-REVEAL_TIMING.maxDomNodes)
            }
            return newLines
          })
          setEmittedCount((c) => c + 1)
          setActiveText("")
          lineComplete = true
          nextDelay = REVEAL_TIMING.lineSpacing
        }
      } else if (event.reveal === "burst") {
        // Burst: reveal in chunks
        const chunkSize = Math.max(1, Math.floor(event.text.length / 4))
        if (charIdx < event.text.length) {
          const end = Math.min(charIdx + chunkSize, event.text.length)
          const partial = event.text.slice(0, end)
          setActiveText(partial)
          charIdx = end
          nextDelay = REVEAL_TIMING.burstDelay
        } else {
          setLines((prev) => {
            const newLines = [
              ...prev,
              { id: event.id, text: event.text, tone: event.tone, kind: event.kind },
            ]
            if (newLines.length > REVEAL_TIMING.maxDomNodes) {
              return newLines.slice(-REVEAL_TIMING.maxDomNodes)
            }
            return newLines
          })
          setEmittedCount((c) => c + 1)
          setActiveText("")
          lineComplete = true
          nextDelay = REVEAL_TIMING.lineSpacing
        }
      } else if (event.reveal === "overwrite") {
        // Overwrite: replace previous line
        if (charIdx < event.text.length) {
          const partial = event.text.slice(0, charIdx + 1)
          setActiveText(partial)
          charIdx++
          nextDelay = REVEAL_TIMING.typeCharDelay
        } else {
          setLines((prev) => {
            if (prev.length === 0) return prev
            const newLines = [...prev]
            newLines[newLines.length - 1] = {
              ...newLines[newLines.length - 1],
              text: event.text,
              tone: event.tone,
            }
            return newLines
          })
          setActiveText("")
          lineComplete = true
          nextDelay = REVEAL_TIMING.lineSpacing
        }
      }

      // Advance to next event if line complete
      if (lineComplete) {
        currentEventIndexRef.current++
        currentCharIndexRef.current = 0
      } else {
        currentCharIndexRef.current = charIdx
      }

      timeoutRef.current = setTimeout(processFrame, nextDelay)
    }

    timeoutRef.current = setTimeout(processFrame, 100)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return {
    lines,
    activeText,
    isPaused: pausedRef.current,
    setPaused: handlePause,
    epoch,
    emittedCount,
  }
}
