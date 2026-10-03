import { useEffect, useRef, useState } from "react"
import { cssVarReader, startFrameLoop } from "./useGameLoop"
import styles from "./BoidsPage.module.scss"

/**
 * Boids — Reynolds flocking (separation, alignment, cohesion). The cursor is a
 * predator the flock flees. A toy, not a game: just watch the murmuration.
 */

interface Boid { x: number; y: number; vx: number; vy: number }

export function BoidsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [count, setCount] = useState(120)
  const countRef = useRef(count)
  countRef.current = count

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
    const FLEE = 90
    const FLEE2 = FLEE * FLEE

    const accent = cssVarReader("--color-accent-base", "#b4424c")

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

      for (const b of boids) {
        let ax = 0, ay = 0          // alignment
        let cx = 0, cy = 0          // cohesion
        let sx = 0, sy = 0          // separation
        let n = 0

        for (const o of boids) {
          if (o === b) continue
          const dx = o.x - b.x, dy = o.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < PERCEPT2) {
            ax += o.vx; ay += o.vy
            cx += o.x; cy += o.y
            n++
            if (d2 < SEP2 && d2 > 0) { sx -= dx / d2; sy -= dy / d2 }
          }
        }

        if (n > 0) {
          ax /= n; ay /= n
          b.vx += (ax - b.vx) * 0.04 * k
          b.vy += (ay - b.vy) * 0.04 * k
          cx = cx / n - b.x; cy = cy / n - b.y
          b.vx += cx * 0.0009 * k
          b.vy += cy * 0.0009 * k
        }
        b.vx += sx * 0.9 * k
        b.vy += sy * 0.9 * k

        // flee the cursor
        if (mouse.active) {
          const dx = b.x - mouse.x, dy = b.y - mouse.y
          const d2 = dx * dx + dy * dy
          if (d2 < FLEE2 && d2 > 0) {
            const f = (FLEE2 - d2) / FLEE2
            const d = Math.sqrt(d2)
            b.vx += (dx / d) * f * 0.9 * k
            b.vy += (dy / d) * f * 0.9 * k
          }
        }

        // clamp speed
        const sp = Math.hypot(b.vx, b.vy)
        if (sp > MAXV) { b.vx = (b.vx / sp) * MAXV; b.vy = (b.vy / sp) * MAXV }

        b.x += b.vx * k; b.y += b.vy * k
        // wrap
        if (b.x < 0) b.x += W; else if (b.x > W) b.x -= W
        if (b.y < 0) b.y += H; else if (b.y > H) b.y -= H
      }
    }

    // draw each boid as a little oriented triangle, batched into one path
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
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
    const onTouch = (e: TouchEvent) => { if (e.touches[0]) { rectXY(e.touches[0]); mouse.active = true } }
    canvas.addEventListener("mousemove", onMove)
    canvas.addEventListener("mouseleave", onLeave)
    canvas.addEventListener("touchmove", onTouch, { passive: true })
    canvas.addEventListener("touchend", onLeave)

    return () => {
      stopLoop()
      canvas.removeEventListener("mousemove", onMove)
      canvas.removeEventListener("mouseleave", onLeave)
      canvas.removeEventListener("touchmove", onTouch)
      canvas.removeEventListener("touchend", onLeave)
    }
  }, [])

  return (
    <div className={styles.boidsContainer}>
      <header className={styles.header}>
        <h1>Murmuration</h1>
        <p>A flock of boids. Move your cursor through them — they scatter.</p>
      </header>
      <div className={styles.stage}>
        <canvas ref={canvasRef} width={640} height={420} className={styles.canvas} />
      </div>
      <div className={styles.controls}>
        <label>
          flock <strong>{count}</strong>
          <input
            type="range" min={30} max={300} value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10))}
          />
        </label>
      </div>
    </div>
  )
}
