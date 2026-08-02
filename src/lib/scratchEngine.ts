// Turntable scratch engine.
//
// Real scratching needs reverse playback at arbitrary speed, which an <audio>
// element cannot do. So during a scratch we hand off from the <audio> element
// to an AudioWorklet that reads the decoded track buffer at a signed, hand-
// driven velocity (see scratch-processor.js). On release we read the worklet's
// final position back and resume the <audio> element there.
//
// The worklet is routed through the SAME analyser the visualiser reads, so the
// bars react to the scratch too. Decoded buffers are cached per URL.

// The worklet processor is served raw from public/ (NOT bundled) so its
// registerProcessor() runs in the AudioWorklet global scope intact. A ?url
// import of a .js gets transformed/inlined by Vite and breaks the worklet.
const processorUrl = "/scratch-processor.js"

const bufferCache = new Map<string, AudioBuffer>()
// Pre-extracted channel arrays per URL, ready to hand to the worklet with zero
// copy at scratch-start (the expensive part was decode + per-scratch copy).
const channelCache = new Map<string, Float32Array[]>()
let moduleAdded = false

export interface ScratchSession {
  /** set signed velocity: 1 = forward at normal speed, -1 = reverse, 0 = hold */
  setVelocity: (v: number) => void
  /** match the player volume (0–1) live */
  setVolume: (v: number) => void
  /** end the scratch; resolves with the final track time in seconds */
  end: () => Promise<number>
}

async function getBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url)
  if (cached) return cached
  const res = await fetch(url, { mode: "cors" })
  const arr = await res.arrayBuffer()
  const buf = await ctx.decodeAudioData(arr)
  bufferCache.set(url, buf)
  // pre-extract channel arrays now so scratch-start does no copying
  const channels: Float32Array[] = []
  for (let c = 0; c < buf.numberOfChannels; c++) channels.push(Float32Array.from(buf.getChannelData(c)))
  channelCache.set(url, channels)
  return buf
}

/**
 * Decode + cache a track's audio ahead of any scratch, so the first scratch is
 * instant instead of waiting on a ~5MB fetch + decode. Safe to call repeatedly;
 * a no-op if already cached or if Web Audio isn't ready yet. Never throws.
 */
export async function prewarmScratch(analyser: AnalyserNode | null, url: string | undefined): Promise<void> {
  if (!analyser || !url || bufferCache.has(url)) return
  const ctx = analyser.context as AudioContext
  if (!ctx) return
  try {
    if (!moduleAdded) {
      await ctx.audioWorklet.addModule(processorUrl)
      moduleAdded = true
    }
    await getBuffer(ctx, url)
  } catch {
    // best-effort; scratch falls back to lazy decode / silent scrub
  }
}

/**
 * Begin a scratch. `effectsInput` is the live music graph's shared entry point,
 * so the worklet inherits its EQ, analyser and master gain. `url` is the
 * current track audio URL and `startTime` the position to scratch from
 * (seconds). Returns a session, or null if Web Audio / the worklet aren't
 * available (caller falls back).
 */
export async function startScratch(
  effectsInput: AudioNode,
  url: string,
  startTime: number,
  volume = 1,
): Promise<ScratchSession | null> {
  const ctx = effectsInput.context as AudioContext
  if (!ctx || !("audioWorklet" in ctx)) return null
  try {
    if (!moduleAdded) {
      await ctx.audioWorklet.addModule(processorUrl)
      moduleAdded = true
    }
    if (ctx.state === "suspended") await ctx.resume()

    const buffer = await getBuffer(ctx, url)
    const node = new AudioWorkletNode(ctx, "scratch-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [buffer.numberOfChannels],
    })

    // Reuse the channel arrays extracted at decode time (prewarm) — no copy at
    // scratch-start. We pass them by structured-clone (not transfer) so the
    // cache survives for the next scratch.
    const channels = channelCache.get(url)
      ?? Array.from({ length: buffer.numberOfChannels }, (_, c) => Float32Array.from(buffer.getChannelData(c)))
    node.port.postMessage({
      type: "load",
      channels,
      length: buffer.length,
      startPos: startTime * buffer.sampleRate,
    })

    // Join at the same effects entry as the streaming decks so scratching gets
    // the user's EQ/filter settings and still reaches the shared analyser.
    node.connect(effectsInput)

    const velParam = node.parameters.get("velocity")!
    const gainParam = node.parameters.get("gain")!
    gainParam.value = volume   // match the player's volume so scratch isn't full-blast

    const setVelocity = (v: number) => {
      // tiny time-constant: responsive but click-free (worklet smooths the rest)
      velParam.setTargetAtTime(v, ctx.currentTime, 0.003)
    }
    const setVolume = (v: number) => {
      gainParam.setTargetAtTime(v, ctx.currentTime, 0.02)
    }

    const end = (): Promise<number> =>
      new Promise((resolve) => {
        const onMsg = (e: MessageEvent) => {
          if (e.data?.type === "pos") {
            node.port.removeEventListener("message", onMsg)
            const seconds = e.data.pos / buffer.sampleRate
            try { node.disconnect() } catch { /* already gone */ }
            resolve(seconds)
          }
        }
        node.port.addEventListener("message", onMsg)
        node.port.start?.()
        node.port.postMessage({ type: "reportPos" })
        // safety: if no reply, tear down anyway after 200ms
        setTimeout(() => {
          node.port.removeEventListener("message", onMsg)
          try { node.disconnect() } catch { /* already gone */ }
          resolve(startTime)
        }, 200)
      })

    return { setVelocity, setVolume, end }
  } catch (err) {
    if (import.meta.env.DEV) console.error("[scratch] engine failed to start:", err)
    return null
  }
}
