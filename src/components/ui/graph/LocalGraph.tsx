import { useEffect, useRef, useState } from "react"
import { useStore } from "@/store"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { loadGraphData } from "@/lib/content-loader"
import * as d3 from "d3"
import styles from "./LocalGraph.module.scss"

interface LocalNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  tags: string[]
  isCurrent: boolean
  degree: number
  r: number
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface LocalLink extends d3.SimulationLinkDatum<LocalNode> {
  source: LocalNode | string
  target: LocalNode | string
  isDirect: boolean
}

interface Props {
  slug: string
}

function normalizeSlugId(s: string): string {
  return s
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
}

export function LocalGraph({ slug }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pushCard = useStore((s) => s.pushCard)
  const isMobile = usePhoneViewport()
  const [isMinimised, setIsMinimised] = useState(true)

  useEffect(() => {
    if (!containerRef.current || isMinimised) return

    let simulation: d3.Simulation<LocalNode, LocalLink> | null = null
    let animFrameId: number | null = null
    let mounted = true
    const currentContainer = containerRef.current

    async function init() {
      const data = await loadGraphData()
      if (!data || !mounted || !currentContainer) return

      const targetNorm = normalizeSlugId(slug)
      const targetBase = targetNorm.split("/").pop() || ""

      // Find the central node matching full path or basename
      let centerNode = data.nodes.find((n) => normalizeSlugId(n.id) === targetNorm)
      if (!centerNode) {
        centerNode = data.nodes.find((n) => {
          const base = normalizeSlugId(n.id).split("/").pop() || ""
          return base === targetBase
        })
      }
      const centerId = centerNode ? centerNode.id : slug

      // Compute total degrees across whole graph for log-scaling
      const fullDegreeMap = new Map<string, number>()
      data.links.forEach((l) => {
        const s = typeof l.source === "string" ? l.source : (l.source as any).id
        const t = typeof l.target === "string" ? l.target : (l.target as any).id
        fullDegreeMap.set(s, (fullDegreeMap.get(s) || 0) + 1)
        fullDegreeMap.set(t, (fullDegreeMap.get(t) || 0) + 1)
      })

      // Immediate neighbors of central node (1-hop radius)
      const neighborIds = new Set<string>()
      neighborIds.add(centerId)

      data.links.forEach((l) => {
        const s = typeof l.source === "string" ? l.source : (l.source as any).id
        const t = typeof l.target === "string" ? l.target : (l.target as any).id
        if (normalizeSlugId(s) === normalizeSlugId(centerId)) {
          neighborIds.add(t)
        } else if (normalizeSlugId(t) === normalizeSlugId(centerId)) {
          neighborIds.add(s)
        }
      })

      // Build local nodes with log-like radius scaling
      const localNodes: LocalNode[] = data.nodes
        .filter((n) =>
          Array.from(neighborIds).some((id) => normalizeSlugId(id) === normalizeSlugId(n.id)),
        )
        .map((n) => {
          const isCurrent = normalizeSlugId(n.id) === normalizeSlugId(centerId)
          const deg = fullDegreeMap.get(n.id) || 1
          // Logarithmic radius: center is prominent, neighbors scale smoothly by degree
          const r = isCurrent
            ? 3.5 + Math.min(3, Math.log2(deg + 1) * 0.75)
            : 1.8 + Math.min(2.5, Math.log2(deg + 1) * 0.65)
          return {
            id: n.id,
            title: n.title || n.id.split("/").pop() || n.id,
            tags: n.tags || [],
            isCurrent,
            degree: deg,
            r,
            x: (Math.random() - 0.5) * 60,
            y: (Math.random() - 0.5) * 60,
          }
        })

      if (localNodes.length === 0) {
        localNodes.push({
          id: centerId,
          title: slug.split("/").pop() || slug,
          tags: [],
          isCurrent: true,
          degree: 0,
          r: 3.5,
          x: 0,
          y: 0,
        })
      }

      // Build all links between nodes in the local neighborhood
      const localNodeMap = new Map<string, LocalNode>()
      localNodes.forEach((n) => {
        localNodeMap.set(normalizeSlugId(n.id), n)
      })

      const localLinks: LocalLink[] = []
      const seenPairs = new Set<string>()

      data.links.forEach((l) => {
        const s = typeof l.source === "string" ? l.source : (l.source as any).id
        const t = typeof l.target === "string" ? l.target : (l.target as any).id
        const sNode = localNodeMap.get(normalizeSlugId(s))
        const tNode = localNodeMap.get(normalizeSlugId(t))
        if (sNode && tNode && sNode.id !== tNode.id) {
          const pairKey = [sNode.id, tNode.id].sort().join("<->")
          if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey)
            const isDirect = sNode.isCurrent || tNode.isCurrent
            localLinks.push({
              source: sNode,
              target: tNode,
              isDirect,
            })
          }
        }
      })

      // Wait two animation frames for CSS transition to settle layout dimensions
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      if (!mounted || !currentContainer) return

      let width = currentContainer.clientWidth || (isMobile ? 300 : 280)
      let height = currentContainer.clientHeight || (isMobile ? 240 : 280)

      // Create Canvas element
      currentContainer.innerHTML = ""
      const canvas = document.createElement("canvas")
      canvasRef.current = canvas
      currentContainer.appendChild(canvas)

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      // Setup D3 Force Simulation
      simulation = d3
        .forceSimulation<LocalNode>(localNodes)
        .force(
          "link",
          d3
            .forceLink<LocalNode, LocalLink>(localLinks)
            .id((d) => d.id)
            .distance((l) => (l.isDirect ? (isMobile ? 45 : 65) : (isMobile ? 55 : 85)))
            .strength(0.55),
        )
        .force("charge", d3.forceManyBody().strength(-160))
        .force("center", d3.forceCenter(0, 0).strength(0.12))
        .force(
          "collision",
          d3
            .forceCollide<LocalNode>()
            .radius((d) => d.r + (isMobile ? 12 : 16))
            .strength(0.8),
        )

      // Camera / Zoom / Pan State
      let cameraX = width / 2
      let cameraY = height / 2
      let targetCameraX = cameraX
      let targetCameraY = cameraY
      let scale = 1.0
      let targetScale = 1.0

      let isPanning = false
      let panStart = { x: 0, y: 0 }
      let dragNode: LocalNode | null = null
      let hasDragged = false
      let hoveredNode: LocalNode | null = null

      // Resolve theme accent color
      const accentColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-accent-base")
          .trim() || "#b4424c"

      // Handle ResizeObserver
      const resizeObserver = new ResizeObserver((entries) => {
        if (!mounted || !canvas) return
        const entry = entries[0]
        if (!entry) return
        const w = entry.contentRect.width
        const h = entry.contentRect.height
        if (w < 2 || h < 2) return

        width = w
        height = h
        canvas.width = width * dpr
        canvas.height = height * dpr
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
        targetCameraX = width / 2
        targetCameraY = height / 2
        simulation?.alpha(0.3).restart()
      })
      resizeObserver.observe(currentContainer)

      // Pointer Coordinate Helper
      function getCanvasPos(e: MouseEvent | Touch): { x: number; y: number } {
        const rect = canvas.getBoundingClientRect()
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        }
      }

      function toWorldPos(screenX: number, screenY: number): { x: number; y: number } {
        return {
          x: (screenX - cameraX) / scale,
          y: (screenY - cameraY) / scale,
        }
      }

      function findNodeAt(worldX: number, worldY: number): LocalNode | null {
        for (let i = localNodes.length - 1; i >= 0; i--) {
          const n = localNodes[i]
          const dx = worldX - n.x
          const dy = worldY - n.y
          if (dx * dx + dy * dy <= (n.r + 6) * (n.r + 6)) {
            return n
          }
        }
        return null
      }

      // Pointer Event Handlers
      const onPointerDown = (e: MouseEvent) => {
        const pos = getCanvasPos(e)
        const world = toWorldPos(pos.x, pos.y)
        const hit = findNodeAt(world.x, world.y)

        if (hit) {
          dragNode = hit
          hit.fx = hit.x
          hit.fy = hit.y
          hasDragged = false
          simulation?.alphaTarget(0.3).restart()
        } else {
          isPanning = true
          panStart = { x: pos.x - targetCameraX, y: pos.y - targetCameraY }
        }
      }

      const onPointerMove = (e: MouseEvent) => {
        const pos = getCanvasPos(e)
        const world = toWorldPos(pos.x, pos.y)

        if (dragNode) {
          dragNode.fx = world.x
          dragNode.fy = world.y
          hasDragged = true
        } else if (isPanning) {
          targetCameraX = pos.x - panStart.x
          targetCameraY = pos.y - panStart.y
          hasDragged = true
        } else {
          const hit = findNodeAt(world.x, world.y)
          hoveredNode = hit
          canvas.style.cursor = hit ? "pointer" : "default"
        }
      }

      const onPointerUp = () => {
        if (dragNode) {
          if (!hasDragged && dragNode.id !== centerId) {
            pushCard(
              {
                url: `/${dragNode.id}`,
                slug: dragNode.id,
                title: dragNode.title,
                html: `<div class="note-loading">Loading...</div>`,
              },
              -1,
            )
          }
          dragNode.fx = null
          dragNode.fy = null
          dragNode = null
          simulation?.alphaTarget(0)
        }
        isPanning = false
      }

      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const pos = getCanvasPos(e)
        const worldBefore = toWorldPos(pos.x, pos.y)

        const factor = e.deltaY < 0 ? 1.15 : 0.85
        targetScale = Math.max(0.3, Math.min(3.5, targetScale * factor))

        // Center zoom on pointer
        targetCameraX = pos.x - worldBefore.x * targetScale
        targetCameraY = pos.y - worldBefore.y * targetScale
      }

      canvas.addEventListener("mousedown", onPointerDown)
      window.addEventListener("mousemove", onPointerMove)
      window.addEventListener("mouseup", onPointerUp)
      canvas.addEventListener("wheel", onWheel, { passive: false })

      // Main Render Loop
      let startTime = performance.now()
      function render() {
        if (!mounted || !ctx) return

        // Smooth camera lerp
        cameraX += (targetCameraX - cameraX) * 0.15
        cameraY += (targetCameraY - cameraY) * 0.15
        scale += (targetScale - scale) * 0.15

        ctx.save()
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, width, height)

        ctx.translate(cameraX, cameraY)
        ctx.scale(scale, scale)

        const elapsed = (performance.now() - startTime) / 1000

        // 1. Draw Links
        localLinks.forEach((l) => {
          const s = l.source as LocalNode
          const t = l.target as LocalNode
          if (s.x === undefined || t.x === undefined) return

          ctx.beginPath()
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(t.x, t.y)

          const isHighlighted =
            hoveredNode && (hoveredNode.id === s.id || hoveredNode.id === t.id)

          if (isHighlighted) {
            ctx.strokeStyle = accentColor
            ctx.lineWidth = 1.8 / scale
            ctx.globalAlpha = 0.85
          } else if (l.isDirect) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"
            ctx.lineWidth = 1.2 / scale
            ctx.globalAlpha = 0.5
          } else {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)"
            ctx.lineWidth = 0.8 / scale
            ctx.globalAlpha = 0.25
          }
          ctx.stroke()
        })

        // 2. Draw Nodes (cores and halos)
        localNodes.forEach((n) => {
          if (n.x === undefined || n.y === undefined) return

          const isHovered = hoveredNode?.id === n.id

          if (n.isCurrent) {
            // Central node glowing halo
            const pulse = Math.sin(elapsed * 3) * 0.8
            ctx.beginPath()
            ctx.arc(n.x, n.y, n.r + 3 + pulse, 0, Math.PI * 2)
            ctx.fillStyle = accentColor
            ctx.globalAlpha = 0.22
            ctx.fill()

            // Central node core
            ctx.beginPath()
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
            ctx.fillStyle = accentColor
            ctx.globalAlpha = 1.0
            ctx.fill()
          } else {
            // Connected neighbor nodes
            ctx.beginPath()
            ctx.arc(n.x, n.y, isHovered ? n.r + 1.5 : n.r, 0, Math.PI * 2)
            ctx.fillStyle = isHovered ? accentColor : "#e2e8f0"
            ctx.globalAlpha = isHovered ? 1.0 : 0.75
            ctx.fill()
          }
        })

        // 3. Draw Labels (Always on top of all nodes, halos, and links)
        const renderLocalLabel = (n: LocalNode) => {
          if (n.x === undefined || n.y === undefined) return
          const isHovered = hoveredNode?.id === n.id

          ctx.font = `${n.isCurrent ? "bold " : ""}9px "JetBrains Mono", monospace`
          ctx.textAlign = "center"
          ctx.textBaseline = "top"

          const labelY = n.y + n.r + 3.5
          // Text shadow backing
          ctx.fillStyle = "rgba(0, 0, 0, 0.85)"
          ctx.globalAlpha = 0.95
          ctx.fillText(n.title, n.x + 0.5, labelY + 0.5)

          ctx.fillStyle = n.isCurrent ? "#ffffff" : isHovered ? "#ffffff" : "#cbd5e1"
          ctx.globalAlpha = n.isCurrent ? 1.0 : isHovered ? 1.0 : 0.8
          ctx.fillText(n.title, n.x, labelY)
        }

        // Render regular labels first, and hovered node label last to keep it topmost
        localNodes.forEach((n) => {
          if (hoveredNode && n.id === hoveredNode.id) return
          renderLocalLabel(n)
        })
        if (hoveredNode) {
          renderLocalLabel(hoveredNode)
        }

        ctx.restore()
        animFrameId = requestAnimationFrame(render)
      }

      animFrameId = requestAnimationFrame(render)

      return () => {
        mounted = false
        if (animFrameId) cancelAnimationFrame(animFrameId)
        simulation?.stop()
        resizeObserver.disconnect()
        canvas.removeEventListener("mousedown", onPointerDown)
        window.removeEventListener("mousemove", onPointerMove)
        window.removeEventListener("mouseup", onPointerUp)
        canvas.removeEventListener("wheel", onWheel)
      }
    }

    const cleanupPromise = init()

    return () => {
      mounted = false
      cleanupPromise.then((fn) => fn?.())
    }
  }, [slug, isMobile, isMinimised, pushCard])

  return (
    <div
      className={styles.localGraph}
      data-floating={!isMobile || undefined}
      data-minimised={isMinimised || undefined}
    >
      {!isMinimised && <div ref={containerRef} className={styles.canvasWrapper} />}
      <div className={styles.header}>
        <span className={styles.title}>Neighborhood</span>
        <div className={styles.actions}>
          {!isMinimised && (
            <button
              className={styles.actionBtn}
              onClick={() => useStore.getState().setGraphOpen(true)}
              title="Open Full Graph"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
          )}
          <button
            className={styles.actionBtn}
            onClick={() => setIsMinimised(!isMinimised)}
            title={isMinimised ? "Restore" : "Minimise"}
          >
            {isMinimised ? "+" : "\u2013"}
          </button>
        </div>
      </div>
    </div>
  )
}
