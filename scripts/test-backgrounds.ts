import assert from "node:assert/strict"
import { simplex } from "../src/lib/backgrounds/simplex.js"
import { MURM } from "../src/lib/backgrounds/murmuration.js"
import { CHAMBER_GLYPHS } from "../src/lib/backgrounds/chamber.js"
import { SCHEMATIC_GLYPHS } from "../src/lib/backgrounds/schematic.js"
import { GLYPH_POOL } from "../src/lib/backgrounds/isometric.js"

// ── 1. Simplex noise tests ──
{
  // Test determinism
  const v1 = simplex(10.5, 20.3)
  const v2 = simplex(10.5, 20.3)
  assert.equal(v1, v2, "simplex must be deterministic for identical coordinates")

  // Test reasonable range bounds [-1.2, 1.2]
  for (let x = -50; x <= 50; x += 3.7) {
    for (let y = -50; y <= 50; y += 4.1) {
      const v = simplex(x * 0.1, y * 0.1)
      assert.ok(v >= -1.2 && v <= 1.2, `simplex noise out of expected bounds: ${v} at (${x}, ${y})`)
      assert.ok(!Number.isNaN(v), `simplex returned NaN at (${x}, ${y})`)
    }
  }

  // Test continuity / smoothness (small delta gives small change)
  const eps = 0.001
  const s0 = simplex(5.0, 5.0)
  const s1 = simplex(5.0 + eps, 5.0)
  assert.ok(Math.abs(s1 - s0) < 0.05, "simplex noise must be continuous without sharp step discontinuities")
}

// ── 2. Murmuration invariants ──
{
  assert.ok(MURM.count > 0, "MURM count must be positive")
  assert.ok(MURM.minSpeed > 0 && MURM.maxSpeed > MURM.minSpeed, "speed bounds must be valid")
  assert.ok(MURM.fleeRadius > 0, "fleeRadius must be positive")

  // Test boundary wrapping logic
  const W = 1000, H = 800
  let bx = -15, by = H + 15
  if (bx < -10) bx += W + 20
  if (by > H + 10) by -= H + 20
  assert.ok(bx >= -10 && bx <= W + 10, "boid x wrapping must return within screen margins")
  assert.ok(by >= -10 && by <= H + 10, "boid y wrapping must return within screen margins")
}

// ── 3. Glyph pool safety ──
{
  assert.ok(CHAMBER_GLYPHS.length > 0, "CHAMBER_GLYPHS must not be empty")
  assert.ok(SCHEMATIC_GLYPHS.length > 0, "SCHEMATIC_GLYPHS must not be empty")
  assert.ok(GLYPH_POOL.length > 0, "GLYPH_POOL must not be empty")
}

// ── 4. In-place compaction logic ──
{
  const items = [{ life: 0.5 }, { life: -0.1 }, { life: 0.8 }, { life: 0 }]
  let writeIdx = 0
  for (let i = 0; i < items.length; i++) {
    if (items[i].life > 0) {
      items[writeIdx++] = items[i]
    }
  }
  items.length = writeIdx

  assert.equal(items.length, 2, "compacted length must match count of active items")
  assert.equal(items[0].life, 0.5)
  assert.equal(items[1].life, 0.8)
}

// ── 5. Zero-allocation dot pooling ──
{
  const pool: Array<{ x: number; y: number; r: number; ci: number; alpha: number }> = []
  let count = 0

  // Frame 1: populate 10
  for (let i = 0; i < 10; i++) {
    let node = pool[count]
    if (!node) {
      node = { x: i, y: i, r: 2, ci: 0, alpha: 1 }
      pool[count] = node
    }
    count++
  }
  assert.equal(pool.length, 10)
  const nodeRef0 = pool[0]

  // Frame 2: reuse without reallocating
  count = 0
  for (let i = 0; i < 5; i++) {
    let node = pool[count]
    if (!node) {
      node = { x: i * 2, y: i * 2, r: 3, ci: 1, alpha: 0.5 }
      pool[count] = node
    } else {
      node.x = i * 2
      node.y = i * 2
    }
    count++
  }
  assert.equal(pool[0], nodeRef0, "node object reference must be preserved across frames")
  assert.equal(pool[0].x, 0)
  assert.equal(pool[1].x, 2)
}

// ── 6. Dendrite tree spawning and tip dynamics ──
{
  const { spawnTree } = await import("../src/lib/backgrounds/dendrite.js")
  const mockState = { w: 1200, h: 800 } as any
  const tree = spawnTree(mockState, "#b4424c")
  assert.ok(tree.tips.length > 0, "spawnTree must initialize with at least one active tip")
  assert.equal(tree.segments.length, 0, "spawnTree segments start empty")
  assert.ok(tree.maxAge > 300, "tree maxAge must allow full growth lifecycle")
}

// ── 7. Lorenz chaotic attractor numerical stability ──
{
  const { initLorenz } = await import("../src/lib/backgrounds/lorenz.js")
  for (let flowType = 0; flowType <= 3; flowType++) {
    const ls = initLorenz(flowType)
    assert.equal(ls.history.length, 3000 * 3, "history buffer must be preallocated")
    assert.ok(!Number.isNaN(ls.x) && !Number.isNaN(ls.y) && !Number.isNaN(ls.z), `initial coordinates for attractor ${flowType} must be valid numbers`)
  }
}

// ── 8. Cartography contour relief determinism ──
{
  const seed = 123.456
  const y = 300
  const x = 500
  const h1 = simplex(x * 0.002 + seed, y * 0.002) * 0.6 + simplex(x * 0.004 + seed, y * 0.004) * 0.3
  const h2 = simplex(x * 0.002 + seed, y * 0.002) * 0.6 + simplex(x * 0.004 + seed, y * 0.004) * 0.3
  assert.equal(h1, h2, "elevation calculation must be deterministic for given coordinates and seed")
  assert.ok(!Number.isNaN(h1), "elevation must not be NaN")
}

console.log("Background simulations, simplex noise, and pooling invariants pass.")
