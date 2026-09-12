/**
 * Constellation Graph Emitter with Pre-Calculated Force Relaxation (SSG Pipeline Phase 3b).
 *
 * Pre-relaxes the global knowledge graph using D3 force simulation at build time.
 * Baking stable celestial (x, y) coordinates directly into `public/graph.json` eliminates
 * blocking client-side tick warmups, prevents violent spring oscillations on page load,
 * and allows BgCanvas background mode to display the authentic semantic constellation.
 */
import * as fs from "fs"
import * as path from "path"
import * as d3 from "d3"

export interface GraphModel {
  index: Record<string, any>
}

export interface EmittedGraphData {
  nodes: Array<{
    id: string
    title: string
    tags: string[]
    x: number
    y: number
  }>
  links: Array<{
    source: string
    target: string
  }>
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  tags: string[]
  clusterTargetX: number
  clusterTargetY: number
  degree: number
  r: number
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: SimNode | string
  target: SimNode | string
}

// PRNG for 100% deterministic, reproducible force relaxation across builds
function createPrng(seed = 0x5a17) {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const norm = (t: string) => t.toLowerCase().trim()

function getClusterKey(slug: string, tags: string[] = []): string {
  if (tags && tags.length > 0 && tags[0].trim()) {
    return norm(tags[0])
  }
  const parts = slug.split("/")
  if (parts.length > 1) {
    if (parts[0].toLowerCase() === "wiki" && parts.length > 2) {
      return `wiki/${parts[1].toLowerCase()}`
    }
    return parts[0].toLowerCase()
  }
  return "general"
}

export function emitGraph(
  model: GraphModel,
  publicDir: string,
): { nodeCount: number; linkCount: number; durationMs: number } {
  const start = Date.now()
  const prng = createPrng(0x90210)

  // System-page entries (synthesized, no real links) would show up as orphan
  // stars — exclude them from the Constellation.
  const graphable = Object.values(model.index).filter((n) => !n.system)

  const links: Array<{ source: string; target: string }> = []
  const degreeMap = new Map<string, number>()

  for (const meta of graphable) {
    const validLinks = Array.isArray(meta.links) ? meta.links : []
    for (const target of validLinks) {
      links.push({ source: meta.slug, target })
      degreeMap.set(meta.slug, (degreeMap.get(meta.slug) ?? 0) + 1)
      degreeMap.set(target, (degreeMap.get(target) ?? 0) + 1)
    }
  }

  // Group into clusters along a celestial circle
  const clusterSet = new Set<string>()
  for (const n of graphable) {
    clusterSet.add(getClusterKey(n.slug, n.tags))
  }
  const clusterList = Array.from(clusterSet).sort()
  const clusterCenters = new Map<string, { x: number; y: number }>()
  const clusterRadius = 600

  clusterList.forEach((key, idx) => {
    const angle = (idx / clusterList.length) * Math.PI * 2
    clusterCenters.set(key, {
      x: Math.cos(angle) * clusterRadius,
      y: Math.sin(angle) * clusterRadius,
    })
  })

  // Initialize simulation nodes near cluster center with deterministic jitter
  const simNodes: SimNode[] = graphable.map((n) => {
    const clusterKey = getClusterKey(n.slug, n.tags)
    const center = clusterCenters.get(clusterKey) ?? { x: 0, y: 0 }
    const deg = degreeMap.get(n.slug) ?? 0
    const jitterRadius = 120 + prng() * 180
    const jitterAngle = prng() * Math.PI * 2

    return {
      id: n.slug,
      title: n.title,
      tags: Array.isArray(n.tags) ? n.tags : [],
      clusterTargetX: center.x,
      clusterTargetY: center.y,
      degree: deg,
      r: 1.3 + Math.min(7.0, Math.log2(deg + 1) * 1.3),
      x: center.x + Math.cos(jitterAngle) * jitterRadius,
      y: center.y + Math.sin(jitterAngle) * jitterRadius,
    }
  })

  const simLinks: SimLink[] = links.map((l) => ({ source: l.source, target: l.target }))

  // Run headless D3 force relaxation
  const simulation = d3
    .forceSimulation<SimNode>(simNodes)
    .force(
      "link",
      d3
        .forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance((l) => {
          const sDeg = (l.source as SimNode).degree ?? 1
          const tDeg = (l.target as SimNode).degree ?? 1
          return 40 + Math.min(60, Math.sqrt(sDeg + tDeg) * 6)
        })
        .strength(0.35),
    )
    .force(
      "charge",
      d3
        .forceManyBody<SimNode>()
        .strength((d) => -50 - d.degree * 8)
        .distanceMax(550),
    )
    .force(
      "collide",
      d3
        .forceCollide<SimNode>()
        .radius((d) => d.r + 5)
        .iterations(2),
    )
    .force(
      "clusterX",
      d3.forceX<SimNode>((d) => d.clusterTargetX).strength(0.04),
    )
    .force(
      "clusterY",
      d3.forceY<SimNode>((d) => d.clusterTargetY).strength(0.04),
    )
    .force("center", d3.forceCenter(0, 0).strength(0.02))
    .alphaDecay(0.02)
    .velocityDecay(0.35)

  // Run 100 ticks to reach celestial equilibrium
  for (let i = 0; i < 100; i++) {
    simulation.tick()
  }

  // Format final payload with coordinates rounded to 1 decimal place
  const emittedData: EmittedGraphData = {
    nodes: simNodes.map((n) => ({
      id: n.id,
      title: n.title,
      tags: n.tags,
      x: Math.round((n.x ?? 0) * 10) / 10,
      y: Math.round((n.y ?? 0) * 10) / 10,
    })),
    links,
  }

  const destPath = path.join(publicDir, "graph.json")
  fs.writeFileSync(destPath, JSON.stringify(emittedData), "utf-8")

  return {
    nodeCount: emittedData.nodes.length,
    linkCount: emittedData.links.length,
    durationMs: Date.now() - start,
  }
}
