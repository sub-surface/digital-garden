/**
 * Hex Life: cellular automata on the hexagonal lattice, pure and headless (the
 * page draws it; scripts/test-hexlife.ts and the soup census drive it too).
 *
 * The world is a W x H torus in "odd-r" offset coordinates (odd rows sit half a
 * cell right), H even so the rows' parities still alternate across the seam.
 * Tiled, that torus covers the plane, so the page draws it at any zoom.
 *
 * A rule is two 64-entry tables indexed by the six-neighbour mask, so one step
 * function serves every rule family:
 *  - totalistic B/S, counts 0..6 ("B2/S34");
 *  - isotropic non-totalistic, where 2, 3 and 4 neighbours split by shape
 *    ("B2o/S2m34"): o, m, p for two neighbours side by side, one apart, or
 *    opposite; for three, o is a run of three, p alternate cells, m the rest;
 *    for four, the letter describes the two EMPTY neighbours the same way;
 *  - Generations ("/C4" or "/G4"): a live cell that fails to survive spends
 *    C-2 further steps dying (drawn as a fading trail) and counts as dead to
 *    its neighbours throughout.
 */

/** Neighbour offsets in angular order (E, NE, NW, W, SW, SE), per row parity. */
const RING_EVEN: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]
const RING_ODD: ReadonlyArray<readonly [number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]

const popcount6 = (m: number) => { let c = 0; for (let i = 0; i < 6; i++) c += (m >> i) & 1; return c }
const ringGap = (i: number, j: number) => { const d = Math.abs(i - j); return Math.min(d, 6 - d) }
const bitsOf = (m: number) => { const out: number[] = []; for (let i = 0; i < 6; i++) if ((m >> i) & 1) out.push(i); return out }

/** The shape letter of a neighbour mask ("" when the count has only one shape). */
export function shapeOf(mask: number): "" | "o" | "m" | "p" {
  const c = popcount6(mask)
  if (c === 2 || c === 4) {
    const [i, j] = bitsOf(c === 2 ? mask : ~mask & 63)
    return (["", "o", "m", "p"] as const)[ringGap(i, j)]
  }
  if (c === 3) {
    const b = bitsOf(mask)
    if (b.every((x, k) => ringGap(x, b[(k + 1) % 3]) === 2)) return "p"
    for (let s = 0; s < 6; s++) if ([s, s + 1, s + 2].every((x) => (mask >> (x % 6)) & 1)) return "o"
    return "m"
  }
  return ""
}

export interface Rule {
  birth: Uint8Array // [64]
  survive: Uint8Array // [64]
  /** 2 for Life-like rules; C > 2 for Generations (C-2 dying states). */
  states: number
  /** Canonical text, e.g. "B2/S34" or "B2o3/S2m/C4". */
  text: string
}

/** One half of a rule ("2o34"): which masks it accepts. */
function parseSet(s: string): Uint8Array | string {
  const table = new Uint8Array(64)
  let i = 0
  while (i < s.length) {
    const n = s.charCodeAt(i) - 48
    if (n < 0 || n > 6) return `unexpected "${s[i]}"`
    i++
    let letters = ""
    while (i < s.length && /[omp]/.test(s[i])) letters += s[i++]
    if (letters && !(n >= 2 && n <= 4)) return `${n} neighbours have no shapes to choose from`
    for (let m = 0; m < 64; m++) {
      if (popcount6(m) !== n) continue
      if (!letters || letters.includes(shapeOf(m))) table[m] = 1
    }
  }
  return table
}

/** "B2/S34", "b2o3/s2m", "B2/S/C3", "2/34" (S/B order is not assumed). Error text on failure. */
export function parseRule(input: string): Rule | string {
  const t = input.replace(/\s+/g, "").replace(/H$/i, "")
  let b = "", s = "", c = 2
  const parts = t.split("/")
  for (const p of parts) {
    const head = p[0]?.toUpperCase()
    if (head === "B") b = p.slice(1)
    else if (head === "S") s = p.slice(1)
    else if (head === "C" || head === "G") { c = Number(p.slice(1)); if (!Number.isInteger(c) || c < 2 || c > 32) return "C must be 2 to 32" }
    else if (p === "") continue
    else return `"${p}" should start with B, S or C`
  }
  const birth = parseSet(b), survive = parseSet(s)
  if (typeof birth === "string") return `birth: ${birth}`
  if (typeof survive === "string") return `survive: ${survive}`
  return { birth, survive, states: c, text: ruleText(birth, survive, c) }
}

/** Canonical text for tables: a count with all its shapes is written bare. */
export function ruleText(birth: Uint8Array, survive: Uint8Array, states = 2): string {
  const half = (t: Uint8Array) => {
    let out = ""
    for (let n = 0; n <= 6; n++) {
      const masks = [...Array(64).keys()].filter((m) => popcount6(m) === n)
      const on = masks.filter((m) => t[m])
      if (!on.length) continue
      if (on.length === masks.length) { out += n; continue }
      const letters = (["o", "m", "p"] as const).filter((l) => masks.some((m) => shapeOf(m) === l) && masks.filter((m) => shapeOf(m) === l).every((m) => t[m]))
      out += n + letters.join("")
    }
    return out
  }
  return `B${half(birth)}/S${half(survive)}${states > 2 ? `/C${states}` : ""}`
}

export interface World {
  W: number
  H: number
  /** 0 dead, 1 alive, 2..states-1 dying. */
  cells: Uint8Array
  next: Uint8Array
  /** Generations each live cell has stayed alive (for the age colouring). */
  age: Uint16Array
  nextAge: Uint16Array
  /** Six neighbour indices per cell, wrap and row parity resolved once. */
  nb: Int32Array
  gen: number
}

export function makeWorld(W: number, H: number): World {
  if (H % 2) H++
  const n = W * H
  const nb = new Int32Array(n * 6)
  for (let y = 0; y < H; y++) {
    const ring = y & 1 ? RING_ODD : RING_EVEN
    for (let x = 0; x < W; x++) for (let k = 0; k < 6; k++) {
      const nx = (x + ring[k][0] + W) % W, ny = (y + ring[k][1] + H) % H
      nb[(y * W + x) * 6 + k] = ny * W + nx
    }
  }
  return { W, H, cells: new Uint8Array(n), next: new Uint8Array(n), age: new Uint16Array(n), nextAge: new Uint16Array(n), nb, gen: 0 }
}

/** Advance one generation. Returns the live population. */
export function step(w: World, rule: Rule): number {
  const { cells, next, age, nextAge, nb } = w
  const { birth, survive, states } = rule
  let pop = 0
  for (let i = 0, j = 0; i < cells.length; i++, j += 6) {
    const cur = cells[i]
    let v: number
    if (cur > 1) v = cur + 1 < states ? cur + 1 : 0
    else {
      const m = (cells[nb[j]] === 1 ? 1 : 0) | (cells[nb[j + 1]] === 1 ? 2 : 0) | (cells[nb[j + 2]] === 1 ? 4 : 0)
        | (cells[nb[j + 3]] === 1 ? 8 : 0) | (cells[nb[j + 4]] === 1 ? 16 : 0) | (cells[nb[j + 5]] === 1 ? 32 : 0)
      v = cur === 1 ? (survive[m] ? 1 : states > 2 ? 2 : 0) : birth[m] ? 1 : 0
    }
    next[i] = v
    if (v === 1) { pop++; nextAge[i] = cur === 1 ? Math.min(age[i] + 1, 65535) : 0 } else nextAge[i] = 0
  }
  w.cells = next; w.next = cells
  w.age = nextAge; w.nextAge = age
  w.gen++
  return pop
}

export function population(w: World): number {
  let n = 0
  for (const v of w.cells) if (v === 1) n++
  return n
}

export function clear(w: World) { w.cells.fill(0); w.age.fill(0); w.gen = 0 }

/** Clear, then fill a centred patch (`frac` of each side) at `density`. */
export function seed(w: World, density: number, rnd: () => number = Math.random, frac = 1) {
  clear(w)
  const pw = Math.max(1, Math.round(w.W * frac)), ph = Math.max(1, Math.round(w.H * frac))
  const x0 = (w.W - pw) >> 1, y0 = (w.H - ph) >> 1
  for (let y = y0; y < y0 + ph; y++) for (let x = x0; x < x0 + pw; x++) if (rnd() < density) w.cells[y * w.W + x] = 1
}

// ── axial <-> offset, for patterns (stored axially so they rotate cleanly) ──
export const toAxial = (x: number, y: number): [number, number] => [x - ((y - (y & 1)) >> 1), y]
export const fromAxial = (q: number, r: number): [number, number] => [q + ((r - (r & 1)) >> 1), r]

/** Rotate an axial offset by k * 60 degrees; `flip` mirrors first. */
export function orient([q, r]: readonly [number, number], k: number, flip = false): [number, number] {
  let a = flip ? r : q, b = flip ? q : r
  for (let i = 0; i < ((k % 6) + 6) % 6; i++) [a, b] = [-b, a + b]
  return [a, b]
}

/** Set cells (axial offsets from the offset-coordinate anchor) to live, wrapping. */
export function stamp(w: World, ax: number, ay: number, cells: ReadonlyArray<readonly [number, number]>, k = 0, flip = false) {
  const [aq, ar] = toAxial(ax, ay)
  for (const c of cells) {
    const [dq, dr] = orient(c, k, flip)
    const r = ar + dr, q = aq + dq
    const [x, y] = fromAxial(q, r)
    const yy = ((y % w.H) + w.H) % w.H, xx = ((x % w.W) + w.W) % w.W
    w.cells[yy * w.W + xx] = 1
  }
}

/** FNV-1a over the cell states: equal hashes across generations flag a cycle. */
export function hashWorld(w: World): number {
  let h = 0x811c9dc5
  const c = w.cells
  for (let i = 0; i < c.length; i++) { h ^= c[i]; h = Math.imul(h, 16777619) }
  return h >>> 0
}
