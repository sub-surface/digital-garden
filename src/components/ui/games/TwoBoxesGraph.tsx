import { countedOf, cutOf, handleOf, type Edge, type Roles, type Theory } from "@/lib/causal"
import styles from "./TwoBoxesPage.module.scss"

export interface GraphNodeSpec { label: string; x: number; y: number }

const EDGE_NOTE: Partial<Record<Edge["kind"], string>> = { same: "same function", retro: "after", inclines: "inclines", see: "you see" }
const HAND: Record<Theory, string> = { cdt: "do(act)", edt: "given", fdt: "do(algorithm)" }

function size(label: string): [number, number] {
  return [label.length * 6.3 + 20, 24]
}

/** Where the segment from a's centre toward b leaves a's pill. */
function clip(a: [number, number], b: [number, number], [w, h]: [number, number]): [number, number] {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity)
  return [a[0] + dx * t, a[1] + dy * t]
}

/**
 * A causal graph as one decision theory reads it: the node it puts its hand
 * on, the arrows it severs, and (animated) the arrows it believes carry its
 * choice to the payoff. Shared by the Newcomb table, the bench and the case files.
 */
export function TheoryGraph({ nodes, edges, roles, theory, height = 200 }: {
  nodes: Record<string, GraphNodeSpec>
  edges: Edge[]
  roles: Roles
  theory: Theory
  height?: number
}) {
  const live = new Set(countedOf(theory, edges, roles).map((e) => `${e.from}>${e.to}`))
  const cut = new Set(cutOf(theory, edges, roles).map((e) => `${e.from}>${e.to}`))
  const hands = new Set(handleOf(theory, edges, roles))
  const used = [...new Set(edges.flatMap((e) => [e.from, e.to]))].filter((n) => nodes[n])
  const pt = (n: string): [number, number] => [nodes[n].x, nodes[n].y]
  return (
    <svg className={styles.graph} viewBox={`0 0 430 ${height}`} role="img" data-t={theory}
      aria-label={`The causal picture as ${theory.toUpperCase()} reads it: it ${theory === "edt" ? "conditions on" : "intervenes on"} ${nodes[theory === "fdt" ? roles.alg : roles.act]?.label}.`}>
      {edges.map((e) => {
        if (!nodes[e.from] || !nodes[e.to]) return null
        const id = `${e.from}>${e.to}`
        const a = clip(pt(e.from), pt(e.to), size(nodes[e.from].label))
        const b = clip(pt(e.to), pt(e.from), size(nodes[e.to].label))
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
        const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
        const note = cut.has(id) ? "cut" : EDGE_NOTE[e.kind]
        return (
          <g key={id} className={styles.edge} data-live={live.has(id) || undefined} data-cut={cut.has(id) || undefined} data-kind={e.kind}>
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
            {live.has(id) && <line className={styles.flow} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />}
            <path d="M0,0 L-8,-4 L-8,4 z" transform={`translate(${b[0]},${b[1]}) rotate(${deg})`} />
            {note && <text x={mx + 5} y={my - 5}>{note}</text>}
          </g>
        )
      })}
      {used.map((n) => {
        const [w, h] = size(nodes[n].label)
        const [cx, cy] = pt(n)
        const hand = theory === "edt" ? n === roles.act : hands.has(n)
        const along = theory === "edt" && hands.has(n) && n !== roles.act
        return (
          <g key={n} className={styles.node} data-hand={hand || undefined} data-along={along || undefined} data-pay={n === roles.pay || undefined}>
            <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={12} />
            <text x={cx} y={cy + 4} textAnchor="middle">{nodes[n].label}</text>
            {hand && <text x={cx} y={cy - h / 2 - 6} textAnchor="middle" className={styles.handText}>{HAND[theory]}</text>}
          </g>
        )
      })}
    </svg>
  )
}
