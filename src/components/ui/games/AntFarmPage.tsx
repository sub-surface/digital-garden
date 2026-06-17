import { useEffect, useRef, useState } from "react"
import styles from "./AntFarmPage.module.scss"

/**
 * Ant Farm — an ant-colony foraging simulation.
 *
 * Ants leave two pheromone fields: a "home" trail when leaving the nest and a
 * "food" trail when carrying food back. Wandering ants sense the food field to
 * find caches; laden ants sense the home field to return. Trails evaporate, so
 * efficient paths reinforce and dead ends fade — emergent shortest-path
 * behaviour from simple local rules. Click to drop food. A toy, no goal.
 */

const GRID = 4 // pheromone cell size in px (coarser than pixels for speed)
const EVAP = 0.985
const DIFFUSE = 0.04
const ANTS = 140

interface Ant {
  x: number; y: number
  dir: number       // heading in radians
  laden: boolean    // carrying food?
}

interface Food { x: number; y: number; amount: number }

export function AntFarmPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const [collected, setCollected] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const GW = Math.ceil(W / GRID)
    const GH = Math.ceil(H / GRID)
    const nest = { x: W / 2, y: H / 2 }

    // pheromone fields
    const home = new Float32Array(GW * GH)
    const food = new Float32Array(GW * GH)
    const gi = (gx: number, gy: number) => gy * GW + gx
    const inB = (gx: number, gy: number) => gx >= 0 && gx < GW && gy >= 0 && gy < GH

    let foods: Food[] = [
      { x: W * 0.2, y: H * 0.25, amount: 400 },
      { x: W * 0.8, y: H * 0.7, amount: 400 },
      { x: W * 0.82, y: H * 0.2, amount: 300 },
    ]

    const ants: Ant[] = Array.from({ length: ANTS }, () => ({
      x: nest.x, y: nest.y,
      dir: Math.random() * Math.PI * 2,
      laden: false,
    }))

    let collectedLocal = 0

    // sense a field in three cones ahead; return steering bias
    const sense = (a: Ant, field: Float32Array): number => {
      const look = 9
      const sides = [-0.6, 0, 0.6]
      let best = -1
      let bestAng = 0
      for (const off of sides) {
        const ang = a.dir + off
        const sx = a.x + Math.cos(ang) * look
        const sy = a.y + Math.sin(ang) * look
        const gx = Math.floor(sx / GRID), gy = Math.floor(sy / GRID)
        let v = 0
        if (inB(gx, gy)) v = field[gi(gx, gy)]
        if (v > best) { best = v; bestAng = off }
      }
      return best > 0.02 ? bestAng : 0
    }

    const stepSim = () => {
      // deposit + evaporate + diffuse (cheap box blur via in-place pass)
      for (let i = 0; i < home.length; i++) { home[i] *= EVAP; food[i] *= EVAP }

      for (const a of ants) {
        // steer toward the field opposite to what it carries
        const target = a.laden ? home : food
        const bias = sense(a, target)
        a.dir += bias * 0.5 + (Math.random() - 0.5) * 0.5

        // nudge generally toward nest when laden (helps closure), toward open when not
        if (a.laden) {
          const toNest = Math.atan2(nest.y - a.y, nest.x - a.x)
          let d = toNest - a.dir
          while (d > Math.PI) d -= Math.PI * 2
          while (d < -Math.PI) d += Math.PI * 2
          a.dir += d * 0.06
        }

        a.x += Math.cos(a.dir) * 1.4
        a.y += Math.sin(a.dir) * 1.4

        // bounce off walls
        if (a.x < 2) { a.x = 2; a.dir = Math.PI - a.dir }
        if (a.x > W - 2) { a.x = W - 2; a.dir = Math.PI - a.dir }
        if (a.y < 2) { a.y = 2; a.dir = -a.dir }
        if (a.y > H - 2) { a.y = H - 2; a.dir = -a.dir }

        const gx = Math.floor(a.x / GRID), gy = Math.floor(a.y / GRID)
        if (inB(gx, gy)) {
          // lay the trail for where it's been
          if (a.laden) food[gi(gx, gy)] = Math.min(1, food[gi(gx, gy)] + 0.25)
          else home[gi(gx, gy)] = Math.min(1, home[gi(gx, gy)] + 0.12)
        }

        if (!a.laden) {
          // pick up food
          for (const f of foods) {
            if (f.amount > 0 && Math.hypot(a.x - f.x, a.y - f.y) < 7) {
              a.laden = true
              f.amount--
              a.dir += Math.PI // turn around
              break
            }
          }
        } else {
          // drop at nest
          if (Math.hypot(a.x - nest.x, a.y - nest.y) < 10) {
            a.laden = false
            a.dir += Math.PI
            collectedLocal++
          }
        }
      }
      foods = foods.filter((f) => f.amount > 0)
      if (collectedLocal !== collected) setCollected(collectedLocal)
    }

    // render
    let raf = 0
    let acc = 0
    let last = 0
    const STEP_MS = 22

    const cssVar = (n: string, fb: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      const accent = cssVar("--color-accent-base", "#b4424c")

      // pheromone fields as faint washes
      // food trail (accent), home trail (muted)
      for (let gy = 0; gy < GH; gy++) {
        for (let gx = 0; gx < GW; gx++) {
          const f = food[gi(gx, gy)]
          if (f > 0.02) {
            ctx.globalAlpha = Math.min(0.4, f * 0.5)
            ctx.fillStyle = accent
            ctx.fillRect(gx * GRID, gy * GRID, GRID, GRID)
          }
          const h = home[gi(gx, gy)]
          if (h > 0.04) {
            ctx.globalAlpha = Math.min(0.12, h * 0.2)
            ctx.fillStyle = "#8e8e93"
            ctx.fillRect(gx * GRID, gy * GRID, GRID, GRID)
          }
        }
      }
      ctx.globalAlpha = 1

      // food caches
      for (const f of foods) {
        ctx.globalAlpha = 0.85
        ctx.fillStyle = "#5a9e5a"
        const r = 3 + Math.sqrt(f.amount) * 0.3
        ctx.beginPath()
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      // nest
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(nest.x, nest.y, 9, 0, Math.PI * 2)
      ctx.stroke()

      // ants
      for (const a of ants) {
        ctx.globalAlpha = 0.95
        ctx.fillStyle = a.laden ? "#5a9e5a" : cssVar("--color-text", "#e0e0e0")
        ctx.beginPath()
        ctx.arc(a.x, a.y, a.laden ? 2.1 : 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (!last) last = t
      acc += t - last
      last = t
      if (!pausedRef.current && acc >= STEP_MS) { stepSim(); acc = 0 }
      draw()
    }
    raf = requestAnimationFrame(loop)

    // click to drop a food cache
    const onClick = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * W
      const y = ((e.clientY - r.top) / r.height) * H
      if (Math.hypot(x - nest.x, y - nest.y) < 20) return
      foods.push({ x, y, amount: 300 })
    }
    canvas.addEventListener("click", onClick)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener("click", onClick)
    }
  }, [])

  return (
    <div className={styles.antContainer}>
      <header className={styles.header}>
        <h1>Ant Farm</h1>
        <p>A colony foraging by pheromone. Trails reinforce and fade — watch paths emerge. Click to drop food.</p>
      </header>

      <div className={styles.stage}>
        <canvas ref={canvasRef} width={640} height={440} className={styles.canvas} />
      </div>

      <div className={styles.bar}>
        <span>gathered <strong>{collected}</strong></span>
        <button onClick={() => setPaused((p) => !p)}>{paused ? "Play" : "Pause"}</button>
      </div>
    </div>
  )
}
