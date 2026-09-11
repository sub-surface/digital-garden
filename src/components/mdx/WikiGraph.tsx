import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import * as d3 from "d3"
import { loadGraphData } from "@/lib/content-loader"
import styles from "./WikiGraph.module.scss"

export interface WikiGraphProps {
  cluster?: string
  tag?: string
  height?: number
}

interface RawNode {
  id: string
  title: string
  tags?: string[]
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  category: "philosophers" | "concepts" | "movements" | "texts" | "events" | "chatters" | "general"
  degree: number
  r: number
  color: string
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

function getNodeCategory(slug: string): GraphNode["category"] {
  const s = slug.toLowerCase()
  if (s.startsWith("wiki/philosophers/")) return "philosophers"
  if (s.startsWith("wiki/concepts/")) return "concepts"
  if (s.startsWith("wiki/movements/")) return "movements"
  if (s.startsWith("wiki/texts/")) return "texts"
  if (s.startsWith("wiki/events/")) return "events"
  if (s.startsWith("wiki/chatters/")) return "chatters"
  return "general"
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

export function WikiGraph({ cluster, tag, height = 520 }: WikiGraphProps) {
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

      const isWikiSlug = (s: string) => {
        const lower = s.toLowerCase()
        return lower.startsWith("wiki/") || lower === "wiki"
      }

      let filteredNodes = (data.nodes as RawNode[]).filter(n => isWikiSlug(n.id))

      if (cluster) {
        const cLower = cluster.toLowerCase()
        filteredNodes = filteredNodes.filter(n => {
          const cat = getNodeCategory(n.id)
          return cat === cLower || n.id.toLowerCase().includes(cLower)
        })
      }

      if (tag) {
        const tLower = tag.toLowerCase()
        filteredNodes = filteredNodes.filter(n =>
          n.tags?.some(t => t.toLowerCase().includes(tLower))
        )
      }

      const nodeIds = new Set(filteredNodes.map(n => n.id))
      const filteredLinks: GraphLink[] = data.links
        .filter(l => nodeIds.has(l.source) && nodeIds.has(l.target))
        .map(l => ({ source: l.source, target: l.target }))

      const degreeMap = new Map<string, number>()
      const adj1 = new Map<string, Set<string>>()

      for (const l of filteredLinks) {
        const s = typeof l.source === "string" ? l.source : l.source.id
        const t = typeof l.target === "string" ? l.target : l.target.id
        degreeMap.set(s, (degreeMap.get(s) ?? 0) + 1)
        degreeMap.set(t, (degreeMap.get(t) ?? 0) + 1)

        if (!adj1.has(s)) adj1.set(s, new Set())
        if (!adj1.has(t)) adj1.set(t, new Set())
        adj1.get(s)!.add(t)
        adj1.get(t)!.add(s)
      }

      adj1Ref.current = adj1

      const categories = Object.keys(CATEGORY_COLORS) as Array<GraphNode["category"]>
      const clusterCenters = new Map<string, { x: number; y: number }>()
      const clusterRadius = Math.min(380, 160 + filteredNodes.length * 1.2)

      categories.forEach((cat, idx) => {
        const angle = (idx / categories.length) * Math.PI * 2
        clusterCenters.set(cat, {
          x: Math.cos(angle) * clusterRadius,
          y: Math.sin(angle) * clusterRadius,
        })
      })

      const graphNodes: GraphNode[] = filteredNodes.map(n => {
        const cat = getNodeCategory(n.id)
        const center = clusterCenters.get(cat) ?? { x: 0, y: 0 }
        const deg = degreeMap.get(n.id) ?? 0
        const jitterR = 50 + Math.random() * 120
        const jitterA = Math.random() * Math.PI * 2

        return {
          id: n.id,
          title: n.title || n.id.split("/").pop() || n.id,
          category: cat,
          degree: deg,
          clusterKey: cat,
          clusterTargetX: center.x,
          clusterTargetY: center.y,
          r: 1.5 + Math.min(7.0, Math.log2(deg + 1) * 1.2),
          color: CATEGORY_COLORS[cat].hex,
          twinkle: Math.random() * Math.PI * 2,
          x: center.x + Math.cos(jitterA) * jitterR,
          y: center.y + Math.sin(jitterA) * jitterR,
        }
      })

      nodesRef.current = graphNodes
      linksRef.current = filteredLinks

      setStats({ nodes: graphNodes.length, links: filteredLinks.length })

      simulation = d3
        .forceSimulation<GraphNode>(graphNodes)
        .force(
          "link",
          d3
            .forceLink<GraphNode, GraphLink>(filteredLinks)
            .id(d => d.id)
            .distance(l => {
              const sDeg = (l.source as GraphNode).degree ?? 1
              const tDeg = (l.target as GraphNode).degree ?? 1
              return 35 + Math.min(55, Math.sqrt(sDeg + tDeg) * 5.5)
            })
            .strength(0.3)
        )
        .force(
          "charge",
          d3
            .forceManyBody<GraphNode>()
            .strength(d => -40 - d.degree * 7)
            .distanceMax(450)
        )
        .force(
          "collide",
          d3
            .forceCollide<GraphNode>()
            .radius(d => d.r + 4)
            .iterations(2)
        )
        .force(
          "clusterX",
          d3.forceX<GraphNode>(d => d.clusterTargetX).strength(0.04)
        )
        .force(
          "clusterY",
          d3.forceY<GraphNode>(d => d.clusterTargetY).strength(0.04)
        )
        .alphaDecay(0.02)

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d", { alpha: true })
      if (!ctx) return

      let lastTime = performance.now()

      function render(time: number) {
        if (cancelled || !canvas || !ctx) return
        const dt = (time - lastTime) / 1000
        lastTime = time

        const dpr = window.devicePixelRatio || 1
        const w = canvas.clientWidth
        const h = canvas.clientHeight

        if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
          canvas.width = Math.floor(w * dpr)
          canvas.height = Math.floor(h * dpr)
        }

        ctx.save()
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, w, h)

        const cx = w / 2 + view.current.x
        const cy = h / 2 + view.current.y
        const zoom = view.current.zoom

        ctx.translate(cx, cy)
        ctx.scale(zoom, zoom)

        const hoveredId = hoveredIdRef.current
        const adj1 = adj1Ref.current
        const hAdj = hoveredId ? adj1.get(hoveredId) : null

        // 1. Draw links
        const links = linksRef.current
        for (let i = 0; i < links.length; i++) {
          const l = links[i]
          const s = l.source as GraphNode
          const t = l.target as GraphNode
          if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) continue

          const isConnected = hoveredId ? (s.id === hoveredId || t.id === hoveredId) : false
          const isDimmed = hoveredId ? !isConnected : false

          ctx.beginPath()
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(t.x, t.y)

          if (isConnected) {
            ctx.strokeStyle = "rgba(180, 220, 255, 0.75)"
            ctx.lineWidth = 1.6 / zoom
          } else if (isDimmed) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.04)"
            ctx.lineWidth = 0.5 / zoom
          } else {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.12)"
            ctx.lineWidth = 0.8 / zoom
          }
          ctx.stroke()
        }

        // 2. Draw nodes (glows and cores)
        const nodes = nodesRef.current
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]
          if (n.x === undefined || n.y === undefined) continue

          n.twinkle = (n.twinkle + dt * 1.8) % (Math.PI * 2)
          const pulse = 0.85 + 0.15 * Math.sin(n.twinkle)

          const isHovered = n.id === hoveredId
          const isNeighbor = hAdj ? hAdj.has(n.id) : false
          const isDimmed = hoveredId ? !isHovered && !isNeighbor : false

          const effectiveR = (isHovered ? n.r * 1.4 : isNeighbor ? n.r * 1.15 : n.r) * (hoveredId ? 1 : pulse)

          // Radial glow for hovered or major hubs
          if (isHovered || (isNeighbor && n.degree >= 4)) {
            const glowR = effectiveR * 3
            const grad = ctx.createRadialGradient(n.x, n.y, effectiveR * 0.5, n.x, n.y, glowR)
            grad.addColorStop(0, n.color)
            grad.addColorStop(1, "rgba(0, 0, 0, 0)")
            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2)
            ctx.fill()
          }

          // Main star core
          ctx.beginPath()
          ctx.arc(n.x, n.y, effectiveR, 0, Math.PI * 2)
          if (isHovered) {
            ctx.fillStyle = "#ffffff"
          } else if (isDimmed) {
            ctx.fillStyle = "rgba(160, 160, 175, 0.2)"
          } else {
            ctx.fillStyle = n.color
          }
          ctx.fill()
        }

        // 3. Draw labels (always rendered on top of all nodes, glows, and links)
        const drawWikiLabel = (n: GraphNode, isHovered: boolean, isNeighbor: boolean) => {
          if (n.x === undefined || n.y === undefined) return
          const pulse = 0.85 + 0.15 * Math.sin(n.twinkle)
          const effectiveR = (isHovered ? n.r * 1.4 : isNeighbor ? n.r * 1.15 : n.r) * (hoveredId ? 1 : pulse)

          ctx.font = `${isHovered ? "600 " : ""}${Math.max(10, Math.min(13, 11 / zoom))}px "IBM Plex Sans", -apple-system, sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"

          const text = n.title
          const textY = n.y + effectiveR + 8 / zoom

          // Pill backing
          const textMetrics = ctx.measureText(text)
          const padX = 4 / zoom
          const padY = 2 / zoom
          ctx.fillStyle = isHovered ? "rgba(12, 12, 16, 0.92)" : "rgba(10, 10, 12, 0.72)"
          ctx.fillRect(
            n.x - textMetrics.width / 2 - padX,
            textY - 6 / zoom - padY,
            textMetrics.width + padX * 2,
            12 / zoom + padY * 2
          )

          ctx.fillStyle = isHovered ? "#ffffff" : isNeighbor ? "rgba(240, 240, 250, 0.95)" : "rgba(210, 210, 220, 0.8)"
          ctx.fillText(text, n.x, textY)
        }

        let hoveredNodeToDraw: GraphNode | null = null

        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]
          if (n.x === undefined || n.y === undefined) continue

          const isHovered = n.id === hoveredId
          const isNeighbor = hAdj ? hAdj.has(n.id) : false
          const isDimmed = hoveredId ? !isHovered && !isNeighbor : false

          if (isHovered) {
            hoveredNodeToDraw = n
            continue // Draw hovered label last to guarantee it stays topmost
          }

          const showLabel = isNeighbor || (zoom >= 1.2 && n.degree >= 5) || (zoom >= 1.8 && n.degree >= 2)
          if (showLabel && !isDimmed) {
            drawWikiLabel(n, false, isNeighbor)
          }
        }

        // Draw hovered label last so its pill and text are on the absolute top layer
        if (hoveredNodeToDraw) {
          drawWikiLabel(hoveredNodeToDraw, true, false)
        }

        ctx.restore()
        animId = requestAnimationFrame(render)
      }

      animId = requestAnimationFrame(render)
    }

    init()

    return () => {
      cancelled = true
      if (simulation) simulation.stop()
      if (animId) cancelAnimationFrame(animId)
    }
  }, [cluster, tag])

  // Mouse / Pointer Interaction handlers
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left - rect.width / 2 - view.current.x) / view.current.zoom
    const y = (clientY - rect.top - rect.height / 2 - view.current.y) / view.current.zoom
    return { x, y }
  }, [])

  const findNodeAt = useCallback((worldX: number, worldY: number): GraphNode | null => {
    const nodes = nodesRef.current
    const hitPadding = 10 / view.current.zoom
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      const dx = n.x - worldX
      const dy = n.y - worldY
      const r = n.r + hitPadding
      if (dx * dx + dy * dy <= r * r) {
        return n
      }
    }
    return null
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = screenToWorld(e.clientX, e.clientY)
    const node = findNodeAt(x, y)
    dragDistance.current = 0

    if (node) {
      isDraggingNode.current = node
      node.fx = node.x
      node.fy = node.y
    } else {
      isPanning.current = true
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        viewX: view.current.x,
        viewY: view.current.y,
      }
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [screenToWorld, findNodeAt])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = screenToWorld(e.clientX, e.clientY)

    if (isDraggingNode.current) {
      const node = isDraggingNode.current
      node.fx = x
      node.fy = y
      dragDistance.current += Math.hypot(e.movementX, e.movementY)
      return
    }

    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      view.current.x = panStart.current.viewX + dx
      view.current.y = panStart.current.viewY + dy
      dragDistance.current += Math.hypot(e.movementX, e.movementY)
      return
    }

    // Hover check
    const hovered = findNodeAt(x, y)
    if (hovered) {
      hoveredIdRef.current = hovered.id
      setHoveredNode({
        title: hovered.title,
        category: CATEGORY_COLORS[hovered.category].label,
        degree: hovered.degree,
      })
    } else {
      hoveredIdRef.current = null
      setHoveredNode(null)
    }
  }, [screenToWorld, findNodeAt])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingNode.current) {
      const node = isDraggingNode.current
      if (dragDistance.current < 5) {
        navigate({ to: `/${node.id}` })
      }
      node.fx = null
      node.fy = null
      isDraggingNode.current = null
    }

    isPanning.current = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Ignored
    }
  }, [navigate])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    const newZoom = Math.max(0.2, Math.min(3.5, view.current.zoom * zoomFactor))

    // Anchor zoom to cursor
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left - rect.width / 2
    const mouseY = e.clientY - rect.top - rect.height / 2

    view.current.x -= (mouseX - view.current.x) * (zoomFactor - 1)
    view.current.y -= (mouseY - view.current.y) * (zoomFactor - 1)
    view.current.zoom = newZoom
  }, [])

  return (
    <div
      ref={containerRef}
      className={styles.wikiGraph}
      style={{ height }}
    >
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h3 className={styles.title}>
            {cluster ? `${cluster.toUpperCase()} CONSTELLATION` : tag ? `#${tag.toUpperCase()} MAP` : "PHILOSOPHICAL CONSTELLATION"}
          </h3>
          {stats && (
            <span className={styles.stats}>
              {stats.nodes} nodes · {stats.links} links
            </span>
          )}
        </div>
        <div className={styles.controls}>
          <button className={styles.controlBtn} onClick={zoomIn} title="Zoom in">
            +
          </button>
          <button className={styles.controlBtn} onClick={zoomOut} title="Zoom out">
            −
          </button>
          <button className={styles.controlBtn} onClick={resetView} title="Reset view">
            ⟲
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className={styles.canvasWrapper}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />

      {hoveredNode && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipTitle}>{hoveredNode.title}</div>
          <div className={styles.tooltipMeta}>
            <span>{hoveredNode.category}</span>
            <span>{hoveredNode.degree} connections</span>
          </div>
        </div>
      )}

      <div className={styles.legend}>
        {Object.entries(CATEGORY_COLORS).map(([key, cat]) => (
          <div key={key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: cat.hex }} />
            <span>{cat.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
