import { useEffect, useRef, useState } from "react"
import { useStore } from "@/store"
import { loadGraphData } from "@/lib/content-loader"
import * as PIXI from "pixi.js"
import * as d3 from "d3"
import styles from "./GraphView.module.scss"

interface Node extends d3.SimulationNodeDatum {
  id: string
  title: string
  tags: string[]
  gfx?: PIXI.Graphics
  label?: PIXI.Text
  fx?: number | null
  fy?: number | null
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node
  target: string | Node
}

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const [loading, setLoading] = useState(true)
  const pushCard = useStore((s) => s.pushCard)
  const setGraphOpen = useStore((s) => s.setGraphOpen)

  useEffect(() => {
    if (!containerRef.current) return

    let simulation: d3.Simulation<Node, Link> | null = null
    let mounted = true
    const currentContainer = containerRef.current

    async function init() {
      const data = await loadGraphData()
      if (!data || !mounted) return

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
        app.destroy(true, { children: true, texture: true })
        appRef.current = null
        return
      }
      currentContainer.innerHTML = ''
      currentContainer.appendChild(app.canvas)

      const stage = new PIXI.Container()
      app.stage.addChild(stage)
      stage.x = width / 2
      stage.y = height / 2

      const nodes: Node[] = data.nodes.map(n => ({ ...n }))
      const links: Link[] = data.links.map(l => ({ ...l }))

      simulation = d3.forceSimulation<Node>(nodes)
        .force("link", d3.forceLink<Node, Link>(links).id((d: any) => d.id).distance(120))
        .force("charge", d3.forceManyBody().strength(-400))
        .force("center", d3.forceCenter(0, 0))
        .force("collision", d3.forceCollide().radius(30))

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

      nodes.forEach(node => {
        const gfx = new PIXI.Graphics()
        gfx.circle(0, 0, 5).fill(0xffffff)
        
        gfx.interactive = true
        gfx.cursor = 'pointer'
        
        gfx.on('pointerdown', (e) => {
          if (e.button === 0) {
            e.stopPropagation()
            dragTarget = node
            node.fx = node.x
            node.fy = node.y
            simulation?.alphaTarget(0.3).restart()
            hasDragged = false
          }
        })

        const label = new PIXI.Text({
          text: node.title,
          style: {
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            fill: 0xffffff,
            align: 'center',
          },
          resolution: 4,
        })
        label.anchor.set(0.5, -1.5)
        label.visible = false

        gfx.on('pointerover', () => {
          label.visible = true
        })

        gfx.on('pointerout', () => {
          if (dragTarget !== node) {
            label.visible = false
          }
        })

        node.gfx = gfx
        node.label = label
        nodeLayer.addChild(gfx)
        nodeLayer.addChild(label)
      })

      // Global Stage interactions
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
          if (!hasDragged) {
            pushCard({
              url: `/${dragTarget.id}`,
              slug: dragTarget.id,
              title: dragTarget.title,
              html: `<div class="note-loading">Loading...</div>`
            }, -1)
            setGraphOpen(false)
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

      // Wheel Listener (Fixed Violation)
      const handleWheel = (e: WheelEvent) => {
        if (!mounted || !appRef.current) return
        e.preventDefault()
        const scaleChange = e.deltaY > 0 ? 0.85 : 1.15
        const oldScale = targetScale
        targetScale = Math.max(0.1, Math.min(targetScale * scaleChange, 5))
        
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
        const linkBaseColor = isDark ? 0xffffff : 0x000000
        const labelColor = isDark ? 0xffffff : 0x000000
        const accent = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").replace('#', ''), 16) || 0xffffff
        
        links.forEach(link => {
          const source = link.source as Node
          const target = link.target as Node
          linkLayer.moveTo(source.x!, source.y!)
          linkLayer.lineTo(target.x!, target.y!)
        })
        linkLayer.stroke({ width: 1, color: accent, alpha: 0.2 })

        nodes.forEach(node => {
          if (node.gfx) {
            node.gfx.x = node.x!
            node.gfx.y = node.y!
            
            node.gfx.clear()
            if (node.label?.visible || dragTarget === node) {
              node.gfx.circle(0, 0, 8).fill(accent)
            } else {
              node.gfx.circle(0, 0, 5).fill(linkBaseColor)
            }
          }
          if (node.label) {
            node.label.x = node.x!
            node.label.y = node.y!
            node.label.style.fill = labelColor
          }
        })
      }

      app.ticker.add(tickerCallback)

      setLoading(false)

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
            appRef.current.destroy(true, { children: true, texture: true })
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
  }, [pushCard, setGraphOpen])

  return (
    <div className={styles.graphContainer}>
      <div ref={containerRef} className={styles.canvasWrapper} />
      {loading && <div className={styles.loading}>Generating knowledge map...</div>}
      <div className={styles.controls}>
        <span>Drag Nodes to Explore</span>
        <span>Drag Space to Pan</span>
        <span>Scroll to Zoom</span>
      </div>
    </div>
  )
}
