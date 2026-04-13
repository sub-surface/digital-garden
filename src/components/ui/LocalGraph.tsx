import { useEffect, useRef, useState } from "react"
import { useStore } from "@/store"
import { loadGraphData } from "@/lib/content-loader"
import * as PIXI from "pixi.js"
import * as d3 from "d3"
import styles from "./LocalGraph.module.scss"

interface Node extends d3.SimulationNodeDatum {
  id: string
  title: string
  tags: string[]
  gfx?: PIXI.Graphics
  label?: PIXI.Text
  isCurrent?: boolean
  fx?: number | null
  fy?: number | null
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node
  target: string | Node
}

interface Props {
  slug: string
}

export function LocalGraph({ slug }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const pushCard = useStore((s) => s.pushCard)
  const clearStack = useStore((s) => s.clearStack)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 800)
  const [isMinimised, setIsMinimised] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 800)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    if (!containerRef.current || isMinimised) return

    let simulation: d3.Simulation<Node, Link> | null = null
    let mounted = true
    const currentContainer = containerRef.current

    async function init() {
      const data = await loadGraphData()
      if (!data || !mounted) return

      const neighbors = new Set<string>()
      neighbors.add(slug)
      data.links.forEach(l => {
        if (l.source === slug) neighbors.add(l.target)
        if (l.target === slug) neighbors.add(l.source)
      })

      const localNodes: Node[] = data.nodes
        .filter(n => neighbors.has(n.id))
        .map(n => ({ ...n, isCurrent: n.id === slug }))
      
      const localLinks: Link[] = data.links
        .filter(l => neighbors.has(l.source as string) && neighbors.has(l.target as string))
        .map(l => ({ ...l }))

      if (!currentContainer) return
      const width = currentContainer.clientWidth
      const height = currentContainer.clientHeight

      const app = new PIXI.Application()
      appRef.current = app
      
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        eventMode: 'static',
      })
      
      if (!mounted || !currentContainer) {
        app.destroy(true, { children: true, texture: false })
        appRef.current = null
        return
      }

      currentContainer.innerHTML = ''
      currentContainer.appendChild(app.canvas)

      const stage = new PIXI.Container()
      app.stage.addChild(stage)
      stage.x = width / 2
      stage.y = height / 2

      simulation = d3.forceSimulation<Node>(localNodes)
        .force("link", d3.forceLink<Node, Link>(localLinks).id((d: any) => d.id).distance(isMobile ? 60 : 100))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(0, 0))
        .force("collision", d3.forceCollide().radius(isMobile ? 35 : 50))

      const linkLayer = new PIXI.Graphics()
      stage.addChild(linkLayer)

      const nodeLayer = new PIXI.Container()
      stage.addChild(nodeLayer)

      // Interaction & Zoom State
      let dragTarget: Node | null = null
      let isPanning = false
      let lastPos = { x: 0, y: 0 }
      let hasDragged = false
      
      // Easing state
      let targetScale = 1
      let targetX = stage.x
      let targetY = stage.y

      localNodes.forEach(node => {
        const gfx = new PIXI.Graphics()
        const accentHex = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").replace('#', ''), 16) || 0xffffff
        
        gfx.circle(0, 0, node.isCurrent ? 6 : 4).fill(node.isCurrent ? accentHex : 0xffffff)
        
        gfx.interactive = true
        gfx.cursor = 'pointer'

        gfx.on('pointerdown', (e) => {
          e.stopPropagation()
          dragTarget = node
          node.fx = node.x
          node.fy = node.y
          simulation?.alphaTarget(0.3).restart()
          hasDragged = false
        })

        const label = new PIXI.Text({
          text: node.title,
          style: {
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            fill: 0xffffff,
            align: 'center',
          },
          resolution: 4,
        })
        label.anchor.set(0.5, -1.5)
        label.alpha = node.isCurrent ? 1 : 0.4

        node.gfx = gfx
        node.label = label
        nodeLayer.addChild(gfx)
        nodeLayer.addChild(label)
      })

      app.stage.interactive = true
      app.stage.hitArea = new PIXI.Rectangle(-10000, -10000, 20000, 20000)

      app.stage.on('pointerdown', (e) => {
        if (!dragTarget) {
          isPanning = true
          lastPos = { x: e.global.x, y: e.global.y }
          targetX = stage.x
          targetY = stage.y
        }
      })

      app.stage.on('pointermove', (e) => {
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
          targetX = stage.x
          targetY = stage.y
          lastPos = { x: e.global.x, y: e.global.y }
        }
      })

      const onGlobalUp = () => {
        if (dragTarget) {
          if (!hasDragged && dragTarget.id !== slug) {
            pushCard({
              url: `/${dragTarget.id}`,
              slug: dragTarget.id,
              title: dragTarget.title,
              html: `<div class="note-loading">Loading...</div>`
            }, -1)
          }
          dragTarget.fx = null
          dragTarget.fy = null
          dragTarget = null
          simulation?.alphaTarget(0)
        }
        isPanning = false
      }

      app.stage.on('pointerup', onGlobalUp)
      app.stage.on('pointerupoutside', onGlobalUp)

      // Stronger Scroll Zoom (Fixed Violation)
      const handleWheel = (e: WheelEvent) => {
        if (!mounted || !appRef.current) return
        e.preventDefault()
        
        const scaleChange = e.deltaY > 0 ? 0.85 : 1.15
        const oldScale = targetScale
        targetScale = Math.max(0.2, Math.min(targetScale * scaleChange, 4))
        
        const mousePos = app.renderer.events.pointer.global
        const localPos = stage.toLocal(mousePos)
        
        targetX -= localPos.x * (targetScale - oldScale)
        targetY -= localPos.y * (targetScale - oldScale)
      }

      currentContainer.addEventListener("wheel", handleWheel, { passive: false })

      const tickerCallback = () => {
        if (!mounted || !appRef.current) return
        
        // Easing interpolation (LERP)
        const lerpFactor = 0.15
        stage.scale.set(stage.scale.x + (targetScale - stage.scale.x) * lerpFactor)
        if (!isPanning) {
          stage.x += (targetX - stage.x) * lerpFactor
          stage.y += (targetY - stage.y) * lerpFactor
        }

        linkLayer.clear()
        const isDark = document.documentElement.getAttribute("data-theme") === "dark"
        const linkColor = isDark ? 0xffffff : 0x000000
        const labelColor = isDark ? 0xffffff : 0x000000
        const accentHex = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").replace('#', ''), 16) || 0xffffff

        localLinks.forEach(link => {
          const source = link.source as Node
          const target = link.target as Node
          linkLayer.moveTo(source.x!, source.y!)
          linkLayer.lineTo(target.x!, target.y!)
        })
        linkLayer.stroke({ width: 1, color: linkColor, alpha: 0.1 })

        localNodes.forEach(node => {
          if (node.gfx) {
            node.gfx.x = node.x!
            node.gfx.y = node.y!
            // Redraw nodes to ensure they exist
            node.gfx.clear().circle(0, 0, node.isCurrent ? 6 : 4).fill(node.isCurrent ? accentHex : linkColor)
          }
          if (node.label) {
            node.label.x = node.x!
            node.label.y = node.y!
            node.label.style.fill = labelColor
          }
        })
      }

      app.ticker.add(tickerCallback)

      // Cleanup
      return () => {
        mounted = false
        simulation?.stop()
        if (currentContainer) {
          currentContainer.removeEventListener("wheel", handleWheel)
        }
        if (appRef.current) {
          try {
            appRef.current.ticker.stop()
            appRef.current.destroy(true, { children: true, texture: false })
          } catch (e) {
            console.warn("Pixi destruction failed:", e)
          }
          appRef.current = null
        }
      }
    }

    const cleanup = init()

    return () => {
      mounted = false
      cleanup.then(fn => fn?.())
    }
  }, [slug, pushCard, isMobile, isMinimised])

  return (
    <div className={styles.localGraph} data-floating={!isMobile || undefined} data-minimised={isMinimised || undefined}>
      {!isMinimised && <div ref={containerRef} className={styles.canvasWrapper} />}
      <div className={styles.header}>
        <span className={styles.title}>{isMinimised ? "Radar" : "Radar Scope"}</span>
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
