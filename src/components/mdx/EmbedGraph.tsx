import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import * as d3 from "d3"
import { loadGraphData } from "@/lib/content-loader"
import styles from "./WikiGraph.module.scss"

export interface EmbedGraphProps {
  /** Focal note slug or node ID to center the graph around (LocalGraph mode / focal neighborhood) */
  slug?: string
  /** Filter to nodes within a specific section / cluster (e.g. "philosophers", "concepts", "movements", "texts", "events", "chatters") */
  cluster?: string
  /** Filter to nodes matching a specific tag */
  tag?: string
  /** Scope of notes to include: "wiki" (only wiki notes), "garden" (only non-wiki notes), or "all" (default) */
  scope?: "all" | "wiki" | "garden"
  /** Maximum hop distance when a focal slug is specified (defaults to 1 for local neighborhood) */
  depth?: number
  /** Canvas height in pixels (defaults to 520) */
  height?: number
  /** Optional custom title override */
  title?: string
  /** Whether navigation / pan / zoom is enabled (defaults to true) */
  interactive?: boolean
}

import {
  filterGraphData,
  getNodeCategory,
  type RawNode,
  type RawLink,
  type GraphFilterOptions,
} from "@/lib/graph-filter"

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  category: ReturnType<typeof getNodeCategory>
  degree: number
  r: number
  color: string
  isFocal?: boolean
  clusterKey: string
  clusterTargetX: number
  clusterTargetY: number
  twinkle: number
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: GraphNode | string
  target: GraphNode | string
}

const CATEGORY_COLORS: Record<GraphNode["category"], { hex: string; label: string }> = {
  philosophers: { hex: "#60a5fa", label: "Philosophers" },
  concepts: { hex: "#34d399", label: "Concepts" },
  movements: { hex: "#fbbf24", label: "Movements" },
  texts: { hex: "#38bdf8", label: "Canonical Texts" },
  events: { hex: "#f87171", label: "Events & Chronicles" },
  chatters: { hex: "#c084fc", label: "Chatters" },
  general: { hex: "#94a3b8", label: "Overviews & Hubs" },
}

function normalizeSlugId(s: string): string {
  return s
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
}

export function EmbedGraph({
  slug,
  cluster,
  tag,
  scope = "all",
  depth = 1,
  height = 520,
  title,
  interactive = true,
}: EmbedGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navigate = useNavigate()

  const [stats, setStats] = useState<{ nodes: number; links: number } | null>(null)
  const [hoveredNode, setHoveredNode] = useState<{ title: string; category: string; degree: number } | null>(null)

  const view = useRef({ x: 0, y: 0, zoom: 0.95 })
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])
  const adj1Ref = useRef<Map<string, Set<string>>>(new Map())
  const hoveredIdRef = useRef<string | null>(null)

  const isDraggingNode = useRef<GraphNode | null>(null)
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, viewX: 0, viewY: 0 })
  const dragDistance = useRef(0)
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)

  const resetView = useCallback(() => {
    view.current = { x: 0, y: 0, zoom: 0.95 }
  }, [])

  const zoomIn = useCallback(() => {
    view.current.zoom = Math.min(3.5, view.current.zoom * 1.3)
  }, [])

  const zoomOut = useCallback(() => {
    view.current.zoom = Math.max(0.2, view.current.zoom / 1.3)
  }, [])

  useEffect(() => {
    let cancelled = false
    let animId: number
    let simulation: d3.Simulation<GraphNode, GraphLink> | null = null

    async function init() {
      const data = await loadGraphData()
      if (!data || cancelled) return

      const { filteredNodes, filteredLinks, centerId } = filterGraphData(
        data.nodes as RawNode[],
        data.links as RawLink[],
        { slug, cluster, tag, scope, depth }
      )

      // Degrees
      const degreeMap = new Map<string, number>()
      filteredLinks.forEach(l => {
        degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1)
        degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1)
      })

      // Adjacency for hover highlights
      const adj1 = new Map<string, Set<string>>()
      filteredLinks.forEach(l => {
        if (!adj1.has(l.source)) adj1.set(l.source, new Set())
        if (!adj1.has(l.target)) adj1.set(l.target, new Set())
        adj1.get(l.source)!.add(l.target)
        adj1.get(l.target)!.add(l.source)
      })
      adj1Ref.current = adj1

      const width = containerRef.current?.clientWidth || 900
      const simHeight = height

      // Cluster gravity centroids
      const clusterAngles: Record<string, number> = {
        philosophers: 0,
        concepts: Math.PI / 3,
        movements: (2 * Math.PI) / 3,
        texts: Math.PI,
        events: (4 * Math.PI) / 3,
        chatters: (5 * Math.PI) / 3,
        general: 0,
      }

      const normSlug = slug ? normalizeSlugId(slug) : null

      const simNodes: GraphNode[] = filteredNodes.map(n => {
        const category = getNodeCategory(n.id)
        const deg = degreeMap.get(n.id) || 0
        const isFocal = normSlug ? normalizeSlugId(n.id) === normSlug || normalizeSlugId(n.id).endsWith("/" + normSlug) : false
        // Logarithmic node radius scaling
        const r = isFocal ? 10 : Math.min(12, Math.max(3.5, 3 + Math.log2(deg + 1) * 1.8))
        const angle = clusterAngles[category] ?? 0
        const clusterRadius = category === "general" ? 40 : Math.min(width, simHeight) * 0.28

        return {
          id: n.id,
          title: n.title,
          category,
          degree: deg,
          r,
          color: CATEGORY_COLORS[category]?.hex || "#94a3b8",
          isFocal,
          clusterKey: category,
          clusterTargetX: Math.cos(angle) * clusterRadius,
          clusterTargetY: Math.sin(angle) * clusterRadius,
          twinkle: Math.random() * Math.PI * 2,
          x: (Math.random() - 0.5) * (width * 0.5),
          y: (Math.random() - 0.5) * (simHeight * 0.5),
        }
      })

      nodesRef.current = simNodes
      linksRef.current = filteredLinks as GraphLink[]
      setStats({ nodes: simNodes.length, links: filteredLinks.length })

      // Pure Canvas 2D + D3 force layout
      simulation = d3.forceSimulation<GraphNode>(simNodes)
        .force("link", d3.forceLink<GraphNode, GraphLink>(filteredLinks)
          .id(d => d.id)
          .distance(50)
          .strength(0.4)
        )
        .force("charge", d3.forceManyBody().strength(d => -30 - ((d as GraphNode).degree * 14)))
        .force("collide", d3.forceCollide<GraphNode>().radius(d => d.r + 5).iterations(2))
        .force("clusterX", d3.forceX<GraphNode>(d => d.clusterTargetX).strength(0.12))
        .force("clusterY", d3.forceY<GraphNode>(d => d.clusterTargetY).strength(0.12))
        .alphaDecay(0.02)

      simulationRef.current = simulation

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

      function render() {
        if (!canvas || !ctx) return
        const w = canvas.clientWidth
        const h = canvas.clientHeight

        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr
          canvas.height = h * dpr
        }

        ctx.save()
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, w, h)

        const midX = w / 2 + view.current.x
        const midY = h / 2 + view.current.y
        const z = view.current.zoom

        ctx.translate(midX, midY)
        ctx.scale(z, z)

        const hoveredId = hoveredIdRef.current
        const adj = adj1Ref.current

        // 1. Render links
        ctx.lineWidth = 1 / z
        linksRef.current.forEach(l => {
          const s = l.source as GraphNode
          const t = l.target as GraphNode
          if (!s.x || !t.x) return

          let alpha = 0.15
          let strokeColor = "rgba(148, 163, 184, 0.25)"

          if (hoveredId) {
            if (s.id === hoveredId || t.id === hoveredId) {
              alpha = 0.8
              strokeColor = s.id === hoveredId ? s.color : t.color
            } else {
              alpha = 0.04
            }
          }

          ctx.globalAlpha = alpha
          ctx.strokeStyle = strokeColor
          ctx.beginPath()
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(t.x, t.y)
          ctx.stroke()
        })

        // 2. Render nodes
        const now = performance.now() / 1000
        nodesRef.current.forEach(n => {
          if (!n.x) return

          const isHovered = n.id === hoveredId
          const isNeighbor = hoveredId ? adj.get(hoveredId)?.has(n.id) : false
          const isDimmed = hoveredId !== null && !isHovered && !isNeighbor

          // Star twinkle phase
          const twinkleAlpha = 0.85 + 0.15 * Math.sin(now * 2 + n.twinkle)
          let nodeAlpha = isDimmed ? 0.18 : twinkleAlpha

          // Outer atmospheric glow for hubs or hovered nodes
          if (isHovered || n.degree >= 5 || n.isFocal) {
            ctx.globalAlpha = isHovered ? 0.4 : n.isFocal ? 0.35 : 0.15
            ctx.fillStyle = n.color
            ctx.beginPath()
            const glowR = n.isFocal ? n.r * 2.2 + Math.sin(now * 4) * 2 : n.r * 2.0
            ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2)
            ctx.fill()
          }

          // Core node body
          ctx.globalAlpha = nodeAlpha
          ctx.fillStyle = n.color
          ctx.beginPath()
          ctx.arc(n.x, n.y, isHovered ? n.r * 1.3 : n.r, 0, Math.PI * 2)
          ctx.fill()

          // Text label for hubs, hovered nodes, or focal note
          if (isHovered || isNeighbor || n.degree >= 4 || n.isFocal || z > 1.4) {
            ctx.globalAlpha = isDimmed ? 0.2 : 0.9
            ctx.fillStyle = isHovered ? "#ffffff" : "var(--color-text)"
            ctx.font = `${isHovered || n.isFocal ? "bold " : ""}11px 'IBM Plex Sans', sans-serif`
            ctx.textAlign = "left"
            ctx.textBaseline = "middle"
            ctx.fillText(n.title, n.x + n.r + 4, n.y)
          }
        })

        ctx.restore()
        animId = requestAnimationFrame(render)
      }

      animId = requestAnimationFrame(render)
    }

    init()

    return () => {
      cancelled = true
      if (animId) cancelAnimationFrame(animId)
      if (simulation) simulation.stop()
      simulationRef.current = null
    }
  }, [slug, cluster, tag, scope, depth, height])

  // Mouse & Drag interactions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const midX = rect.width / 2 + view.current.x
    const midY = rect.height / 2 + view.current.y
    const z = view.current.zoom

    const worldX = (mouseX - midX) / z
    const worldY = (mouseY - midY) / z

    // Detect hit node
    let clickedNode: GraphNode | null = null
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i]
      const dx = n.x - worldX
      const dy = n.y - worldY
      if (Math.hypot(dx, dy) <= n.r + 6) {
        clickedNode = n
        break
      }
    }

    if (clickedNode) {
      isDraggingNode.current = clickedNode
      clickedNode.fx = clickedNode.x
      clickedNode.fy = clickedNode.y
      simulationRef.current?.alphaTarget(0.3).restart()
    } else {
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, viewX: view.current.x, viewY: view.current.y }
    }
    dragDistance.current = 0
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingNode.current || isPanning.current) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const midX = rect.width / 2 + view.current.x
    const midY = rect.height / 2 + view.current.y
    const z = view.current.zoom

    const worldX = (mouseX - midX) / z
    const worldY = (mouseY - midY) / z

    // Hover check
    let found: GraphNode | null = null
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i]
      const dx = n.x - worldX
      const dy = n.y - worldY
      if (Math.hypot(dx, dy) <= n.r + 5) {
        found = n
        break
      }
    }

    if (found) {
      hoveredIdRef.current = found.id
      setHoveredNode({
        title: found.title,
        category: CATEGORY_COLORS[found.category]?.label || found.category,
        degree: found.degree,
      })
      if (canvasRef.current) canvasRef.current.style.cursor = "pointer"
    } else {
      hoveredIdRef.current = null
      setHoveredNode(null)
      if (canvasRef.current) canvasRef.current.style.cursor = "grab"
    }
  }

  const handleMouseUp = useCallback(() => {
    if (isDraggingNode.current) {
      if (dragDistance.current < 4) {
        // Direct click navigation
        const targetId = isDraggingNode.current.id
        navigate({ to: `/${targetId}` })
      }
      isDraggingNode.current.fx = null
      isDraggingNode.current.fy = null
      isDraggingNode.current = null
      simulationRef.current?.alphaTarget(0)
    }
    isPanning.current = false
  }, [navigate])

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isDraggingNode.current && !isPanning.current) return
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const midX = rect.width / 2 + view.current.x
      const midY = rect.height / 2 + view.current.y
      const z = view.current.zoom

      const worldX = (mouseX - midX) / z
      const worldY = (mouseY - midY) / z

      if (isDraggingNode.current) {
        dragDistance.current += Math.hypot(e.movementX, e.movementY)
        isDraggingNode.current.fx = worldX
        isDraggingNode.current.fy = worldY
        simulationRef.current?.alphaTarget(0.3).restart()
        return
      }

      if (isPanning.current) {
        dragDistance.current += Math.hypot(e.movementX, e.movementY)
        view.current.x = panStart.current.viewX + (e.clientX - panStart.current.x)
        view.current.y = panStart.current.viewY + (e.clientY - panStart.current.y)
        return
      }
    }

    const handleWindowMouseUp = () => {
      if (isDraggingNode.current || isPanning.current) {
        handleMouseUp()
      }
    }

    window.addEventListener("mousemove", handleWindowMouseMove)
    window.addEventListener("mouseup", handleWindowMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove)
      window.removeEventListener("mouseup", handleWindowMouseUp)
    }
  }, [handleMouseUp])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !interactive) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      view.current.zoom = Math.min(3.5, Math.max(0.2, view.current.zoom * factor))
    }

    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [interactive])

  const displayTitle = title ?? (
    slug ? `Neighborhood: ${slug}` :
    cluster ? `Cluster: ${cluster}` :
    tag ? `Tag: #${tag}` :
    scope === "wiki" ? "Map of Philosophy & Wiki Constellation" : "Knowledge Constellation"
  )

  return (
    <div
      className={styles.wikiGraph}
      style={{ height: `${height}px` }}
      ref={containerRef}
      data-testid="embed-graph"
    >
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h4 className={styles.title}>{displayTitle}</h4>
          {stats && (
            <span className={styles.stats}>
              {stats.nodes} notes &middot; {stats.links} relations
            </span>
          )}
        </div>
        {interactive && (
          <div className={styles.controls}>
            <button className={styles.controlBtn} onClick={zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
            <button className={styles.controlBtn} onClick={zoomOut} title="Zoom out" aria-label="Zoom out">&minus;</button>
            <button className={styles.controlBtn} onClick={resetView} title="Reset view" aria-label="Reset view">&#8635;</button>
          </div>
        )}
      </div>

      {hoveredNode && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipTitle}>{hoveredNode.title}</div>
          <div className={styles.tooltipMeta}>
            <span>{hoveredNode.category}</span>
            <span>{hoveredNode.degree} links</span>
          </div>
        </div>
      )}

      <div className={styles.legend}>
        {Object.entries(CATEGORY_COLORS).map(([cat, info]) => (
          <div key={cat} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ backgroundColor: info.hex }} />
            <span>{info.label}</span>
          </div>
        ))}
      </div>

      <div className={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
      </div>
    </div>
  )
}
