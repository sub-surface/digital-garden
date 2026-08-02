import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { useProgramHost } from "@/components/ui/games/ProgramHostContext"
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

interface Stats {
  notes: number
  links: number
  tags: number
  topTags: { tag: string; count: number }[]
  hub: { title: string; id: string; degree: number } | null
  orphans: number
}

export function ConstellationPage({ embedded = false }: { embedded?: boolean } = {}) {
  const programHost = useProgramHost()
  const isEmbedded = embedded || programHost.embedded
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navigate = useNavigate()
  const openNote = useCallback((slug: string) => {
    if (programHost.open) programHost.open(slug)
    else navigate({ to: `/${slug}` })
  }, [navigate, programHost])
  const [ready, setReady] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [showStats, setShowStats] = useState(!isEmbedded)
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

        // ── garden statistics ──
        const tagCounts = new Map<string, number>()
        for (const n of data.nodes) {
          for (const tg of n.tags ?? []) tagCounts.set(norm(tg), (tagCounts.get(norm(tg)) ?? 0) + 1)
        }
        const topTags = [...tagCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tag, count]) => ({ tag, count }))
        let hub: Stats["hub"] = null
        for (const s of stars.current) {
          if (!hub || s.degree > hub.degree) hub = { title: s.title, id: s.id, degree: s.degree }
        }
        const orphans = stars.current.filter((s) => s.degree === 0).length
        setStats({
          notes: data.nodes.length,
          links: data.links.length,
          tags: tagCounts.size,
          topTags,
          hub: hub && hub.degree > 0 ? hub : null,
          orphans,
        })

        setReady(true)
      })
      .catch((e) => console.warn("Constellation: graph load failed", e))
    return () => { cancelled = true }
  }, [])

  const resetView = () => { view.current = { x: 0, y: 0, zoom: 1 } }
  const zoomBy = (factor: number) => {
    view.current.zoom = Math.max(0.3, Math.min(6, view.current.zoom * factor))
  }

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

      // Resolve theme-dependent colours ONCE per frame. The canvas is transparent
      // and sits over the (theme-aware) BgCanvas, so in light mode the previously
      // hardcoded white stars/lines/labels vanished. Reading these per-element
      // inside the loops below also forced a style recalc every iteration — a
      // measurable reflow on large graphs. Once per frame keeps them live when
      // the user toggles theme/accent (the effect doesn't re-run on theme change).
      const isLight = document.documentElement.getAttribute("data-theme") === "light"
      const accentCol = getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").trim() || "#b4424c"
      const lineCol = isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.06)"
      const labelBaseCol = isLight ? "rgba(0,0,0,0.80)" : "rgba(255,255,255,0.82)"
      const labelHovCol = isLight ? "#000" : "#fff"
      const starLightness = isLight ? 45 : 72

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
        ctx.strokeStyle = isLit ? accentCol : lineCol
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
        const col = isLit ? accentCol : `hsl(${s.hue} 45% ${starLightness}%)`
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

        // Labels: always for the hovered star + its neighbours; and once zoomed
        // in past a threshold, reveal labels for every star (brighter for bigger
        // / more-connected stars, fading in as you zoom further).
        const zoomReveal = v.zoom >= 1.6
        const showLabel = isHov || (hov && isLit) || zoomReveal
        if (showLabel) {
          let alpha: number
          if (isHov) alpha = 0.95
          else if (hov && isLit) alpha = 0.5
          else {
            // fade in between zoom 1.6 and 2.4, weighted by degree so hubs show first
            const z = Math.min(1, (v.zoom - 1.6) / 0.8)
            alpha = Math.min(0.85, z * (0.4 + Math.min(0.5, s.degree * 0.12)))
          }
          if (alpha > 0.04) {
            ctx.globalAlpha = alpha
            ctx.fillStyle = isHov ? labelHovCol : labelBaseCol
            ctx.font = `${(isHov ? 13 : 10) / v.zoom}px 'IBM Plex Mono', monospace`
            ctx.textAlign = "center"
            ctx.fillText(s.title, p.x, p.y - r - 6 / v.zoom)
          }
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
          openNote(hit.id)
        }
      }
      dragging = false
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = view.current
      const rect = canvas.getBoundingClientRect()
      // cursor position relative to the transform origin (canvas centre + pan)
      const cxp = e.clientX - rect.left - rect.width / 2 - v.x
      const cyp = e.clientY - rect.top - rect.height / 2 - v.y
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const nz = Math.max(0.3, Math.min(6, v.zoom * factor))
      const ratio = nz / v.zoom
      // keep the point under the cursor fixed while zooming
      v.x -= cxp * (ratio - 1)
      v.y -= cyp * (ratio - 1)
      v.zoom = nz
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
  }, [ready, openNote, embedded])

  return (
    <div
      className={`${styles.constellationContainer} ${isEmbedded ? styles.embedded : ""}`}
      data-fullbleed={!isEmbedded || undefined}
    >
      {!isEmbedded && (
        <header className={styles.header}>
          <h1>Constellation</h1>
          <p>The garden as a night sky. Drift through it — each star a note, each line a link. Click a star to travel there.</p>
        </header>
      )}
      <div className={styles.sky}>
        <canvas ref={canvasRef} className={styles.canvas} />
        {hovered && <div className={styles.hint}>{stars.current.find((s) => s.id === hovered)?.title}</div>}

        {/* Stats panel */}
        {stats && showStats && (
          <div className={styles.statsPanel}>
            <button className={styles.statsClose} onClick={() => setShowStats(false)} aria-label="Hide stats">×</button>
            <div className={styles.statsGrid}>
              <div className={styles.stat}><strong>{stats.notes}</strong><span>notes</span></div>
              <div className={styles.stat}><strong>{stats.links}</strong><span>links</span></div>
              <div className={styles.stat}><strong>{stats.tags}</strong><span>tags</span></div>
              <div className={styles.stat}><strong>{stats.orphans}</strong><span>orphans</span></div>
            </div>
            {stats.hub && (
              <button className={styles.hubLink} onClick={() => openNote(stats.hub!.id)}>
                ★ most-linked: <em>{stats.hub.title}</em> ({stats.hub.degree})
              </button>
            )}
            {stats.topTags.length > 0 && (
              <div className={styles.tagRow}>
                {stats.topTags.map((t) => (
                  <a key={t.tag} href={`/tags/${t.tag}`} className={styles.tagChip}>{t.tag} <span>{t.count}</span></a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tools */}
        <div className={styles.tools}>
          <button onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in">+</button>
          <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out">−</button>
          <button onClick={resetView} aria-label="Reset view" title="Reset view">⌖</button>
          {!showStats && <button onClick={() => setShowStats(true)} aria-label="Show stats" title="Show stats">ℹ</button>}
        </div>
      </div>
    </div>
  )
}
