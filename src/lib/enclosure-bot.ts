/**
 * Enclosure opponents. Not ShieldBot (the max-flow planner in ../strategy):
 * a small, honest search that plays the game's shape.
 *
 *  - Pilgrim: wanders, takes area when it falls into its lap.
 *  - Warden: plans both moves of its turn together and judges each line by
 *    its projected final margin. Area counts once per turn still to come
 *    (score is area integrated over time, so a field now is worth more than a
 *    field later); it looks one closing move further, and weighs what the
 *    opponent could cut on their reply (this turn's edges are protected then;
 *    older ones aren't). A line that ends the game is scored by its result,
 *    so it won't stalemate itself into a draw it's winning.
 *
 * Pure: runs in a Web Worker (enclosure.worker.ts) or anywhere else.
 */
import {
  check, cloneState, edgesOf, filledArea, legalMoves, onBoard, parsePk, pk, segTouch, step,
  type Move, type Player, type Pt, type State,
} from "./enclosure"

export type BotLevel = "pilgrim" | "warden"

/** xorshift32, so a seeded game replays. */
export function rng(seed: number) {
  let x = seed >>> 0 || 0x9e3779b9
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0x100000000 }
}

/** Turns (scoring instants) left, counting the one in progress. */
const turnsLeft = (s: State) => Math.max(1, Math.ceil((s.cfg.maxMoves - s.moveCount) / 2))

/**
 * Could this move change its maker's area? Only if it meets their own network
 * again: it ends on one of their nodes, or touches one of their edges not
 * incident to its start. (An edge at `a` can't be touched anywhere else: that
 * would be an overlap or passing an own node, both illegal.)
 */
function mayClose(s: State, m: Move): boolean {
  const me = s.toMove
  if (s.nodes.get(pk(m.b)) === me) return true
  for (const e of s.edges.values()) {
    if (e.owner !== me) continue
    const atA = (e.a[0] === m.a[0] && e.a[1] === m.a[1]) || (e.b[0] === m.a[0] && e.b[1] === m.a[1])
    if (!atA && segTouch(m.a, m.b, e.a, e.b)) return true
  }
  return false
}

interface Areas { mine: number; theirs: number }

/** Play `m` on a light copy, recomputing areas only where they can have changed. */
function apply(s: State, m: Move, before: Areas, me: Player): { next: State; areas: Areas } | null {
  const c = check(s, m)
  if (!c.ok) return null
  const mover = s.toMove
  const closes = mayClose(s, m)
  const next = cloneState(s, true)
  step(next, m, c)
  const cut = c.touched.length > 0
  const moverArea = (st: State) => filledArea(edgesOf(st, mover))
  const otherArea = (st: State) => filledArea(edgesOf(st, (mover ^ 1) as Player))
  const mine = mover === me ? (closes ? moverArea(next) : before.mine) : (cut ? otherArea(next) : before.mine)
  const theirs = mover === me ? (cut ? otherArea(next) : before.theirs) : (closes ? moverArea(next) : before.theirs)
  return { next, areas: { mine, theirs } }
}

/** Some node of `by` within one move's reach of a point of segment e. */
function reachable(s: State, e: { a: Pt; b: Pt }, by: Player): boolean {
  const k = s.cfg.step
  const pts: Pt[] = [e.a, e.b]
  const g = Math.max(Math.abs(e.b[0] - e.a[0]), Math.abs(e.b[1] - e.a[1]))
  for (let i = 1; i < g; i++) pts.push([e.a[0] + ((e.b[0] - e.a[0]) * i) / g, e.a[1] + ((e.b[1] - e.a[1]) * i) / g])
  for (const [key, o] of s.nodes) {
    if (o !== by) continue
    const n = parsePk(key)
    for (const p of pts) if (Math.max(Math.abs(p[0] - n[0]), Math.abs(p[1] - n[1])) <= k) return true
  }
  return false
}

/**
 * The most area the opponent could take from `me` next turn by cutting one
 * unprotected edge (an over-estimate: reach is checked, not full legality).
 */
function exposure(s: State, me: Player, mine: number, safe: Set<number>): number {
  if (mine <= 0) return 0
  const opp = (me ^ 1) as Player
  const all = [...s.edges.values()].filter((e) => e.owner === me)
  let worst = 0
  for (const e of all) {
    if (safe.has(e.id) || !reachable(s, e, opp)) continue
    const loss = mine - filledArea(all.filter((x) => x !== e).map((x) => [x.a, x.b] as [Pt, Pt]))
    if (loss > worst) worst = loss
  }
  return worst
}

/** The most area one more move of mine could add (a move that ends on my own node). */
function closingPotential(s: State, me: Player, mine: number): number {
  const t = cloneState(s, true)
  t.toMove = me
  t.movesLeft = 1
  t.protected = new Set()
  const segs = edgesOf(t, me)
  const k = t.cfg.step
  let best = 0
  const tried = new Set<string>()
  for (const [key, o] of t.nodes) {
    if (o !== me) continue
    const a = parsePk(key)
    for (let dx = -k; dx <= k; dx++) for (let dy = -k; dy <= k; dy++) {
      const b: Pt = [a[0] + dx, a[1] + dy]
      if ((!dx && !dy) || !onBoard(t.cfg, b) || t.nodes.get(pk(b)) !== me) continue
      const id = pk(a) < pk(b) ? `${pk(a)}|${pk(b)}` : `${pk(b)}|${pk(a)}`
      if (tried.has(id)) continue
      tried.add(id)
      if (!check(t, { a, b }).ok) continue
      const gain = filledArea([...segs, [a, b]]) - mine
      if (gain > best) best = gain
    }
  }
  return best
}

export interface Plan { moves: Move[]; thought: string }

/**
 * `budgetMs` bounds the Warden's search: late in a standard game there are
 * thousands of closing lines, each needing a face trace. Candidates are
 * ordered best-first, so running out of time drops the least promising.
 */
export function planTurn(s: State, level: BotLevel, random: () => number = Math.random, budgetMs = 1500): Plan {
  const t0 = Date.now()
  const spent = () => (Date.now() - t0) / budgetMs
  const me = s.toMove
  const opp = (me ^ 1) as Player
  const base: Areas = { mine: filledArea(edgesOf(s, me)), theirs: filledArea(edgesOf(s, opp)) }

  if (level === "pilgrim") {
    const moves: Move[] = []
    let cur = s, areas = base
    while (moves.length < s.movesLeft && !cur.done && cur.toMove === me) {
      const legal = legalMoves(cur)
      if (!legal.length) break
      let pick = legal[Math.floor(random() * legal.length)]
      if (random() < 0.6) {
        let bestGain = 0
        for (const m of legal) {
          const r = apply(cur, m, areas, me)
          if (!r) continue
          const gain = r.areas.mine - areas.mine + (areas.theirs - r.areas.theirs) * 0.7
          if (gain > bestGain + 1e-9) { bestGain = gain; pick = m }
        }
      }
      const r = apply(cur, pick, areas, me)!
      moves.push(pick)
      cur = r.next
      areas = r.areas
    }
    return { moves, thought: "wandering" }
  }

  // ── Warden ──
  /** Projected final margin for `me` from a position after my turn. */
  const projected = (st: State, a: Areas) => {
    const lead = st.scores[me] - st.scores[opp]
    if (st.done) return st.result === "Draw" ? 0 : (st.result === (me === 0 ? "Blue" : "Red") ? 1e6 + lead : -1e6 + lead)
    // The turn just ended was scored into st.scores; what's held now scores every remaining turn.
    return lead + (a.mine - a.theirs) * turnsLeft(st)
  }

  const legal = legalMoves(s)
  if (!legal.length) return { moves: [], thought: "no move" }
  // Cheap ordering first (no area traces), then areas for as many as time allows.
  const shuffled = legal.map((m) => ({ m, k: random() - (mayClose(s, m) ? 2 : 0) })).sort((x, y) => x.k - y.k).map((x) => x.m)
  const scored: { m: Move; r: { next: State; areas: Areas } }[] = []
  for (const m of shuffled) {
    if (scored.length >= 8 && spent() > 0.3) break
    scored.push({ m, r: apply(s, m, base, me)! })
  }
  const firsts = scored.map(({ m, r }) => {
    // A pull toward my own nodes (future closes) and the middle; noise to vary play.
    let near = 0
    for (const [key, o] of s.nodes) {
      if (o !== me) continue
      const n = parsePk(key)
      const d = Math.max(Math.abs(n[0] - m.b[0]), Math.abs(n[1] - m.b[1]))
      if (d > 0 && d <= s.cfg.step) near++
    }
    const centre = -Math.max(Math.abs(m.b[0]), Math.abs(m.b[1])) / s.cfg.R
    const gain = (r.areas.mine - base.mine) - (r.areas.theirs - base.theirs)
    return { m, r, v: gain * 100 + Math.min(near, 4) * 0.4 + centre + random() * 0.5 }
  }).sort((x, y) => y.v - x.v)

  type Line = { moves: Move[]; next: State; areas: Areas; v: number }
  const lines: Line[] = []
  const pair = s.movesLeft >= 2
  for (const f of firsts.slice(0, pair ? 12 : firsts.length)) {
    if (lines.length && spent() > 0.75) break
    if (!pair || f.r.next.done || f.r.next.toMove !== me) {
      lines.push({ moves: [f.m], next: f.r.next, areas: f.r.areas, v: projected(f.r.next, f.r.areas) })
      continue
    }
    for (const m2 of legalMoves(f.r.next)) {
      if (lines.length > 40 && spent() > 0.75) break
      const r2 = apply(f.r.next, m2, f.r.areas, me)
      if (r2) lines.push({ moves: [f.m, m2], next: r2.next, areas: r2.areas, v: projected(r2.next, r2.areas) + random() * 0.3 })
    }
  }
  lines.sort((x, y) => y.v - x.v)

  // A closer look at the most promising lines.
  let best = lines[0]
  let bestScore = -Infinity
  let thought = "advancing"
  for (const [i, line] of lines.slice(0, 14).entries()) {
    if (i >= 3 && spent() > 1) break
    const later = line.next.done ? 0 : turnsLeft(line.next) - 1
    let score = line.v
    let potential = 0
    if (later > 0) {
      // This turn's edges are protected through the reply.
      const safe = new Set<number>()
      for (const e of line.next.edges.values()) if (e.owner === me && !s.edges.has(e.id)) safe.add(e.id)
      potential = closingPotential(line.next, me, line.areas.mine)
      score += potential * later * 0.5 - exposure(line.next, me, line.areas.mine, safe) * later * 0.7
      // Under the reference rule a player with no legal move ends the game
      // drawn, so hemming the opponent in hands them that draw: fine when
      // behind, a blunder when ahead. (Under "pass" it's simply good.)
      if (s.cfg.stuck !== "pass") {
        const room = legalMoves(line.next).length
        if (room <= 12) score -= score * (room <= 4 ? 0.9 : 0.4)
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = line
      thought = line.areas.mine > base.mine + 1e-9 ? "enclosing"
        : line.areas.theirs < base.theirs - 1e-9 ? "cutting"
        : potential > 0 ? "laying a wall" : "advancing"
    }
  }
  return { moves: best.moves, thought }
}
