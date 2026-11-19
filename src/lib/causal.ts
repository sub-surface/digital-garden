/**
 * Where a decision theory puts its hand on a causal graph, after Pearl's
 * do-calculus and the "mechanised" graphs of MacDermott et al. (2023).
 *
 *   CDT  intervenes on the act node, cutting whatever flows into it.
 *   EDT  conditions on the act, so everything upstream of it comes along.
 *   FDT  intervenes on the algorithm node: "intervene on your algorithm, not
 *        on your action" (Levinstein & Soares 2020, §4.2).
 *
 * An edge is "counted" when it lies on a directed path from where the theory
 * acts to the payoff node: those are the arrows the theory believes carry its
 * choice to its winnings. Pure; shared by Newcomb and the case files, tested by
 * scripts/test-games.ts.
 */
export type Theory = "cdt" | "edt" | "fdt"
export const THEORIES: Theory[] = ["cdt", "edt", "fdt"]

/** cause: physical influence; same: two runs of one function; retro: caused after the fact; see: an observation; inclines: a common cause tugging on you. */
export type EdgeKind = "cause" | "same" | "retro" | "see" | "inclines"
export interface Edge<N extends string = string> { from: N; to: N; kind: EdgeKind }

export interface Roles<N extends string = string> { act: N; alg: N; pay: N }

function reach<N extends string>(edges: Edge<N>[], from: N[], forward: boolean): Set<N> {
  const seen = new Set<N>(from)
  const stack = [...from]
  while (stack.length) {
    const n = stack.pop()!
    for (const ed of edges) {
      const [a, b] = forward ? [ed.from, ed.to] : [ed.to, ed.from]
      if (a === n && !seen.has(b)) { seen.add(b); stack.push(b) }
    }
  }
  return seen
}

/** Where the theory puts its hand: the act (CDT), the algorithm (FDT), or the act and all its ancestors (EDT). */
export function handleOf<N extends string>(theory: Theory, edges: Edge<N>[], roles: Roles<N>): N[] {
  if (theory === "cdt") return [roles.act]
  if (theory === "fdt") return [roles.alg]
  return [...reach(edges, [roles.act], false)]
}

/** The edges a theory counts as carrying its choice to the payoff. */
export function countedOf<N extends string>(theory: Theory, edges: Edge<N>[], roles: Roles<N>): Edge<N>[] {
  const hands = handleOf(theory, edges, roles)
  const from = reach(edges, hands, true)
  const to = reach(edges, [roles.pay], false)
  // An intervention cuts what flows into the node it sets.
  const cut = theory === "edt" ? new Set<N>() : new Set(hands)
  return edges.filter((ed) => from.has(ed.from) && to.has(ed.to) && !cut.has(ed.to))
}

/** Edges an intervention severs (into the node it sets). EDT severs nothing. */
export function cutOf<N extends string>(theory: Theory, edges: Edge<N>[], roles: Roles<N>): Edge<N>[] {
  if (theory === "edt") return []
  const hands = new Set(handleOf(theory, edges, roles))
  return edges.filter((ed) => hands.has(ed.to))
}

// ── Deliberation ────────────────────────────────────────────────────────────

/**
 * Skyrms's deliberational dynamics (the "Nash map"), as Joyce (2012) uses it
 * for unstable problems: start from some credence p that you'll take the
 * first act, compute each act's causal expected utility *given* that credence,
 * nudge p toward whichever act beats the average, and repeat until the
 * utilities balance. `u(p)` returns [U(first act), U(second act)].
 */
export function deliberate(u: (p: number) => [number, number], p0: number, k: number, steps: number): { p: number; ua: number; ub: number }[] {
  const out: { p: number; ua: number; ub: number }[] = []
  let p = p0
  for (let i = 0; i <= steps; i++) {
    const [ua, ub] = u(p)
    out.push({ p, ua, ub })
    const avg = p * ua + (1 - p) * ub
    const ga = Math.max(0, ua - avg), gb = Math.max(0, ub - avg)
    p = (p + k * ga) / (1 + k * (ga + gb))
  }
  return out
}
