/**
 * Small falling things: snow, blossom, leaves, summer motes, rain.
 *
 * One canvas, one loop at 30 fps, and nothing at all when there's nothing to
 * draw: a flurry spawns for its duration, then lets its last particles fall
 * out of frame and stops the loop. Hidden tabs pause. Drawn behind the page
 * (between the background canvas and the content), never over the text.
 */

import type { Particle } from "./sky"

export interface FlurryOptions {
  kind: Particle
  /** How long new particles keep arriving; omit for "until stopped" (weather). */
  durationMs?: number
  /** 0–1: share of the full count (heavy rain = 1, a gentle flurry ≈ 0.5). */
  density?: number
  theme: "light" | "dark"
}

interface P {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  spin: number
  phase: number
  color: string
  life: number
}

const FRAME_MS = 1000 / 30
const MAX: Record<Particle, number> = { snow: 90, blossom: 40, leaves: 34, motes: 46, rain: 160 }
const LEAF_COLOURS = ["#b5562a", "#c9782f", "#9a3f22", "#d29a3a", "#7d5a2a"]
const PETAL_COLOURS = ["#f2c4d0", "#eab0c0", "#f6d6de", "#e59fb4"]

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}

function spawn(kind: Particle, w: number, h: number, theme: "light" | "dark", initial: boolean): P {
  const y = initial ? rand(-h, 0) : rand(-40, -8)
  const base: P = { x: rand(-40, w + 40), y, vx: 0, vy: 0, size: 2, rot: rand(0, Math.PI * 2), spin: 0, phase: rand(0, 1000), color: "", life: 0 }
  switch (kind) {
    case "snow":
      return { ...base, vy: rand(18, 42), size: rand(1, 2.6), color: theme === "dark" ? "rgba(235,240,248,0.8)" : "rgba(120,140,165,0.55)" }
    case "blossom":
      return { ...base, vx: rand(10, 30), vy: rand(20, 38), size: rand(3, 5), spin: rand(-1.4, 1.4), color: PETAL_COLOURS[Math.floor(Math.random() * PETAL_COLOURS.length)] }
    case "leaves":
      return { ...base, vx: rand(-8, 18), vy: rand(26, 48), size: rand(4.5, 7.5), spin: rand(-2.2, 2.2), color: LEAF_COLOURS[Math.floor(Math.random() * LEAF_COLOURS.length)] }
    case "motes":
      // Fireflies: start anywhere low, drift up and wander.
      return { ...base, y: initial ? rand(h * 0.3, h) : h + 10, vx: rand(-6, 6), vy: rand(-12, -4), size: rand(1, 2), color: theme === "dark" ? "214,196,120" : "176,140,40" }
    case "rain":
      return { ...base, vx: -60, vy: rand(520, 700), size: rand(9, 16), color: theme === "dark" ? "rgba(170,190,215,0.35)" : "rgba(80,100,130,0.3)" }
  }
}

function draw(ctx: CanvasRenderingContext2D, kind: Particle, p: P, t: number) {
  switch (kind) {
    case "snow":
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      return
    case "blossom":
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.6 + 0.4) // tumbling
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      return
    case "leaves": {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.scale(Math.cos(p.rot * 1.3) * 0.5 + 0.6, 1)
      const s = p.size
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.moveTo(0, -s)
      ctx.quadraticCurveTo(s * 0.9, 0, 0, s)
      ctx.quadraticCurveTo(-s * 0.9, 0, 0, -s)
      ctx.fill()
      ctx.strokeStyle = "rgba(60,30,10,0.35)"
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(0, -s)
      ctx.lineTo(0, s * 1.2)
      ctx.stroke()
      ctx.restore()
      return
    }
    case "motes": {
      const a = 0.25 + 0.6 * Math.max(0, Math.sin(t * 0.0021 + p.phase))
      ctx.fillStyle = `rgba(${p.color},${a.toFixed(3)})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    case "rain":
      ctx.strokeStyle = p.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + p.vx * 0.02, p.y + p.size)
      ctx.stroke()
  }
}

/** Starts a flurry on `canvas`. Returns stop(); `done` resolves when the last particle has gone. */
export function startFlurry(canvas: HTMLCanvasElement, opts: FlurryOptions): { stop: () => void; done: Promise<void> } {
  const ctx = canvas.getContext("2d")!
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
  let w = 0
  let h = 0
  const resize = () => {
    w = window.innerWidth
    h = window.innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener("resize", resize)

  const phone = w <= 800
  const target = Math.round(MAX[opts.kind] * (opts.density ?? 0.6) * (phone ? 0.5 : 1))
  const particles: P[] = []
  for (let i = 0; i < Math.round(target * 0.35); i++) particles.push(spawn(opts.kind, w, h, opts.theme, true))

  const start = performance.now()
  let last = start
  let raf = 0
  let stopped = false
  let finish!: () => void
  const done = new Promise<void>((resolve) => (finish = resolve))

  const end = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    window.removeEventListener("resize", resize)
    document.removeEventListener("visibilitychange", onVisibility)
    ctx.clearRect(0, 0, w, h)
    finish()
  }

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    if (now - last < FRAME_MS) return
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    const spawning = opts.durationMs === undefined || now - start < opts.durationMs

    // Ease in over the first few seconds rather than appearing all at once.
    const want = spawning ? Math.round(target * Math.min(1, (now - start) / 4000 + 0.35)) : 0
    while (particles.length < want) particles.push(spawn(opts.kind, w, h, opts.theme, false))

    ctx.clearRect(0, 0, w, h)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life += dt
      const sway = opts.kind === "rain" ? 0 : Math.sin(now * 0.0012 + p.phase) * (opts.kind === "snow" ? 12 : 22)
      p.x += (p.vx + sway) * dt
      p.y += p.vy * dt
      p.rot += p.spin * dt
      if (opts.kind === "motes") {
        p.vx += rand(-4, 4) * dt
        if (p.life > 14) p.y = -100 // fireflies fade out after a while
      }
      const gone = opts.kind === "motes" ? p.y < -20 : p.y > h + 20
      if (gone) {
        particles.splice(i, 1)
        continue
      }
      draw(ctx, opts.kind, p, now)
    }
    if (!spawning && particles.length === 0) end()
  }

  const onVisibility = () => {
    if (document.visibilityState === "hidden") cancelAnimationFrame(raf)
    else if (!stopped) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener("visibilitychange", onVisibility)
  raf = requestAnimationFrame(frame)
  return { stop: end, done }
}
