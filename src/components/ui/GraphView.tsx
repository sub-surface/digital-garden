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
  x?: number
  y?: number
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node
  target: string | Node
}

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const pushCard = useStore((s) => s.pushCard)

  useEffect(() => {
    if (!containerRef.current) return

    let app: PIXI.Application | null = null
    let simulation: d3.Simulation<Node, Link> | null = null

    async function init() {
      const data = await loadGraphData()
      if (!data) return

      const width = containerRef.current!.clientWidth
      const height = containerRef.current!.clientHeight

      app = new PIXI.Application()
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })
      containerRef.current!.appendChild(app.canvas)

      const stage = new PIXI.Container()
      app.stage.addChild(stage)

      // Center stage
      stage.x = width / 2
      stage.y = height / 2

      const nodes: Node[] = data.nodes.map(n => ({ ...n }))
      const links: Link[] = data.links.map(l => ({ ...l }))

      simulation = d3.forceSimulation<Node>(nodes)
        .force("link", d3.forceLink<Node, Link>(links).id((d: any) => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-200))
        .force("center", d3.forceCenter(0, 0))
        .force("collision", d3.forceCollide().radius(20))

      const linkLayer = new PIXI.Graphics()
      stage.addChild(linkLayer)

      const nodeLayer = new PIXI.Container()
      stage.addChild(nodeLayer)

      nodes.forEach(node => {
        const gfx = new PIXI.Graphics()
        gfx.circle(0, 0, 5).fill(0xffffff)
        
        gfx.interactive = true
        gfx.cursor = 'pointer'
        
        gfx.on('pointerdown', (e: any) => {
          if (e.button === 0) {
            pushCard({
              url: `/${node.id}`,
              slug: node.id,
              title: node.title,
              html: `<div class="note-loading">Loading...</div>`
            }, -1)
          }
        })

        const label = new PIXI.Text({
          text: node.title,
          style: {
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            fill: 0xffffff,
            align: 'center',
          }
        })
        label.anchor.set(0.5, -1.5)
        label.visible = false

        gfx.on('pointerover', () => {
          label.visible = true
          gfx.clear()
          const accent = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").replace('#', ''), 16) || 0xffffff
          gfx.circle(0, 0, 8).fill(accent)
        })

        gfx.on('pointerout', () => {
          label.visible = false
          gfx.clear()
          gfx.circle(0, 0, 5).fill(0xffffff)
        })

        node.gfx = gfx
        node.label = label
        nodeLayer.addChild(gfx)
        nodeLayer.addChild(label)
      })

      app.ticker.add(() => {
        linkLayer.clear()
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
          }
          if (node.label) {
            node.label.x = node.x!
            node.label.y = node.y!
          }
        })
      })

      // Zoom and Pan
      let isDragging = false
      let lastPos = { x: 0, y: 0 }

      containerRef.current!.onwheel = (e) => {
        e.preventDefault()
        const scaleChange = e.deltaY > 0 ? 0.9 : 1.1
        stage.scale.x *= scaleChange
        stage.scale.y *= scaleChange
      }

      containerRef.current!.onmousedown = (e) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
          isDragging = true
          lastPos = { x: e.clientX, y: e.clientY }
        }
      }

      window.onmousemove = (e) => {
        if (isDragging) {
          const dx = e.clientX - lastPos.x
          const dy = e.clientY - lastPos.y
          stage.x += dx
          stage.y += dy
          lastPos = { x: e.clientX, y: e.clientY }
        }
      }

      window.onmouseup = () => {
        isDragging = false
      }

      setLoading(false)
    }

    init()

    return () => {
      simulation?.stop()
      app?.ticker.stop()
      app?.destroy(true, { children: true, texture: true })
    }
  }, [])

  return (
    <div className={styles.graphContainer}>
      <div ref={containerRef} className={styles.canvasWrapper} />
      {loading && <div className={styles.loading}>Generating knowledge map...</div>}
      <div className={styles.controls}>
        <span>Middle-click or Alt+Drag to Pan</span>
        <span>Scroll to Zoom</span>
      </div>
    </div>
  )
}
