/**
 * Tiny synthesized sound effects via the Web Audio API.
 *
 * No audio files — every sound is generated from oscillators + an envelope, so
 * it's dependency-free, instant, and matches the site's minimal aesthetic.
 * Respects a global mute flag persisted to localStorage ("sfx-muted").
 *
 * Usage:
 *   import { sfx } from "@/lib/sfx"
 *   sfx.blip()            // a short tick
 *   sfx.play("eat")       // a named preset
 *   sfx.setMuted(true)
 */

type Wave = OscillatorType

interface ToneSpec {
  freq: number
  to?: number // optional pitch glide target
  dur: number // seconds
  type?: Wave
  gain?: number
  delay?: number // seconds before this tone starts
}

const MUTE_KEY = "sfx-muted"

class Sfx {
  private ctx: AudioContext | null = null
  private muted = false

  constructor() {
    if (typeof localStorage !== "undefined") {
      this.muted = localStorage.getItem(MUTE_KEY) === "1"
    }
  }

  isMuted() {
    return this.muted
  }

  setMuted(m: boolean) {
    this.muted = m
    try {
      localStorage.setItem(MUTE_KEY, m ? "1" : "0")
    } catch {
      /* ignore */
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted)
    return this.muted
  }

  private ensure(): AudioContext | null {
    if (this.muted) return null
    if (typeof window === "undefined") return null
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!AC) return null
      this.ctx = new AC() as AudioContext
    }
    const ctx: AudioContext = this.ctx
    if (ctx.state === "suspended") ctx.resume()
    return ctx
  }

  /** Play a single tone (or pitch glide). */
  tone({ freq, to, dur, type = "sine", gain = 0.18, delay = 0 }: ToneSpec) {
    const ctx = this.ensure()
    if (!ctx) return
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur)
    // quick attack, smooth decay
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  /** Play a sequence of tones. */
  seq(specs: ToneSpec[]) {
    let acc = 0
    for (const s of specs) {
      this.tone({ ...s, delay: (s.delay ?? 0) + acc })
      acc += s.dur * 0.7
    }
  }

  blip() {
    this.tone({ freq: 660, dur: 0.06, type: "square", gain: 0.1 })
  }

  /** Named presets used across the arcade. */
  play(name: SfxName) {
    switch (name) {
      // — generic —
      case "click":
        this.tone({ freq: 520, dur: 0.05, type: "square", gain: 0.08 })
        break
      case "move":
        this.tone({ freq: 300, dur: 0.04, type: "triangle", gain: 0.06 })
        break
      // — snake —
      case "eat":
        this.tone({ freq: 440, to: 880, dur: 0.09, type: "square", gain: 0.12 })
        break
      case "bloom":
        this.seq([
          { freq: 660, dur: 0.08, type: "sine", gain: 0.14 },
          { freq: 990, dur: 0.1, type: "sine", gain: 0.14 },
          { freq: 1320, dur: 0.14, type: "sine", gain: 0.12 },
        ])
        break
      case "death":
        this.tone({ freq: 320, to: 70, dur: 0.5, type: "sawtooth", gain: 0.16 })
        break
      // — cards / blackjack —
      case "deal":
        this.tone({ freq: 900, to: 600, dur: 0.07, type: "triangle", gain: 0.1 })
        break
      case "flip":
        this.tone({ freq: 700, to: 1100, dur: 0.06, type: "triangle", gain: 0.11 })
        break
      case "win":
        this.seq([
          { freq: 523, dur: 0.1, type: "sine", gain: 0.14 },
          { freq: 659, dur: 0.1, type: "sine", gain: 0.14 },
          { freq: 784, dur: 0.16, type: "sine", gain: 0.14 },
        ])
        break
      case "lose":
        this.seq([
          { freq: 392, dur: 0.12, type: "sawtooth", gain: 0.12 },
          { freq: 294, dur: 0.2, type: "sawtooth", gain: 0.12 },
        ])
        break
      case "push":
        this.tone({ freq: 440, dur: 0.12, type: "sine", gain: 0.1 })
        break
      case "blackjack":
        this.seq([
          { freq: 659, dur: 0.08, type: "sine", gain: 0.15 },
          { freq: 880, dur: 0.08, type: "sine", gain: 0.15 },
          { freq: 1175, dur: 0.18, type: "sine", gain: 0.15 },
        ])
        break
      // — tetris —
      case "lock":
        this.tone({ freq: 200, dur: 0.05, type: "square", gain: 0.08 })
        break
      case "rotate":
        this.tone({ freq: 480, dur: 0.04, type: "triangle", gain: 0.07 })
        break
      case "clear":
        this.seq([
          { freq: 600, dur: 0.07, type: "square", gain: 0.13 },
          { freq: 900, dur: 0.1, type: "square", gain: 0.13 },
        ])
        break
      case "tetris":
        this.seq([
          { freq: 600, dur: 0.07, type: "square", gain: 0.14 },
          { freq: 800, dur: 0.07, type: "square", gain: 0.14 },
          { freq: 1000, dur: 0.07, type: "square", gain: 0.14 },
          { freq: 1300, dur: 0.16, type: "square", gain: 0.14 },
        ])
        break
      // — 2048 —
      case "merge":
        this.tone({ freq: 440, to: 660, dur: 0.08, type: "sine", gain: 0.1 })
        break
    }
  }
}

export type SfxName =
  | "click" | "move"
  | "eat" | "bloom" | "death"
  | "deal" | "flip" | "win" | "lose" | "push" | "blackjack"
  | "lock" | "rotate" | "clear" | "tetris"
  | "merge"

export const sfx = new Sfx()
