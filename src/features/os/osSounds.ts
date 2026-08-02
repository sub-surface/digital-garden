export type OSSound = "startup" | "open" | "close" | "notify"

let context: AudioContext | null = null

/** Tiny synthesized cues: no asset download, no ambient engine, no autoplay loop. */
export function playOSSound(sound: OSSound, volume: number): void {
  if (typeof window === "undefined" || volume <= 0) return
  try {
    context ??= new AudioContext()
    const ctx = context
    void ctx.resume().catch(() => undefined)
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.12), now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (sound === "startup" ? 0.52 : 0.16))
    gain.connect(ctx.destination)

    const notes: Record<OSSound, number[]> = {
      startup: [330, 494, 659],
      open: [440, 554],
      close: [392, 294],
      notify: [660, 660],
    }
    notes[sound].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator()
      oscillator.type = sound === "startup" ? "sine" : "triangle"
      oscillator.frequency.value = frequency
      oscillator.connect(gain)
      const offset = sound === "startup" ? index * 0.08 : index * 0.035
      oscillator.start(now + offset)
      oscillator.stop(now + offset + (sound === "startup" ? 0.34 : 0.11))
    })
  } catch {
    // Web Audio unavailable or blocked: cues are decorative, never fatal.
  }
}
