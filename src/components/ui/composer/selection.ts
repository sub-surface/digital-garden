import type { Apparatus, Connector, Node, Plate } from "@/lib/composer/types"

/** A selected IR element, addressed by kind + id. */
export type Sel = { kind: "node" | "connector" | "apparatus"; id: string }

export function selKey(s: Sel): string {
  return `${s.kind}:${s.id}`
}

export function sameSel(a: Sel, b: Sel): boolean {
  return a.kind === b.kind && a.id === b.id
}

export function elementOf(plate: Plate, s: Sel): Node | Connector | Apparatus | undefined {
  if (s.kind === "node") return plate.nodes.find((n) => n.id === s.id)
  if (s.kind === "connector") return plate.connectors.find((c) => c.id === s.id)
  return plate.apparatus.find((a) => a.id === s.id)
}

export function existsInPlate(plate: Plate, s: Sel): boolean {
  return elementOf(plate, s) !== undefined
}
