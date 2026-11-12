import { useEffect, useRef, useState } from "react"
import { cssVarReader, startFrameLoop } from "./useGameLoop"
import { ignoreGameKey } from "./gameUtils"
import styles from "./AntFarmPage.module.scss"

/**
 * Ant Farm — an ant-colony foraging simulation.
 *
 * Ants leave two pheromone fields: a "home" trail when leaving the nest and a
 * "food" trail when carrying food back. Wandering ants sense the food field to
 * find caches; laden ants sense the home field to return. Trails evaporate, so
 * efficient paths reinforce and dead ends fade — emergent shortest-path
 * behaviour from simple local rules. A trail is laid strongest just after its
 * source (each ant's scent fades as it walks), so trails carry a gradient back
 * to where they came from. Drop food, or draw rocks and watch the colony find
 * the way round. A toy, no goal.
 */

const GRID = 4 // pheromone cell size in px (coarser than pixels for speed)
const EVAP = 0.985
const DIFFUSE = 0.04
const ANTS = 140

interface Ant {
  x: number; y: number
  dir: number       // heading in radians
  laden: boolean    // carrying food?
  scent: number     // trail strength, refilled at the nest or a cache, fading as it walks
}

type Tool = "food" | "rock" | "erase"

interface Food { x: number; y: number; amount: number }

export function AntFarmPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const [collected, setCollected] = useState(0)
  const [tool, setTool] = useState<Tool>("food")
  const toolRef = useRef(tool)
  toolRef.current = tool
  const [showTrails, setShowTrails] = useState(true)
  const trailsRef = useRef(showTrails)
  trailsRef.current = showTrails
  const resetRef = useRef<() => void>(() => {})

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
    const scratch = new Float32Array(GW * GH)
    const rock = new Uint8Array(GW * GH)
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
      scent: 1,
    }))
    const blocked = (x: number, y: number) => {
      const gx = Math.floor(x / GRID), gy = Math.floor(y / GRID)
      return !inB(gx, gy) || rock[gi(gx, gy)] === 1
    }

    let collectedLocal = 0
    let reportedCollected = 0

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
        if (inB(gx, gy) && !rock[gi(gx, gy)]) v = field[gi(gx, gy)]
        if (v > best) { best = v; bestAng = off }
      }
      return best > 0.02 ? bestAng : 0
    }

    const stepSim = () => {
      // evaporate, then diffuse: each cell keeps (1 − DIFFUSE) and shares the
      // rest with its four neighbours (DIFFUSE was declared but never applied,
      // so trails stayed one cell wide and hard to find)
      for (const field of [home, food]) {
        for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
          const i = gi(gx, gy)
          if (rock[i]) { scratch[i] = 0; continue }
          const l = gx > 0 ? field[i - 1] : field[i], r = gx < GW - 1 ? field[i + 1] : field[i]
          const u = gy > 0 ? field[i - GW] : field[i], d = gy < GH - 1 ? field[i + GW] : field[i]
          scratch[i] = (field[i] * (1 - DIFFUSE) + (l + r + u + d) * (DIFFUSE / 4)) * EVAP
        }
        field.set(scratch)
      }

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

        const nx = a.x + Math.cos(a.dir) * 1.4
        const ny = a.y + Math.sin(a.dir) * 1.4
        if (blocked(nx, ny)) {
          // feel along the rock: try turning a little either way, else about-face
          let turned = false
          for (const t of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
            const d2 = a.dir + t
            if (!blocked(a.x + Math.cos(d2) * 1.4, a.y + Math.sin(d2) * 1.4)) { a.dir = d2; turned = true; break }
          }
          if (!turned) a.dir += Math.PI
        } else {
          a.x = nx; a.y = ny
        }
        a.scent *= 0.996

        // bounce off walls
        if (a.x < 2) { a.x = 2; a.dir = Math.PI - a.dir }
        if (a.x > W - 2) { a.x = W - 2; a.dir = Math.PI - a.dir }
        if (a.y < 2) { a.y = 2; a.dir = -a.dir }
        if (a.y > H - 2) { a.y = H - 2; a.dir = -a.dir }

        const gx = Math.floor(a.x / GRID), gy = Math.floor(a.y / GRID)
        if (inB(gx, gy)) {
          // lay the trail for where it's been
          if (a.laden) food[gi(gx, gy)] = Math.min(1, food[gi(gx, gy)] + 0.25 * a.scent)
          else home[gi(gx, gy)] = Math.min(1, home[gi(gx, gy)] + 0.12 * a.scent)
        }

        if (!a.laden) {
          // pick up food
          for (const f of foods) {
            if (f.amount > 0 && Math.hypot(a.x - f.x, a.y - f.y) < 7) {
              a.laden = true
              a.scent = 1
              f.amount--
              a.dir += Math.PI // turn around
              break
            }
          }
        } else {
          // drop at nest
          if (Math.hypot(a.x - nest.x, a.y - nest.y) < 10) {
            a.laden = false
            a.scent = 1
            a.dir += Math.PI
            collectedLocal++
          }
        }
      }
      foods = foods.filter((f) => f.amount > 0)
      if (collectedLocal !== reportedCollected) {
        reportedCollected = collectedLocal
        setCollected(collectedLocal)
      }
    }

    // render
    let acc = 0
    const STEP_MS = 22

    const accentVar = cssVarReader("--color-accent-base", "#b4424c")
    const textVar = cssVarReader("--color-text", "#e0e0e0")

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      const accent = accentVar()
      const antColor = textVar() // read once per frame, not once per ant

      // pheromone fields as faint washes
      // food trail (accent), home trail (muted); rocks solid
      const showTrails = trailsRef.current
      for (let gy = 0; gy < GH; gy++) {
        for (let gx = 0; gx < GW; gx++) {
          if (rock[gi(gx, gy)]) {
            ctx.globalAlpha = 0.55
            ctx.fillStyle = "#6a6258"
            ctx.fillRect(gx * GRID, gy * GRID, GRID, GRID)
            continue
          }
          if (!showTrails) continue
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
        ctx.fillStyle = a.laden ? "#5a9e5a" : antColor
        ctx.beginPath()
        ctx.arc(a.x, a.y, a.laden ? 2.1 : 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const stopLoop = startFrameLoop((dt) => {
      acc += dt
      if (!pausedRef.current && acc >= STEP_MS) { stepSim(); acc = 0 }
      draw()
    })

    // Tools: click drops food; drag draws rock or erases (both rock and food).
    let drawing = false
    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
    }
    const brush = (x: number, y: number, erase: boolean) => {
      const cx = Math.floor(x / GRID), cy = Math.floor(y / GRID)
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const gx = cx + dx, gy = cy + dy
        if (!inB(gx, gy) || dx * dx + dy * dy > 5) continue
        // never wall in the nest
        if (!erase && Math.hypot(gx * GRID - nest.x, gy * GRID - nest.y) < 18) continue
        rock[gi(gx, gy)] = erase ? 0 : 1
        if (!erase) { home[gi(gx, gy)] = 0; food[gi(gx, gy)] = 0 }
      }
      if (erase) foods = foods.filter((f) => Math.hypot(f.x - x, f.y - y) > 12)
    }
    const down = (e: PointerEvent) => {
      const { x, y } = at(e)
      const t = e.button === 2 ? "erase" : toolRef.current
      if (t === "food") {
        if (Math.hypot(x - nest.x, y - nest.y) < 20 || blocked(x, y)) return
        foods.push({ x, y, amount: 300 })
        return
      }
      drawing = true
      canvas.setPointerCapture?.(e.pointerId)
      brush(x, y, t === "erase")
    }
    const move = (e: PointerEvent) => {
      if (!drawing) return
      const { x, y } = at(e)
      brush(x, y, (e.buttons & 2) !== 0 || toolRef.current === "erase")
    }
    const up = () => { drawing = false }
    const menu = (e: MouseEvent) => e.preventDefault()
    canvas.addEventListener("pointerdown", down)
    canvas.addEventListener("pointermove", move)
    canvas.addEventListener("pointerup", up)
    canvas.addEventListener("pointercancel", up)
    canvas.addEventListener("contextmenu", menu)

    resetRef.current = () => {
      home.fill(0); food.fill(0); rock.fill(0)
      foods = [
        { x: W * 0.2, y: H * 0.25, amount: 400 },
        { x: W * 0.8, y: H * 0.7, amount: 400 },
        { x: W * 0.82, y: H * 0.2, amount: 300 },
      ]
      for (const a of ants) { a.x = nest.x; a.y = nest.y; a.laden = false; a.scent = 1; a.dir = Math.random() * Math.PI * 2 }
      collectedLocal = 0
      reportedCollected = 0
      setCollected(0)
    }

    return () => {
      stopLoop()
      canvas.removeEventListener("pointerdown", down)
      canvas.removeEventListener("pointermove", move)
      canvas.removeEventListener("pointerup", up)
      canvas.removeEventListener("pointercancel", up)
      canvas.removeEventListener("contextmenu", menu)
    }
  }, [])

  // F/R/E tools · T trails · Space pause · N new colony
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return
      const k = e.key.toLowerCase()
      if (k === "f") setTool("food")
      else if (k === "r") setTool("rock")
      else if (k === "e") setTool("erase")
      else if (k === "t") setShowTrails((v) => !v)
      else if (k === "n") resetRef.current()
      else if (k === " ") { e.preventDefault(); setPaused((p) => !p) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className={styles.antContainer}>
      <header className={styles.header}>
        <h1>Ant Farm</h1>
        <p>A colony foraging by pheromone. Trails reinforce and fade — watch paths emerge. Drop food, draw rocks in the way.</p>
      </header>

      <div className={styles.stage}>
        <canvas ref={canvasRef} width={640} height={440} className={styles.canvas} style={{ touchAction: "none" }} />
      </div>

      <div className={styles.bar}>
        <span>gathered <strong>{collected}</strong></span>
        {(["food", "rock", "erase"] as const).map((t) => (
          <button key={t} data-active={tool === t || undefined} onClick={() => setTool(t)} title={t[0].toUpperCase()}>{t}</button>
        ))}
        <button data-active={showTrails || undefined} onClick={() => setShowTrails((v) => !v)} title="T">trails</button>
        <button onClick={() => setPaused((p) => !p)}>{paused ? "Play" : "Pause"}</button>
        <button onClick={() => resetRef.current()} title="N">New</button>
      </div>
    </div>
  )
}
