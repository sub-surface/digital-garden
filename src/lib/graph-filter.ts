export interface RawNode {
  id: string
  title: string
  tags?: string[]
}

export interface RawLink {
  source: string
  target: string
}

export interface GraphFilterOptions {
  slug?: string
  cluster?: string
  tag?: string
  scope?: "all" | "wiki" | "garden"
  depth?: number
}

export function getNodeCategory(slug: string): "philosophers" | "concepts" | "movements" | "texts" | "events" | "chatters" | "general" {
  const s = slug.toLowerCase()
  if (s.startsWith("wiki/philosophers/")) return "philosophers"
  if (s.startsWith("wiki/concepts/")) return "concepts"
  if (s.startsWith("wiki/movements/")) return "movements"
  if (s.startsWith("wiki/texts/")) return "texts"
  if (s.startsWith("wiki/events/")) return "events"
  if (s.startsWith("wiki/chatters/")) return "chatters"
  return "general"
}

export function normalizeSlugId(s: string): string {
  return s
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
}

export function filterGraphData(
  nodes: RawNode[],
  links: RawLink[],
  options: GraphFilterOptions = {}
): { filteredNodes: RawNode[]; filteredLinks: RawLink[]; centerId?: string } {
  const { slug, cluster, tag, scope = "all", depth = 1 } = options

  const isWikiSlug = (s: string) => {
    const lower = s.toLowerCase()
    return lower.startsWith("wiki/") || lower === "wiki"
  }

  let filteredNodes = [...nodes]

  // 1. Apply scope filter
  if (scope === "wiki") {
    filteredNodes = filteredNodes.filter((n) => isWikiSlug(n.id))
  } else if (scope === "garden") {
    filteredNodes = filteredNodes.filter((n) => !isWikiSlug(n.id))
  }

  // 2. Apply focal slug neighbourhood filter
  let centerId: string | undefined = undefined
  if (slug) {
    const normTarget = normalizeSlugId(slug)
    const targetBase = normTarget.split("/").pop() || ""

    let center = nodes.find((n) => normalizeSlugId(n.id) === normTarget)
    if (!center) {
      center = nodes.find((n) => {
        const base = normalizeSlugId(n.id).split("/").pop() || ""
        return base === targetBase
      })
    }
    centerId = center ? center.id : slug

    // Multi-hop BFS neighbourhood
    const visited = new Set<string>([centerId])
    let currentLevel = new Set<string>([centerId])

    for (let d = 0; d < depth; d++) {
      const nextLevel = new Set<string>()
      links.forEach((l) => {
        const s = typeof l.source === "string" ? l.source : (l.source as any).id
        const t = typeof l.target === "string" ? l.target : (l.target as any).id
        if (currentLevel.has(s) && !visited.has(t)) {
          nextLevel.add(t)
          visited.add(t)
        } else if (currentLevel.has(t) && !visited.has(s)) {
          nextLevel.add(s)
          visited.add(s)
        }
      })
      currentLevel = nextLevel
    }

    filteredNodes = filteredNodes.filter((n) => visited.has(n.id))
  }

  // 3. Apply cluster / category filter
  if (cluster) {
    const cLower = cluster.toLowerCase()
    filteredNodes = filteredNodes.filter((n) => {
      const cat = getNodeCategory(n.id)
      return cat === cLower || n.id.toLowerCase().includes(cLower)
    })
  }

  // 4. Apply tag filter
  if (tag) {
    const tLower = tag.toLowerCase()
    filteredNodes = filteredNodes.filter((n) =>
      n.tags?.some((t) => t.toLowerCase() === tLower)
    )
  }

  const validNodeIds = new Set(filteredNodes.map((n) => n.id))

  // Links where both endpoints exist in our filtered node set
  const filteredLinks = links
    .filter((l) => validNodeIds.has(l.source) && validNodeIds.has(l.target))
    .map((l) => ({ source: l.source, target: l.target }))

  return { filteredNodes, filteredLinks, centerId }
}
