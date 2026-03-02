import { useEffect, useRef } from "react"
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
  x?: number
  y?: number
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
  const pushCard = useStore((s) => s.pushCard)

  useEffect(() => {
    if (!containerRef.current) return

    let app: PIXI.Application | null = null
    let simulation: d3.Simulation<Node, Link> | null = null

    async function init() {
      const data = await loadGraphData()
      if (!data) return

      // Filter for neighbors only
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

      const width = containerRef.current!.clientWidth
      const height = containerRef.current!.clientHeight

      app = new PIXI.Application()
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
      })
      containerRef.current!.appendChild(app.canvas)

      const stage = new PIXI.Container()
      app.stage.addChild(stage)
      stage.x = width / 2
      stage.y = height / 2

      simulation = d3.forceSimulation<Node>(localNodes)
        .force("link", d3.forceLink<Node, Link>(localLinks).id((d: any) => d.id).distance(80))
        .force("charge", d3.forceManyBody().strength(-150))
        .force("center", d3.forceCenter(0, 0))
        .force("collision", d3.forceCollide().radius(30))

      const linkLayer = new PIXI.Graphics()
      stage.addChild(linkLayer)

      const nodeLayer = new PIXI.Container()
      stage.addChild(nodeLayer)

      localNodes.forEach(node => {
        const gfx = new PIXI.Graphics()
        const accentHex = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--color-accent-base").replace('#', ''), 16) || 0xffffff
        
        gfx.circle(0, 0, node.isCurrent ? 6 : 4).fill(node.isCurrent ? accentHex : 0xffffff)
        
        gfx.interactive = true
        gfx.cursor = 'pointer'
        gfx.on('pointerdown', () => {
          if (node.id !== slug) {
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
            fontSize: 9,
            fill: 0xffffff,
            align: 'center',
          }
        })
        label.anchor.set(0.5, -1.5)
        label.alpha = node.isCurrent ? 1 : 0.4

        node.gfx = gfx
        node.label = label
        nodeLayer.addChild(gfx)
        nodeLayer.addChild(label)
      })

      app.ticker.add(() => {
        linkLayer.clear()
        
        localLinks.forEach(link => {
          const source = link.source as Node
          const target = link.target as Node
          linkLayer.moveTo(source.x!, source.y!)
          linkLayer.lineTo(target.x!, target.y!)
        })
        linkLayer.stroke({ width: 1, color: 0xffffff, alpha: 0.1 })

        localNodes.forEach(node => {
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

      setLoading(false)
    }

    let loading = true
    const setLoading = (v: boolean) => { loading = v }

    init()

    return () => {
      app?.destroy(true, { children: true, texture: true })
      simulation?.stop()
    }
  }, [slug])

  return (
    <div className={styles.localGraph}>
      <div ref={containerRef} className={styles.canvasWrapper} />
      <div className={styles.title}>Local Graph</div>
    </div>
  )
}
