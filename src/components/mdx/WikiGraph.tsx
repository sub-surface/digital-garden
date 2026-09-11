import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { loadGraphData } from "@/lib/content-loader"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import * as PIXI from "pixi.js"
import * as d3 from "d3"
import styles from "./WikiGraph.module.scss"

interface RawNode {
  id: string
  title: string
  tags?: string[]
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  category: "philosophers" | "concepts" | "movements" | "events" | "chatters" | "general"
  degree: number
  radius: number
  color: number
  gfx?: PIXI.Graphics
  label?: PIXI.Text
  isHovered?: boolean
  fx?: number | null
  fy?: number | null
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
}

function getNodeCategory(slug: string): GraphNode["category"] {
  const s = slug.toLowerCase()
  if (s.startsWith("wiki/philosophers/")) return "philosophers"
  if (s.startsWith("wiki/concepts/")) return "concepts"
  if (s.startsWith("wiki/movements/")) return "movements"
  if (s.startsWith("wiki/events/")) return "events"
  if (s.startsWith("wiki/chatters/")) return "chatters"
  return "general"
}

const CATEGORY_COLORS: Record<GraphNode["category"], { hex: number; css: string; label: string }> = {
  philosophers: { hex: 0x60a5fa, css: "#60a5fa", label: "Philosophers" },
  concepts: { hex: 0x34d399, css: "#34d399", label: "Concepts" },
  movements: { hex: 0xfbbf24, css: "#fbbf24", label: "Movements" },
  events: { hex: 0xf87171, css: "#f87171", label: "Events & Chronicles" },
  chatters: { hex: 0xc084fc, css: "#c084fc", label: "Chatters" },
  general: { hex: 0x94a3b8, css: "#94a3b8", label: "Overviews & Hubs" },
}

export function WikiGraph() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const isMobile = usePhoneViewport()
  const navigate = useNavigate()

  const [stats, setStats] = useState<{ nodes: number; links: number } | null>(null)
  const [hoveredNode, setHoveredNode] = useState<{ title: string; category: string; degree: number } | null>(null)

  const resetViewRef = useRef<() => void>(() => {})
  const zoomInRef = useRef<() => void>(() => {})
  const zoomOutRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!containerRef.current) return

    let simulation: d3.Simulation<GraphNode, GraphLink> | null = null
    let mounted = true
    const currentContainer = containerRef.current

    async function init() {
      const data = await loadGraphData()
      if (!data || !mounted) return

      // Filter exclusively to Wiki notes
      const isWikiSlug = (s: string) => {
        const lower = s.toLowerCase()
        return lower.startsWith("wiki/") || lower === "wiki"
      }

      const wikiRawNodes = data.nodes.filter(n => isWikiSlug(n.id))
      const wikiNodeIds = new Set(wikiRawNodes.map(n => n.id))

      // Keep links where both source and target are in the wiki
      const wikiLinks: GraphLink[] = data.links
        .filter(l => wikiNodeIds.has(l.source) && wikiNodeIds.has(l.target))
        .map(l => ({ source: l.source, target: l.target }))

      // Calculate degrees
      const degrees = new Map<string, number>()
      wikiLinks.forEach(l => {
        const s = typeof l.source === "string" ? l.source : l.source.id
        const t = typeof l.target === "string" ? l.target : l.target.id
        degrees.set(s, (degrees.get(s) || 0) + 1)
        degrees.set(t, (degrees.get(t) || 0) + 1)
      })

      const graphNodes: GraphNode[] = wikiRawNodes.map(n => {
        const category = getNodeCategory(n.id)
        const degree = degrees.get(n.id) || 0
        const radius = Math.min(16, Math.max(5, 5 + Math.sqrt(degree) * 2.6))
        return {
          id: n.id,
          title: n.title || n.id.split("/").pop() || n.id,
          category,
          degree,
          radius,
          color: CATEGORY_COLORS[category].hex,
        }
      })

      setStats({ nodes: graphNodes.length, links: wikiLinks.length })

      // Wait for DOM sizing
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      if (!mounted || !currentContainer) return

      const width = currentContainer.clientWidth || 700
      const height = currentContainer.clientHeight || 500

      const app = new PIXI.Application()
      appRef.current = app

      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        eventMode: "static",
      })

      if (!mounted || !currentContainer) {
        app.destroy(true, { children: true, texture: false })
        appRef.current = null
        return
      }

      currentContainer.innerHTML = ""
      currentContainer.appendChild(app.canvas)

      const stage = new PIXI.Container()
      app.stage.addChild(stage)
      stage.x = width / 2
      stage.y = height / 2

      // D3 Force Simulation
      simulation = d3.forceSimulation<GraphNode>(graphNodes)
        .force("link", d3.forceLink<GraphNode, GraphLink>(wikiLinks).id((d: any) => d.id).distance(isMobile ? 50 : 80))
        .force("charge", d3.forceManyBody().strength(-240))
        .force("center", d3.forceCenter(0, 0))
        .force("collision", d3.forceCollide<GraphNode>().radius(d => d.radius + (isMobile ? 6 : 10)))

      const linkLayer = new PIXI.Graphics()
      stage.addChild(linkLayer)

      const nodeLayer = new PIXI.Container()
      stage.addChild(nodeLayer)

      // Interaction state
      let dragTarget: GraphNode | null = null
      let isPanning = false
      let lastPos = { x: 0, y: 0 }
      let hasDragged = false
      let currentScale = 1
      let activeHoveredId: string | null = null

      resetViewRef.current = () => {
        stage.x = width / 2
        stage.y = height / 2
        currentScale = 1
        stage.scale.set(1)
        simulation?.alpha(0.3).restart()
      }

      zoomInRef.current = () => {
        currentScale = Math.min(3, currentScale * 1.25)
        stage.scale.set(currentScale)
      }

      zoomOutRef.current = () => {
        currentScale = Math.max(0.25, currentScale / 1.25)
        stage.scale.set(currentScale)
      }

      // Adjacency map for hover highlighting
      const adjacentMap = new Map<string, Set<string>>()
      wikiLinks.forEach(l => {
        const s = typeof l.source === "string" ? l.source : (l.source as GraphNode).id
        const t = typeof l.target === "string" ? l.target : (l.target as GraphNode).id
        if (!adjacentMap.has(s)) adjacentMap.set(s, new Set())
        if (!adjacentMap.has(t)) adjacentMap.set(t, new Set())
        adjacentMap.get(s)!.add(t)
        adjacentMap.get(t)!.add(s)
      })

      // Draw nodes
      graphNodes.forEach(node => {
        const gfx = new PIXI.Graphics()
        gfx.circle(0, 0, node.radius).fill(node.color)

        gfx.interactive = true
        gfx.cursor = "pointer"

        gfx.on("pointerdown", (e) => {
          e.stopPropagation()
          dragTarget = node
          node.fx = node.x
          node.fy = node.y
          simulation?.alphaTarget(0.3).restart()
          hasDragged = false
        })

        gfx.on("pointerover", () => {
          activeHoveredId = node.id
          node.isHovered = true
          setHoveredNode({
            title: node.title,
            category: CATEGORY_COLORS[node.category].label,
            degree: node.degree,
          })
          renderHighlight(node)
        })

        gfx.on("pointerout", () => {
          activeHoveredId = null
          node.isHovered = false
          setHoveredNode(null)
          clearHighlight()
        })

        gfx.on("pointerup", () => {
          if (!hasDragged) {
            navigate({ to: `/${node.id}` as any })
          }
        })

        const label = new PIXI.Text({
          text: node.title,
          style: {
            fontFamily: "var(--font-code), monospace",
            fontSize: node.degree > 3 ? 10 : 8,
            fill: 0xe2e8f0,
            align: "center",
          },
          resolution: 2,
        })
        label.anchor.set(0.5, -0.6)
        label.alpha = node.degree > 2 ? 0.8 : 0.45

        node.gfx = gfx
        node.label = label
        nodeLayer.addChild(gfx)
        nodeLayer.addChild(label)
      })

      function renderHighlight(activeNode: GraphNode) {
        const neighbors = adjacentMap.get(activeNode.id) || new Set()
        graphNodes.forEach(n => {
          const isNeighbor = n.id === activeNode.id || neighbors.has(n.id)
          if (n.gfx) n.gfx.alpha = isNeighbor ? 1 : 0.2
          if (n.label) n.label.alpha = isNeighbor ? 1 : 0.1
        })
        drawLinks(activeNode.id)
      }

      function clearHighlight() {
        graphNodes.forEach(n => {
          if (n.gfx) n.gfx.alpha = 1
          if (n.label) n.label.alpha = n.degree > 2 ? 0.8 : 0.45
        })
        drawLinks()
      }

      function drawLinks(highlightedNodeId?: string) {
        linkLayer.clear()
        wikiLinks.forEach(l => {
          const s = l.source as GraphNode
          const t = l.target as GraphNode
          if (s.x == null || s.y == null || t.x == null || t.y == null) return

          const isConnected = highlightedNodeId && (s.id === highlightedNodeId || t.id === highlightedNodeId)
          const alpha = highlightedNodeId ? (isConnected ? 0.7 : 0.04) : 0.18
          const strokeColor = isConnected ? 0x60a5fa : 0x718096
          const strokeWidth = isConnected ? 1.5 : 0.75

          linkLayer
            .moveTo(s.x, s.y)
            .lineTo(t.x, t.y)
            .stroke({ width: strokeWidth, color: strokeColor, alpha })
        })
      }

      app.stage.interactive = true
      app.stage.hitArea = new PIXI.Rectangle(-10000, -10000, 20000, 20000)

      app.stage.on("pointerdown", (e) => {
        if (!dragTarget) {
          isPanning = true
          lastPos = { x: e.global.x, y: e.global.y }
        }
      })

      app.stage.on("pointermove", (e) => {
        if (!mounted || !appRef.current) return
        if (dragTarget) {
          const pos = e.getLocalPosition(stage)
          dragTarget.fx = pos.x
          dragTarget.fy = pos.y
          hasDragged = true
        } else if (isPanning) {
          const dx = e.global.x - lastPos.x
          const dy = e.global.y - lastPos.y
          stage.x += dx
          stage.y += dy
          lastPos = { x: e.global.x, y: e.global.y }
        }
      })

      const endDrag = () => {
        if (dragTarget) {
          dragTarget.fx = null
          dragTarget.fy = null
          dragTarget = null
          simulation?.alphaTarget(0)
        }
        isPanning = false
      }

      app.stage.on("pointerup", endDrag)
      app.stage.on("pointerupoutside", endDrag)

      // Wheel Zoom
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89
        const newScale = Math.min(3, Math.max(0.25, currentScale * zoomFactor))
        if (newScale !== currentScale) {
          currentScale = newScale
          stage.scale.set(currentScale)
        }
      }
      currentContainer.addEventListener("wheel", onWheel, { passive: false })

      // Simulation Tick
      simulation.on("tick", () => {
        graphNodes.forEach(n => {
          if (n.gfx && n.x != null && n.y != null) {
            n.gfx.x = n.x
            n.gfx.y = n.y
          }
          if (n.label && n.x != null && n.y != null) {
            n.label.x = n.x
            n.label.y = n.y
          }
        })
        drawLinks(activeHoveredId || undefined)
      })

      // Resize observer
      const resizeObserver = new ResizeObserver(entries => {
        if (!mounted || !appRef.current) return
        const { width: w, height: h } = entries[0].contentRect
        if (w < 2 || h < 2) return
        appRef.current.renderer.resize(w, h)
        stage.x = w / 2
        stage.y = h / 2
        simulation?.alpha(0.2).restart()
      })
      resizeObserver.observe(currentContainer)
    }

    init()

    return () => {
      mounted = false
      simulation?.stop()
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: false })
        appRef.current = null
      }
    }
  }, [isMobile, navigate])

  return (
    <div className={styles.wikiGraph} data-testid="wiki-graph">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h3 className={styles.title}>Wiki Constellation</h3>
          {stats && (
            <span className={styles.stats}>
              {stats.nodes} entries · {stats.links} relations
            </span>
          )}
        </div>
        <div className={styles.controls}>
          <button type="button" className={styles.controlBtn} onClick={() => zoomInRef.current()} title="Zoom In">
            +
          </button>
          <button type="button" className={styles.controlBtn} onClick={() => zoomOutRef.current()} title="Zoom Out">
            −
          </button>
          <button type="button" className={styles.controlBtn} onClick={() => resetViewRef.current()} title="Reset View">
            Reset
          </button>
        </div>
      </div>

      <div ref={containerRef} className={styles.canvasWrapper} />

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
        {(Object.entries(CATEGORY_COLORS) as [GraphNode["category"], { css: string; label: string }][]).map(
          ([cat, meta]) => (
            <span key={cat} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ backgroundColor: meta.css }} />
              {meta.label}
            </span>
          )
        )}
      </div>
    </div>
  )
}
