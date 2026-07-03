/**
 * SIGIL board generation — pure logic, no DOM (testable headlessly, same
 * convention as lib/hexo.ts). The generator lays a full snake-partition
 * solution over the grid first, then hands the player only the endpoints,
 * so every plate is solvable by construction (and fillable in fill mode).
 */

export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Cell = { x: number; y: number }
export interface Pair { id: number; pen: number; glyph: string; a: Cell; b: Cell }
export interface Board {
  n: number
  seed: string
  pairs: Pair[]
  plateLength: number            // generator solution total cells ("par" proxy)
  paths: Map<number, Cell[]>     // pairId -> ordered cells (player state)
  owner: Int16Array              // n*n → pairId or -1 (player state)
}

export const TERMINAL_GLYPHS = "⊕⊗⊙∮∇∂≡☾♁☿♆⚶✶⟁⌖"
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

/** Generate a solvable plate: partition the grid into K contiguous snakes,
 * take each snake's ends as a terminal pair, clear the interiors. */
export function generateBoard(n: number, seed: string): Board {
  const targetK = Math.max(3, Math.round(n * 0.9))
  for (let attempt = 0; attempt < 24; attempt++) {
    const rnd = mulberry32(hashStr(`${seed}:${attempt}`))
    const K = Math.max(3, targetK - (attempt >= 16 ? 1 : 0)) // ease off on late retries
    const owner = new Int16Array(n * n).fill(-1)
    const snakes: Cell[][] = []
    const idx = (x: number, y: number) => y * n + x

    // 1. Self-avoiding random walks over unassigned cells
    const unassigned = () => {
      const cells: Cell[] = []
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (owner[idx(x, y)] === -1) cells.push({ x, y })
      }
      return cells
    }
    // Bound failed walks: when the only free cells left are isolated islands,
    // every walk comes up short and unwinds — without a cap this spins forever
    // (free never shrinks). Give up after a few misses and let absorption /
    // the outer retry handle the leftovers.
    let failedWalks = 0
    while (snakes.length < K && failedWalks < 30) {
      const free = unassigned()
      if (!free.length) break
      const start = free[(rnd() * free.length) | 0]
      const id = snakes.length
      const snake: Cell[] = [start]
      owner[idx(start.x, start.y)] = id
      const len = 3 + ((rnd() * (2 * n - 3)) | 0)
      let cur = start
      for (let s = 1; s < len; s++) {
        const options = DIRS
          .map(([dx, dy]) => ({ x: cur.x + dx, y: cur.y + dy }))
          .filter(c => c.x >= 0 && c.x < n && c.y >= 0 && c.y < n && owner[idx(c.x, c.y)] === -1)
        if (!options.length) break
        cur = options[(rnd() * options.length) | 0]
        owner[idx(cur.x, cur.y)] = id
        snake.push(cur)
      }
      if (snake.length < 3) {
        // too short to be a pair — unwind and let absorption handle the cells
        for (const c of snake) owner[idx(c.x, c.y)] = -1
        failedWalks++
        continue
      }
      snakes.push(snake)
    }

    // 2. Leftover absorption: append stray cells to an adjacent snake's endpoint
    let changed = true
    while (changed) {
      changed = false
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (owner[idx(x, y)] !== -1) continue
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= n || ny < 0 || ny >= n) continue
          const oid = owner[idx(nx, ny)]
          if (oid === -1) continue
          const snake = snakes[oid]
          const head = snake[0], tail = snake[snake.length - 1]
          if (head.x === nx && head.y === ny) {
            snake.unshift({ x, y }); owner[idx(x, y)] = oid; changed = true; break
          }
          if (tail.x === nx && tail.y === ny) {
            snake.push({ x, y }); owner[idx(x, y)] = oid; changed = true; break
          }
        }
      }
    }

    // stranded cell that couldn't extend an endpoint → retry with next sub-seed
    if (owner.includes(-1)) continue
    if (snakes.some(s => s.length < 2)) continue

    const pairs: Pair[] = snakes.map((s, id) => ({
      id,
      pen: id,
      glyph: TERMINAL_GLYPHS[id % TERMINAL_GLYPHS.length],
      a: s[0],
      b: s[s.length - 1],
    }))
    return {
      n,
      seed,
      pairs,
      plateLength: snakes.reduce((sum, s) => sum + s.length, 0),
      paths: new Map(),
      owner: new Int16Array(n * n).fill(-1),
    }
  }
  // Exhausted retries (vanishingly rare): shrink the board and try again.
  return generateBoard(Math.max(4, n - 1), seed + "*")
}

/** Verify a generated board's structural invariants (used by the test). */
export function validateBoard(b: Board): string | null {
  const seen = new Set<string>()
  for (const p of b.pairs) {
    for (const t of [p.a, p.b]) {
      if (t.x < 0 || t.x >= b.n || t.y < 0 || t.y >= b.n) return `terminal out of bounds: ${JSON.stringify(t)}`
      const key = `${t.x},${t.y}`
      if (seen.has(key)) return `overlapping terminals at ${key}`
      seen.add(key)
    }
    if (p.a.x === p.b.x && p.a.y === p.b.y) return `degenerate pair ${p.id}`
  }
  if (b.pairs.length < 3) return `too few pairs (${b.pairs.length})`
  if (b.plateLength !== b.n * b.n) return `partition doesn't tile the grid (${b.plateLength} ≠ ${b.n * b.n})`
  return null
}
