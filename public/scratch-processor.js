// AudioWorkletProcessor for turntable scratching.
//
// Owns a fractional read-position into a decoded track buffer and a signed
// `velocity` (samples advanced per output sample). Forward AND reverse play at
// any speed, with linear interpolation between samples — this is what makes a
// real scratch: drag forward → audio forward, drag back → audio reverses, slow
// → pitched down, fast → pitched up. The main thread pushes the buffer once,
// then streams velocity targets via AudioParam; we smooth them to avoid clicks.
class ScratchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // signed playback speed: 1 = normal forward, -1 = normal reverse, 0 = hold
      { name: "velocity", defaultValue: 0, automationRate: "a-rate" },
      // overall gain (lets the main thread fade in/out)
      { name: "gain", defaultValue: 1, automationRate: "k-rate" },
    ]
  }

  constructor() {
    super()
    this.channels = []      // Float32Array per channel
    this.length = 0
    this.pos = 0            // fractional read position in samples
    this.smoothVel = 0
    this.port.onmessage = (e) => {
      const d = e.data
      if (d.type === "load") {
        this.channels = d.channels
        this.length = d.length
        this.pos = Math.max(0, Math.min(this.length - 1, d.startPos || 0))
      } else if (d.type === "seek") {
        this.pos = Math.max(0, Math.min(this.length - 1, d.pos))
      } else if (d.type === "reportPos") {
        this.port.postMessage({ type: "pos", pos: this.pos })
      }
    }
  }

  process(_inputs, outputs, params) {
    const out = outputs[0]
    if (!this.channels.length || this.length < 2) {
      for (let c = 0; c < out.length; c++) out[c].fill(0)
      return true
    }
    const velArr = params.velocity
    const gainArr = params.gain
    const frames = out[0].length
    const nCh = out.length

    for (let i = 0; i < frames; i++) {
      const targetVel = velArr.length > 1 ? velArr[i] : velArr[0]
      // glide toward the target velocity so abrupt hand jumps don't click.
      // 0.35 is snappy (low lag) but still smooths the single-sample steps that
      // would otherwise pop; the AudioParam already pre-smooths the target.
      this.smoothVel += (targetVel - this.smoothVel) * 0.35
      const g = gainArr.length > 1 ? gainArr[i] : gainArr[0]

      const p = this.pos
      const i0 = Math.floor(p)
      const frac = p - i0
      const i1 = i0 + 1

      for (let c = 0; c < nCh; c++) {
        const buf = this.channels[Math.min(c, this.channels.length - 1)]
        const s0 = i0 >= 0 && i0 < this.length ? buf[i0] : 0
        const s1 = i1 >= 0 && i1 < this.length ? buf[i1] : 0
        out[c][i] = (s0 + (s1 - s0) * frac) * g
      }

      this.pos += this.smoothVel
      // clamp / stall at the buffer ends
      if (this.pos < 0) { this.pos = 0; this.smoothVel = 0 }
      else if (this.pos >= this.length - 1) { this.pos = this.length - 1; this.smoothVel = 0 }
    }
    return true
  }
}

registerProcessor("scratch-processor", ScratchProcessor)
