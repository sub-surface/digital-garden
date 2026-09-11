import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import * as d3 from "d3"
import { useStore } from "@/store"
import { useProgramHost } from "@/components/ui/games/ProgramHostContext"
import styles from "./ConstellationPage.module.scss"

/**
 * Living Constellation — Obsidian-style physics graph synthesized with celestial fidelity.
 *
 * Stars are notes sized by degree and tinted by tag/folder clustering.
 * Interactive D3 force simulation:
 * - Real-time click-and-drag physics with spring-back equilibrium.
 * - Dynamic collision bounds preventing node overlap.
 * - Organic cluster formation by tag/folder lineages.
 * - Depth-aware edge highlighting (1-hop and 2-hop neighborhood illumination).
 * - Gentle celestial breathing drift and individual star twinkling.
 * - Anchor-centered zoom and inertial viewport panning.
 */

interface RawNode {
  id: string
  title: string
  tags?: string[]
}

interface RawLink {
  source: string
  target: string
}

interface GraphData {
  nodes: RawNode[]
  links: RawLink[]
}

interface StarNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  tag: string
  clusterKey: string
  clusterTargetX: number
  clusterTargetY: number
  r: number
  twinkle: number
  degree: number
  hue: number
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface StarLink extends d3.SimulationLinkDatum<StarNode> {
  source: StarNode | string
  target: StarNode | string
}

function hueForTag(tag: string): number {
  let h = 0
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) % 360
  }
  return h
}

const norm = (t: string) => t.toLowerCase().trim()

function getClusterKey(node: RawNode): string {
  if (node.tags && node.tags.length > 0 && node.tags[0].trim()) {
    return norm(node.tags[0])
  }
  const parts = node.id.split("/")
  if (parts.length > 1) {
    if (parts[0].toLowerCase() === "wiki" && parts.length > 2) {
      return `wiki/${parts[1].toLowerCase()}`
    }
    return parts[0].toLowerCase()
  }
  return "general"
}

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

  const openNote = useCallback(
    (slug: string) => {
      if (programHost.open) programHost.open(slug)
      else navigate({ to: `/${slug}` })
    },
    [navigate, programHost]
  )

  const [ready, setReady] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [activeFilterTag, setActiveFilterTag] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [showStats, setShowStats] = useState(!isEmbedded)

  const hoveredRef = useRef<string | null>(null)
  hoveredRef.current = hovered

  const filterTagRef = useRef<string | null>(null)
  filterTagRef.current = activeFilterTag

  const view = useRef({ x: 0, y: 0, zoom: 1 })
  const starsRef = useRef<StarNode[]>([])
  const linksRef = useRef<StarLink[]>([])
  const adj1Ref = useRef<Map<string, Set<string>>>(new Map())
  const adj2Ref = useRef<Map<string, Set<string>>>(new Map())
  const simRef = useRef<d3.Simulation<StarNode, StarLink> | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch("/graph.json")
      .then((r) => r.json())
      .then((data: GraphData) => {
        if (cancelled) return

        const degreeMap = new Map<string, number>()
        const adj1 = new Map<string, Set<string>>()

        for (const l of data.links) {
          degreeMap.set(l.source, (degreeMap.get(l.source) ?? 0) + 1)
          degreeMap.set(l.target, (degreeMap.get(l.target) ?? 0) + 1)

          if (!adj1.has(l.source)) adj1.set(l.source, new Set())
          if (!adj1.has(l.target)) adj1.set(l.target, new Set())
          adj1.get(l.source)!.add(l.target)
          adj1.get(l.target)!.add(l.source)
        }

        // Compute 2-hop neighborhood map for depth-aware illumination
        const adj2 = new Map<string, Set<string>>()
        for (const [nodeId, neighbors] of adj1.entries()) {
          const hop2Set = new Set<string>()
          for (const n1 of neighbors) {
            const n2s = adj1.get(n1)
            if (n2s) {
              for (const n2 of n2s) {
                if (n2 !== nodeId && !neighbors.has(n2)) {
                  hop2Set.add(n2)
                }
              }
            }
          }
          adj2.set(nodeId, hop2Set)
        }

        adj1Ref.current = adj1
        adj2Ref.current = adj2

        // Cluster targets: organize clusters along a celestial circle
        const clusterSet = new Set<string>()
        for (const n of data.nodes) {
          clusterSet.add(getClusterKey(n))
        }
        const clusterList = Array.from(clusterSet)
        const clusterCenters = new Map<string, { x: number; y: number }>()
        const clusterRadius = 600

        clusterList.forEach((key, idx) => {
          const angle = (idx / clusterList.length) * Math.PI * 2
          clusterCenters.set(key, {
            x: Math.cos(angle) * clusterRadius,
            y: Math.sin(angle) * clusterRadius,
          })
        })

        const starsList: StarNode[] = data.nodes.map((n) => {
          const clusterKey = getClusterKey(n)
          const center = clusterCenters.get(clusterKey) ?? { x: 0, y: 0 }
          const deg = degreeMap.get(n.id) ?? 0
          const tag = n.tags && n.tags[0] ? norm(n.tags[0]) : clusterKey

          // Initial position seeded near cluster center with jitter
          const jitterRadius = 120 + Math.random() * 180
          const jitterAngle = Math.random() * Math.PI * 2

          return {
            id: n.id,
            title: n.title || n.id.split("/").pop() || n.id,
            tag,
            clusterKey,
            clusterTargetX: center.x,
            clusterTargetY: center.y,
            r: 2.2 + Math.min(8, Math.sqrt(deg) * 2.2),
            twinkle: Math.random() * Math.PI * 2,
            degree: deg,
            hue: hueForTag(tag),
            x: center.x + Math.cos(jitterAngle) * jitterRadius,
            y: center.y + Math.sin(jitterAngle) * jitterRadius,
          }
        })

        // Clone links for simulation
        const linksList: StarLink[] = data.links.map((l) => ({
          source: l.source,
          target: l.target,
        }))

        // Setup D3 Force Simulation
        const simulation = d3
          .forceSimulation<StarNode>(starsList)
          .force(
            "link",
            d3
              .forceLink<StarNode, StarLink>(linksList)
              .id((d) => d.id)
              .distance((l) => {
                const sDeg = (l.source as StarNode).degree ?? 1
                const tDeg = (l.target as StarNode).degree ?? 1
                return 45 + Math.min(65, Math.sqrt(sDeg + tDeg) * 7)
              })
              .strength(0.35)
          )
          .force(
            "charge",
            d3
              .forceManyBody<StarNode>()
              .strength((d) => -60 - d.degree * 10)
              .distanceMax(550)
          )
          .force(
            "collide",
            d3
              .forceCollide<StarNode>()
              .radius((d) => d.r + 8)
              .iterations(2)
          )
          .force(
            "clusterX",
            d3.forceX<StarNode>((d) => d.clusterTargetX).strength(0.04)
          )
          .force(
            "clusterY",
            d3.forceY<StarNode>((d) => d.clusterTargetY).strength(0.04)
          )
          .force("center", d3.forceCenter(0, 0).strength(0.02))
          .alphaDecay(0.02)
          .velocityDecay(0.35)

        // Warm up simulation slightly so it arrives already organized
        for (let i = 0; i < 35; i++) {
          simulation.tick()
        }

        simRef.current = simulation
        starsRef.current = starsList
        linksRef.current = linksList

        // Garden statistics
        const tagCounts = new Map<string, number>()
        for (const n of data.nodes) {
          for (const tg of n.tags ?? []) {
            const t = norm(tg)
            tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
          }
        }

        const topTags = [...tagCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([t, count]) => ({ tag: t, count }))

        let hub: Stats["hub"] = null
        for (const s of starsList) {
          if (!hub || s.degree > hub.degree) {
            hub = { title: s.title, id: s.id, degree: s.degree }
          }
        }

        const orphans = starsList.filter((s) => s.degree === 0).length

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

    return () => {
      cancelled = true
      if (simRef.current) {
        simRef.current.stop()
        simRef.current = null
      }
    }
  }, [])

  const resetView = () => {
    view.current = { x: 0, y: 0, zoom: 1 }
    if (simRef.current) {
      simRef.current.alpha(0.3).restart()
    }
  }

  const zoomBy = (factor: number) => {
    view.current.zoom = Math.max(0.25, Math.min(6, view.current.zoom * factor))
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

    const resizeObserver = new ResizeObserver(() => {
      resize()
    })
    resizeObserver.observe(canvas)

    let raf = 0

    // Render loop
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)

      const W = canvas.width / dpr
      const H = canvas.height / dpr
      const v = view.current

      ctx.clearRect(0, 0, W, H)

      // Theme-dependent colors resolved once per frame
      const isLight = document.documentElement.getAttribute("data-theme") === "light"
      const accentCol =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-accent-base")
          .trim() || "#b4424c"
      const lineBaseCol = isLight ? "rgba(0, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.08)"
      const labelBaseCol = isLight ? "rgba(0, 0, 0, 0.78)" : "rgba(255, 255, 255, 0.82)"
      const labelHovCol = isLight ? "#000000" : "#ffffff"
      const starLightness = isLight ? 42 : 72

      ctx.save()
      ctx.translate(W / 2 + v.x, H / 2 + v.y)
      ctx.scale(v.zoom, v.zoom)

      const hov = hoveredRef.current
      const filterTag = filterTagRef.current
      const hop1Set = hov ? adj1Ref.current.get(hov) ?? new Set<string>() : null
      const hop2Set = hov ? adj2Ref.current.get(hov) ?? new Set<string>() : null

      // Draw constellation edges with depth-aware lighting
      const links = linksRef.current
      for (let i = 0; i < links.length; i++) {
        const l = links[i]
        const a = l.source as StarNode
        const b = l.target as StarNode
        if (!a || !b || a.x == null || b.x == null) continue

        const is1Hop = hov && (a.id === hov || b.id === hov)
        const is2Hop =
          hov &&
          !is1Hop &&
          ((hop1Set?.has(a.id) && hop1Set?.has(b.id)) ||
            (hop1Set?.has(a.id) && hop2Set?.has(b.id)) ||
            (hop2Set?.has(a.id) && hop1Set?.has(b.id)))

        const isTagMatch = filterTag && (a.tag === filterTag || b.tag === filterTag)

        if (hov) {
          if (is1Hop) {
            ctx.lineWidth = 1.8 / v.zoom
            ctx.strokeStyle = accentCol
            ctx.globalAlpha = 0.85
          } else if (is2Hop) {
            ctx.lineWidth = 1.0 / v.zoom
            ctx.strokeStyle = lineBaseCol
            ctx.globalAlpha = 0.35
          } else {
            ctx.lineWidth = 0.5 / v.zoom
            ctx.strokeStyle = lineBaseCol
            ctx.globalAlpha = 0.04
          }
        } else if (filterTag) {
          if (isTagMatch) {
            ctx.lineWidth = 1.4 / v.zoom
            ctx.strokeStyle = accentCol
            ctx.globalAlpha = 0.7
          } else {
            ctx.lineWidth = 0.5 / v.zoom
            ctx.strokeStyle = lineBaseCol
            ctx.globalAlpha = 0.04
          }
        } else {
          ctx.lineWidth = 0.65 / v.zoom
          ctx.strokeStyle = lineBaseCol
          ctx.globalAlpha = isLight ? 0.18 : 0.13
        }

        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      // Draw stars with organic breathing & twinkling
      const stars = starsRef.current
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        if (s.x == null || s.y == null) continue

        // Celestial breathing perturbation
        const driftX = Math.sin(t * 0.0006 + s.twinkle) * 1.5
        const driftY = Math.cos(t * 0.0006 + s.twinkle) * 1.5
        const px = s.x + driftX
        const py = s.y + driftY

        const isHov = s.id === hov
        const is1Hop = hop1Set?.has(s.id) ?? false
        const is2Hop = hop2Set?.has(s.id) ?? false
        const isTagMatch = filterTag ? s.tag === filterTag : false

        const tw = 0.7 + 0.3 * Math.sin(t * 0.0025 + s.twinkle)
        let alpha = tw
        let r = s.r

        if (hov) {
          if (isHov) {
            r *= 1.8
            alpha = 1
          } else if (is1Hop) {
            r *= 1.3
            alpha = 0.85
          } else if (is2Hop) {
            r *= 1.1
            alpha = 0.5
          } else {
            alpha = 0.18
          }
        } else if (filterTag) {
          if (isTagMatch) {
            r *= 1.4
            alpha = 0.95
          } else {
            alpha = 0.15
          }
        }

        // Halos
        if (isHov) {
          // Multi-layer nebula aura for active node
          ctx.globalAlpha = 0.12
          ctx.fillStyle = accentCol
          ctx.beginPath()
          ctx.arc(px, py, r * 4.5, 0, Math.PI * 2)
          ctx.fill()

          ctx.globalAlpha = 0.28
          ctx.beginPath()
          ctx.arc(px, py, r * 2.5, 0, Math.PI * 2)
          ctx.fill()
        } else if (is1Hop || (filterTag && isTagMatch)) {
          ctx.globalAlpha = 0.2
          ctx.fillStyle = is1Hop ? accentCol : `hsl(${s.hue} 65% ${starLightness}%)`
          ctx.beginPath()
          ctx.arc(px, py, r * 2.2, 0, Math.PI * 2)
          ctx.fill()
        }

        // Core star
        ctx.globalAlpha = alpha
        ctx.fillStyle =
          isHov || is1Hop
            ? accentCol
            : `hsl(${s.hue} 55% ${starLightness}%)`

        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()

        // Labels: active star, 1-hop neighbors, tag matches, or progressive zoom reveal
        const zoomReveal = v.zoom >= 1.5
        const showLabel =
          isHov ||
          is1Hop ||
          (filterTag && isTagMatch) ||
          (zoomReveal && s.degree >= 3) ||
          v.zoom >= 2.6

        if (showLabel) {
          let labelAlpha = 0.85
          if (isHov) {
            labelAlpha = 1
          } else if (is1Hop || (filterTag && isTagMatch)) {
            labelAlpha = 0.8
          } else if (hov || filterTag) {
            labelAlpha = 0.25
          } else {
            // Fade in smoothly as zoom increases
            const zFactor = Math.min(1, (v.zoom - 1.5) / 1.1)
            labelAlpha = Math.min(0.8, zFactor * (0.35 + Math.min(0.45, s.degree * 0.1)))
          }

          if (labelAlpha > 0.05) {
            ctx.globalAlpha = labelAlpha
            ctx.fillStyle = isHov ? labelHovCol : labelBaseCol
            const fontSize = (isHov ? 12 : 9.5) / v.zoom
            ctx.font = `${isHov ? "600 " : ""}${fontSize}px 'IBM Plex Mono', monospace`
            ctx.textAlign = "center"

            // Text background pill for active star
            if (isHov) {
              const metrics = ctx.measureText(s.title)
              const textWidth = metrics.width
              const pillH = fontSize * 1.5
              const pillW = textWidth + fontSize * 1.2
              const pillX = px - pillW / 2
              const pillY = py - r - pillH - 4 / v.zoom

              ctx.save()
              ctx.globalAlpha = 0.88
              ctx.fillStyle = isLight ? "#ffffff" : "#141418"
              ctx.strokeStyle = accentCol
              ctx.lineWidth = 1 / v.zoom
              ctx.beginPath()
              ctx.roundRect(pillX, pillY, pillW, pillH, 4 / v.zoom)
              ctx.fill()
              ctx.stroke()
              ctx.restore()

              ctx.globalAlpha = 1
              ctx.fillStyle = isHov ? labelHovCol : labelBaseCol
              ctx.fillText(s.title, px, pillY + pillH * 0.72)
            } else {
              ctx.fillText(s.title, px, py - r - 5 / v.zoom)
            }
          }
        }
      }

      ctx.restore()
      ctx.globalAlpha = 1
    }

    raf = requestAnimationFrame(draw)

    // Interaction mechanics: Obsidian-like dragging physics + pan & zoom
    let dragTarget: StarNode | null = null
    let isPanning = false
    let hasDragged = false
    let startX = 0
    let startY = 0
    let lastX = 0
    let lastY = 0

    const toGraph = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const W = rect.width
      const H = rect.height
      const v = view.current
      return {
        sx: (clientX - rect.left - W / 2 - v.x) / v.zoom,
        sy: (clientY - rect.top - H / 2 - v.y) / v.zoom,
      }
    }

    const hitTest = (clientX: number, clientY: number): StarNode | null => {
      const { sx, sy } = toGraph(clientX, clientY)
      let best: StarNode | null = null
      let bestDist = 16 / view.current.zoom
      const stars = starsRef.current

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        const d = Math.hypot(s.x - sx, s.y - sy)
        const hitR = Math.max(bestDist, s.r + 8 / view.current.zoom)
        if (d <= hitR && (!best || d < bestDist)) {
          best = s
          bestDist = d
        }
      }
      return best
    }

    const onPointerDown = (e: PointerEvent) => {
      startX = e.clientX
      startY = e.clientY
      lastX = e.clientX
      lastY = e.clientY
      hasDragged = false

      canvas.setPointerCapture(e.pointerId)

      const hit = hitTest(e.clientX, e.clientY)
      if (hit) {
        dragTarget = hit
        hit.fx = hit.x
        hit.fy = hit.y

        // Wake simulation for dynamic interaction
        if (simRef.current) {
          simRef.current.alphaTarget(0.25).restart()
        }
        canvas.style.cursor = "grabbing"
      } else {
        isPanning = true
        canvas.style.cursor = "grabbing"
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (dragTarget) {
        const { sx, sy } = toGraph(e.clientX, e.clientY)
        dragTarget.fx = sx
        dragTarget.fy = sy

        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
          hasDragged = true
        }
      } else if (isPanning) {
        const dx = e.clientX - lastX
        const dy = e.clientY - lastY

        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 3) {
          hasDragged = true
        }

        view.current.x += dx
        view.current.y += dy
        lastX = e.clientX
        lastY = e.clientY
      } else {
        const hit = hitTest(e.clientX, e.clientY)
        const newHovId = hit?.id ?? null
        if (newHovId !== hoveredRef.current) {
          hoveredRef.current = newHovId
          setHovered(newHovId)
        }
        canvas.style.cursor = hit ? "pointer" : "grab"
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        // Pointer capture may have already been released
      }

      if (dragTarget) {
        if (!hasDragged) {
          // Direct click: navigate to note
          if (embedded) useStore.getState().setGraphOpen(false)
          openNote(dragTarget.id)
        }

        // Release pin so it springs back into equilibrium
        dragTarget.fx = null
        dragTarget.fy = null

        if (simRef.current) {
          simRef.current.alphaTarget(0)
        }
        dragTarget = null
      }

      isPanning = false
      canvas.style.cursor = "grab"
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = view.current
      const rect = canvas.getBoundingClientRect()
      const cxp = e.clientX - rect.left - rect.width / 2 - v.x
      const cyp = e.clientY - rect.top - rect.height / 2 - v.y

      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14
      const newZoom = Math.max(0.25, Math.min(6, v.zoom * factor))
      const ratio = newZoom / v.zoom

      v.x -= cxp * (ratio - 1)
      v.y -= cyp * (ratio - 1)
      v.zoom = newZoom
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)
    canvas.addEventListener("wheel", onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      canvas.removeEventListener("wheel", onWheel)
    }
  }, [ready, openNote, embedded])

  const toggleFilterTag = (t: string) => {
    setActiveFilterTag((prev) => (prev === t ? null : t))
  }

  return (
    <div
      className={`${styles.constellationContainer} ${isEmbedded ? styles.embedded : ""}`}
      data-fullbleed={!isEmbedded || undefined}
    >
      {!isEmbedded && (
        <header className={styles.header}>
          <h1>Constellation</h1>
          <p>
            The garden as an interactive celestial graph. Click and drag stars to test their
            tensions, scroll to zoom, or select a star to travel there.
          </p>
        </header>
      )}

      <div className={styles.sky}>
        <canvas ref={canvasRef} className={styles.canvas} />

        {hovered && (
          <div className={styles.hint}>
            {starsRef.current.find((s) => s.id === hovered)?.title}
          </div>
        )}

        {/* Stats & clustering panel */}
        {stats && showStats && (
          <div className={styles.statsPanel}>
            <button
              className={styles.statsClose}
              onClick={() => setShowStats(false)}
              aria-label="Hide stats"
            >
              ×
            </button>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <strong>{stats.notes}</strong>
                <span>notes</span>
              </div>
              <div className={styles.stat}>
                <strong>{stats.links}</strong>
                <span>links</span>
              </div>
              <div className={styles.stat}>
                <strong>{stats.tags}</strong>
                <span>clusters</span>
              </div>
              <div className={styles.stat}>
                <strong>{stats.orphans}</strong>
                <span>orphans</span>
              </div>
            </div>

            {stats.hub && (
              <button className={styles.hubLink} onClick={() => openNote(stats.hub!.id)}>
                ★ most-linked: <em>{stats.hub.title}</em> ({stats.hub.degree})
              </button>
            )}

            {stats.topTags.length > 0 && (
              <div className={styles.tagRow}>
                {stats.topTags.map((t) => {
                  const isFiltered = activeFilterTag === t.tag
                  return (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => toggleFilterTag(t.tag)}
                      className={`${styles.tagChip} ${isFiltered ? styles.activeTag : ""}`}
                      title={isFiltered ? "Clear filter" : `Highlight #${t.tag}`}
                    >
                      {t.tag} <span>{t.count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Viewport & Physics Tools */}
        <div className={styles.tools}>
          <button onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in">
            +
          </button>
          <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out">
            −
          </button>
          <button onClick={resetView} aria-label="Reset view and physics" title="Reset view">
            ⌖
          </button>
          {!showStats && (
            <button
              onClick={() => setShowStats(true)}
              aria-label="Show stats"
              title="Show constellation stats"
            >
              ℹ
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
