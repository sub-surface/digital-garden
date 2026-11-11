/**
 * Enclosure: a two-player territory game on a lattice. Draw straight edges,
 * close off area, cut the opponent's edges; score is area integrated over time.
 *
 * A port of the reference engine in ../strategy (`enclosure/game.py`,
 * `enclosure/geometry.py`); its RULES.md is the spec and each rule below is
 * numbered as there. Points and segment tests are exact integer arithmetic;
 * intersection points are exact rationals (so the plane graph never mistakes
 * two nearby points for one); only the final areas are summed as floats.
 *
 * Pure: no DOM. Shared by the arcade page and its bot (enclosure-bot.ts).
 * Tested by scripts/test-enclosure.ts.
 */

export type Pt = readonly [number, number]
export type Player = 0 | 1
export const BLUE: Player = 0
export const RED: Player = 1
export const PLAYER_NAMES = ["Blue", "Red"] as const

export interface Config {
  /** Board is Z² ∩ [-R, R]². */
  R: number
  /** A move spans at most `step` in x and in y. */
  step: number
  maxMoves: number
  blueStart: readonly [Pt, Pt]
  redStart: readonly [Pt, Pt]
  /**
   * A player with no legal move: "draw" ends the game drawn (the reference
   * rule, RULES.md v0); "pass" skips their turn, and when neither side can
   * move the remaining turns are scored as they stand. The arcade plays
   * "pass", so a losing player can't wall themselves in for a draw.
   */
  stuck?: "draw" | "pass"
}

export const STANDARD: Config = { R: 9, step: 3, maxMoves: 120, blueStart: [[-9, 0], [-6, 0]], redStart: [[6, 0], [9, 0]] }
/** The standard game on 3Z×3Z, scaled by 1/3: a 7×7 primer. */
export const LATTICE3: Config = { R: 3, step: 1, maxMoves: 120, blueStart: [[-3, 0], [-2, 0]], redStart: [[2, 0], [3, 0]] }
/** The arcade's boards: the same games with the "pass" rule. */
export const ARCADE_STANDARD: Config = { ...STANDARD, stuck: "pass" }
export const ARCADE_PRIMER: Config = { ...LATTICE3, stuck: "pass" }

export interface Edge { id: number; owner: Player; a: Pt; b: Pt }
export interface Move { a: Pt; b: Pt }

export interface State {
  cfg: Config
  /** "x,y" → owner */
  nodes: Map<string, Player>
  edges: Map<number, Edge>
  nextId: number
  toMove: Player
  turn: number
  movesLeft: number
  moveCount: number
  scores: [number, number]
  /** Edge ids the opponent placed on their most recent turn (untouchable, rule 5). */
  protected: Set<number>
  placedNow: number[]
  done: boolean
  result: "Blue" | "Red" | "Draw" | null
  /** Area held at the end of each turn, per player: the integral's samples. */
  areaLog: [number, number][]
  history: { player: Player; move: Move }[]
  /** Who passed for want of a legal move after the last step, if anyone ("pass" rule). */
  passed: Player[]
}

export const pk = (p: Pt) => `${p[0]},${p[1]}`
export const parsePk = (k: string): Pt => k.split(",").map(Number) as unknown as Pt

// ── exact segment geometry ──
const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
const inBox = (p: Pt, a: Pt, b: Pt) =>
  Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1])
const same = (p: Pt, q: Pt) => p[0] === q[0] && p[1] === q[1]

/** Closed segments ab and cd share at least one point. */
export function segTouch(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return (d1 === 0 && inBox(c, a, b)) || (d2 === 0 && inBox(d, a, b)) || (d3 === 0 && inBox(a, c, d)) || (d4 === 0 && inBox(b, c, d))
}

/** ab and cd are collinear and share a piece of positive length. */
export function collinearOverlap(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  if (cross(a, b, c) !== 0 || cross(a, b, d) !== 0) return false
  const k = a[0] !== b[0] ? 0 : 1
  const lo1 = Math.min(a[k], b[k]), hi1 = Math.max(a[k], b[k])
  const lo2 = Math.min(c[k], d[k]), hi2 = Math.max(c[k], d[k])
  return Math.max(lo1, lo2) < Math.min(hi1, hi2)
}

export function strictlyInside(p: Pt, a: Pt, b: Pt): boolean {
  return !same(p, a) && !same(p, b) && cross(a, b, p) === 0 && inBox(p, a, b)
}

// ── filled area ──
const gcd = (a: number, b: number): number => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a }

/** An exact rational t = n/d with d > 0, reduced. */
interface Q { n: number; d: number }
const q = (n: number, d: number): Q => { if (d < 0) { n = -n; d = -d } const g = gcd(n, d) || 1; return { n: n / g, d: d / g } }
const qCmp = (x: Q, y: Q) => x.n * y.d - y.n * x.d

/** 0 for directions in [0, π), 1 for [π, 2π). */
const half = (v: Pt) => (v[1] > 0 || (v[1] === 0 && v[0] > 0) ? 0 : 1)
function ccwCmp(p: Pt, r: Pt): number {
  const hp = half(p), hr = half(r)
  if (hp !== hr) return hp - hr
  const c = p[0] * r[1] - p[1] * r[0]
  return c > 0 ? -1 : c < 0 ? 1 : 0
}

interface Component { area: number; outer: [number, number][] }

/**
 * Area of the union of the bounded components of R² minus the segments
 * (everything enclosed, holes filled). Split every segment at every
 * intersection, build the plane graph, trace faces; per connected component
 * sum its bounded faces; drop components inside another's filled region.
 */
export function filledArea(segs: readonly (readonly [Pt, Pt])[]): number {
  const comps = components(segs)
  let total = 0
  for (const c of comps) {
    const [x, y] = c.outer[0]
    if (!comps.some((o) => o !== c && winding(x, y, o.outer) !== 0)) total += c.area
  }
  return total
}

/** The outer boundary of each region that encloses area (for drawing territory). */
export function enclosedRegions(segs: readonly (readonly [Pt, Pt])[]): { area: number; outer: [number, number][] }[] {
  return components(segs)
}

/**
 * Drop dangling tails: a segment with a free end (no other segment ends or
 * passes there) that touches the rest only at its other end can't bound
 * anything. Repeated, this strips paths and spurs, which are most of a
 * typical network, before the quadratic work below.
 */
function pruneTails(segs: (readonly [Pt, Pt])[]): (readonly [Pt, Pt])[] {
  let live = segs
  for (;;) {
    const ends = new Map<string, number>()
    for (const [a, b] of live) { ends.set(pk(a), (ends.get(pk(a)) ?? 0) + 1); ends.set(pk(b), (ends.get(pk(b)) ?? 0) + 1) }
    const keep = live.filter((seg, i) => {
      const [a, b] = seg
      const freeA = ends.get(pk(a)) === 1, freeB = ends.get(pk(b)) === 1
      if (!freeA && !freeB) return true
      if (freeA && freeB) {
        // An isolated stick, unless something crosses it.
        return live.some((o, j) => j !== i && segTouch(a, b, o[0], o[1]))
      }
      const joint = freeA ? b : a
      // Kept if any other segment touches it anywhere but at the joint, where they share an endpoint.
      return live.some((o, j) => j !== i && segTouch(a, b, o[0], o[1]) && !(same(o[0], joint) || same(o[1], joint)))
    })
    if (keep.length === live.length) return live
    live = keep
  }
}

function components(input: readonly (readonly [Pt, Pt])[]): Component[] {
  const segs = pruneTails(input.filter(([a, b]) => !same(a, b)))
  if (segs.length < 3) return []
  // 1. split parameters along each segment
  const cuts: Q[][] = segs.map(() => [q(0, 1), q(1, 1)])
  for (let i = 0; i < segs.length; i++) {
    const [a, b] = segs[i]
    const u: Pt = [b[0] - a[0], b[1] - a[1]]
    for (let j = i + 1; j < segs.length; j++) {
      const [c, d] = segs[j]
      const v: Pt = [d[0] - c[0], d[1] - c[1]]
      const den = u[0] * v[1] - u[1] * v[0]
      const ca: Pt = [c[0] - a[0], c[1] - a[1]]
      if (den === 0) {
        if (cross(a, b, c) !== 0) continue // parallel, disjoint
        // collinear: an endpoint of one lying on the other splits it
        const tries: [Pt, Pt, Pt, Pt, number][] = [[c, a, b, u, i], [d, a, b, u, i], [a, c, d, v, j], [b, c, d, v, j]]
        for (const [p, s0, s1, w, tgt] of tries) {
          if (!inBox(p, s0, s1)) continue
          const k = w[0] !== 0 ? 0 : 1
          cuts[tgt].push(q(p[k] - s0[k], w[k]))
        }
        continue
      }
      const t = q(ca[0] * v[1] - ca[1] * v[0], den)
      const s = q(ca[0] * u[1] - ca[1] * u[0], den)
      if (t.n >= 0 && t.n <= t.d && s.n >= 0 && s.n <= s.d) {
        cuts[i].push(t)
        cuts[j].push(s)
      }
    }
  }
  // 2. plane graph over exact points; half-edges keyed by reduced parent direction
  const coords = new Map<string, [number, number]>()
  const adj = new Map<string, Map<string, string>>() // point → (dirKey → point)
  const dirOf = new Map<string, Pt>()
  const pointKey = (a: Pt, u: Pt, t: Q) => {
    // a + t·u = (a·d + n·u) / d, reduced per coordinate
    const x = q(a[0] * t.d + t.n * u[0], t.d), y = q(a[1] * t.d + t.n * u[1], t.d)
    const key = `${x.n}/${x.d},${y.n}/${y.d}`
    if (!coords.has(key)) coords.set(key, [x.n / x.d, y.n / y.d])
    return key
  }
  const link = (p: string, dir: Pt, r: string) => {
    const g = gcd(dir[0], dir[1])
    const red: Pt = [dir[0] / g, dir[1] / g]
    const dk = `${red[0]},${red[1]}`
    dirOf.set(dk, red)
    let m = adj.get(p)
    if (!m) adj.set(p, (m = new Map()))
    m.set(dk, r)
  }
  segs.forEach(([a, b], i) => {
    const u: Pt = [b[0] - a[0], b[1] - a[1]]
    const ts = cuts[i].sort(qCmp).filter((t, k, all) => k === 0 || qCmp(t, all[k - 1]) !== 0)
    const pts = ts.map((t) => pointKey(a, u, t))
    for (let k = 0; k + 1 < pts.length; k++) {
      link(pts[k], u, pts[k + 1])
      link(pts[k + 1], [-u[0], -u[1]], pts[k])
    }
  })
  const order = new Map<string, string[]>()
  for (const [p, out] of adj) {
    order.set(p, [...out.keys()].sort((x, y) => ccwCmp(dirOf.get(x)!, dirOf.get(y)!)))
  }
  // 3. connected components
  const comp = new Map<string, string>()
  for (const p of adj.keys()) {
    if (comp.has(p)) continue
    comp.set(p, p)
    const stack = [p]
    while (stack.length) {
      const x = stack.pop()!
      for (const r of adj.get(x)!.values()) if (!comp.has(r)) { comp.set(r, p); stack.push(r) }
    }
  }
  // 4. faces: next(u→v) = the first outgoing edge at v clockwise from v→u
  const seen = new Set<string>()
  const compArea = new Map<string, number>()
  const outer = new Map<string, [number, number][]>()
  for (const p of adj.keys()) {
    for (const v of order.get(p)!) {
      if (seen.has(`${p}|${v}`)) continue
      const walk: [number, number][] = []
      let area2 = 0
      let x = p, d = v
      while (!seen.has(`${x}|${d}`)) {
        seen.add(`${x}|${d}`)
        const y = adj.get(x)!.get(d)!
        const X = coords.get(x)!, Y = coords.get(y)!
        walk.push(X)
        area2 += X[0] * Y[1] - Y[0] * X[1]
        const dv = dirOf.get(d)!
        const back = `${-dv[0]},${-dv[1]}`
        const ords = order.get(y)!
        const i = ords.indexOf(back)
        d = ords[(i - 1 + ords.length) % ords.length]
        x = y
      }
      const c = comp.get(p)!
      // Exact areas are multiples of tiny rationals; anything this small is float noise.
      if (area2 > 1e-9) compArea.set(c, (compArea.get(c) ?? 0) + area2 / 2)
      else if (area2 < -1e-9) outer.set(c, walk)
    }
  }
  const out: Component[] = []
  for (const [c, area] of compArea) if (area > 0 && outer.has(c)) out.push({ area, outer: outer.get(c)! })
  return out
}

/** Winding number of the closed polygon around (px, py) (point not on it). */
function winding(px: number, py: number, poly: [number, number][]): number {
  let w = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const c = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])
    if (a[1] <= py && py < b[1] && c > 0) w++
    else if (b[1] <= py && py < a[1] && c < 0) w--
  }
  return w
}

// ── state ──
function addEdge(s: State, owner: Player, a: Pt, b: Pt): number {
  const id = s.nextId++
  s.edges.set(id, { id, owner, a, b })
  if (!s.nodes.has(pk(a))) s.nodes.set(pk(a), owner)
  if (!s.nodes.has(pk(b))) s.nodes.set(pk(b), owner)
  return id
}

export function newGame(cfg: Config = STANDARD): State {
  const s: State = {
    cfg, nodes: new Map(), edges: new Map(), nextId: 0, toMove: BLUE, turn: 1, movesLeft: 1, moveCount: 0,
    scores: [0, 0], protected: new Set(), placedNow: [], done: false, result: null, areaLog: [], history: [], passed: [],
  }
  addEdge(s, BLUE, ...cfg.blueStart)
  addEdge(s, RED, ...cfg.redStart)
  return s
}

/** A copy safe to step. `light` (for search) starts history and the area log empty. */
export function cloneState(s: State, light = false): State {
  return {
    ...s,
    nodes: new Map(s.nodes),
    edges: new Map(s.edges),
    scores: [...s.scores] as [number, number],
    protected: new Set(s.protected),
    placedNow: [...s.placedNow],
    areaLog: light ? [] : s.areaLog.map((x) => [...x] as [number, number]),
    history: light ? [] : [...s.history],
    passed: [...s.passed],
  }
}

export function onBoard(cfg: Config, p: Pt): boolean {
  return Math.abs(p[0]) <= cfg.R && Math.abs(p[1]) <= cfg.R
}

export function degree(s: State, p: Pt): number {
  let n = 0
  for (const e of s.edges.values()) if (same(p, e.a) || same(p, e.b)) n++
  return n
}

export function edgesOf(s: State, player: Player): [Pt, Pt][] {
  const out: [Pt, Pt][] = []
  for (const e of s.edges.values()) if (e.owner === player) out.push([e.a, e.b])
  return out
}

export interface Check { ok: boolean; reason: string; touched: number[] }

export function check(s: State, m: Move): Check {
  const me = s.toMove, { a, b } = m
  if (s.done) return { ok: false, reason: "the game is over", touched: [] }
  if (s.nodes.get(pk(a)) !== me) return { ok: false, reason: "not your node", touched: [] }
  const dx = b[0] - a[0], dy = b[1] - a[1]
  if ((dx === 0 && dy === 0) || Math.max(Math.abs(dx), Math.abs(dy)) > s.cfg.step) return { ok: false, reason: "too far", touched: [] }
  if (!onBoard(s.cfg, b)) return { ok: false, reason: "off the board", touched: [] }
  const bIsNode = s.nodes.has(pk(b))
  for (const e of s.edges.values()) {
    if (e.owner !== me) continue
    if (collinearOverlap(a, b, e.a, e.b)) return { ok: false, reason: "overlaps your own edge", touched: [] } // rule 1
    if (!bIsNode && strictlyInside(b, e.a, e.b)) return { ok: false, reason: "ends on your own edge", touched: [] } // rule 3
  }
  for (const [k, o] of s.nodes) {
    if (o === me && strictlyInside(parsePk(k), a, b)) return { ok: false, reason: "passes through your own node", touched: [] } // rule 2
  }
  const touched: number[] = []
  for (const e of s.edges.values()) if (e.owner !== me && segTouch(a, b, e.a, e.b)) touched.push(e.id)
  if (touched.some((i) => s.protected.has(i))) return { ok: false, reason: "touches an edge placed last turn", touched } // rule 5
  if (touched.length > 1) return { ok: false, reason: "touches two enemy edges", touched } // rule 4
  return { ok: true, reason: "ok", touched }
}

export function* candidates(s: State): Generator<Move> {
  const k = s.cfg.step
  for (const [key, o] of s.nodes) {
    if (o !== s.toMove) continue
    const p = parsePk(key)
    for (let dx = -k; dx <= k; dx++) for (let dy = -k; dy <= k; dy++) {
      if (dx === 0 && dy === 0) continue
      const b: Pt = [p[0] + dx, p[1] + dy]
      if (onBoard(s.cfg, b)) yield { a: p, b }
    }
  }
}

export function legalMoves(s: State): Move[] {
  const out: Move[] = []
  for (const m of candidates(s)) if (check(s, m).ok) out.push(m)
  return out
}

export function hasMove(s: State): boolean {
  for (const m of candidates(s)) if (check(s, m).ok) return true
  return false
}

export function area(s: State, player: Player): number {
  return filledArea(edgesOf(s, player))
}

export interface StepInfo { player: Player; move: Move; cut: [Pt, Pt] | null; removed: Pt[]; captured: boolean }

/** Play a legal move (throws on an illegal one). Mutates `s`. */
export function step(s: State, m: Move, known?: Check): StepInfo {
  const c = known ?? check(s, m)
  if (!c.ok) throw new Error(`illegal move ${pk(m.a)}->${pk(m.b)}: ${c.reason}`)
  const me = s.toMove
  s.passed = []
  const bOwner = s.nodes.get(pk(m.b))
  const captured = bOwner !== undefined && bOwner !== me
  s.placedNow.push(addEdge(s, me, m.a, m.b))
  const info: StepInfo = { player: me, move: m, cut: null, removed: [], captured }
  for (const i of c.touched) {
    const e = s.edges.get(i)!
    s.edges.delete(i)
    info.cut = [e.a, e.b]
    for (const p of [e.a, e.b]) {
      if (degree(s, p) === 0) { s.nodes.delete(pk(p)); info.removed.push(p) }
    }
  }
  if (captured) s.nodes.set(pk(m.b), me)
  s.history.push({ player: me, move: m })
  s.moveCount++
  s.movesLeft--
  if (s.moveCount >= s.cfg.maxMoves) {
    score(s)
    finish(s)
    return info
  }
  if (s.movesLeft === 0) endTurn(s)
  while (!s.done && !hasMove(s)) {
    if (s.cfg.stuck !== "pass") {
      // No legal move: the game ends as a draw (RULES.md, v0).
      s.done = true
      s.result = "Draw"
      break
    }
    // The stuck player forfeits the rest of their turn; the turn is still scored.
    s.passed.push(s.toMove)
    s.moveCount += s.movesLeft
    s.movesLeft = 0
    if (s.moveCount >= s.cfg.maxMoves) { score(s); finish(s); break }
    endTurn(s)
  }
  return info
}

function endTurn(s: State) {
  score(s)
  s.protected = new Set(s.placedNow.filter((i) => s.edges.has(i)))
  s.placedNow = []
  s.toMove = (s.toMove ^ 1) as Player
  s.turn++
  s.movesLeft = 2
}

function score(s: State) {
  const now: [number, number] = [area(s, BLUE), area(s, RED)]
  s.scores[0] += now[0]
  s.scores[1] += now[1]
  s.areaLog.push(now)
}

function finish(s: State) {
  s.done = true
  const [b, r] = s.scores
  s.result = Math.abs(b - r) < 1e-6 ? "Draw" : b > r ? "Blue" : "Red"
}

/** Areas are exact rationals; show them as such when they're simple, else to two places. */
export function fmtArea(x: number): string {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x))
  for (const d of [2, 3, 4, 6, 8, 9, 12]) {
    const n = x * d
    if (Math.abs(n - Math.round(n)) < 1e-9) {
      const whole = Math.trunc(x), rest = Math.round(n) - whole * d
      return whole ? `${whole} ${Math.abs(rest)}/${d}` : `${rest}/${d}`
    }
  }
  return x.toFixed(2)
}
