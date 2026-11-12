import { useEffect, useRef, useState } from "react"
import { cssVarReader, startFrameLoop } from "./useGameLoop"
import styles from "./BoidsPage.module.scss"

/**
 * Boids — Reynolds flocking (separation, alignment, cohesion). The cursor is a
 * predator the flock flees, and an optional hawk hunts on its own. The world
 * wraps, and so does each boid's sense of its neighbours (it used to measure
 * plain distances, so a flock tore in half at every edge). A toy, not a game.
 */

const RULES = [
  { key: "align", label: "alignment", def: 1 },
  { key: "cohere", label: "cohesion", def: 1 },
  { key: "separate", label: "separation", def: 1 },
] as const
type Weights = Record<(typeof RULES)[number]["key"], number>

interface Boid { x: number; y: number; vx: number; vy: number }

export function BoidsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [count, setCount] = useState(120)
  const countRef = useRef(count)
  countRef.current = count
  const [weights, setWeights] = useState<Weights>({ align: 1, cohere: 1, separate: 1 })
  const weightsRef = useRef(weights)
  weightsRef.current = weights
  const [hawk, setHawk] = useState(false)
  const hawkRef = useRef(hawk)
  hawkRef.current = hawk
  const [trails, setTrails] = useState(false)
  const trailsRef = useRef(trails)
  trailsRef.current = trails

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const mouse = { x: -9999, y: -9999, active: false }

    let boids: Boid[] = []
    const seed = (n: number) => {
      boids = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      }))
    }
    seed(countRef.current)

    const PERCEPT = 42
    const PERCEPT2 = PERCEPT * PERCEPT
    const SEP = 22
    const SEP2 = SEP * SEP
    const MAXV = 2.6
    const MINV = 1.1
    const FLEE = 90
    const FLEE2 = FLEE * FLEE

    const accent = cssVarReader("--color-accent-base", "#b4424c")
    const text = cssVarReader("--color-text", "#e0e0e0")
    // shortest offset on the torus
    const wrapD = (d: number, span: number) => (d > span / 2 ? d - span : d < -span / 2 ? d + span : d)
    const hawkB = { x: W * 0.1, y: H * 0.1, vx: 1.5, vy: 0.8 }

    // Every increment below is scaled by `k` (frames-at-60Hz elapsed), so the flock
    // moves at the same speed on 120/144 Hz displays as on 60 Hz ones instead of
    // running 2-2.4x fast.
    const step = (k: number) => {
      // adjust population if the slider changed
      if (boids.length !== countRef.current) {
        if (countRef.current > boids.length) {
          for (let i = boids.length; i < countRef.current; i++)
            boids.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2 })
        } else {
          boids.length = countRef.current
        }
      }

      const w = weightsRef.current
      const hunting = hawkRef.current
      // The hawk chases the nearest boid, a touch faster than the flock.
      if (hunting && boids.length) {
        let best = boids[0], bd = Infinity
        for (const b of boids) {
          const d = wrapD(b.x - hawkB.x, W) ** 2 + wrapD(b.y - hawkB.y, H) ** 2
          if (d < bd) { bd = d; best = b }
        }
        const dx = wrapD(best.x - hawkB.x, W), dy = wrapD(best.y - hawkB.y, H)
        const d = Math.hypot(dx, dy) || 1
        hawkB.vx += (dx / d) * 0.12 * k
        hawkB.vy += (dy / d) * 0.12 * k
        const sp = Math.hypot(hawkB.vx, hawkB.vy)
        if (sp > MAXV * 1.15) { hawkB.vx *= (MAXV * 1.15) / sp; hawkB.vy *= (MAXV * 1.15) / sp }
        hawkB.x = (hawkB.x + hawkB.vx * k + W) % W
        hawkB.y = (hawkB.y + hawkB.vy * k + H) % H
      }
      const predators: { x: number; y: number }[] = []
      if (mouse.active) predators.push(mouse)
      if (hunting) predators.push(hawkB)

      for (const b of boids) {
        let ax = 0, ay = 0          // alignment
        let cx = 0, cy = 0          // cohesion (sum of offsets to neighbours)
        let sx = 0, sy = 0          // separation
        let n = 0

        for (const o of boids) {
          if (o === b) continue
          const dx = wrapD(o.x - b.x, W), dy = wrapD(o.y - b.y, H)
          const d2 = dx * dx + dy * dy
          if (d2 < PERCEPT2) {
            ax += o.vx; ay += o.vy
            cx += dx; cy += dy
            n++
            if (d2 < SEP2 && d2 > 0) { sx -= dx / d2; sy -= dy / d2 }
          }
        }

        if (n > 0) {
          ax /= n; ay /= n
          b.vx += (ax - b.vx) * 0.04 * w.align * k
          b.vy += (ay - b.vy) * 0.04 * w.align * k
          b.vx += (cx / n) * 0.0009 * w.cohere * k
          b.vy += (cy / n) * 0.0009 * w.cohere * k
        }
        b.vx += sx * 0.9 * w.separate * k
        b.vy += sy * 0.9 * w.separate * k

        // flee the cursor and the hawk
        for (const p of predators) {
          const dx = wrapD(b.x - p.x, W), dy = wrapD(b.y - p.y, H)
          const d2 = dx * dx + dy * dy
          if (d2 < FLEE2 && d2 > 0) {
            const f = (FLEE2 - d2) / FLEE2
            const d = Math.sqrt(d2)
            b.vx += (dx / d) * f * 0.9 * k
            b.vy += (dy / d) * f * 0.9 * k
          }
        }

        // clamp speed both ways (a boid that stalls stops reading as a bird)
        const sp = Math.hypot(b.vx, b.vy)
        if (sp > MAXV) { b.vx = (b.vx / sp) * MAXV; b.vy = (b.vy / sp) * MAXV }
        else if (sp < MINV) {
          if (sp < 1e-6) { const a = Math.random() * Math.PI * 2; b.vx = Math.cos(a) * MINV; b.vy = Math.sin(a) * MINV }
          else { b.vx = (b.vx / sp) * MINV; b.vy = (b.vy / sp) * MINV }
        }

        b.x += b.vx * k; b.y += b.vy * k
        // wrap
        if (b.x < 0) b.x += W; else if (b.x > W) b.x -= W
        if (b.y < 0) b.y += H; else if (b.y > H) b.y -= H
      }
    }

    // draw each boid as a little oriented triangle, batched into one path
    const draw = () => {
      if (trailsRef.current) {
        // fade the last frame instead of clearing it
        ctx.globalCompositeOperation = "destination-out"
        ctx.fillStyle = "rgba(0,0,0,0.12)"
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = "source-over"
      } else {
        ctx.clearRect(0, 0, W, H)
      }
      ctx.globalAlpha = 0.8
      ctx.fillStyle = accent()
      ctx.beginPath()
      for (const b of boids) {
        const sp = Math.hypot(b.vx, b.vy) || 1
        const ux = b.vx / sp, uy = b.vy / sp // heading
        const nx = -uy, ny = ux              // its normal
        ctx.moveTo(b.x + ux * 5, b.y + uy * 5)
        ctx.lineTo(b.x - ux * 3 + nx * 2.4, b.y - uy * 3 + ny * 2.4)
        ctx.lineTo(b.x - ux * 3 - nx * 2.4, b.y - uy * 3 - ny * 2.4)
        ctx.closePath()
      }
      ctx.fill()
      if (hawkRef.current) {
        const sp = Math.hypot(hawkB.vx, hawkB.vy) || 1
        const ux = hawkB.vx / sp, uy = hawkB.vy / sp, nx = -uy, ny = ux
        ctx.globalAlpha = 0.95
        ctx.fillStyle = text()
        ctx.beginPath()
        ctx.moveTo(hawkB.x + ux * 10, hawkB.y + uy * 10)
        ctx.lineTo(hawkB.x - ux * 6 + nx * 7, hawkB.y - uy * 6 + ny * 7)
        ctx.lineTo(hawkB.x - ux * 2, hawkB.y - uy * 2)
        ctx.lineTo(hawkB.x - ux * 6 - nx * 7, hawkB.y - uy * 6 - ny * 7)
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const stopLoop = startFrameLoop((dt) => {
      step(Math.min(dt, 50) / (1000 / 60))
      draw()
    })

    const rectXY = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - r.left) / r.width) * W
      mouse.y = ((e.clientY - r.top) / r.height) * H
    }
    const onMove = (e: MouseEvent) => { rectXY(e); mouse.active = true }
    const onLeave = () => { mouse.active = false }
    const onTouch = (e: TouchEvent) => { if (e.touches[0]) { e.preventDefault(); rectXY(e.touches[0]); mouse.active = true } }
    canvas.addEventListener("mousemove", onMove)
    canvas.addEventListener("mouseleave", onLeave)
    canvas.addEventListener("touchstart", onTouch, { passive: false })
    canvas.addEventListener("touchmove", onTouch, { passive: false })
    canvas.addEventListener("touchend", onLeave)

    return () => {
      stopLoop()
      canvas.removeEventListener("mousemove", onMove)
      canvas.removeEventListener("mouseleave", onLeave)
      canvas.removeEventListener("touchstart", onTouch)
      canvas.removeEventListener("touchmove", onTouch)
      canvas.removeEventListener("touchend", onLeave)
    }
  }, [])

  return (
    <div className={styles.boidsContainer}>
      <header className={styles.header}>
        <h1>Murmuration</h1>
        <p>A flock of boids. Move your cursor (or a finger) through them — they scatter. Set a hawk on them, or tip the three rules.</p>
      </header>
      <div className={styles.stage}>
        <canvas ref={canvasRef} width={640} height={420} className={styles.canvas} style={{ touchAction: "none" }} />
      </div>
      <div className={styles.controls}>
        <label>
          flock <strong>{count}</strong>
          <input
            type="range" min={30} max={300} value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10))}
          />
        </label>
        {RULES.map((r) => (
          <label key={r.key}>
            {r.label} <strong>{weights[r.key].toFixed(1)}</strong>
            <input
              type="range" min={0} max={30} value={Math.round(weights[r.key] * 10)}
              onChange={(e) => setWeights((w) => ({ ...w, [r.key]: parseInt(e.target.value, 10) / 10 }))}
            />
          </label>
        ))}
        <div className={styles.toggles}>
          <button data-active={hawk || undefined} onClick={() => setHawk((h) => !h)}>hawk</button>
          <button data-active={trails || undefined} onClick={() => setTrails((t) => !t)}>trails</button>
          <button onClick={() => setWeights({ align: 1, cohere: 1, separate: 1 })}>reset rules</button>
        </div>
      </div>
    </div>
  )
}
