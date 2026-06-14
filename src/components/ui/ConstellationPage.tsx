import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import styles from "./ConstellationPage.module.scss"

/**
 * Living Constellation — the note-graph as a slowly drifting star map.
 *
 * Stars are notes (sized by connection count, tinted by their dominant tag);
 * links are faint constellation lines. The whole sky breathes and twinkles even
 * when idle. Hover a star to light its constellation; click to travel to the
 * note. Drag to pan, scroll to zoom. Contemplative cousin of /graph.
 */

interface RawNode { id: string; title: string; tags?: string[] }
interface RawLink { source: string; target: string }
interface GraphData { nodes: RawNode[]; links: RawLink[] }

interface Star {
  id: string
  title: string
  tag: string
  x: number; y: number      // home position (graph space)
  r: number                 // radius
  twinkle: number           // phase offset
  degree: number
  hue: number
}

// A small palette across the spectrum; tags map to a stable hue.
function hueForTag(tag: string): number {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % 360
  return h
}

const norm = (t: string) => t.toLowerCase()

export function ConstellationPage({ embedded = false }: { embedded?: boolean } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const hoveredRef = useRef<string | null>(null)
  hoveredRef.current = hovered

  const view = useRef({ x: 0, y: 0, zoom: 1 })
  const stars = useRef<Star[]>([])
  const adj = useRef<Map<string, Set<string>>>(new Map())
  const links = useRef<RawLink[]>([])

  useEffect(() => {
    let cancelled = false
    fetch("/graph.json")
      .then((r) => r.json())
      .then((data: GraphData) => {
        if (cancelled) return
        const degree = new Map<string, number>()
        const adjacency = new Map<string, Set<string>>()
        for (const l of data.links) {
          degree.set(l.source, (degree.get(l.source) ?? 0) + 1)
          degree.set(l.target, (degree.get(l.target) ?? 0) + 1)
          if (!adjacency.has(l.source)) adjacency.set(l.source, new Set())
          if (!adjacency.has(l.target)) adjacency.set(l.target, new Set())
          adjacency.get(l.source)!.add(l.target)
          adjacency.get(l.target)!.add(l.source)
        }
        adj.current = adjacency
        links.current = data.links

        // Lay out stars in loose tag-clusters arranged around a circle, then
        // jitter — gives constellations a sense of region without a heavy sim.
        const tagList = Array.from(
          new Set(data.nodes.flatMap((n) => (n.tags ?? []).map(norm)).concat(["·"]))
        )
        const tagAngle = new Map<string, number>()
        tagList.forEach((t, i) => tagAngle.set(t, (i / tagList.length) * Math.PI * 2))

        const R = 1100
        stars.current = data.nodes.map((n) => {
          const tag = (n.tags && n.tags[0] ? norm(n.tags[0]) : "·")
          const baseAng = tagAngle.get(tag) ?? 0
          const ang = baseAng + (Math.random() - 0.5) * 0.9
          const rad = R * (0.25 + Math.random() * 0.75)
          const deg = degree.get(n.id) ?? 0
          return {
            id: n.id,
            title: n.title,
            tag,
            x: Math.cos(ang) * rad + (Math.random() - 0.5) * 120,
            y: Math.sin(ang) * rad + (Math.random() - 0.5) * 120,
            r: 1.6 + Math.min(6, deg * 0.9),
            twinkle: Math.random() * Math.PI * 2,
            degree: deg,
            hue: hueForTag(tag),
          }
        })
        setReady(true)
      })
      .catch((e) => console.warn("Constellation: graph load failed", e))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const starById = new Map(stars.current.map((s) => [s.id, s]))
    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").trim() || "#b4424c"

    let raf = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      const W = canvas.width / dpr
      const H = canvas.height / dpr
      const v = view.current
      // gentle global drift (the sky slowly turns)
      const rot = t * 0.000012
      const cos = Math.cos(rot), sin = Math.sin(rot)

      ctx.clearRect(0, 0, W, H)
      ctx.save()
      ctx.translate(W / 2 + v.x, H / 2 + v.y)
      ctx.scale(v.zoom, v.zoom)

      const hov = hoveredRef.current
      const lit = hov ? adj.current.get(hov) ?? new Set<string>() : null

      const place = (s: Star) => ({ x: s.x * cos - s.y * sin, y: s.x * sin + s.y * cos })

      // constellation lines
      ctx.lineWidth = 0.6 / v.zoom
      for (const l of links.current) {
        const a = starById.get(l.source), b = starById.get(l.target)
        if (!a || !b) continue
        const pa = place(a), pb = place(b)
        const isLit = hov && (l.source === hov || l.target === hov)
        ctx.strokeStyle = isLit ? accent() : "rgba(255,255,255,0.06)"
        ctx.globalAlpha = isLit ? 0.5 : 0.5
        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.lineTo(pb.x, pb.y)
        ctx.stroke()
      }

      // stars
      for (const s of stars.current) {
        const p = place(s)
        const tw = 0.6 + 0.4 * Math.sin(t * 0.002 + s.twinkle)
        const isHov = s.id === hov
        const isLit = lit?.has(s.id) || isHov
        const r = s.r * (isHov ? 1.8 : 1) * (0.85 + tw * 0.25)

        // glow
        ctx.globalAlpha = (isLit ? 0.9 : 0.5) * tw
        const col = isLit ? accent() : `hsl(${s.hue} 45% 72%)`
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fill()

        if (isLit) {
          ctx.globalAlpha = 0.18
          ctx.beginPath()
          ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2)
          ctx.fill()
        }

        // label for hovered (and its neighbours faintly)
        if (isHov || (hov && isLit)) {
          ctx.globalAlpha = isHov ? 0.95 : 0.5
          ctx.fillStyle = isHov ? "#fff" : "rgba(255,255,255,0.7)"
          ctx.font = `${(isHov ? 13 : 11) / v.zoom}px 'IBM Plex Mono', monospace`
          ctx.textAlign = "center"
          ctx.fillText(s.title, p.x, p.y - r - 6 / v.zoom)
        }
      }

      ctx.restore()
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(draw)

    // ── interaction ──
    let dragging = false
    let moved = false
    let lastX = 0, lastY = 0

    const toGraph = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const W = rect.width, H = rect.height
      const v = view.current
      // inverse of translate+scale (rotation handled per-star, so approximate
      // hit-testing un-rotates using current rot at call time below)
      return {
        sx: (clientX - rect.left - W / 2 - v.x) / v.zoom,
        sy: (clientY - rect.top - H / 2 - v.y) / v.zoom,
      }
    }

    const hitTest = (clientX: number, clientY: number): Star | null => {
      const { sx, sy } = toGraph(clientX, clientY)
      const rot = performance.now() * 0.000012
      const cos = Math.cos(rot), sin = Math.sin(rot)
      let best: Star | null = null
      let bestD = 14 / view.current.zoom
      for (const s of stars.current) {
        const x = s.x * cos - s.y * sin
        const y = s.x * sin + s.y * cos
        const d = Math.hypot(x - sx, y - sy)
        if (d < Math.max(bestD, s.r + 6)) { bestD = d; best = s }
      }
      return best
    }

    const onDown = (e: PointerEvent) => {
      dragging = true; moved = false
      lastX = e.clientX; lastY = e.clientY
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY
        if (Math.hypot(dx, dy) > 3) moved = true
        view.current.x += dx
        view.current.y += dy
        lastX = e.clientX; lastY = e.clientY
      } else {
        const hit = hitTest(e.clientX, e.clientY)
        setHovered(hit?.id ?? null)
        canvas.style.cursor = hit ? "pointer" : "grab"
      }
    }
    const onUp = (e: PointerEvent) => {
      if (dragging && !moved) {
        const hit = hitTest(e.clientX, e.clientY)
        if (hit) {
          // close the Knowledge Map overlay if we're inside it, then travel
          if (embedded) useStore.getState().setGraphOpen(false)
          navigate({ to: `/${hit.id}` })
        }
      }
      dragging = false
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      view.current.zoom = Math.max(0.3, Math.min(3, view.current.zoom * factor))
    }

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("wheel", onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("wheel", onWheel)
    }
  }, [ready, navigate, embedded])

  return (
    <div className={`${styles.constellationContainer} ${embedded ? styles.embedded : ""}`}>
      {!embedded && (
        <header className={styles.header}>
          <h1>Constellation</h1>
          <p>The garden as a night sky. Drift through it — each star a note, each line a link. Click a star to travel there.</p>
        </header>
      )}
      <div className={styles.sky}>
        <canvas ref={canvasRef} className={styles.canvas} />
        {hovered && <div className={styles.hint}>{stars.current.find((s) => s.id === hovered)?.title}</div>}
      </div>
    </div>
  )
}
