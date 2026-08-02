import { useCallback, useEffect, useRef, useState } from "react"
import { GameCabinet, type CabinetStatus } from "./GameCabinet"
import { hashStr, mulberry32 } from "@/lib/sigil"
import styles from "./ColliderPage.module.scss"

/**
 * COLLIDER — the bubble-chamber as a toy (ROADMAP §16). Fire particle tracks
 * from an emitter through an invisible flow field to hit specimen targets.
 * Same advection maths as the `chamber` background, but over a *seeded* lattice
 * field so every plate is reproducible: aim is skill, the field is the puzzle.
 */

type Pt = { x: number; y: number }
interface Target { x: number; y: number; r: number; glyph: string; hit: boolean }
interface Track { pts: Pt[]; born: number; polarity: 1 | -1 }

const TARGET_GLYPHS = "⊕⊗⊙∮∇"
const STEPS = 160
const STEP_LEN = 7
const SHOTS_PER_PLATE = 8

/** Seeded lattice flow field: hashed angles at grid points, bilinearly
 * interpolated — deterministic per plate seed, no global noise state. */
function makeField(seed: string, turbulence: number) {
  const rnd = mulberry32(hashStr(seed))
  const N = 12
  const grid = Array.from({ length: N * N }, () => rnd() * Math.PI * 2)
  return (x: number, y: number, w: number, h: number): number => {
    const gx = Math.min(N - 1.001, Math.max(0, (x / w) * (N - 1)))
    const gy = Math.min(N - 1.001, Math.max(0, (y / h) * (N - 1)))
    const x0 = gx | 0, y0 = gy | 0
    const fx = gx - x0, fy = gy - y0
    // interpolate angles via their vectors so wrap-around doesn't glitch
    let vx = 0, vy = 0
    for (const [dx, dy, wgt] of [
      [0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)],
      [0, 1, (1 - fx) * fy], [1, 1, fx * fy],
    ] as const) {
      const a = grid[(y0 + dy) * N + (x0 + dx)]
      vx += Math.cos(a) * wgt; vy += Math.sin(a) * wgt
    }
    return Math.atan2(vy, vx) * turbulence
  }
}

export function ColliderPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [level, setLevel] = useState(1)
  const [plateNum, setPlateNum] = useState(0) // bump to reroll a plate
  const [shots, setShots] = useState(SHOTS_PER_PLATE)
  const [polarity, setPolarity] = useState<1 | -1>(1)
  const [status, setStatus] = useState<CabinetStatus>("playing")
  const [cleared, setCleared] = useState(0) // plates cleared this run (score)
  const [hits, setHits] = useState(0)
  const targetTotal = Math.min(5, 2 + level)

  const seed = `collider-${level}-${plateNum}`
  const stateRef = useRef<{
    field: (x: number, y: number, w: number, h: number) => number
    targets: Target[]
    tracks: Track[]
    aim: number
    raf: number
  }>({ field: () => 0, targets: [], tracks: [], aim: 0, raf: 0 })

  // Build the plate: field + targets, reset shots
  useEffect(() => {
    const s = stateRef.current
    const rnd = mulberry32(hashStr(seed + ":targets"))
    const turbulence = 0.8 + level * 0.25
    s.field = makeField(seed, turbulence)
    s.targets = Array.from({ length: Math.min(5, 2 + level) }, (_, i) => ({
      x: 0.45 + rnd() * 0.5,   // fractions of canvas, resolved at draw time
      y: 0.12 + rnd() * 0.76,
      r: 0.055 - level * 0.004,
      glyph: TARGET_GLYPHS[i % TARGET_GLYPHS.length],
      hit: false,
    }))
    s.tracks = []
    setShots(SHOTS_PER_PLATE)
    setHits(0)
    setStatus("playing")
  }, [seed, level])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const w = canvas.clientWidth, h = canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const css = (p: string) => getComputedStyle(document.documentElement).getPropertyValue(p).trim()
    const pen = css("--color-primary") || "#b4424c"
    const accent = css("--color-secondary") || "#424cb4"
    const muted = css("--color-text-muted") || "#8e8e93"
    const faint = css("--color-border") || "#2a2a30"
    const s = stateRef.current
    const now = performance.now()

    // frame + faint field hint (sparse direction dashes — enough to read the
    // currents without giving the whole answer away)
    ctx.strokeStyle = faint
    ctx.lineWidth = 1
    ctx.strokeRect(4.5, 4.5, w - 9, h - 9)
    ctx.globalAlpha = 0.18
    ctx.beginPath()
    for (let gx = 0.08; gx < 1; gx += 0.09) for (let gy = 0.1; gy < 1; gy += 0.12) {
      const a = s.field(gx * w, gy * h, w, h)
      ctx.moveTo(gx * w, gy * h)
      ctx.lineTo(gx * w + Math.cos(a) * 7, gy * h + Math.sin(a) * 7)
    }
    ctx.stroke()
    ctx.globalAlpha = 1

    // emitter
    const ex = w * 0.06, ey = h / 2
    ctx.strokeStyle = pen
    ctx.beginPath()
    ctx.arc(ex, ey, 7, 0, Math.PI * 2)
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex + Math.cos(s.aim) * 16, ey + Math.sin(s.aim) * 16)
    ctx.stroke()

    // targets
    ctx.font = "12px 'IBM Plex Mono', monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (const t of s.targets) {
      const tx = t.x * w, ty = t.y * h
      const trPx = Math.max(14, t.r * w)
      ctx.strokeStyle = t.hit ? accent : muted
      ctx.globalAlpha = t.hit ? 0.9 : 0.5
      ctx.beginPath(); ctx.arc(tx, ty, trPx, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(tx, ty, trPx * 0.55, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = t.hit ? accent : muted
      ctx.fillText(t.glyph, tx, ty)
    }
    ctx.globalAlpha = 1

    // tracks: reveal head-to-tail over ~700ms, then linger stippled
    let animating = false
    for (const tr of s.tracks) {
      const age = (now - tr.born) / 700
      const upTo = Math.min(tr.pts.length - 1, Math.floor(age * tr.pts.length))
      if (upTo < tr.pts.length - 1) animating = true
      ctx.fillStyle = tr.polarity === 1 ? pen : accent
      ctx.globalAlpha = Math.max(0.15, 0.7 - age * 0.06)
      for (let i = 0; i <= upTo; i += 2) {
        const p = tr.pts[i]
        const sz = 1 + (i / tr.pts.length) * 1.2
        ctx.fillRect(p.x, p.y, sz, sz)
      }
    }
    ctx.globalAlpha = 1
    if (animating) s.raf = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    const state = stateRef.current
    draw()
    const ro = new ResizeObserver(draw)
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => { ro.disconnect(); cancelAnimationFrame(state.raf) }
  }, [draw, seed])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const ex = rect.width * 0.06, ey = rect.height / 2
    stateRef.current.aim = Math.atan2(e.clientY - rect.top - ey, e.clientX - rect.left - ex)
    draw()
  }, [draw])

  const fire = useCallback(() => {
    if (status !== "playing" || shots <= 0) return
    const canvas = canvasRef.current!
    const w = canvas.clientWidth, h = canvas.clientHeight
    const s = stateRef.current

    // integrate: steer toward the field + constant polarity curl (chamber maths)
    let x = w * 0.06, y = h / 2, ang = s.aim
    const pts: Pt[] = [{ x, y }]
    for (let i = 0; i < STEPS; i++) {
      const fa = s.field(x, y, w, h)
      ang += Math.sin(fa - ang) * 0.22 + polarity * 0.045
      x += Math.cos(ang) * STEP_LEN
      y += Math.sin(ang) * STEP_LEN
      if (x < 0 || x > w || y < 0 || y > h) break
      pts.push({ x, y })
      // hit test along the path
      for (const t of s.targets) {
        if (t.hit) continue
        const trPx = Math.max(14, t.r * w)
        if (Math.hypot(x - t.x * w, y - t.y * h) < trPx) t.hit = true
      }
    }
    s.tracks.push({ pts, born: performance.now(), polarity })
    if (s.tracks.length > 12) s.tracks.shift()

    const remaining = shots - 1
    setShots(remaining)
    setHits(s.targets.filter(t => t.hit).length)
    const allHit = s.targets.every(t => t.hit)
    if (allHit) {
      setCleared(c => c + 1)
      setStatus("won")
    } else if (remaining <= 0) {
      setStatus("lost")
    }
    cancelAnimationFrame(s.raf)
    s.raf = requestAnimationFrame(draw)
  }, [status, shots, polarity, draw])

  const nextPlate = useCallback(() => {
    if (status === "won") setLevel(l => Math.min(6, l + 1))
    else setCleared(0) // run over — streak resets
    setPlateNum(n => n + 1)
  }, [status])

  return (
    <GameCabinet
      title="COLLIDER"
      blurb="Fire particle tracks through an invisible flow field to strike every specimen target. The dashes hint at the currents; polarity flips your curl."
      status={status}
      onStart={status !== "playing" ? nextPlate : undefined}
      endMessage={status === "won" ? "plate cleared — field deepens" : "shots exhausted — streak reset"}
      score={{ value: cleared, bestKey: "collider.best", label: "plates" }}
      hint="aim with the pointer · click to fire · ± flips curl"
      zen
      controls={
        <div className={styles.controls}>
          <button onClick={() => setPolarity(p => (p === 1 ? -1 : 1))} title="flip track curl">
            polarity {polarity === 1 ? "+" : "−"}
          </button>
          <button onClick={() => setPlateNum(n => n + 1)}>new plate</button>
          <span className={styles.readout}>shots {shots} · targets {hits}/{targetTotal} · field {level}</span>
        </div>
      }
    >
      <canvas
        ref={canvasRef}
        className={styles.chamber}
        onPointerMove={onPointerMove}
        onPointerDown={fire}
      />
    </GameCabinet>
  )
}
