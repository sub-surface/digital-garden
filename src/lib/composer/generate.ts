/**
 * generate — seed → Plate (the IR). Threads one rng in a fixed order through
 * grammar (pick armature, fill slots with motif requests) → layout solver
 * (resolve boxes) → anchor resolution → apparatus. Same `(seed, salt)` →
 * byte-identical IR → identical render.
 */

import type { Anchor, Apparatus, Armature, Connector, Node, Palette, Plate, PostParams, Rng } from "./types"
import { makeRng, ri, pick, pickWeighted, chance } from "./rng"
import { ARMATURES, getArmature } from "./armatures"
import { motifDefaults } from "./motifs"
import { solveLayout, type PlacementReq } from "./layout"
import { realizeNode } from "./realize"
import { getPalette, DEFAULT_PALETTE_ID } from "./pens"
import { DEFAULT_ERA_ID } from "./eras"
import { apparatusRegion } from "./apparatus"
import { romanNumeral, catalogCode, plateNumber, unit, caption, legendEntries } from "./lexicon"

export interface GenerateOptions {
  seed: string
  salt?: number
  archetype?: string // force a specific armature
  vibeTags?: string[] // bias the armature pick toward these tags
  ratio?: [number, number]
  paletteId?: string
  palette?: Palette // a fully-built palette (e.g. the runtime accent palette) wins over paletteId
  era?: string
  post?: Partial<PostParams> // render-time tuning; never affects geometry
  /** Locked elements carried verbatim into a regeneration (see §4 re-roll model). */
  keep?: { nodes?: Node[]; connectors?: Connector[]; apparatus?: Apparatus[] }
}

const slotIdOf = (node: Node): string => node.id.replace(/-\d+$/, "")

function nearestAnchor(node: Node, tx: number, ty: number, kind: Anchor["kind"]): Anchor | undefined {
  const pool = node.anchors.filter((a) => a.kind === kind)
  const src = pool.length ? pool : node.anchors
  let best: Anchor | undefined
  let bd = Infinity
  for (const a of src) {
    const d = (a.x - tx) ** 2 + (a.y - ty) ** 2
    if (d < bd) {
      bd = d
      best = a
    }
  }
  return best
}

/** Resolve each armature connector intent to concrete anchor-to-anchor links. */
function buildConnectors(armature: Armature, nodes: Node[], rng: Rng): Connector[] {
  const out: Connector[] = []
  let idc = 0
  for (const intent of armature.connectorIntents) {
    const fromNodes = nodes.filter((n) => slotIdOf(n) === intent.from)
    const toNodes = nodes.filter((n) => slotIdOf(n) === intent.to)
    if (!fromNodes.length || !toNodes.length) continue
    let numbered = 0
    for (const tn of toNodes) {
      if (!chance(rng, intent.density)) continue
      const fn = pick(rng, fromNodes)
      if (fn.id === tn.id) continue
      const tc = { x: tn.box.x + tn.box.w / 2, y: tn.box.y + tn.box.h / 2 }
      const fc = { x: fn.box.x + fn.box.w / 2, y: fn.box.y + fn.box.h / 2 }
      const fromA = nearestAnchor(fn, tc.x, tc.y, "port") ?? fn.anchors[0]
      const toA = nearestAnchor(tn, fc.x, fc.y, "mount") ?? tn.anchors[0]
      if (!fromA || !toA) continue
      out.push({
        id: `c-${intent.from}-${intent.to}-${idc++}`,
        from: `${fn.id}#${fromA.id}`,
        to: `${tn.id}#${toA.id}`,
        route: intent.route === "auto" ? "leader" : intent.route,
        penRole: "annotation",
        label: chance(rng, 0.7) ? romanNumeral(++numbered) : undefined,
        locked: false,
      })
    }
  }
  return out
}

/** Lexicon-generated content carried on an apparatus item, keyed by kind. */
function apparatusData(kind: Apparatus["kind"], rng: Rng, vibe: string[]): Record<string, unknown> | undefined {
  switch (kind) {
    case "legend":
      return { entries: legendEntries(rng, ri(rng, 3, 5), vibe) }
    case "scale-bar":
      return { unit: unit(rng) }
    case "caption":
      return { text: caption(rng, vibe) }
    case "colophon":
      return { text: `${plateNumber(rng)} · ${catalogCode(rng, vibe)}` }
    default:
      return undefined
  }
}

function pickArmature(rng: () => number, archetype?: string, vibeTags?: string[]) {
  if (archetype) {
    const forced = getArmature(archetype)
    if (forced) return forced
  }
  let pool = ARMATURES
  if (vibeTags?.length) {
    const filtered = ARMATURES.filter((a) => a.tags.some((t) => vibeTags.includes(t)))
    if (filtered.length) pool = filtered
  }
  return pickWeighted(rng, pool, (a) => a.weight)
}

export function generate(opts: GenerateOptions): Plate {
  const salt = opts.salt ?? 0
  const rng = makeRng(opts.seed, salt)
  const armature = pickArmature(rng, opts.archetype, opts.vibeTags)

  // Locked nodes are carried verbatim and re-used slot-by-slot; only the fresh
  // (unlocked) nodes are re-rolled and re-solved (around the locked obstacles).
  const lockedNodes = opts.keep?.nodes ?? []
  const lockedBySlot: Record<string, Node[]> = {}
  for (const ln of lockedNodes) (lockedBySlot[slotIdOf(ln)] ??= []).push(ln)

  const nodes: Node[] = []
  const reqs: PlacementReq[] = []
  let z = 0
  for (const slot of armature.slots) {
    const rolled = ri(rng, slot.count[0], slot.count[1])
    const lockedForSlot = lockedBySlot[slot.id] ?? []
    const count = Math.max(rolled, lockedForSlot.length)
    for (let j = 0; j < count; j++) {
      if (j < lockedForSlot.length) {
        nodes.push(lockedForSlot[j]) // verbatim — keeps box/params/anchors/seed
        z = Math.max(z, lockedForSlot[j].z + 1)
        continue
      }
      const motif = pick(rng, slot.motifKeys)
      const node: Node = {
        id: `${slot.id}-${j}`,
        motif,
        box: { x: 0, y: 0, w: 0.1, h: 0.1 },
        params: motifDefaults(motif),
        penRole: slot.penRole ?? "structure",
        anchors: [],
        locked: false,
        z: z++,
        seed: ri(rng, 1, 0x7fffffff),
      }
      nodes.push(node)
      reqs.push({ node, slot })
    }
  }

  solveLayout(armature.layout, reqs, rng, lockedNodes.map((n) => n.box))

  // Resolve anchors for freshly-placed nodes (locked nodes keep their anchors).
  for (const { node } of reqs) node.anchors = realizeNode(node, opts.seed).anchors

  // Connectors: keep locked ones, rebuild the rest from intents.
  const connectors = [...(opts.keep?.connectors ?? []), ...buildConnectors(armature, nodes, rng)]
  const apparatus: Apparatus[] = armature.apparatusIntents.map((intent, i) => {
    const kept = opts.keep?.apparatus?.find((a) => a.kind === intent.kind && a.locked)
    if (kept) return kept
    return {
      id: `app-${intent.kind}-${i}`,
      kind: intent.kind,
      penRole: "apparatus" as const,
      box: apparatusRegion(intent.kind),
      data: apparatusData(intent.kind, rng, armature.tags),
      locked: false,
    }
  })

  return {
    version: 1,
    seed: opts.seed,
    salt,
    archetype: armature.id,
    ratio: opts.ratio ?? [1, 1],
    palette: opts.palette ?? getPalette(opts.paletteId ?? DEFAULT_PALETTE_ID),
    era: opts.era ?? DEFAULT_ERA_ID,
    nodes,
    connectors,
    apparatus,
    post: { inkBias: 0, contrast: 1, handJitter: 0.3, lineWeight: 1, ...opts.post },
    meta: { createdWith: "apparatus" },
  }
}
