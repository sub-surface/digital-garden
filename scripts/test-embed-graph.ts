import assert from "node:assert/strict"
import { filterGraphData, type RawNode, type RawLink } from "../src/lib/graph-filter.js"

const mockNodes: RawNode[] = [
  { id: "wiki/philosophers/bateson", title: "Gregory Bateson", tags: ["cybernetics", "systems"] },
  { id: "wiki/concepts/double-bind", title: "Double Bind", tags: ["cybernetics", "psychiatry"] },
  { id: "wiki/texts/steps-to-an-ecology-of-mind", title: "Steps to an Ecology of Mind", tags: ["ecology"] },
  { id: "wiki/movements/cybernetics", title: "Cybernetics", tags: ["cybernetics"] },
  { id: "garden/notes/emergence", title: "Emergence", tags: ["systems"] },
  { id: "garden/essays/digital-animism", title: "Digital Animism", tags: ["philosophy"] },
]

const mockLinks: RawLink[] = [
  { source: "wiki/philosophers/bateson", target: "wiki/concepts/double-bind" },
  { source: "wiki/philosophers/bateson", target: "wiki/texts/steps-to-an-ecology-of-mind" },
  { source: "wiki/concepts/double-bind", target: "wiki/movements/cybernetics" },
  { source: "wiki/philosophers/bateson", target: "garden/notes/emergence" },
  { source: "garden/notes/emergence", target: "garden/essays/digital-animism" },
]

// ── 1. Scope filtering ──
{
  const allRes = filterGraphData(mockNodes, mockLinks, { scope: "all" })
  assert.equal(allRes.filteredNodes.length, 6, "scope='all' should return all nodes")
  assert.equal(allRes.filteredLinks.length, 5, "scope='all' should return all links")

  const wikiRes = filterGraphData(mockNodes, mockLinks, { scope: "wiki" })
  assert.equal(wikiRes.filteredNodes.length, 4, "scope='wiki' should only return wiki/ nodes")
  assert.ok(wikiRes.filteredNodes.every(n => n.id.startsWith("wiki/")), "all nodes must be wiki")
  // Only links where both endpoints are wiki should remain (the link to garden/notes/emergence must be pruned)
  assert.equal(wikiRes.filteredLinks.length, 3, "links crossing out of wiki scope must be pruned")

  const gardenRes = filterGraphData(mockNodes, mockLinks, { scope: "garden" })
  assert.equal(gardenRes.filteredNodes.length, 2, "scope='garden' should only return garden nodes")
  assert.ok(gardenRes.filteredNodes.every(n => !n.id.startsWith("wiki/")))
  assert.equal(gardenRes.filteredLinks.length, 1, "only garden-to-garden links should remain")
}

// ── 2. Focal neighborhood filtering (BFS multi-hop) ──
{
  // depth=1 centered on bateson
  const focal1 = filterGraphData(mockNodes, mockLinks, {
    slug: "wiki/philosophers/bateson",
    depth: 1,
    scope: "all",
  })
  // Bateson connects directly to double-bind, steps, and emergence (3 neighbors + 1 focal = 4 nodes)
  assert.equal(focal1.filteredNodes.length, 4)
  const ids1 = new Set(focal1.filteredNodes.map(n => n.id))
  assert.ok(ids1.has("wiki/philosophers/bateson"))
  assert.ok(ids1.has("wiki/concepts/double-bind"))
  assert.ok(ids1.has("wiki/texts/steps-to-an-ecology-of-mind"))
  assert.ok(ids1.has("garden/notes/emergence"))
  assert.ok(!ids1.has("wiki/movements/cybernetics"), "2-hop neighbor should not be in depth=1")
  assert.ok(!ids1.has("garden/essays/digital-animism"), "2-hop neighbor should not be in depth=1")

  // depth=2 centered on bateson
  const focal2 = filterGraphData(mockNodes, mockLinks, {
    slug: "wiki/philosophers/bateson",
    depth: 2,
    scope: "all",
  })
  // Now includes cybernetics (via double-bind) and digital-animism (via emergence)
  assert.equal(focal2.filteredNodes.length, 6, "depth=2 should reach all 6 nodes")
}

// ── 3. Cluster / Category filtering ──
{
  const clusterRes = filterGraphData(mockNodes, mockLinks, {
    cluster: "concepts",
    scope: "all",
  })
  assert.equal(clusterRes.filteredNodes.length, 1)
  assert.equal(clusterRes.filteredNodes[0].id, "wiki/concepts/double-bind")
}

// ── 4. Tag filtering ──
{
  const tagRes = filterGraphData(mockNodes, mockLinks, {
    tag: "cybernetics",
    scope: "all",
  })
  // bateson, double-bind, cybernetics movement
  assert.equal(tagRes.filteredNodes.length, 3)
  assert.ok(tagRes.filteredNodes.every(n => n.tags?.includes("cybernetics")))
}

// ── 5. Combined filters (e.g. focal slug with scope='wiki') ──
{
  const combined = filterGraphData(mockNodes, mockLinks, {
    slug: "wiki/philosophers/bateson",
    scope: "wiki",
    depth: 1,
  })
  // emergence is connected to bateson, but is garden, so scope='wiki' prunes it
  assert.equal(combined.filteredNodes.length, 3)
  const cIds = new Set(combined.filteredNodes.map(n => n.id))
  assert.ok(!cIds.has("garden/notes/emergence"), "garden node must be excluded when scope='wiki'")
}

console.log("EmbedGraph filtering, neighborhood BFS, and scope pruning pass.")
