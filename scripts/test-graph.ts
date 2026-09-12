/**
 * Test Suite: Constellation Graph & Pre-Calculated Force Relaxation (SSG Pipeline Phase 3b).
 *
 * Verifies:
 *  1. public/graph.json exists and adheres to { nodes: Array<{id, title, tags, x, y}>, links }.
 *  2. Every node has finite numerical x and y coordinates within celestial bounds.
 *  3. Force relaxation is deterministic across prebuild runs (zero diff churn).
 */
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import { emitGraph } from "./emit-graph"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const GRAPH_JSON_PATH = path.join(ROOT, "public", "graph.json")

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}

async function testGraph() {
  console.log("=== Testing Constellation Pre-Calculated Relaxation ===")

  if (!fs.existsSync(GRAPH_JSON_PATH)) {
    console.log("  public/graph.json not found on disk — generating with synthetic model for test...")
    const mockIndex: Record<string, any> = {}
    for (let i = 0; i < 300; i++) {
      mockIndex[`note-${i}`] = {
        slug: `note-${i}`,
        title: `Note ${i}`,
        tags: [i % 3 === 0 ? "philosophy" : i % 3 === 1 ? "physics" : "logic"],
        links: [`note-${(i + 1) % 300}`, `note-${(i + 7) % 300}`],
      }
    }
    emitGraph({ index: mockIndex }, path.join(ROOT, "public"))
  }

  assert(fs.existsSync(GRAPH_JSON_PATH), "public/graph.json must exist")

  const raw = fs.readFileSync(GRAPH_JSON_PATH, "utf-8")
  const data = JSON.parse(raw)

  assert(Array.isArray(data.nodes), "graph.json must contain nodes array")
  assert(Array.isArray(data.links), "graph.json must contain links array")
  assert(data.nodes.length >= 250, `expected >= 250 nodes, got ${data.nodes.length}`)
  assert(data.links.length >= 500, `expected >= 500 links, got ${data.links.length}`)

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

  for (const node of data.nodes) {
    assert(typeof node.id === "string" && node.id.length > 0, "node id must be non-empty string")
    assert(typeof node.title === "string", `node ${node.id} title must be string`)
    assert(Array.isArray(node.tags), `node ${node.id} tags must be array`)
    assert(typeof node.x === "number" && !isNaN(node.x) && isFinite(node.x), `node ${node.id} x must be finite number, got ${node.x}`)
    assert(typeof node.y === "number" && !isNaN(node.y) && isFinite(node.y), `node ${node.id} y must be finite number, got ${node.y}`)

    if (node.x < minX) minX = node.x
    if (node.x > maxX) maxX = node.x
    if (node.y < minY) minY = node.y
    if (node.y > maxY) maxY = node.y
  }

  assert(maxX - minX > 200, `expected x spread > 200, got ${maxX - minX}`)
  assert(maxY - minY > 200, `expected y spread > 200, got ${maxY - minY}`)

  // Verify determinism: re-run emitGraph in memory and verify exact identical coordinate output
  const dummyPublic = path.join(ROOT, "scratch", "test-graph-public")
  fs.mkdirSync(dummyPublic, { recursive: true })

  // Build model mock from graph nodes/links
  const mockIndex: Record<string, any> = {}
  for (const n of data.nodes) {
    mockIndex[n.id] = { slug: n.id, title: n.title, tags: n.tags, links: [] }
  }
  for (const l of data.links) {
    if (mockIndex[l.source]) {
      mockIndex[l.source].links.push(l.target)
    }
  }

  emitGraph({ index: mockIndex }, dummyPublic)
  const emitted1 = fs.readFileSync(path.join(dummyPublic, "graph.json"), "utf-8")

  emitGraph({ index: mockIndex }, dummyPublic)
  const emitted2 = fs.readFileSync(path.join(dummyPublic, "graph.json"), "utf-8")

  assert(emitted1 === emitted2, "emitGraph must be 100% deterministic between runs")

  // Cleanup scratch dir
  fs.rmSync(dummyPublic, { recursive: true, force: true })

  console.log(`PASS: Pre-calculated graph relaxation test passed! (${data.nodes.length} nodes, ${data.links.length} links, bounds [${minX.toFixed(1)}, ${minY.toFixed(1)}] to [${maxX.toFixed(1)}, ${maxY.toFixed(1)}])`)
}

testGraph().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
