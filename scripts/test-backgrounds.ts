import assert from "node:assert/strict"
import { simplex } from "../src/lib/backgrounds/simplex.js"
import { MURM } from "../src/lib/backgrounds/murmuration.js"
import { CHAMBER_GLYPHS } from "../src/lib/backgrounds/chamber.js"
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

// ── 6. Orrery ephemeris: the planets where they really are ──
{
  const { PLANETS, planetXY, eccentricAnomaly } = await import("../src/lib/backgrounds/orrery.js")
  // Kepler's equation round-trips
  for (const e of [0, 0.2, 0.9, 0.967]) {
    for (const M of [-3, -1, 0.3, 2.5]) {
      const E = eccentricAnomaly(M, e)
      assert.ok(Math.abs(E - e * Math.sin(E) - M) < 1e-8, `Kepler solve e=${e} M=${M}`)
    }
  }
  const J2000 = 2451545
  const earth = PLANETS.find((p) => p.name === "Earth")!
  // Earth ~1 AU from the Sun all year, nearest in early January (perihelion)
  const r = (jd: number) => Math.hypot(...planetXY(earth, jd))
  assert.ok(Math.abs(r(J2000) - 0.983) < 0.003, `Earth on 2000-01-01 ~0.983 AU, got ${r(J2000)}`)
  assert.ok(Math.abs(r(J2000 + 183) - 1.0167) < 0.003, `Earth in early July ~1.017 AU, got ${r(J2000 + 183)}`)
  // At the March equinox the Sun is at ecliptic longitude 0, so Earth is at 180°
  const [ex, ey] = planetXY(earth, 2451623.8) // 2000-03-20 07:35 UT
  const lon = (Math.atan2(ey, ex) * 180) / Math.PI
  assert.ok(Math.abs(Math.abs(lon) - 180) < 1.5, `Earth heliocentric longitude at the equinox ~180°, got ${lon}`)
  // Every orbit's size is right to a few percent
  for (const p of PLANETS) {
    const d = Math.hypot(...planetXY(p, J2000 + 9000))
    assert.ok(d > p.a[0] * 0.75 && d < p.a[0] * 1.25, `${p.name} distance ${d} vs a=${p.a[0]}`)
  }
}

// ── 7. Attractors stay finite and bounded ──
{
  const { SYSTEMS } = await import("../src/lib/backgrounds/attractor.js")
  const o: [number, number, number] = [0, 0, 0]
  for (const sys of SYSTEMS) {
    let [x, y, z] = sys.start
    for (let i = 0; i < 20000; i++) {
      sys.f(x, y, z, o)
      x += o[0] * sys.dt; y += o[1] * sys.dt; z += o[2] * sys.dt
    }
    assert.ok([x, y, z].every((v) => Number.isFinite(v) && Math.abs(v) < 500), `${sys.name} must stay on its attractor, got ${[x, y, z]}`)
  }
}

// ── 7b. Off-DOM text layout (lib/textlayout) ──
{
  const tl = await import("../src/lib/textlayout.js")
  tl.setMeasure((text) => text.length * 10) // monospace: 10px per character
  const p = tl.prepare("aaaa bbbb cccc dddd e", "x")
  assert.equal(p.space, 10)
  // 4+1+4 = 9 chars per two words → 90px; three words need 140px
  assert.equal(tl.lineCount(p, 95), 3, "greedy breaking at 95px")
  assert.deepEqual(tl.layoutLines(p, 95).map((l) => l.text), ["aaaa bbbb", "cccc dddd", "e"])
  // Shrink-wrap keeps the line count and evens the lines
  const q = tl.prepare("one two three four five six seven", "x")
  const wide = 300
  const n = tl.lineCount(q, wide)
  const tight = tl.shrinkWrap(q, wide)
  assert.ok(tight < wide && tl.lineCount(q, tight) === n, `shrinkWrap ${tight} keeps ${n} lines`)
  // Hyphenated words break after the hyphen
  const h = tl.prepare("well-known", "x")
  assert.deepEqual(h.words, ["well-", "known"])
  assert.equal(tl.lineText(h, 0, 2), "well-known")
  // Per-line widths (text around a shape)
  assert.equal(tl.lineCount(p, (i) => (i === 0 ? 45 : 200)), 2)
  // Justified word positions fill the line exactly
  const line = tl.layoutLines(p, 95)[0]
  const xs = tl.justify(p, line, 120)
  assert.equal(xs[0], 0)
  assert.equal(xs[1] + p.widths[1], 120)
  tl.setMeasure(null)
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
