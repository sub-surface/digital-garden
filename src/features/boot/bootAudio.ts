/**
 * AmbientEngine — a small, low-CPU atmospheric pad for the /boot console.
 *
 * Design goals (in priority order):
 *   1. Safe: every frequency is clamped to a musical band and the master gain
 *      is hard-capped, so nothing can ever ramp into a shriek or a thud.
 *   2. Cheap: a fixed, small node graph built once. 5 pad voices (one detuned
 *      oscillator pair each) share a single slow filter LFO instead of one LFO
 *      per voice. No per-frame JS — all movement is scheduled on the audio
 *      thread. Chord changes glide via `setTargetAtTime` (one cheap call).
 *   3. Washy + lofi: a gentle lowpass + a synthetic convolution reverb on a
 *      send, plus a touch of dark noise bed. Deliberately soft and blurred.
 *
 * Public surface consumed by BootPage: start/stop/destroy, chime(tone),
 * chordName, onStateChange, onMessage. The rest is internal.
 */

export type AudioState = "unbuilt" | "suspended" | "running" | "closed" | "failed"

export type ChordName =
  | "dm11" | "dm9" | "am9" | "am11" | "cm9" | "cm11" | "em11"
  | "gm9" | "gm11" | "fmaj9" | "bbmaj9sharp11" | "ebmaj9"
  | "g13sus" | "suspended" | "moon"

export type ProgressionName = "underice" | "orbit" | "rain" | "lantern" | "bluehour" | "suspended"

interface Voice {
  oscA: OscillatorNode
  oscB: OscillatorNode
  gain: GainNode
  note: number
}

// --- Safe musical bounds. Nothing the engine schedules may exit these. ---
const MIN_FREQ = 55      // A1 — below this pads get muddy / inaudible
const MAX_FREQ = 1320    // ~E6 — above this they get piercing
const MAX_LEVEL = 0.22   // hard ceiling on master gain
const MIN_LEVEL = 0.03
const VOICE_COUNT = 5
const GLIDE_TAU = 1.4    // setTargetAtTime time-constant for chord glides (s)

function clampFreq(freq: number): number {
  if (!Number.isFinite(freq)) return MIN_FREQ
  return Math.min(MAX_FREQ, Math.max(MIN_FREQ, freq))
}

export class AmbientEngine {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  output: GainNode | null = null
  filter: BiquadFilterNode | null = null
  reverbSend: GainNode | null = null
  voices: Voice[] = []
  enabled = false
  chimeCooldown = 0
  level = 0.16
  chordName: ChordName = "dm11"
  progressionName: ProgressionName = "underice"
  progressionStep = 0
  evolutionTimer: ReturnType<typeof setTimeout> | null = null
  lastError = "none"
  tempo = 50
  harmonyAuto = true

  onStateChange?: (state: AudioState, error?: string) => void
  onMessage?: (message: string, tone: string) => void

  get AudioCtx(): typeof AudioContext {
    return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  }

  async ensureRunning(): Promise<AudioContext> {
    if (!this.AudioCtx) throw new Error("Web Audio API unavailable in this browser")
    if (!this.ctx) this.build()
    if (this.ctx && this.ctx.state !== "running") await this.ctx.resume()
    await new Promise((resolve) => setTimeout(resolve, 24))
    this.notifyState()
    if (this.ctx?.state !== "running") {
      throw new Error(`audio context is ${this.ctx?.state}; click the command line and try again`)
    }
    return this.ctx
  }

  notifyState(): void {
    this.onStateChange?.((this.ctx?.state as AudioState) || "unbuilt", this.lastError)
  }

  async start(announce = true): Promise<boolean> {
    try {
      await this.ensureRunning()
      if (!this.ctx || !this.master) return false
      const now = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now)
      this.master.gain.linearRampToValueAtTime(this.level, now + 2.2)
      this.enabled = true
      this.scheduleEvolution()
      this.notifyState()
      if (announce && this.onMessage) {
        this.onMessage(`pad field rising · ${this.chordName} · ${(this.level * 100).toFixed(0)}%`, "normal")
      }
      return true
    } catch (error: unknown) {
      this.lastError = error instanceof Error ? error.message : String(error)
      this.notifyState()
      this.onMessage?.(`audio: ${this.lastError}`, "error")
      return false
    }
  }

  async stop(): Promise<void> {
    if (!this.ctx || !this.master) return
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now)
    this.master.gain.linearRampToValueAtTime(0.0001, now + 1.6)
    this.enabled = false
    this.clearEvolution()
    this.notifyState()
    this.onMessage?.("pad field receding", "normal")
  }

  setLevel(targetLevel: number) {
    this.level = Math.max(0.0001, Math.min(MAX_LEVEL, targetLevel))
    if (!this.enabled || !this.ctx || !this.master) return
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now)
    this.master.gain.linearRampToValueAtTime(this.level, now + 0.5)
  }

  destroy(): void {
    this.clearEvolution()
    this.enabled = false
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
    }
    this.voices = []
    this.notifyState()
  }

  build(): void {
    try {
      this.ctx = new this.AudioCtx({ latencyHint: "playback" })
    } catch {
      this.ctx = new this.AudioCtx()
    }
    const ctx = this.ctx
    const now = ctx.currentTime

    // --- Master chain: voices → filter → (dry + reverb send) → master → limiter → out
    this.master = ctx.createGain()
    this.master.gain.value = 0.0001

    this.output = ctx.createGain()
    this.output.gain.value = 0.85

    // A limiter guards the hard ceiling even if scheduling ever overshoots.
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.knee.value = 6
    limiter.ratio.value = 12
    limiter.attack.value = 0.006
    limiter.release.value = 0.3

    this.filter = ctx.createBiquadFilter()
    this.filter.type = "lowpass"
    this.filter.frequency.value = 1600
    this.filter.Q.value = 0.5

    // Washy reverb on a send (cheaper than wetting every voice). One convolver,
    // a short-ish impulse — enough blur to feel like a room, not a cathedral.
    const dry = ctx.createGain(); dry.gain.value = 0.7
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.55
    const reverb = ctx.createConvolver(); reverb.buffer = this.makeImpulse(3.2, 2.8)
    const wet = ctx.createGain(); wet.gain.value = 0.5

    this.filter.connect(dry); dry.connect(this.master)
    this.filter.connect(this.reverbSend); this.reverbSend.connect(reverb); reverb.connect(wet); wet.connect(this.master)
    this.master.connect(limiter); limiter.connect(this.output); this.output.connect(ctx.destination)

    // --- Pad voices: one detuned oscillator pair each, gentle static gains.
    const midi = this.getChordMidi(this.chordName)
    for (let index = 0; index < VOICE_COUNT; index++) {
      const note = midi[index % midi.length]
      const freq = clampFreq(this.midiToFreq(note))
      const gain = ctx.createGain()
      gain.gain.value = index < 2 ? 0.06 : 0.045

      const oscA = ctx.createOscillator()
      const oscB = ctx.createOscillator()
      oscA.type = "triangle"
      oscB.type = "sine"
      oscA.frequency.value = freq
      oscB.frequency.value = freq
      oscA.detune.value = -5 - index * 0.6
      oscB.detune.value = 5 + index * 0.6
      oscA.connect(gain); oscB.connect(gain); gain.connect(this.filter)
      oscA.start(now); oscB.start(now)
      this.voices.push({ oscA, oscB, gain, note })
    }

    // --- Shared modulation: ONE slow filter LFO for the whole field. This is
    // the big CPU win over per-voice LFOs — the movement is global and gentle.
    const filterLfo = ctx.createOscillator()
    const filterDepth = ctx.createGain()
    filterLfo.frequency.value = 0.03
    filterDepth.gain.value = 600
    filterLfo.connect(filterDepth); filterDepth.connect(this.filter.frequency); filterLfo.start(now)

    // --- A very quiet, dark noise bed for lofi texture. Bandpassed low so it
    // reads as air, not hiss. Single short looping buffer.
    const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.12
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer; noise.loop = true
    const noiseFilter = ctx.createBiquadFilter(); noiseFilter.type = "bandpass"
    noiseFilter.frequency.value = 700; noiseFilter.Q.value = 0.4
    const noiseGain = ctx.createGain(); noiseGain.gain.value = 0.006
    noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(this.reverbSend)
    noise.start(now)

    ctx.onstatechange = () => {
      if (ctx.state !== "running" && this.enabled) {
        this.lastError = `context changed to ${ctx.state}`
      }
      this.notifyState()
    }
    this.notifyState()
  }

  midiToFreq(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12)
  }

  getChordMidi(name: ChordName): number[] {
    const chords: Record<ChordName, number[]> = {
      dm11: [38, 45, 48, 52, 55, 65, 69],
      dm9: [38, 45, 48, 52, 57, 64, 69],
      am9: [33, 40, 43, 47, 52, 59, 64],
      am11: [33, 40, 43, 47, 50, 59, 62],
      cm9: [36, 43, 46, 50, 55, 62, 67],
      cm11: [36, 43, 46, 50, 53, 62, 65],
      em11: [40, 47, 50, 54, 57, 66, 69],
      gm9: [31, 38, 41, 45, 50, 57, 62],
      gm11: [31, 38, 41, 45, 48, 57, 60],
      fmaj9: [29, 36, 40, 43, 48, 55, 60],
      bbmaj9sharp11: [34, 41, 45, 48, 52, 64, 69],
      ebmaj9: [39, 46, 50, 53, 58, 65, 70],
      g13sus: [31, 38, 41, 45, 48, 52, 64],
      suspended: [38, 45, 50, 52, 57, 62, 67],
      moon: [38, 45, 52, 55, 60, 65, 69],
    }
    return chords[name] || chords.dm11
  }

  progressions(): Record<ProgressionName, ChordName[]> {
    return {
      underice: ["dm11", "bbmaj9sharp11", "fmaj9", "cm11"],
      orbit: ["dm9", "gm11", "bbmaj9sharp11", "am11"],
      rain: ["cm9", "ebmaj9", "gm11", "dm11"],
      lantern: ["am9", "fmaj9", "cm11", "g13sus"],
      bluehour: ["em11", "cm9", "gm9", "dm11"],
      suspended: ["suspended", "moon", "g13sus", "dm11"],
    }
  }

  /** Nearest-octave voice leading, clamped to the safe MIDI band. */
  voiceLead(target: number, current: number): number {
    let best = target
    let distance = Infinity
    for (let octave = -3; octave <= 3; octave++) {
      const candidate = target + octave * 12
      const d = Math.abs(candidate - current)
      if (d < distance) { best = candidate; distance = d }
    }
    return Math.min(84, Math.max(28, best))
  }

  /** Glide the pad to a new chord with one cheap `setTargetAtTime` per osc. */
  setChord(name: ChordName): boolean {
    this.chordName = name
    if (!this.ctx || !this.voices.length) return true
    const midi = this.getChordMidi(name)
    const now = this.ctx.currentTime
    this.voices.forEach((voice, index) => {
      const note = this.voiceLead(midi[index % midi.length], voice.note)
      const freq = clampFreq(this.midiToFreq(note))
      voice.oscA.frequency.setTargetAtTime(freq, now, GLIDE_TAU)
      voice.oscB.frequency.setTargetAtTime(freq, now, GLIDE_TAU)
      voice.note = note
    })
    return true
  }

  setProgression(name: ProgressionName): boolean {
    if (!this.progressions()[name]) return false
    this.progressionName = name
    this.progressionStep = 0
    this.scheduleEvolution()
    return true
  }

  advanceHarmony(): ChordName {
    const progression = this.progressions()[this.progressionName] || this.progressions().underice
    const next = progression[this.progressionStep % progression.length]
    this.progressionStep++
    this.setChord(next)
    this.onMessage?.(`HARMONY // ${this.progressionName} → ${next}`, "tender")
    this.chime("tender")
    return next
  }

  clearEvolution(): void {
    if (this.evolutionTimer) clearTimeout(this.evolutionTimer)
    this.evolutionTimer = null
  }

  scheduleEvolution(): void {
    this.clearEvolution()
    if (!this.enabled || !this.harmonyAuto) return
    // Slow, breathing chord changes — 12–16 beats apart at a calm tempo.
    const beats = 12 + (this.progressionStep % 3) * 2
    const delay = (60000 / this.tempo) * beats
    this.evolutionTimer = setTimeout(() => {
      if (this.enabled && this.harmonyAuto) this.advanceHarmony()
      this.scheduleEvolution()
    }, delay)
  }

  setVolume(value: number): void {
    this.level = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, value))
    if (this.ctx && this.enabled && this.master) {
      const now = this.ctx.currentTime
      this.master.gain.setTargetAtTime(this.level, now, 0.4)
    }
  }

  makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx?.sampleRate || 44100
    const length = Math.floor(rate * seconds)
    const impulse = this.ctx!.createBuffer(2, length, rate)
    for (let c = 0; c < 2; c++) {
      const d = impulse.getChannelData(c)
      for (let i = 0; i < length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
      }
    }
    return impulse
  }

  /** A soft bell tied to the current chord. Frequency-clamped + rate-limited. */
  chime(tone = "normal"): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running" || !this.filter) return
    const now = performance.now()
    if (now < this.chimeCooldown) return
    this.chimeCooldown = now + 520

    const t = this.ctx.currentTime
    const midi = this.getChordMidi(this.chordName)
    const base = midi[Math.floor(Math.random() * midi.length)]
    const offset = tone === "tender" ? 24 : tone === "warning" ? -12 : 12
    const freq = clampFreq(this.midiToFreq(base + offset))

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.03, t + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
    // Route through the reverb send so chimes inherit the wash; auto-clean up.
    osc.connect(gain); gain.connect(this.filter); gain.connect(this.reverbSend!)
    osc.start(t); osc.stop(t + 1.9)
  }
}
